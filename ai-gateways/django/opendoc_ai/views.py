from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

import requests
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse, JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt


def csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def number(name: str, fallback: int) -> int:
    try:
        value = int(os.getenv(name, ""))
        return value if value > 0 else fallback
    except ValueError:
        return fallback


@dataclass(frozen=True)
class Config:
    token: str
    dev_mode: bool
    origins: tuple[str, ...]
    provider: str
    model: str
    base_url: str
    api_key: str
    allow_client_model: bool
    allowed_models: tuple[str, ...]
    rate_limit: int
    max_concurrent: int
    max_messages: int
    max_message_chars: int
    max_context_chars: int
    max_output_tokens: int
    timeout_seconds: int
    max_body_bytes: int


def load_config() -> Config:
    model = os.getenv("AI_MODEL", "").strip()
    if not model:
        raise RuntimeError("AI_MODEL is required.")
    provider = os.getenv("AI_PROVIDER", "openai")
    if provider not in ("openai", "openrouter", "ollama", "custom"):
        raise RuntimeError("Framework gateway examples require an OpenAI-compatible AI_PROVIDER.")
    allow = os.getenv("AI_GATEWAY_ALLOW_CLIENT_MODEL") == "true"
    models = tuple(csv(os.getenv("AI_GATEWAY_ALLOWED_MODELS"))) if allow else (model,)
    if any("*" in value for value in models):
        raise RuntimeError("AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.")
    if not models or model not in models:
        raise RuntimeError("AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.")
    config = Config(
        token=os.getenv("AI_GATEWAY_TOKEN", ""),
        dev_mode=os.getenv("AI_GATEWAY_DEV_MODE") == "true",
        origins=tuple(csv(os.getenv("AI_GATEWAY_ORIGINS") or os.getenv("AI_GATEWAY_ORIGIN") or "http://localhost:3000")),
        provider=provider,
        model=model,
        base_url=os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        api_key=os.getenv("AI_API_KEY", ""),
        allow_client_model=allow,
        allowed_models=models,
        rate_limit=number("AI_GATEWAY_RATE_LIMIT", 30),
        max_concurrent=number("AI_GATEWAY_MAX_CONCURRENT", 4),
        max_messages=number("AI_GATEWAY_MAX_MESSAGES", 24),
        max_message_chars=number("AI_GATEWAY_MAX_MESSAGE_CHARS", 40_000),
        max_context_chars=number("AI_GATEWAY_MAX_CONTEXT_CHARS", 250_000),
        max_output_tokens=number("AI_GATEWAY_MAX_OUTPUT_TOKENS", 2_048),
        timeout_seconds=max(5, number("AI_GATEWAY_UPSTREAM_TIMEOUT_MS", 60_000) // 1000),
        max_body_bytes=number("AI_GATEWAY_MAX_BODY_BYTES", 1_048_576),
    )
    if not config.token and not config.dev_mode:
        raise RuntimeError("AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.")
    return config


config = load_config()


def cors(request: HttpRequest, response: HttpResponse) -> HttpResponse:
    origin = request.headers.get("Origin", "")
    if origin:
        response["Access-Control-Allow-Origin"] = origin
    response["Vary"] = "Origin"
    response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response["Access-Control-Expose-Headers"] = "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After"
    return response


def failure(request: HttpRequest, message: str, status: int, **details) -> JsonResponse:
    return cors(request, JsonResponse({"error": {"message": message, **details}}, status=status))


def guard(request: HttpRequest):
    origin = request.headers.get("Origin", "")
    if origin and origin not in config.origins:
        return failure(request, "Origin is not allowed by this AI gateway.", 403)
    if config.token and request.headers.get("Authorization") != f"Bearer {config.token}":
        return failure(request, "Invalid AI gateway token.", 401)
    client = request.META.get("REMOTE_ADDR", "unknown")
    window = int(time.time() // 60)
    rate_key = f"opendoc-ai:rate:{client}:{window}"
    try:
        count = cache.incr(rate_key)
    except ValueError:
        cache.set(rate_key, 1, timeout=70)
        count = 1
    if count > config.rate_limit:
        response = failure(request, "AI gateway rate limit exceeded.", 429)
        response["Retry-After"] = "60"
        return response
    try:
        active = cache.incr("opendoc-ai:active")
    except ValueError:
        cache.set("opendoc-ai:active", 1, timeout=120)
        active = 1
    if active > config.max_concurrent:
        cache.decr("opendoc-ai:active")
        response = failure(request, "AI gateway is busy.", 429)
        response["Retry-After"] = "2"
        return response
    return max(0, config.rate_limit - count)


def release() -> None:
    try:
        if cache.get("opendoc-ai:active", 0) > 0:
            cache.decr("opendoc-ai:active")
    except ValueError:
        pass


def valid_messages(messages) -> bool:
    if not isinstance(messages, list) or not 1 <= len(messages) <= config.max_messages:
        return False
    total = 0
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in ("system", "user", "assistant"):
            return False
        content = message.get("content")
        if not isinstance(content, str) or len(content) > config.max_message_chars:
            return False
        total += len(content)
        if total > config.max_context_chars:
            return False
    return True


def select_model(body: dict) -> str:
    if body.get("provider") and body["provider"] != config.provider:
        raise ValueError(f"Provider is fixed to '{config.provider}' by the gateway.")
    model = body.get("model") if isinstance(body.get("model"), str) and body["model"].strip() else config.model
    if model not in config.allowed_models:
        raise ValueError(f"Model '{model}' is not allowed by this gateway.")
    return model


@csrf_exempt
def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({
        "ok": True,
        "authenticated": bool(config.token),
        "provider": config.provider,
        "model": config.model,
        "clientModelSelection": config.allow_client_model,
    })


@csrf_exempt
def models(request: HttpRequest) -> HttpResponse:
    if request.method == "OPTIONS":
        return cors(request, HttpResponse(status=204))
    if request.method != "POST":
        return failure(request, "Only POST and OPTIONS are allowed.", 405)
    slot = guard(request)
    if isinstance(slot, HttpResponse):
        return slot
    try:
        response = JsonResponse({
            "models": [
                {
                    "id": model,
                    "label": f"{model} · Gateway allowed",
                    "tier": "local" if config.provider == "ollama" else "free" if model.endswith(":free") else "premium",
                }
                for model in config.allowed_models
            ],
            "gateway": {
                "clientModelSelection": config.allow_client_model,
                "provider": config.provider,
                "model": config.model,
                **({"models": list(config.allowed_models)} if config.allow_client_model else {}),
            },
        })
        response["X-RateLimit-Limit"] = str(config.rate_limit)
        response["X-RateLimit-Remaining"] = str(slot)
        return cors(request, response)
    finally:
        release()


@csrf_exempt
def chat(request: HttpRequest) -> HttpResponse:
    if request.method == "OPTIONS":
        return cors(request, HttpResponse(status=204))
    if request.method != "POST":
        return failure(request, "Only POST and OPTIONS are allowed.", 405)
    slot = guard(request)
    if isinstance(slot, HttpResponse):
        return slot
    try:
        declared = int(request.headers.get("Content-Length", "0") or 0)
    except ValueError:
        declared = 0
    if declared > config.max_body_bytes or len(request.body) > config.max_body_bytes:
        release()
        return failure(request, "AI gateway request body is too large.", 413)
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        release()
        return failure(request, "A valid JSON request body is required.", 400)
    if not valid_messages(body.get("messages")):
        release()
        return failure(request, "The messages array exceeds gateway limits or is invalid.", 400)
    try:
        model = select_model(body)
    except ValueError as error:
        release()
        return failure(request, str(error), 400)
    if not config.api_key and config.provider != "ollama":
        release()
        return failure(request, "AI_API_KEY is not configured on the gateway.", 503)
    url = config.base_url if config.base_url.endswith("/chat/completions") else f"{config.base_url}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    payload = {
        "model": model,
        "messages": body["messages"],
        "temperature": min(2, max(0, body.get("temperature", 0.2)))
        if isinstance(body.get("temperature", 0.2), (int, float))
        else 0.2,
        "max_tokens": config.max_output_tokens,
        "stream": True,
    }
    try:
        upstream = requests.post(url, headers=headers, json=payload, timeout=config.timeout_seconds, stream=True)
    except requests.RequestException:
        release()
        return failure(request, "AI upstream could not be reached.", 502)
    if not upstream.ok:
        release()
        try:
            message = upstream.json().get("error", {}).get("message") or upstream.json().get("message")
        except Exception:
            message = upstream.text[:16_384]
        status = upstream.status_code
        upstream.close()
        return failure(request, message or f"Upstream returned HTTP {status}.", 502, code="upstream_error", status=status, provider=config.provider, model=model)

    def iterator():
        try:
            yield from upstream.iter_content(chunk_size=8192)
        finally:
            upstream.close()
            release()

    response = StreamingHttpResponse(iterator(), content_type=upstream.headers.get("Content-Type", "text/event-stream; charset=utf-8"))
    response["Cache-Control"] = "no-cache, no-transform"
    response["X-Accel-Buffering"] = "no"
    response["X-RateLimit-Limit"] = str(config.rate_limit)
    response["X-RateLimit-Remaining"] = str(slot)
    return cors(request, response)
