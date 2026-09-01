← [Back to README](../README.md) · [Docs index](index.md)

---

# Optional AI gateway

The gateway is not required for `npm run build`. Use it when a provider blocks browser CORS or
when provider keys should stay server-side. **A gateway token is mandatory outside explicit
local development.** The default CORS allowlist is `http://localhost:3000,http://127.0.0.1:3000`;
never deploy with a wildcard origin unless you understand the risk.

```bash
# Trusted local Ollama gateway (development only)
AI_GATEWAY_DEV_MODE=true \\
AI_GATEWAY_TOKEN=local-dev-token \\
AI_GATEWAY_ORIGIN=http://localhost:3000 \\
AI_PROVIDER=ollama AI_MODEL=llama3.2 \\
npm run ai-gateway

# Hosted provider gateway with a fixed server-side model
NODE_ENV=production \\
AI_GATEWAY_TOKEN=replace-with-a-long-random-token \\
AI_GATEWAY_ORIGIN=https://docs.example.com \\
AI_PROVIDER=openrouter \\
AI_MODEL=your-model-id \\
AI_API_KEY=your-provider-key \\
npm run ai-gateway
```

In the assistant settings, choose **Gateway** transport. During development use `/api/ai`; Vite
proxies that path to `http://127.0.0.1:8787`. For a separately deployed gateway, enter its full
URL instead. The gateway never accepts a provider key or base URL from the browser.

The gateway always owns `AI_PROVIDER`, `AI_API_KEY`, and `AI_BASE_URL`. By default it is locked to
`AI_MODEL`; a browser request that submits a different selection receives a clear error rather than
silently using a different upstream model. If the UI should choose among approved models, enable
client selection and provide a non-empty exact allowlist that includes `AI_MODEL`:

```bash
AI_GATEWAY_ALLOW_CLIENT_MODEL=true \\
AI_GATEWAY_ALLOWED_MODELS=openrouter/free,openai/gpt-4o-mini \\
AI_GATEWAY_TOKEN=replace-with-a-long-random-token \\
AI_PROVIDER=openrouter AI_MODEL=openrouter/free \\
npm run ai-gateway
```

The gateway also enforces per-IP rate limits, a concurrency limit, request/message/context limits,
maximum output tokens, and an upstream timeout. Tune them with `AI_GATEWAY_RATE_LIMIT`,
`AI_GATEWAY_MAX_CONCURRENT`, `AI_GATEWAY_MAX_MESSAGES`, `AI_GATEWAY_MAX_CONTEXT_CHARS`,
`AI_GATEWAY_MAX_OUTPUT_TOKENS`, and `AI_GATEWAY_UPSTREAM_TIMEOUT_MS`. `/health` is intentionally
minimal; chat and model discovery require `Authorization: Bearer <AI_GATEWAY_TOKEN>`.

## Managed AI mode (zero-config for users)

Managed mode is the enterprise alternative to user profiles: the organization configures the
assistant once on its backend, and every user's OpenDoc UI discovers and locks to it — no provider
profiles, no AI settings UI, and no authorization data in the browser, ever.

Enable it on the reference gateway:

```bash
NODE_ENV=production \
AI_GATEWAY_MANAGED=true \
AI_GATEWAY_AUTH_MODE=ambient \
AI_GATEWAY_SUBJECT_HEADER=X-Forwarded-User \
AI_GATEWAY_DISPLAY_NAME=Acme Assistant \
AI_PROVIDER=openrouter AI_MODEL=your-model-id AI_API_KEY=your-provider-key \
npm run ai-gateway
```

The UI probes `GET /api/ai/policy` on its own origin at startup. When a managed descriptor answers:

- the assistant works immediately — no profile creation, no token, no settings;
- provider, model, and authorization stay server-side; the policy payload is secret-free and the
  client normalizer drops unknown and credential-shaped fields;
- `AI_GATEWAY_AUTH_MODE=ambient` (default) delegates user authentication to the perimeter in front
  of the gateway (SSO session / reverse proxy); never expose such a gateway directly to the
  internet. `AI_GATEWAY_SUBJECT_HEADER` optionally keys per-user rate limits from an edge identity
  header (the edge must overwrite it for untrusted requests);
- model identity is masked by default (`AI_GATEWAY_EXPOSE_MODEL=true` publishes it);
- generation behavior is server-locked: `AI_GATEWAY_LOCK_TEMPERATURE=true` (default) ignores the
  client temperature in favor of `AI_GATEWAY_TEMPERATURE`;
- skill packs are server-curated via `AI_GATEWAY_ALLOWED_SKILL_PACKS`;
- existing local profiles are never touched — they simply stay dormant while managed mode is
  active and return if managed mode is removed;
- with no managed backend answering (404 / 502 / offline), the app behaves exactly like the
  classic profile flow.

`AI_GATEWAY_AUTH_MODE=token` keeps the classic bearer-token check and is meant for split
deployments where the UI and the gateway live on different origins.

Activation precedence: the runtime `ai.managed` config block wins, then build-time env, then the
silent same-origin default probe:

```json
{
  "ai": {
    "managed": {"enabled": true, "policyUrl": "/api/ai/policy"}
  }
}
```

Build-time env: `VITE_AI_MANAGED` and `VITE_AI_MANAGED_POLICY_URL` (default `/api/ai/policy`); set
`VITE_AI_MANAGED=false` to hard-disable probing. For the fastest path, `docker compose --profile
managed-ai up -d --build` starts the UI plus the reference gateway with nginx already proxying
`/api/ai`. The framework examples in `ai-gateways/` share the same policy contract, documented in
`ai-gateways/config.env.example`.

