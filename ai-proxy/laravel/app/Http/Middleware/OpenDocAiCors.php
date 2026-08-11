<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class OpenDocAiCors
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = (string) $request->header('Origin');
        if ($origin !== '' && !in_array($origin, config('opendoc-ai.origins'), true)) {
            return response()->json(['error' => ['message' => 'Origin is not allowed by this AI gateway.']], 403);
        }
        $response = $request->isMethod('OPTIONS') ? response('', 204) : $next($request);
        if ($origin !== '') $response->headers->set('Access-Control-Allow-Origin', $origin);
        $response->headers->set('Vary', 'Origin');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        $response->headers->set('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After');
        return $response;
    }
}
