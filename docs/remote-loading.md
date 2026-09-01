← [Back to README](../README.md) · [Docs index](index.md)

---

# Remote URL loading and downloader proxies

Remote URL loading is an optional, build-time capability. When enabled, the specification selector
gets a **Load from URL** action, a dedicated URL modal, classified request errors, CORS help, and a
bounded recent-URL history. Downloaded documents use the same OpenAPI parser, diagnostics, cache,
last-known-good fallback, IndexedDB storage, tabs, and deep links as configured specifications.

Remote history keys contain only a stable hash; the complete source URL is not written into the URL
fragment. The URL is retained locally in the browser so it can be reopened. Avoid putting permanent
secrets in query strings, and URLs containing an embedded username or password are rejected.

## Build-time settings

Add these values to `.env`, `.env.production`, or the environment that runs Vite:

```env
VITE_LOAD_FROM_URL=true
VITE_SPEC_DOWNLOADER=https://proxy.example.com/download?spec_url={URL}
```

| `VITE_LOAD_FROM_URL` | `VITE_SPEC_DOWNLOADER` | Result                                              |
| -------------------- | ---------------------- | --------------------------------------------------- |
| `false` or missing   | Any value              | URL-loading controls are unavailable in this build  |
| `true`               | Missing/empty          | Browser-direct mode with CORS help and scheme retry |
| `true`               | Valid `{URL}` template | Downloader-first mode with direct browser fallbacks |

The downloader is optional, but when present it must contain the exact, case-sensitive `{URL}`
placeholder. Vite fails the build instead of shipping a malformed template. `{URL}` is replaced with
the percent-encoded complete target URL, including its original `http://` or `https://` scheme.
Templates therefore work in either query or path form:

```env
VITE_SPEC_DOWNLOADER=proxy.example.com/download?spec_url={URL}
VITE_SPEC_DOWNLOADER=proxy.example.com/{URL}/dl
```

Any initial scheme on the **downloader endpoint** is removed and replaced with the scheme currently
serving OpenDoc UI. An HTTPS documentation page therefore never calls an HTTP downloader and cannot
create a downloader mixed-content error. If OpenDoc is opened with a non-HTTP scheme, HTTPS is used.
The target specification's own scheme is preserved inside `{URL}` so the backend knows what to fetch.

The browser request sequence is deterministic:

1. With a downloader, call the scheme-normalized downloader URL.
2. A downloader network, timeout, DNS, or HTTP `5xx` failure falls back to the exact target URL.
3. A direct transport/CORS/mixed-content failure retries once using OpenDoc UI's scheme.
4. A downloader `4xx` response is a deliberate policy rejection and is never bypassed.
5. A received direct HTTP response, including `4xx`/`5xx`, is reported as-is rather than retried under another scheme.

Remote responses are limited to 10 MiB in the browser, even when a custom downloader is used. Cache
identity is based on the original target URL rather than the generated proxy URL. Downloader services
return `X-OpenDoc-Final-URL`, allowing the OpenAPI engine to enforce same-origin external `$ref`
redirect rules while still downloading those references through the configured service.

For a one-off Windows PowerShell build without an environment file:

```powershell
$env:VITE_LOAD_FROM_URL = "true"
$env:VITE_SPEC_DOWNLOADER = "https://proxy.example.com/download?spec_url={URL}"
npm run build
```

Because these values are compiled into the static bundle, changing them requires another build. Do
not place a secret token in `VITE_SPEC_DOWNLOADER`; browser-visible build variables are public.

---

Next: [Downloader services](downloaders.md) — the six reference implementations, or [Back to README](../README.md).

---

← [Back to README](../README.md)