## Framework AI gateway examples

The `ai-gateways/` directory provides explicit integrations for popular languages and frameworks—not
just generic language samples:

| Directory     | Language / framework | Form                                                |
| ------------- | -------------------- | --------------------------------------------------- |
| `express`     | Node.js / Express    | Standalone app and reusable `createGatewayApp()`    |
| `fastapi`     | Python / FastAPI     | Standalone ASGI app                                 |
| `django`      | Python / Django      | Installable app views and URL configuration         |
| `laravel`     | PHP / Laravel        | Controller, routes, config, and service provider    |
| `gin`         | Go / Gin             | Standalone app with reusable handler logic          |
| `spring-boot` | Java / Spring Boot   | Controller, limits service, and standalone launcher |
| `aspnet-core` | C# / ASP.NET Core    | Minimal host and reusable endpoint extension        |
| `rails`       | Ruby / Rails         | API controller, initializer, and routes             |
| `axum`        | Rust / Axum          | Standalone Tokio/Axum service                       |

All examples implement the frontend's exact gateway contract:

```http
GET  /health
POST /api/ai/models
POST /api/ai/chat
OPTIONS /api/ai/*
```

`/api/ai/chat` accepts the OpenDoc message payload and relays an OpenAI-compatible streaming or JSON
response. `/api/ai/models` returns only the server-owned model or the exact server allowlist. The
browser can never submit an API key, base URL, arbitrary upstream provider, or unapproved model.

Copy `ai-gateways/config.env.example` and configure the same environment for any implementation:

```env
AI_GATEWAY_TOKEN=replace-with-a-long-random-token
AI_GATEWAY_ORIGINS=https://docs.example.com
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-provider-key

AI_GATEWAY_ALLOW_CLIENT_MODEL=false
AI_GATEWAY_ALLOWED_MODELS=gpt-4o-mini
AI_GATEWAY_RATE_LIMIT=30
AI_GATEWAY_MAX_CONCURRENT=4
AI_GATEWAY_MAX_MESSAGES=24
AI_GATEWAY_MAX_MESSAGE_CHARS=40000
AI_GATEWAY_MAX_CONTEXT_CHARS=250000
AI_GATEWAY_MAX_OUTPUT_TOKENS=2048
AI_GATEWAY_UPSTREAM_TIMEOUT_MS=60000
AI_GATEWAY_MAX_BODY_BYTES=1048576
PORT=8787
```

These framework adapters deliberately target **OpenAI-compatible** upstreams: OpenAI, OpenRouter,
Ollama, LM Studio, vLLM, and custom compatible services. Set `AI_PROVIDER=custom` for another
compatible backend. The repository's primary Express gateway in `server/ai-gateway.ts` remains the
full adapter when native Anthropic or Gemini protocols are required.

Every adapter provides exact-origin CORS checks, bearer gateway authentication, fixed/allowlisted
models, message/context/body limits, upstream timeouts, rate limiting, concurrency limiting,
provider-key isolation, bounded upstream error messages, and streaming pass-through. Use a shared
Redis/database cache for rate and concurrency counters when Laravel, Django, or Rails runs with
multiple workers; for multiple standalone replicas, enforce an additional shared limit at the load
balancer. Never expose a hosted gateway with `AI_GATEWAY_DEV_MODE=true`.

### Express

```bash
cd ai-gateways/express
npm install
npm start
```

Mount `createGatewayApp(configFromEnv())` in a larger Node service, or run `server.mjs` directly.

### FastAPI

```bash
cd ai-gateways/fastapi
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8787
```

The exported `app` can also be mounted inside an existing FastAPI/Starlette deployment.

### Laravel

Copy `ai-gateways/laravel/app`, `config/opendoc-ai.php`, and `routes/opendoc-ai.php` into the matching
Laravel directories. Register `App\Providers\OpenDocAiServiceProvider::class` in
`bootstrap/providers.php`. The controller uses Laravel HTTP streaming, RateLimiter, and Cache; use
Redis in production so limits are shared across workers.

### Django

Install `ai-gateways/django/requirements.txt`, copy `opendoc_ai` into the project, add
`"opendoc_ai"` to `INSTALLED_APPS`, and include its URL patterns:

```python
path("", include("opendoc_ai.urls"))
```

Use a shared Django cache backend in multi-worker deployments.

### Gin

```bash
cd ai-gateways/gin
go run .
```

`main.go` contains the Gin middleware, gateway guards, catalog endpoint, and streaming relay in one
copyable service.

### Spring Boot

```bash
cd ai-gateways/spring-boot
mvn spring-boot:run
```

Existing Spring applications can register `GatewayController`, `GatewayLimits`, and
`GatewayConfig` instead of using the included launcher.

### ASP.NET Core

```bash
cd ai-gateways/aspnet-core
dotnet run
```

For an existing app, call `app.MapOpenDocAiGateway(config)` and install
`GatewayEndpoints.CorsMiddleware` as shown in `Program.cs`.

### Rails

Copy the controller and initializer into an API-mode Rails application, merge the supplied routes,
and add the gems from `Gemfile.fragment`. Configure Redis-backed `Rails.cache` for multiple workers.

### Axum

```bash
cd ai-gateways/axum
cargo run --release
```

The Axum implementation streams upstream bytes without buffering the model response and holds its
concurrency permit until the client stream finishes.

Standalone examples include Dockerfiles. Put any implementation behind HTTPS and enter either its
origin or `/api/ai` in the OpenDoc assistant's **Gateway URL** field.
---

← [Back to README](../README.md)
