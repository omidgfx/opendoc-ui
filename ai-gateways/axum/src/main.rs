use std::{collections::{HashMap, HashSet}, env, sync::Arc, time::{Duration, SystemTime, UNIX_EPOCH}};

use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    extract::{ConnectInfo, DefaultBodyLimit, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};
use tower_http::cors::{AllowOrigin, CorsLayer};

#[derive(Clone)]
struct Config {
    token: String, dev_mode: bool, origins: HashSet<String>, provider: String, model: String,
    base_url: String, api_key: String, allow_client_model: bool, allowed_models: HashSet<String>,
    rate_limit: usize, max_messages: usize, max_message_chars: usize, max_context_chars: usize,
    max_output_tokens: usize, timeout: Duration, max_body_bytes: usize, site_url: String, app_name: String,
}

#[derive(Clone)]
struct AppState {
    config: Arc<Config>, client: reqwest::Client, semaphore: Arc<Semaphore>,
    rates: Arc<Mutex<HashMap<String, (u64, usize)>>>,
}

#[derive(Deserialize, Serialize, Clone)]
struct Message { role: String, content: String }

#[derive(Deserialize)]
struct ChatInput { provider: Option<String>, model: Option<String>, messages: Vec<Message>, temperature: Option<f64> }

fn csv(value: String) -> Vec<String> { value.split(',').map(str::trim).filter(|v| !v.is_empty()).map(str::to_owned).collect() }
fn env_or(name: &str, fallback: &str) -> String { env::var(name).ok().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| fallback.to_owned()) }
fn positive(name: &str, fallback: usize) -> usize { env::var(name).ok().and_then(|v| v.parse().ok()).filter(|v| *v > 0).unwrap_or(fallback) }

fn config() -> Config {
    let model = env_or("AI_MODEL", "");
    assert!(!model.is_empty(), "AI_MODEL is required.");
    let provider = env_or("AI_PROVIDER", "openai");
    assert!(["openai", "openrouter", "ollama", "custom"].contains(&provider.as_str()), "Framework gateway examples require an OpenAI-compatible AI_PROVIDER.");
    let allow = env_or("AI_GATEWAY_ALLOW_CLIENT_MODEL", "false") == "true";
    let allowed_models: HashSet<_> = if allow { csv(env_or("AI_GATEWAY_ALLOWED_MODELS", "")) } else { vec![model.clone()] }.into_iter().collect();
    assert!(!allowed_models.iter().any(|value| value.contains('*')), "AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.");
    assert!(!allowed_models.is_empty() && allowed_models.contains(&model), "AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.");
    let token = env_or("AI_GATEWAY_TOKEN", "");
    let dev_mode = env_or("AI_GATEWAY_DEV_MODE", "false") == "true";
    assert!(!token.is_empty() || dev_mode, "AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.");
    Config {
        token, dev_mode,
        origins: csv(env_or("AI_GATEWAY_ORIGINS", &env_or("AI_GATEWAY_ORIGIN", "http://localhost:3000"))).into_iter().collect(),
        provider, model,
        base_url: env_or("AI_BASE_URL", "https://api.openai.com/v1").trim_end_matches('/').to_owned(),
        api_key: env_or("AI_API_KEY", ""), allow_client_model: allow, allowed_models,
        rate_limit: positive("AI_GATEWAY_RATE_LIMIT", 30), max_messages: positive("AI_GATEWAY_MAX_MESSAGES", 24),
        max_message_chars: positive("AI_GATEWAY_MAX_MESSAGE_CHARS", 40_000),
        max_context_chars: positive("AI_GATEWAY_MAX_CONTEXT_CHARS", 250_000),
        max_output_tokens: positive("AI_GATEWAY_MAX_OUTPUT_TOKENS", 2_048),
        timeout: Duration::from_millis(positive("AI_GATEWAY_UPSTREAM_TIMEOUT_MS", 60_000) as u64),
        max_body_bytes: positive("AI_GATEWAY_MAX_BODY_BYTES", 1_048_576),
        site_url: env_or("AI_SITE_URL", ""), app_name: env_or("AI_APP_NAME", "OpenDoc UI"),
    }
}

