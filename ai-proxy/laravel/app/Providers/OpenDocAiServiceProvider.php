<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use RuntimeException;

final class OpenDocAiServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(base_path('config/opendoc-ai.php'), 'opendoc-ai');
    }

    public function boot(): void
    {
        if (!config('opendoc-ai.model')) throw new RuntimeException('AI_MODEL is required.');
        if (!in_array(config('opendoc-ai.provider'), ['openai', 'openrouter', 'ollama', 'custom'], true))
            throw new RuntimeException('Framework gateway examples require an OpenAI-compatible AI_PROVIDER.');
        if (!config('opendoc-ai.token') && !config('opendoc-ai.dev_mode'))
            throw new RuntimeException('AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.');
        if (array_filter(config('opendoc-ai.allowed_models'), fn (string $model) => str_contains($model, '*')))
            throw new RuntimeException('AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.');
        if (config('opendoc-ai.allow_client_model')
            && (!config('opendoc-ai.allowed_models')
                || !in_array(config('opendoc-ai.model'), config('opendoc-ai.allowed_models'), true)))
            throw new RuntimeException('AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.');

        $this->loadRoutesFrom(base_path('routes/opendoc-ai.php'));
    }
}
