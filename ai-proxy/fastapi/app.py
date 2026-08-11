from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse


def csv(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def positive_int(value: str | None, fallback: int) -> int:
    try:
        parsed = int(value or "")
        return parsed if parsed > 0 else fallback
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
    allowed_models: frozenset[str]
    rate_limit: int
    max_concurrent: int
    max_messages: int
    max_message_chars: int
    max_context_chars: int
    max_output_tokens: int
    timeout_seconds: float
    max_body_bytes: int
    site_url: str
    app_name: str

    @staticmethod
    def from_env() -> "Config":
        model = os.getenv("AI_MODEL", "").strip()
        if not model:
            raise RuntimeError("AI_MODEL is required.")
        provider = os.getenv("AI_PROVIDER", "openai")
        if provider not in ("openai", "openrouter", "ollama", "custom"):
            raise RuntimeError("Framework gateway examples require an OpenAI-compatible AI_PROVIDER.")
        allow_client = os.getenv("AI_GATEWAY_ALLOW_CLIENT_MODEL") == "true"
        allowed = frozenset(csv(os.getenv("AI_GATEWAY_ALLOWED_MODELS"))) if allow_client else frozenset((model,))
        if any("*" in value for value in allowed):
            raise RuntimeError("AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.")
        if not allowed or model not in allowed:
            raise RuntimeError("AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.")
        config = Config(
            token=os.getenv("AI_GATEWAY_TOKEN", ""),
            dev_mode=os.getenv("AI_GATEWAY_DEV_MODE") == "true",
            origins=tuple(csv(os.getenv("AI_GATEWAY_ORIGINS") or os.getenv("AI_GATEWAY_ORIGIN") or "http://localhost:3000")),
            provider=provider,
            model=model,
            base_url=os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            api_key=os.getenv("AI_API_KEY", ""),
            allow_client_model=allow_client,
            allowed_models=allowed,
            rate_limit=positive_int(os.getenv("AI_GATEWAY_RATE_LIMIT"), 30),
            max_concurrent=positive_int(os.getenv("AI_GATEWAY_MAX_CONCURRENT"), 4),
            max_messages=positive_int(os.getenv("AI_GATEWAY_MAX_MESSAGES"), 24),
            max_message_chars=positive_int(os.getenv("AI_GATEWAY_MAX_MESSAGE_CHARS"), 40_000),
            max_context_chars=positive_int(os.getenv("AI_GATEWAY_MAX_CONTEXT_CHARS"), 250_000),
            max_output_tokens=positive_int(os.getenv("AI_GATEWAY_MAX_OUTPUT_TOKENS"), 2_048),
            timeout_seconds=positive_int(os.getenv("AI_GATEWAY_UPSTREAM_TIMEOUT_MS"), 60_000) / 1000,
            max_body_bytes=positive_int(os.getenv("AI_GATEWAY_MAX_BODY_BYTES"), 1_048_576),
            site_url=os.getenv("AI_SITE_URL", ""),
            app_name=os.getenv("AI_APP_NAME", "OpenDoc UI"),
        )
        if not config.token and not config.dev_mode:
            raise RuntimeError("AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.")
        return config


config = Config.from_env()
app = FastAPI(title="OpenDoc AI gateway", docs_url=None, redoc_url=None)
rate_buckets: dict[str, list[float]] = {}
rate_lock = asyncio.Lock()
active_requests = 0
active_lock = asyncio.Lock()


def error(message: str, status: int, **details) -> JSONResponse:
    return JSONResponse({"error": {"message": message, **details}}, status_code=status)


@app.middleware("http")
async def gateway_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    if origin and origin not in config.origins:
        return error("Origin is not allowed by this AI gateway.", 403)
    if request.method == "OPTIONS":
        response: Response = Response(status_code=204)
    else:
        try:
            declared = int(request.headers.get("content-length", "0") or 0)
        except ValueError:
            declared = 0
        if declared > config.max_body_bytes:
            return error("AI gateway request body is too large.", 413)
        response = await call_next(request)
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Expose-Headers"] = "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After"
    return response


async def acquire(request: Request):
    global active_requests
    if config.token and request.headers.get("authorization") != f"Bearer {config.token}":
        return error("Invalid AI gateway token.", 401)
    client = request.client.host if request.client else "unknown"
    now = time.time()
    async with rate_lock:
        recent = [stamp for stamp in rate_buckets.get(client, []) if now - stamp < 60]
        if len(recent) >= config.rate_limit:
            response = error("AI gateway rate limit exceeded.", 429)
            response.headers["Retry-After"] = "60"
            return response
        recent.append(now)
        rate_buckets[client] = recent
        remaining = max(0, config.rate_limit - len(recent))
    async with active_lock:
        if active_requests >= config.max_concurrent:
            response = error("AI gateway is busy.", 429)
            response.headers["Retry-After"] = "2"
            return response
        active_requests += 1
    return remaining


async def release() -> None:
    global active_requests
    async with active_lock:
        active_requests = max(0, active_requests - 1)


def select_model(body: dict) -> str:
    if body.get("provider") and body["provider"] != config.provider:
        raise ValueError(f"Provider is fixed to '{config.provider}' by the gateway.")
    model = body.get("model") if isinstance(body.get("model"), str) and body["model"].strip() else config.model
    if model not in config.allowed_models:
        raise ValueError(f"Model '{model}' is not allowed by this gateway.")
    return model


def validate_messages(messages) -> bool:
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


def model_tier(model: str) -> str:
    return "local" if config.provider == "ollama" else "free" if model.endswith(":free") else "premium"


@app.get("/health")
async def health():
    return {
        "ok": True,
        "authenticated": bool(config.token),
        "provider": config.provider,
        "model": config.model,
        "clientModelSelection": config.allow_client_model,
    }


@app.post("/api/ai/models")
async def models(request: Request):
    slot = await acquire(request)
    if isinstance(slot, Response):
        return slot
    try:
        response = JSONResponse(
            {
                "models": [
                    {"id": model, "label": f"{model} · Gateway allowed", "tier": model_tier(model)}
                    for model in config.allowed_models
                ],
                "gateway": {
                    "clientModelSelection": config.allow_client_model,
                    "provider": config.provider,
                    "model": config.model,
                    **({"models": list(config.allowed_models)} if config.allow_client_model else {}),
                },
            }
        )
        response.headers["X-RateLimit-Limit"] = str(config.rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(slot)
        return response
    finally:
        await release()


@app.post("/api/ai/chat")
async def chat(request: Request):
    slot = await acquire(request)
    if isinstance(slot, Response):
        return slot
    try:
        raw = await request.body()
        if len(raw) > config.max_body_bytes:
            await release()
            return error("AI gateway request body is too large.", 413)
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            await release()
            return error("A valid JSON request body is required.", 400)
        if not validate_messages(body.get("messages")):
            await release()
            return error("The messages array exceeds gateway limits or is invalid.", 400)
        try:
            model = select_model(body)
        except ValueError as failure:
            await release()
            return error(str(failure), 400)
        if not config.api_key and config.provider != "ollama":
            await release()
            return error("AI_API_KEY is not configured on the gateway.", 503)
        url = config.base_url if config.base_url.endswith("/chat/completions") else f"{config.base_url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"
        if config.site_url:
            headers["HTTP-Referer"] = config.site_url
        if config.app_name:
            headers["X-Title"] = config.app_name
        payload = {
            "model": model,
            "messages": body["messages"],
            "temperature": min(2, max(0, body.get("temperature", 0.2)))
            if isinstance(body.get("temperature", 0.2), (int, float))
            else 0.2,
            "max_tokens": config.max_output_tokens,
            "stream": True,
        }
        client = httpx.AsyncClient(timeout=httpx.Timeout(config.timeout_seconds))
        upstream_request = client.build_request("POST", url, headers=headers, json=payload)
        upstream = await client.send(upstream_request, stream=True)
        if not upstream.is_success:
            data = (await upstream.aread())[:16_384]
            await upstream.aclose()
            await client.aclose()
            await release()
            try:
                parsed = json.loads(data)
                message = parsed.get("error", {}).get("message") or parsed.get("message")
            except Exception:
                message = data.decode(errors="replace")
            return error(message or f"Upstream returned HTTP {upstream.status_code}.", 502, code="upstream_error", status=upstream.status_code, provider=config.provider, model=model)

        async def stream() -> AsyncIterator[bytes]:
            try:
                async for chunk in upstream.aiter_raw():
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()
                await release()

        response = StreamingResponse(stream(), media_type=upstream.headers.get("content-type", "text/event-stream"))
        response.headers["Cache-Control"] = "no-cache, no-transform"
        response.headers["X-Accel-Buffering"] = "no"
        response.headers["X-RateLimit-Limit"] = str(config.rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(slot)
        return response
    except Exception as failure:
        await release()
        return error(str(failure) or "AI gateway request failed.", 502)