#[tokio::main]
async fn main() {
    let config = Arc::new(config());
    let state = AppState {
        client: reqwest::Client::builder().timeout(config.timeout).build().expect("HTTP client"),
        semaphore: Arc::new(Semaphore::new(positive("AI_GATEWAY_MAX_CONCURRENT", 4))),
        rates: Arc::new(Mutex::new(HashMap::new())), config: config.clone(),
    };
    let allowed_origins: Vec<HeaderValue> = config.origins.iter().filter_map(|value| value.parse().ok()).collect();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .expose_headers([
            header::HeaderName::from_static("x-ratelimit-limit"),
            header::HeaderName::from_static("x-ratelimit-remaining"),
            header::RETRY_AFTER,
        ]);
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/ai/models", post(models).options(preflight))
        .route("/api/ai/chat", post(chat).options(preflight))
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        .layer(cors)
        .with_state(state);
    let bind = env_or("AI_GATEWAY_BIND", "0.0.0.0");
    let port = env_or("PORT", "8787");
    let listener = tokio::net::TcpListener::bind(format!("{bind}:{port}")).await.expect("bind gateway");
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await.expect("serve gateway");
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"ok": true, "authenticated": !state.config.token.is_empty(), "provider": state.config.provider,
        "model": state.config.model, "clientModelSelection": state.config.allow_client_model}))
}

async fn preflight(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match cors_headers(&state.config, &headers) {
        Ok(cors) => with_headers(StatusCode::NO_CONTENT.into_response(), cors),
        Err(response) => response,
    }
}

async fn guard(state: &AppState, headers: &HeaderMap, client: String) -> Result<(OwnedSemaphorePermit, usize, Vec<(header::HeaderName, HeaderValue)>), Response> {
    let cors = cors_headers(&state.config, headers)?;
    let expected_token = format!("Bearer {}", state.config.token);
    if !state.config.token.is_empty()
        && headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) != Some(expected_token.as_str())
    {
        return Err(with_headers(error(StatusCode::UNAUTHORIZED, "Invalid AI gateway token.", json!({})), cors));
    }
    let minute = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() / 60;
    let mut rates = state.rates.lock().await;
    let entry = rates.entry(client).or_insert((minute, 0));
    if entry.0 != minute { *entry = (minute, 0); }
    entry.1 += 1;
    if entry.1 > state.config.rate_limit {
        return Err(with_headers(error(StatusCode::TOO_MANY_REQUESTS, "AI gateway rate limit exceeded.", json!({})), cors));
    }
    let remaining = state.config.rate_limit - entry.1;
    drop(rates);
    let permit = state.semaphore.clone().try_acquire_owned().map_err(|_| with_headers(error(StatusCode::TOO_MANY_REQUESTS, "AI gateway is busy.", json!({})), cors.clone()))?;
    Ok((permit, remaining, cors))
}

async fn models(State(state): State<AppState>, ConnectInfo(address): ConnectInfo<std::net::SocketAddr>, headers: HeaderMap) -> Response {
    let (_permit, remaining, mut cors) = match guard(&state, &headers, address.ip().to_string()).await { Ok(value) => value, Err(response) => return response };
    cors.push((header::HeaderName::from_static("x-ratelimit-limit"), HeaderValue::from_str(&state.config.rate_limit.to_string()).unwrap()));
    cors.push((header::HeaderName::from_static("x-ratelimit-remaining"), HeaderValue::from_str(&remaining.to_string()).unwrap()));
    let models: Vec<_> = state.config.allowed_models.iter().map(|model| json!({"id": model, "label": format!("{model} · Gateway allowed"),
        "tier": if state.config.provider == "ollama" { "local" } else if model.ends_with(":free") { "free" } else { "premium" }})).collect();
    let mut gateway = json!({"clientModelSelection": state.config.allow_client_model, "provider": state.config.provider, "model": state.config.model});
    if state.config.allow_client_model { gateway["models"] = json!(state.config.allowed_models); }
    with_headers(Json(json!({"models": models, "gateway": gateway})).into_response(), cors)
}

