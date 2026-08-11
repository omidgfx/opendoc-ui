<?php

use App\Http\Controllers\OpenDocAiGatewayController;
use App\Http\Middleware\OpenDocAiCors;
use Illuminate\Support\Facades\Route;

Route::middleware(OpenDocAiCors::class)->group(function (): void {
    Route::get('/health', [OpenDocAiGatewayController::class, 'health']);
    Route::options('/api/ai/{path?}', [OpenDocAiGatewayController::class, 'options'])->where('path', '.*');
    Route::post('/api/ai/models', [OpenDocAiGatewayController::class, 'models']);
    Route::post('/api/ai/chat', [OpenDocAiGatewayController::class, 'chat']);
});
