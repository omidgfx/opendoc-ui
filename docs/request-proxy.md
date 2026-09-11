← [Back to README](../README.md) · [Docs index](index.md)

---

# Request proxy

The OpenDoc UI proxy agent doubles as a **request proxy**: the Runner can hand every
compiled request to it, the service executes the real API call server-side, and the response
travels back through an envelope — so APIs that send no CORS headers (or live on schemes and
ports the browser would block) are fully testable. The same service still downloads
specifications; nothing about `GET /download` changes.

## Enabling it in a build

```env
VITE_REQUEST_PROXY=proxy.example.com/proxy
```

The endpoint accepts either a full URL or a scheme-less host+path; like the proxy agent
template, its scheme is replaced with the scheme currently serving OpenDoc UI, so an HTTPS
deployment never calls an HTTP proxy. An empty or missing `VITE_REQUEST_PROXY` builds the app
without proxy support and the Runner behaves exactly as before (direct browser requests).

## Disabling it on the front-end

A build that ships with the proxy can still opt out at runtime — the backend keeps running
either way:

- **runtime config:** a `proxy` block in `config.json` / `window.INITIAL_CONFIG` wins for the
  deployment: `{"proxy": {"enabled": false}}` turns the proxy off for everyone, and
  `{"proxy": {"url": "..."}}` redirects it to another endpoint;
- **per user:** Settings → General shows a "Route runner requests through the proxy" switch
  (only in proxy builds) that stores the preference locally.

Precedence: build flag → runtime `enabled: false` → user preference. With the proxy inactive,
requests go straight from the browser to the API server, with the usual CORS rules applying.

## Wire contract

The browser POSTs to the proxy endpoint. Target URL, method, and headers travel as descriptor
headers; the request body — including multipart forms and binary streams — is forwarded exactly
as the Runner built it, with its content type:

| Header                     | Meaning                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `X-OpenDoc-Target-Url`     | The API URL to call                                             |
| `X-OpenDoc-Target-Method`  | HTTP method for the target                                      |
| `X-OpenDoc-Target-Headers` | JSON object of headers to send to the target (cookies included) |

The answer is a JSON envelope:

```json
{
  "status": 200,
  "statusText": "OK",
  "headers": {"content-type": "application/json"},
  "finalUrl": "https://api.example.com/v1/things",
  "body": "<base64>",
  "bodyEncoding": "base64",
  "durationMs": 41
}
```

Redirects are followed server-side up to `OPENDOC_MAX_REDIRECTS`, and `finalUrl` (plus the
`X-OpenDoc-Final-URL` response header) reports where the call landed. Errors answer as
`{"error": {"code", "message"}}` with a 4xx/5xx status and are surfaced in the Runner as proxy
failures — there is deliberately **no silent fallback** to a direct request; switching back to
direct is a setting, not a guess.

## Safety

The proxy reuses the proxy agent's guards: browser origin allowlist (`OPENDOC_ALLOWED_ORIGINS`),
per-client rate limiting, response size cap (`OPENDOC_MAX_BYTES`), timeout
(`OPENDOC_TIMEOUT_SECONDS`), and the SSRF policy — private, reserved, and local destinations
are blocked unless explicitly allowlisted with `OPENDOC_ALLOWED_REMOTE_HOSTS` /
`OPENDOC_ALLOWED_PORTS`. Hop-by-hop headers (`Host`, `Connection`, `Transfer-Encoding`, …) are
stripped before forwarding. `OPENDOC_PROXY_ENABLED=false` serves downloads only.

The reference implementation is `proxy-agent/node/server.mjs` (`POST /proxy` next to
`GET /download`); the shared environment contract lives in `proxy-agent/config.env.example`.
Code generators and OAuth flows keep describing direct calls — the proxy is a transport for the
Runner only.

See also: [Proxy agent services](proxy-agent.md) · [Remote URL loading](remote-loading.md) ·
[API Runner](api-runner.md)
