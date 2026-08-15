<?php

return [
    'token' => env('AI_GATEWAY_TOKEN', ''),
    'dev_mode' => env('AI_GATEWAY_DEV_MODE', false),
    'origins' => array_values(array_filter(array_map('trim', explode(',', env('AI_GATEWAY_ORIGINS', env('AI_GATEWAY_ORIGIN', 'http://localhost:3000')))))),
    'provider' => env('AI_PROVIDER', 'openai'),
    'model' => env('AI_MODEL', ''),
    'base_url' => rtrim(env('AI_BASE_URL', 'https://api.openai.com/v1'), '/'),
    'api_key' => env('AI_API_KEY', ''),
    'allow_client_model' => env('AI_GATEWAY_ALLOW_CLIENT_MODEL', false),
    'allowed_models' => array_values(array_filter(array_map('trim', explode(',', env('AI_GATEWAY_ALLOWED_MODELS', ''))))),
    'rate_limit' => max(1, (int) env('AI_GATEWAY_RATE_LIMIT', 30)),
    'max_concurrent' => max(1, (int) env('AI_GATEWAY_MAX_CONCURRENT', 4)),
    'max_messages' => max(1, (int) env('AI_GATEWAY_MAX_MESSAGES', 24)),
    'max_message_chars' => max(1000, (int) env('AI_GATEWAY_MAX_MESSAGE_CHARS', 40000)),
    'max_context_chars' => max(10000, (int) env('AI_GATEWAY_MAX_CONTEXT_CHARS', 250000)),
    'max_output_tokens' => max(256, (int) env('AI_GATEWAY_MAX_OUTPUT_TOKENS', 2048)),
    'timeout_seconds' => max(5, (int) ceil(((int) env('AI_GATEWAY_UPSTREAM_TIMEOUT_MS', 60000)) / 1000)),
    'max_body_bytes' => max(131072, (int) env('AI_GATEWAY_MAX_BODY_BYTES', 1048576)),
    'site_url' => env('AI_SITE_URL', ''),
    'app_name' => env('AI_APP_NAME', 'OpenDoc UI'),
];
