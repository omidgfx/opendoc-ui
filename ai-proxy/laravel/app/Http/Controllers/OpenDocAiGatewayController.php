<?php

namespace App\Http\Controllers;

use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

final class OpenDocAiGatewayController extends Controller
{
    public function health(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            'authenticated' => config('opendoc-ai.token') !== '',
            'provider' => config('opendoc-ai.provider'),
            'model' => config('opendoc-ai.model'),
            'clientModelSelection' => (bool) config('opendoc-ai.allow_client_model'),
        ]);
    }

    public function options(Request $request): Response
    {
        if (!$this->originAllowed($request)) return $this->error('Origin is not allowed by this AI gateway.', 403);
        return $this->cors($request, response('', 204));
    }

    public function models(Request $request): JsonResponse
    {
        if ($failure = $this->guard($request)) return $failure;
        try {
            $models = $this->allowedModels();
            return $this->cors($request, response()->json([
                'models' => array_map(fn (string $model) => [
                    'id' => $model,
                    'label' => "{$model} · Gateway allowed",
                    'tier' => $this->tier($model),
                ], $models),
                'gateway' => array_filter([
                    'clientModelSelection' => (bool) config('opendoc-ai.allow_client_model'),
                    'provider' => config('opendoc-ai.provider'),
                    'model' => config('opendoc-ai.model'),
                    'models' => config('opendoc-ai.allow_client_model') ? $models : null,
                ], fn ($value) => $value !== null),
            ]));
        } finally {
            $this->releaseConcurrency();
        }
    }

    public function chat(Request $request): Response
    {
        if ($failure = $this->guard($request)) return $failure;
        try {
            if (strlen($request->getContent()) > config('opendoc-ai.max_body_bytes')) {
                $this->releaseConcurrency();
                return $this->error('AI gateway request body is too large.', 413);
            }
            $messages = $request->input('messages');
            if (!$this->validMessages($messages)) {
                $this->releaseConcurrency();
                return $this->error('The messages array exceeds gateway limits or is invalid.', 400);
            }
            $model = $this->selectModel($request);
            if ($model instanceof JsonResponse) {
                $this->releaseConcurrency();
                return $model;
            }
            if (!config('opendoc-ai.api_key') && config('opendoc-ai.provider') !== 'ollama') {
                $this->releaseConcurrency();
                return $this->error('AI_API_KEY is not configured on the gateway.', 503);
            }
            $headers = ['Content-Type' => 'application/json'];
            if (config('opendoc-ai.api_key')) $headers['Authorization'] = 'Bearer ' . config('opendoc-ai.api_key');
            if (config('opendoc-ai.site_url')) $headers['HTTP-Referer'] = config('opendoc-ai.site_url');
            if (config('opendoc-ai.app_name')) $headers['X-Title'] = config('opendoc-ai.app_name');
            $base = config('opendoc-ai.base_url');
            $url = str_ends_with($base, '/chat/completions') ? $base : $base . '/chat/completions';
            $temperature = is_numeric($request->input('temperature'))
                ? max(0, min(2, (float) $request->input('temperature')))
                : 0.2;
            $upstream = Http::withHeaders($headers)
                ->timeout(config('opendoc-ai.timeout_seconds'))
                ->connectTimeout(min(10, config('opendoc-ai.timeout_seconds')))
                ->withOptions(['stream' => true])
                ->post($url, [
                    'model' => $model,
                    'messages' => $messages,
                    'temperature' => $temperature,
                    'max_tokens' => config('opendoc-ai.max_output_tokens'),
                    'stream' => true,
                ]);
            if (!$upstream->successful()) {
                $this->releaseConcurrency();
                return $this->error($this->upstreamError($upstream), 502, [
                    'code' => 'upstream_error',
                    'status' => $upstream->status(),
                    'provider' => config('opendoc-ai.provider'),
                    'model' => $model,
                ]);
            }
            $psr = $upstream->toPsrResponse();
            $stream = $psr->getBody();
            $contentType = $upstream->header('Content-Type') ?: 'text/event-stream; charset=utf-8';
            $response = response()->stream(function () use ($stream): void {
                try {
                    while (!$stream->eof()) {
                        echo $stream->read(8192);
                        if (function_exists('ob_flush')) @ob_flush();
                        flush();
                        if (connection_aborted()) break;
                    }
                } finally {
                    $stream->close();
                    $this->releaseConcurrency();
                }
            }, 200, [
                'Content-Type' => $contentType,
                'Cache-Control' => 'no-cache, no-transform',
                'X-Accel-Buffering' => 'no',
            ]);
            return $this->cors($request, $response);
        } catch (Throwable $error) {
            $this->releaseConcurrency();
            report($error);
            return $this->error('AI gateway request failed.', 502);
        }
    }

    private function guard(Request $request): ?JsonResponse
    {
        $token = (string) config('opendoc-ai.token');
        if ($token === '' && !config('opendoc-ai.dev_mode'))
            return $this->error('AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.', 503);
        if ($token !== '' && !hash_equals('Bearer ' . $token, (string) $request->header('Authorization')))
            return $this->error('Invalid AI gateway token.', 401);
        if (!$this->originAllowed($request)) return $this->error('Origin is not allowed by this AI gateway.', 403);
        $rateKey = 'opendoc-ai:' . ($request->ip() ?: 'unknown');
        if (RateLimiter::tooManyAttempts($rateKey, config('opendoc-ai.rate_limit')))
            return $this->error('AI gateway rate limit exceeded.', 429);
        RateLimiter::hit($rateKey, 60);
        $active = Cache::increment('opendoc-ai:active');
        if ($active > config('opendoc-ai.max_concurrent')) {
            Cache::decrement('opendoc-ai:active');
            return $this->error('AI gateway is busy.', 429);
        }
        return null;
    }

    private function releaseConcurrency(): void
    {
        if ((int) Cache::get('opendoc-ai:active', 0) > 0) Cache::decrement('opendoc-ai:active');
    }

    private function originAllowed(Request $request): bool
    {
        $origin = (string) $request->header('Origin');
        return $origin === '' || in_array($origin, config('opendoc-ai.origins'), true);
    }

    private function cors(Request $request, Response $response): Response
    {
        $origin = (string) $request->header('Origin');
        if ($origin !== '') $response->headers->set('Access-Control-Allow-Origin', $origin);
        $response->headers->set('Vary', 'Origin');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        $response->headers->set('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After');
        return $response;
    }

    private function error(string $message, int $status, array $details = []): JsonResponse
    {
        return response()->json(['error' => ['message' => $message] + $details], $status);
    }

    private function allowedModels(): array
    {
        return config('opendoc-ai.allow_client_model')
            ? config('opendoc-ai.allowed_models')
            : [(string) config('opendoc-ai.model')];
    }

    private function selectModel(Request $request): string|JsonResponse
    {
        if ($request->filled('provider') && $request->input('provider') !== config('opendoc-ai.provider'))
            return $this->error("Provider is fixed to '" . config('opendoc-ai.provider') . "' by the gateway.", 400);
        $model = $request->filled('model') ? trim((string) $request->input('model')) : (string) config('opendoc-ai.model');
        return in_array($model, $this->allowedModels(), true)
            ? $model
            : $this->error("Model '{$model}' is not allowed by this gateway.", 400);
    }

    private function validMessages(mixed $messages): bool
    {
        if (!is_array($messages) || count($messages) < 1 || count($messages) > config('opendoc-ai.max_messages')) return false;
        $total = 0;
        foreach ($messages as $message) {
            if (!is_array($message)
                || !in_array($message['role'] ?? null, ['system', 'user', 'assistant'], true)
                || !is_string($message['content'] ?? null)
                || strlen($message['content']) > config('opendoc-ai.max_message_chars')) return false;
            $total += strlen($message['content']);
            if ($total > config('opendoc-ai.max_context_chars')) return false;
        }
        return true;
    }

    private function tier(string $model): string
    {
        return config('opendoc-ai.provider') === 'ollama' ? 'local' : (str_ends_with($model, ':free') ? 'free' : 'premium');
    }

    private function upstreamError(ClientResponse $response): string
    {
        $payload = $response->json();
        return is_array($payload)
            ? ($payload['error']['message'] ?? $payload['message'] ?? "Upstream returned HTTP {$response->status()}.")
            : "Upstream returned HTTP {$response->status()}.";
    }
}