async fn chat(State(state): State<AppState>, ConnectInfo(address): ConnectInfo<std::net::SocketAddr>, headers: HeaderMap, body: Bytes) -> Response {
    let (permit, remaining, mut cors) = match guard(&state, &headers, address.ip().to_string()).await { Ok(value) => value, Err(response) => return response };
    let input: ChatInput = match serde_json::from_slice(&body) { Ok(value) => value, Err(_) => return with_headers(error(StatusCode::BAD_REQUEST, "A valid JSON request body is required.", json!({})), cors) };
    if !valid_messages(&input.messages, &state.config) { return with_headers(error(StatusCode::BAD_REQUEST, "The messages array exceeds gateway limits or is invalid.", json!({})), cors); }
    if input.provider.as_deref().filter(|v| !v.is_empty()) .is_some_and(|v| v != state.config.provider) {
        return with_headers(error(StatusCode::BAD_REQUEST, &format!("Provider is fixed to '{}' by the gateway.", state.config.provider), json!({})), cors);
    }
    let model = input.model.filter(|v| !v.trim().is_empty()).unwrap_or_else(|| state.config.model.clone());
    if !state.config.allowed_models.contains(&model) { return with_headers(error(StatusCode::BAD_REQUEST, &format!("Model '{model}' is not allowed by this gateway."), json!({})), cors); }
    if state.config.api_key.is_empty() && state.config.provider != "ollama" { return with_headers(error(StatusCode::SERVICE_UNAVAILABLE, "AI_API_KEY is not configured on the gateway.", json!({})), cors); }
    let url = if state.config.base_url.ends_with("/chat/completions") { state.config.base_url.clone() } else { format!("{}/chat/completions", state.config.base_url) };
    let mut request = state.client.post(url).json(&json!({"model": model, "messages": input.messages,
        "temperature": input.temperature.unwrap_or(0.2).clamp(0.0, 2.0), "max_tokens": state.config.max_output_tokens, "stream": true}));
    if !state.config.api_key.is_empty() { request = request.bearer_auth(&state.config.api_key); }
    if !state.config.site_url.is_empty() { request = request.header("HTTP-Referer", &state.config.site_url); }
    if !state.config.app_name.is_empty() { request = request.header("X-Title", &state.config.app_name); }
    let upstream = match request.send().await { Ok(value) => value, Err(_) => return with_headers(error(StatusCode::BAD_GATEWAY, "AI upstream could not be reached.", json!({})), cors) };
    let status = upstream.status();
    if !status.is_success() {
        let raw = upstream.bytes().await.unwrap_or_default();
        let message = upstream_message(&raw[..raw.len().min(16_384)], status.as_u16());
        return with_headers(error(StatusCode::BAD_GATEWAY, &message, json!({"code": "upstream_error", "status": status.as_u16(), "provider": state.config.provider, "model": model})), cors);
    }
    let content_type = upstream.headers().get(header::CONTENT_TYPE).cloned().unwrap_or_else(|| HeaderValue::from_static("text/event-stream; charset=utf-8"));
    cors.push((header::CONTENT_TYPE, content_type));
    cors.push((header::CACHE_CONTROL, HeaderValue::from_static("no-cache, no-transform")));
    cors.push((header::HeaderName::from_static("x-accel-buffering"), HeaderValue::from_static("no")));
    cors.push((header::HeaderName::from_static("x-ratelimit-limit"), HeaderValue::from_str(&state.config.rate_limit.to_string()).unwrap()));
    cors.push((header::HeaderName::from_static("x-ratelimit-remaining"), HeaderValue::from_str(&remaining.to_string()).unwrap()));
    let mut bytes = upstream.bytes_stream();
    let output = stream! {
        let _permit = permit;
        while let Some(chunk) = bytes.next().await {
            yield chunk.map_err(|error| std::io::Error::other(error));
        }
    };
    with_headers(Response::new(Body::from_stream(output)), cors)
}

fn valid_messages(messages: &[Message], config: &Config) -> bool {
    if messages.is_empty() || messages.len() > config.max_messages { return false; }
    let mut total = 0;
    for message in messages { if !matches!(message.role.as_str(), "system" | "user" | "assistant") || message.content.len() > config.max_message_chars { return false; } total += message.content.len(); if total > config.max_context_chars { return false; } }
    true
}

fn cors_headers(config: &Config, headers: &HeaderMap) -> Result<Vec<(header::HeaderName, HeaderValue)>, Response> {
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()).unwrap_or("");
    if !origin.is_empty() && !config.origins.contains(origin) { return Err(error(StatusCode::FORBIDDEN, "Origin is not allowed by this AI gateway.", json!({}))); }
    let mut output = vec![(header::VARY, HeaderValue::from_static("Origin")),
        (header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type, Authorization")),
        (header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, OPTIONS")),
        (header::ACCESS_CONTROL_EXPOSE_HEADERS, HeaderValue::from_static("X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After"))];
    if !origin.is_empty() { output.push((header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_str(origin).unwrap())); }
    Ok(output)
}

fn with_headers(mut response: Response, headers: Vec<(header::HeaderName, HeaderValue)>) -> Response { for (name, value) in headers { response.headers_mut().insert(name, value); } response }
fn error(status: StatusCode, message: &str, details: Value) -> Response { let mut value = json!({"message": message}); if let (Some(target), Some(source)) = (value.as_object_mut(), details.as_object()) { target.extend(source.clone()); } (status, Json(json!({"error": value}))).into_response() }
fn upstream_message(raw: &[u8], status: u16) -> String { serde_json::from_slice::<Value>(raw).ok().and_then(|v| v.pointer("/error/message").or_else(|| v.get("message")).and_then(Value::as_str).map(str::to_owned)).unwrap_or_else(|| if raw.is_empty() { format!("Upstream returned HTTP {status}.") } else { String::from_utf8_lossy(raw).into_owned() }) }
