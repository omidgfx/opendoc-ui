# [OpenDoc UI](https://omidgfx.github.io/opendoc-ui/)

A static-first documentation browser, API runner, and optional AI assistant for **Swagger 2.x** and
**OpenAPI 3.x** specifications (JSON or YAML). Point it at a spec — via configuration or straight
from your disk — and it renders the whole API: endpoints grouped by tag, schemas, examples,
authentication schemes, a built-in request runner, code/type generators, deep-linkable URLs,
full theming, and grounded AI answers. The documentation UI never requires a backend; AI can use
CORS-enabled providers directly or an optional gateway.

[![Website](https://img.shields.io/badge/website-omidgfx.github.io%2Fopendoc--ui-4f46e5)](https://omidgfx.github.io/opendoc-ui/)
![Version](https://img.shields.io/badge/version-0.1.15-blue) ![License](https://img.shields.io/badge/license-MIT-green) [![Live Demo](https://img.shields.io/badge/live-demo-7c3aed)](https://omidgfx.github.io/opendoc-ui/demo/)

**[Open the live demo →](https://omidgfx.github.io/opendoc-ui/demo/)** Browse the bundled Complete Capability Showcase specification or open your own JSON/YAML files directly in the hybrid demo.

---

## Table of contents

- [Features](#features)
- [Version 0.1.15](#version-015)
- [Changelog](CHANGELOG.md)
- [Quick start](#quick-start)
- [Docker](#docker)
- [Builder CLI — `npm run make`](#builder-cli--npm-run-make)
- [Configuration](#configuration)
  - [Mode 1 — `public/config.json` (pre-defined specs)](#mode-1--publicconfigjson-pre-defined-specs)
  - [Mode 2 — `window.INITIAL_CONFIG` (pre-defined specs)](#mode-2--windowinitial_config-pre-defined-specs)
  - [Hybrid option — configured and local specs](#hybrid-option--configured-and-local-specs)
  - [Mode 3 — No configuration (local mode)](#mode-3--no-configuration-local-mode)
- [Remote URL loading and downloader proxies](#remote-url-loading-and-downloader-proxies)
  - [Build-time settings](#build-time-settings)
  - [Downloader services](#downloader-services)
- [Spec loading, caching and the refresh button](#spec-loading-caching-and-the-refresh-button)
- [Local endpoint notes and hidden endpoints](#local-endpoint-notes-and-hidden-endpoints)
- [OpenDoc UI assistant](#opendoc-ui-assistant)
- [Optional AI gateway](#optional-ai-gateway)
  - [Framework AI gateway examples](#framework-ai-gateway-examples)
- [Local history](#local-history)
- [Theme system](#theme-system)
- [The "no specification" state](#the-no-specification-state)
- [URL routing & deep links](#url-routing--deep-links)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Browser persistence](#browser-persistence)
- [Project structure](#project-structure)
- [Deployment notes](#deployment-notes)
  - [GitHub Pages demo](#github-pages-demo)
- [FAQ](#faq)
- [License](#license)

---

## Features

- **Documentation browser** — tag folders with nested groups, endpoint list, parameter
  tables, request bodies, response examples and full schema inspection.
- **Built-in API runner** — execute requests straight from the browser with bearer token,
  API-key, basic auth and cookie support; use recursive nested-object/array forms, edit JSON/YAML/XML
  raw bodies with format-aware validation, and view bounded response details. CORS permitting, no
  proxy is needed.
- **Code & type generators** — fetch / axios / Angular snippets plus TypeScript models,
  generated from your schemas, downloadable as a zip.
- **Global search** — `Ctrl/⌘ + K` searches paths, summaries, tags and schema definitions,
  with method/tag/security filters that sync with the sidebar.
- **Themes** — 15+ hand-picked palettes, per-spec memory, light / dark / **system** modes.
- **Deep links** — every endpoint, open tab, response code and schema modal is encoded in the
  URL, so any view is shareable and re-openable.
- **View tabs** — the specification overview, global search, schema explorer, about page, and
  AI assistant open as tabs in the same bar as endpoints: preview/pin, close, reorder,
  middle-click and context-menu all behave identically.
- **OpenDoc UI assistant** — ask grounded questions using retrieved redacted endpoint/schema context,
  see source citations, use Swagger/REST skill packs, save conversations per spec, and prepare
  requests in the existing API Runner.
- **Local mode** — no configuration at all: open `.json` / `.yaml` / `.yml` files from your
  device, with a persistent history of everything you opened.
- **Local endpoint notes** — keep private Markdown notes and todos per endpoint, choose from fourteen
  translucent theme-safe tones, optionally hide an endpoint after confirming its last todo, and
  export/import every note as JSON with orphaned-note detection.
- **Hidden endpoints** — move endpoints into a muted folder without changing the OpenAPI source,
  then unhide them individually or restore every hidden endpoint from navigation settings.
- **Remote URL loading** — optional build-time capability with CORS guidance, downloaders/direct fallbacks,
  persistent URL history, cache revalidation, and hardened downloader examples in six backend languages.
- **Spec caching** — remote specs use a bounded-TTL cache with ETag / Last-Modified
  revalidation; persistent state and raw documents use IndexedDB instead of consuming the localStorage quota.
- **Reference-safe rendering** — unresolved, circular, and multi-file `$ref` graphs are diagnosed without taking down unrelated views; recursive property matrices and Runner forms stop at cycle boundaries, and missing local files can be added after the root is opened.
- **Clean routes** — endpoint, schema, compatibility, and assistant links use normal paths while retaining legacy hash-link compatibility.
- **Crash recovery** — view-level boundaries isolate malformed endpoint/schema content, while the global recovery screen remains the final fallback.

---

## Version 0.1.15

This release fixes Docker builds from Git Bash on Windows and makes the API key control
visible for custom OpenAI-compatible AI profiles:

- **Docker builds on Git Bash/Windows** no longer rewrite `VITE_BASE_PATH=/` into a
  Windows filesystem path before it reaches `docker.exe`; Dockerfile and build-context
  path conversion remains intact;
- **Custom OpenAI-compatible** profiles now show an API key field when Direct transport
  is selected. The previous preset metadata incorrectly set `requiresApiKey` to `false`,
  even though the request adapter already supported a Bearer token;
- configured keys are sent as `Authorization: Bearer <key>`, while Ollama remains suitable
  for keyless local use;
- the package and lockfile versions are bumped to `0.1.15`.

See [`CHANGELOG.md`](CHANGELOG.md) for the complete release history.

## Quick start

Try it immediately in the **[live GitHub Pages demo](https://omidgfx.github.io/opendoc-ui/demo/)**, or run it locally:

```bash
npm ci
npm run dev        # http://localhost:3000
```

Production build and preview:

```bash
npm run build      # outputs one JavaScript bundle: dist/index.js
npm run preview    # serves dist/ locally
```

Build and clean scripts are shell-independent and run on Windows, macOS, and Linux. Production
source maps are always disabled and verification fails if a `.map` file or `sourceMappingURL` is
emitted. The build also fails if more than one `.js` bundle appears.

Apple emoji assets are disabled by default to keep the drop-in script and stylesheet lighter:

```env
VITE_DISABLE_APPLE_EMOJIS=true
```

Set the value to `false` before building when consistent Apple Emoji 16 rendering is required. In
that mode the complete metadata and sprite are embedded in the final `index.js`/`index.css`; no
runtime emoji file or CDN is required.

Formatting, type checks, and tests:

```bash
npm run format:check
npm run lint
npm test
npm run test:browser   # Playwright request/history/accessibility flows
npm run test:all       # lint + contract + browser + production build
```

The documentation build has **no server-side requirement** — `dist/` is plain static files and can
be dropped on any static host (nginx, GitHub Pages, S3, `python -m http.server`, …). The optional
AI gateway is only needed for providers that do not support browser CORS or when you want keys to
remain server-side.

> Regular non-Docker builds intentionally ship **without** `public/config.json` or sample spec files,
> so each deployment keeps its own. Until you add one, the app runs in
> [local mode](#mode-3--no-configuration-local-mode). The Docker image uses `docker/config.json`.

---

## Docker

Docker Desktop, or Docker Engine with the Compose plugin, is the only prerequisite. The image uses a
lockfile-based `npm ci` builder and serves the verified static bundle from nginx.

The cross-platform path is Docker Compose:

```console
docker compose up --build --detach
```

Open <http://localhost:3000>. Stop and remove the container with:

```console
docker compose down
```

`docker/config.json` is mounted into the container and defaults to hybrid local-file mode. Edit that
file to add configured specifications, then reload the browser; rebuilding the image is unnecessary.
The file is served without browser caching.

Build-time frontend options can be supplied through environment variables. For example, in Windows
PowerShell:

```powershell
$env:VITE_LOAD_FROM_URL = 'true'
$env:VITE_SPEC_DOWNLOADER = 'https://proxy.example.com/download?spec_url={URL}'
docker compose up --build --detach
```

The supported build variables are `VITE_DISABLE_APPLE_EMOJIS`, `VITE_LOAD_FROM_URL`,
`VITE_SPEC_DOWNLOADER`, and `VITE_BASE_PATH`. Set `OPENDOC_PORT` to change the host port.

Equivalent helper scripts are included for direct `docker build` / `docker run` workflows:

```powershell
# Windows PowerShell
.\docker\build.ps1
.\docker\run.ps1
```

```bash
# macOS, Linux, WSL, or Git Bash
sh ./docker/build.sh
sh ./docker/run.sh
```

The run scripts replace an existing OpenDoc UI container, mount `docker/config.json` read-only, and
publish port `3000` by default. Override the image, container, configuration, port, or restart policy
with `OPENDOC_IMAGE_NAME`, `OPENDOC_CONTAINER_NAME`, `OPENDOC_CONFIG_FILE`, `OPENDOC_PORT`, and
`OPENDOC_RESTART_POLICY`.

The container exposes `/healthz` and includes a working Docker health check.

---

## Builder CLI — `npm run make`

For anyone who prefers answering questions over editing configuration files, the repository ships a
guided, cross-platform builder CLI. Run it with plain npm — it works identically on Windows,
macOS, and Linux:

```console
npm run make
```

The CLI walks through every deployment decision, produces a clean configured production build, and
then offers to start it. It is built exclusively on Node built-ins (no new dependencies), and it
**never touches the plain `npm run build` script** — build-time options are injected only into the
child build process, and runtime settings land in `.env`.

### What it asks

| Step               | What it gathers                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight          | Reuse of a previous configuration (with a summary and Use / Edit / Start fresh choices), Node version check, Docker engine + compose detection |
| Deployment profile | Static files only, Docker image, or both; clean the previous output first if desired                                                           |
| Frontend options   | Apple Emoji sprite (exclude for a leaner bundle, include for consistent Apple rendering), base path, and whether to enable Load-from-URL       |
| Downloader proxy   | A `{URL}` template validated with the same rules as `vite.config.ts`, plus optional framework example env files                                |
| AI gateway         | Provider, model, base URL, hidden API key, auto-generated gateway token, allowed origins, port, and limits — with optional framework examples  |
| Docker options     | Image name, container name, host port (with in-use detection), restart policy                                                                  |
| Review             | A full summary of every choice — origins, proxy examples, Docker status, secret status — before anything is built                              |
| Build              | Optional clean, then the existing `npm run build` with live output, followed by fresh-output verification and bundle/gzip sizes                |
| Start              | Local preview, dev server, Docker Compose (with `/healthz` polling before claiming success), or the AI gateway                                 |

### What it writes

- **`.env`** — runtime settings only (`AI_GATEWAY_*`, `AI_PROVIDER`, `AI_MODEL`, `OPENDOC_*`, and
  friends), exactly what the AI gateway and `compose.yaml` read at runtime. Builder-owned keys live
  in a clearly marked managed section; unrelated entries keep their exact formatting, the previous
  file is backed up as `.env.bak`, stale managed keys are removed when no longer applicable, and
  permissions are tightened to `0600` on Unix.
- **`builder.config.json`** (gitignored) — the full answer set for reproducible re-runs. Secrets are
  **never** stored here; tokens and API keys stay in `.env` and are loaded back from there on reuse.
- **`downloaders/<framework>/.env`** and **`ai-gateways/<framework>/.env`** — only when you ask for a
  framework example, pre-filled with your origins, token, provider and model.

### Guarantees

- `npm run build` stays byte-for-byte identical — build-time `VITE_*` options are passed only to the
  child process the CLI spawns.
- The build runs first; configuration is committed only after the output verifies (fresh-dist
  snapshot, `index.html` referencing `index.js`, non-empty artifacts), so a failed build cannot leave
  the project half-modified.
- Loaded configurations are schema-validated with a version/migration hook; an invalid stored config
  falls back to a fresh start with a clear warning.
- Origins must be strict `scheme://host`, base paths are normalized, downloader templates must
  contain exactly one `{URL}`, and gateway tokens enforce a safe character set.
- Child processes run from the project root; Ctrl+C tracks lifecycle state and terminates them.
  On Windows, child launches use a shell-backed helper required by Node's CVE-2024-27980 fix.
- A buffered piped-input fallback keeps the CLI scriptable (`printf '...' | npm run make`) and
  CI-friendly.

---

## Configuration

OpenDoc UI supports **three deployment modes**. The mode is decided at startup, entirely by
what is present on the page:

| Mode                           | Trigger                                                     | What the user sees                                                 |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| **1. config.json**             | `public/config.json` exists and is served at `/config.json` | A spec selector in the navbar + switch modal, specs auto-load      |
| **2. `window.INITIAL_CONFIG`** | A global object injected before the app boots               | Same as mode 1; the inline object wins over `config.json`          |
| **3. Local mode**              | Neither of the above exists (no config source at all)       | An **Open** button instead of the selector; users open local files |

### Mode 1 — `public/config.json` (pre-defined specs)

Place a `config.json` in the **public** folder of the app (it is served at `/config.json`,
the path the app fetches on boot). The file describes every spec the deployment should offer:

```jsonc
{
  // Theme used for every spec in this file ("default" falls back to the first built-in theme)
  "theme": "default",

  // Optional: keep configured specs and also let visitors open local files
  "allowLocalSpecifications": true,

  "parsables": {
    "Player API": {
      "theme": "default", // optional, per-spec theme
      "url": "https://api.example.com/docs-json", // remote JSON or YAML
      "title": "Player API", // optional, shown in the selector
    },
    "Pet Store": {
      "url": "/specs/pet-store.json", // local file inside public/
    },
    "Inline Spec": {
      "isCustom": true, // optional — treat the entry as inline
      "rawSpec": "{ \"openapi\": \"3.0.0\", ... }", // the spec itself, as a string
    },
  },
}
```

Supported keys per entry:

| Key        | Type    | Description                                                                                                                                         |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`      | string  | Where to fetch the spec from. Relative paths resolve against the site root; absolute URLs are fetched directly (the remote server must allow CORS). |
| `title`    | string  | Display name in the selector and navbar. Defaults to the object key.                                                                                |
| `theme`    | string  | Theme name applied when this spec is opened. Defaults to the file-level `theme` / first built-in theme.                                             |
| `isCustom` | boolean | Marks the entry as inline (implies `rawSpec` is the source).                                                                                        |
| `rawSpec`  | string  | The full spec document as a string (JSON or YAML).                                                                                                  |

The **first entry** is selected on first visit; afterwards the app remembers the last selection,
and an explicit clean route or legacy hash deep link is the source of truth.

### Mode 2 — `window.INITIAL_CONFIG` (pre-defined specs)

Identical shape to `config.json`, but injected as a JavaScript global **before** the app
script runs, e.g. in `index.html`:

```html
<script>
  window.INITIAL_CONFIG = {
    theme: 'default',
    parsables: {
      'Pet Store': {url: '/specs/pet-store.json'},
    },
  };
</script>
<script type="module" src="/src/main.tsx"></script>
```

Useful when you don't control the server routes (no `/config.json` available), or when the
configuration must be baked into the HTML itself.

**Precedence:** if `window.INITIAL_CONFIG` exists it is used and `/config.json` is never
fetched. Otherwise the app fetches `/config.json`; a 404 means local mode.

> By default, pre-defined deployments remain locked to their configured specifications. Local
> file loading is enabled only when the configuration explicitly opts into hybrid mode.

### Hybrid option — configured and local specs

Set `"allowLocalSpecifications": true` in either configuration source to keep the configured
spec selector while also allowing visitors to open local JSON/YAML files. Hybrid mode includes
recent local-file history, preserves deep links to those files, and always keeps the configured
specifications available for switching back. Files remain entirely in the visitor's browser.

The **[live GitHub Pages demo](https://omidgfx.github.io/opendoc-ui/demo/)** uses this mode: it opens the bundled Complete Capability Showcase specification immediately, but visitors can still try OpenDoc UI with their own specifications.

### Mode 3 — No configuration (local mode)

Run the app with **no** `window.INITIAL_CONFIG` and **no** `public/config.json` (a 404 on
`/config.json`). The app boots straight into the empty state and offers:

- an **Open** button in the navbar (where the spec selector would normally sit),
- a dedicated **"No specification loaded"** page with _Open specification_ and
  _About OpenDoc UI_ actions,
- the **spec selector modal** (opened from the navbar / mobile sidebar) containing a
  folder button for picking files, a drop-zone-style open card and the **recent history**,
- file support for `.json`, `.yaml` and `.yml` (Swagger 2.x and OpenAPI 3.x), including selecting
  multiple related files for local external `$ref` resolution.

Files are read with the browser's File API — **nothing is uploaded anywhere**. Everything
stays in your browser. Each opened spec is recorded in the history (see
[Local history](#local-history)) so you can reopen it after a reload.

---

## Remote URL loading and downloader proxies

Remote URL loading is an optional, build-time capability. When enabled, the specification selector
gets a **Load from URL** action, a dedicated URL modal, classified request errors, CORS help, and a
bounded recent-URL history. Downloaded documents use the same OpenAPI parser, diagnostics, cache,
last-known-good fallback, IndexedDB storage, tabs, and deep links as configured specifications.

Remote history keys contain only a stable hash; the complete source URL is not written into the URL
fragment. The URL is retained locally in the browser so it can be reopened. Avoid putting permanent
secrets in query strings, and URLs containing an embedded username or password are rejected.

### Build-time settings

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

### Downloader services

The `downloaders/` directory contains six standalone services. Every implementation exposes the same API:

```http
GET /download?spec_url=<percent-encoded-http-or-https-url>
OPTIONS /download
GET /health
```

A successful download returns the raw JSON/YAML bytes. Errors use a consistent JSON envelope:

```json
{
  "error": {
    "code": "TARGET_ADDRESS_BLOCKED",
    "message": "The target resolves to a private, reserved, or otherwise prohibited address."
  }
}
```

Copy `downloaders/config.env.example` into your deployment configuration. The common settings are:

```env
OPENDOC_ALLOWED_ORIGINS=https://docs.example.com,http://localhost:3000
OPENDOC_MAX_BYTES=10485760
OPENDOC_TIMEOUT_SECONDS=15
OPENDOC_MAX_REDIRECTS=3
OPENDOC_ALLOWED_PORTS=80,443
OPENDOC_RATE_LIMIT_PER_MINUTE=60
OPENDOC_ALLOWED_REMOTE_HOSTS=
PORT=8080
OPENDOC_BIND=0.0.0.0
```

`OPENDOC_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Do not include URL
paths. An empty `OPENDOC_ALLOWED_REMOTE_HOSTS` permits arbitrary **public** targets; private,
loopback, link-local, multicast, metadata-service, and reserved destinations remain blocked. Set an
exact/wildcard allowlist for constrained deployments:

```env
OPENDOC_ALLOWED_REMOTE_HOSTS=api.example.com,*.trusted.example
```

All services revalidate redirects, resolve every destination before connecting, limit ports,
stream with a hard size cutoff, omit user credentials/cookies, forward only conditional cache
headers, apply a per-client minute rate limit, and expose only the response headers OpenDoc needs.
Run them behind a production TLS reverse proxy and make both HTTP and HTTPS available if the same
OpenDoc bundle is served over both schemes.

#### Node.js 22

```bash
cd downloaders/node
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 npm start
```

`server.mjs` exports `configFromEnv`, `downloadSpecification`, and `createDownloaderHandler`, so an
existing Node/Express application can mount the returned handler instead of starting the included
HTTP server.

#### Python 3.11+

```bash
cd downloaders/python
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 python app.py
```

`app.py` uses only the standard library. `download_spec()` and `create_handler()` can be called from
Flask, Django, FastAPI, or another Python server; the included `ThreadingHTTPServer` is the standalone
entry point.

#### PHP 8.1+

```bash
cd downloaders/php
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 php -S 0.0.0.0:8080 -t public public/index.php
```

The cURL extension is required. `src/Downloader.php` contains framework-independent functions; a
Laravel/Symfony controller can call `downloadSpecification()` and translate `DownloaderException`
into its normal response type. `public/index.php` is the ready-to-run standalone adapter.

#### Go 1.23+

```bash
cd downloaders/go
go run ./cmd/server
```

Import `downloaders/go/downloader` and mount `downloader.NewHandler(config)` in an existing `net/http`
router, or use the included command directly.

#### Java 21 / Spring Boot

```bash
cd downloaders/java
mvn spring-boot:run
```

`DownloaderService` contains the reusable fetch policy and `DownloaderController` exposes the
Spring MVC routes. Existing Spring applications can copy/register those beans without using the
included `DownloaderApplication` launcher.

#### C# / ASP.NET Core 8

```bash
cd downloaders/dotnet
dotnet run
```

Call `app.MapOpenDocSpecDownloader(DownloaderConfig.FromEnvironment())` in an existing ASP.NET Core
application. `Program.cs` is the standalone host and `SpecDownloader.cs` contains the reusable
service, target policy, rate limiter, and endpoint extension.

Every implementation also includes a Dockerfile. Example:

```bash
docker build -t opendoc-downloader downloaders/go
docker run --rm -p 8080:8080 \
  -e OPENDOC_ALLOWED_ORIGINS=https://docs.example.com \
  opendoc-downloader
```

These services are intentionally specification downloaders—not general-purpose open proxies. Keep
their limits enabled, deploy only the implementation matching your backend stack, and use a host
allowlist where practical.

---

## Local endpoint notes and hidden endpoints

OpenDoc can keep private notes beside individual operations without changing the OpenAPI document.
Notes are scoped to the selected specification, stored in IndexedDB-backed local persistence, and
never uploaded. The **Local Notes** sidebar page groups notes by endpoint and supports search plus
simple-note/todo filters.

- Notes render Markdown and use one of **14 predefined translucent tones**, including white and black,
  from a compact inline selector. Tone opacity blends with the active light or dark theme instead of
  forcing pale cards.
- A note has a required title (128 characters), optional Markdown details (4,096 characters), and an
  endpoint maximum of 100 notes. Soft progress meters appear only after typing, with countdowns near
  each limit.
- A segmented control switches between a simple reference and a todo with a persistent done state.
- Todos can offer to hide their endpoint when all endpoint todos are done. Completing the final todo
  opens a confirmation with a default-checked hide option that can be unchecked.
- Endpoint context menus can create notes, open the endpoint note list, hide, or unhide the endpoint.
  Only the specification-wide **New note** action shows the searchable, always-expanded endpoint tree;
  its independently scrolling sidebar fills the create modal. Endpoint-specific actions keep their
  endpoint fixed. The tree follows sidebar sorting, tag, route, compact-method, count, protection,
  deprecation, and hidden-endpoint preferences.
- Endpoint headers use a fixed-width note counter, and noted endpoints receive a note marker in the
  sidebar before deprecation/security indicators. In a single documentation or Runner view, the
  counter toggles a resizable right notes sidebar; expanded-note state and sidebar width persist in
  IndexedDB. In Split View, the same action retains the endpoint-notes modal.
- Hidden endpoints move into one muted **Hidden endpoints** folder at the end of the tree. Use their
  context menu to restore one, or **Unhide all endpoints** from navigation settings.
- Endpoint note lists and the Local Notes page use custom confirmation dialogs for individual and
  bulk deletion. Opening a note uses the tone-colored `NoteViewerModal`, with header edit/delete controls,
  todo actions, and a centered empty-note state when no Markdown body exists.
- **Export / Import notes.** The Local Notes page can download every note and todo for the selected
  specification as a JSON file (`opendoc-endpoint-notes` format, e.g. `opendoc-notes-<title>.json`) and
  restore notes from such a file. Export detects notes whose endpoint no longer exists in the loaded
  specification, asks before writing them, and records their ids as `orphanedNoteIds` so nothing is
  silently lost. Import validates the file, classifies notes against the current specification
  (matching, orphaned, or already present), warns clearly when the file was exported from a different
  specification, and lets you import everything or only the matching notes; imported notes respect
  per-endpoint capacity limits and id deduplication.
- **Trash.** Deleting a note moves it to the spec-scoped trash instead of removing it forever. The
  Local Notes toolbar shows a **Trash** button that opens a modal with restore, permanent delete, and
  empty-trash actions; restore and permanent delete each ask for confirmation. **Move all to trash**
  only moves active notes — orphaned notes are never touched by bulk deletion.
- **Orphaned notes.** Notes whose endpoint disappears from the loaded specification (removed, renamed,
  or imported from another spec) are kept in a dedicated **Orphaned** list instead of mixing into the
  page. From the Orphaned modal each note can be re-assigned to another endpoint (compact searchable
  picker) or deleted permanently with confirmation, so nothing is lost when an endpoint is renamed.
  Restoring a trashed note whose endpoint is missing returns it to the Orphaned list.

Resetting one specification preserves its local notes by default. The reset confirmation includes an
unchecked **Clear local notes too** option for intentionally deleting them. Reset All still clears all
per-spec data, including notes.

## OpenDoc UI assistant

The topbar sparkle button opens a dedicated **OpenDoc UI** assistant page. You can also right-click
any endpoint and choose **Ask AI**, or open the assistant while viewing an endpoint to keep that
endpoint as the conversation context. The fixed chat header shows whether it is talking about
specific endpoint(s) or the entire API. It supports:

- multiple removable conversations saved per specification (including zero saved conversations),
- Markdown chat export from the assistant header,
- up to five endpoint contexts per conversation, with per-endpoint removal and endpoint-context Ask AI actions,
- global AI profiles containing provider/model settings, keys, gateway settings, and skill packs,
- a clear profile-creation screen when no AI profile exists,
- OpenRouter, Ollama, OpenAI, Anthropic, Gemini, and custom OpenAI-compatible endpoints,
- direct browser calls for CORS-enabled providers,
- optional same-origin or external gateway transport,
- retrieved endpoint/schema context (rather than an unconditional full-spec prompt) with source-ID citations,
- operational Swagger/OpenAPI, REST debugging, security, SDK generation, and API testing skill packs,
- a validated OpenDoc UI action bridge for opening endpoints/schemas, searching, filling Runner fields, and proposing explicit API runs,
- explicit Runner actions that return a bounded, redacted result card to the current conversation,
- request preparation in the existing API Runner with a confirmation gate,
- standard in-app endpoint links in AI answers, target indicators in the sidebar, and an unread dot when a background answer finishes,
- fixed-height chat context header with up to five selected endpoints and Markdown conversation export,
- automatic compact mode: scrolling down hides the AI title bar and compacts the context header; scrolling up restores both.

Provider API keys are held in memory/session storage by default when Direct transport is used;
the settings dialog has an explicit **Remember secrets on this device** opt-in for localStorage
persistence. LocalStorage is not a secure vault. Profiles can be created, selected, renamed,
edited, saved with confirmation, deleted with confirmation, or removed all at once with
confirmation. Gateway mode keeps provider credentials on the gateway and sends only the
conversation/context request. API keys, tokens, passwords, cookies, and secret-looking OpenAPI
values are redacted by default. A conversation can explicitly enable authentication values,
which displays a persistent warning.

The assistant is static-build safe: the documentation browser works without an AI gateway. Open
AI settings to create a profile, then select a provider, model, transport, gateway URL, skills, and
optional instructions. Direct browser transport remains available for providers that permit CORS;
the optional gateway is only needed when server-side credentials or a provider proxy is required.
The default online free choice is OpenRouter’s `openrouter/free` router; it still requires a free
OpenRouter account/API key. The settings dialog presents models in a searchable, scrollable list;
**Refresh models** fetches and globally caches the current provider catalog, so newly released GPT
or other provider models can be entered or selected without an app update.

## Runner safety and OpenAPI behavior

The API Runner is manual-first and remains fully usable without an AI profile or gateway. The API Runner serializes query, path, header, and cookie parameters using OpenAPI styles
including `form`, `simple`, `label`, `matrix`, `deepObject`, `spaceDelimited`, and
`pipeDelimited`, with `explode` and `allowReserved` handling. Swagger 2 `collectionFormat`
values are mapped during compatibility conversion. Enum and boolean parameters use rich documented-value
controls with an explicit custom-value mode, while numeric, UUID, date, and other scalar inputs remain
permissive text so negative tests can still reach the API. The response reader is bounded at 2 MiB,
detects `application/*+json`, shows the substituted request URL, and supports a Cancel button plus a
30-second timeout. When actual `Content-Type` or `Content-Disposition` headers identify binary or
attachment data, the Runner cancels the body stream immediately after headers, saves no file, creates
no download link, and shows metadata only. Every endpoint keeps its **last 10 transaction outcomes**
per specification in IndexedDB-backed storage (with an emergency localStorage fallback only when IndexedDB is unavailable), including HTTP responses,
browser/network failures, validation outcomes, timeouts, and cancellations.

The Overview page keeps a specification-wide **Runner Compatibility** summary and shortcut. Its full
matrix remains part of Overview navigation, keeps Overview selected in the sidebar, and provides a
visible Back to Overview control. The matrix adds A–D ratings, numeric scores, auth, parameter counts,
request and response media, and scoped findings. It also lists missing reference files, can append
them to a local bundle, exports the immutable original or a derived bundled copy, and generates
`llms.txt`.
Compatibility remains a static preflight—not a promise about CORS, DNS, authentication state, server
behavior, or payloads missing from the specification. File-serving operations should declare a 2xx response media
type and a `string` schema with `format: binary`; when that success response is omitted, OpenDoc can
only recognize binary data from the real response headers after the request has been sent.

Request bodies have two complementary paths: the manual recursive form handles nested objects,
arrays of objects, arrays of arrays, enums, defaults, examples, and add/remove/reorder controls;
Raw mode remains available for payloads that need exact text. Simple parameter fields and recursive
body fields share the same focus frames, description popovers, schema links, and custom dropdowns.
Plain descriptions stay inline up to the compact threshold; Markdown descriptions move completely
into selectable, closable popovers with working links. Enum Markdown tables can supply lighter case
labels inside dropdown options. The raw editor selects JSON, YAML, XML, JavaScript, HTML, or plain-text
behavior from the media type and does not apply JSON diagnostics to non-JSON bodies.

The Runner is intentionally **permissive, not a client-side API validator**. Pattern mismatches,
malformed JSON, missing non-path values, and questionable server values are reported as notices but
remain testable against the real API. Missing required path parameters are the one strict exception:
they block execution because an incomplete route can resolve to the wrong backend endpoint.
Browser-imposed limitations such as GET/HEAD bodies and forbidden headers are disclosed rather than
hidden.

Authentication keeps actual OpenAPI security-scheme IDs and can apply composed requirements
simultaneously, with credentials isolated per specification and operation-level security overrides
honored. Cookie-secured operations show one informational note and send browser-managed cookies with
`credentials: include` without repetitive Runner warnings. Native OAuth 2 authorization-code and
implicit flows can launch interactively; authorization-code uses PKCE and requires token-endpoint
CORS because OpenDoc remains a public browser client. Manual access-token entry remains available.

Documents retain their immutable raw source and dialect alongside a separate semantic graph. OpenDoc
supports Swagger 2.0 and OpenAPI 3.0/3.1/3.2, including OAS 3.2 `QUERY` and `additionalOperations`.
Reference resolution is centralized and cycle-safe; unresolved references remain unchanged and are
shown as scoped diagnostics instead of recursive crashes. Same-origin remote external references are
loaded with count, size, timeout, redirect, and origin limits. For local multi-document APIs, missing
referenced files can be added after opening the root document; resolution remains entirely in memory.
The Compatibility page can download the untouched original or a derived bundled copy when every
required document is available.

## Optional AI gateway

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

### Framework AI gateway examples

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

#### Express

```bash
cd ai-gateways/express
npm install
npm start
```

Mount `createGatewayApp(configFromEnv())` in a larger Node service, or run `server.mjs` directly.

#### FastAPI

```bash
cd ai-gateways/fastapi
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8787
```

The exported `app` can also be mounted inside an existing FastAPI/Starlette deployment.

#### Laravel

Copy `ai-gateways/laravel/app`, `config/opendoc-ai.php`, and `routes/opendoc-ai.php` into the matching
Laravel directories. Register `App\Providers\OpenDocAiServiceProvider::class` in
`bootstrap/providers.php`. The controller uses Laravel HTTP streaming, RateLimiter, and Cache; use
Redis in production so limits are shared across workers.

#### Django

Install `ai-gateways/django/requirements.txt`, copy `opendoc_ai` into the project, add
`"opendoc_ai"` to `INSTALLED_APPS`, and include its URL patterns:

```python
path("", include("opendoc_ai.urls"))
```

Use a shared Django cache backend in multi-worker deployments.

#### Gin

```bash
cd ai-gateways/gin
go run .
```

`main.go` contains the Gin middleware, gateway guards, catalog endpoint, and streaming relay in one
copyable service.

#### Spring Boot

```bash
cd ai-gateways/spring-boot
mvn spring-boot:run
```

Existing Spring applications can register `GatewayController`, `GatewayLimits`, and
`GatewayConfig` instead of using the included launcher.

#### ASP.NET Core

```bash
cd ai-gateways/aspnet-core
dotnet run
```

For an existing app, call `app.MapOpenDocAiGateway(config)` and install
`GatewayEndpoints.CorsMiddleware` as shown in `Program.cs`.

#### Rails

Copy the controller and initializer into an API-mode Rails application, merge the supplied routes,
and add the gems from `Gemfile.fragment`. Configure Redis-backed `Rails.cache` for multiple workers.

#### Axum

```bash
cd ai-gateways/axum
cargo run --release
```

The Axum implementation streams upstream bytes without buffering the model response and holds its
concurrency permit until the client stream finishes.

Standalone examples include Dockerfiles. Put any implementation behind HTTPS and enter either its
origin or `/api/ai` in the OpenDoc assistant's **Gateway URL** field.

## Spec loading, caching and the refresh button

When a configured spec has a `url`, the app uses the versioned `opendoc_spec_cache_v2:` /
IndexedDB cache. A fresh entry is used for five minutes; after that the app revalidates with
`If-None-Match` and/or `If-Modified-Since` when the server supplied those headers. A failed
revalidation may use the stale entry as an offline fallback, but stale data is never treated as
fresh indefinitely. Validated cache indexes and large raw documents are stored in IndexedDB;
localStorage is used only as an emergency fallback when IndexedDB is unavailable or a write fails.

The **refresh button** (circular arrows, next to the spec selector in the navbar and in the
mobile sidebar toolbar) drops the cache and reloads: it clears every cached spec and
re-fetches the current one from the network. In local mode the same button re-reads the
opened file from disk (when the file handle is still available) or re-parses the stored
text. The icon spins while a refresh is in flight.

---

## Local history

In **local mode**, every spec opened from disk is saved to browser persistent storage
(`opendoc_local_history`), most recent first. IndexedDB is the primary store; localStorage is used
only as an emergency fallback when IndexedDB is unavailable or a write fails. The spec selector modal lists the history with the
spec title, file name and relative open time; entries can be re-opened with one click or removed
individually, and the whole history can be cleared from the modal footer.

History specifics:

- limited to the **12 most recent** entries,
- entries whose raw text exceeds ~2 MB are stored with metadata only and re-opened from
  the original file if you still have it,
- deep links work across reloads: the URL hash references the history entry, so opening a
  shared link restores the right spec from history automatically,
- history is strictly local to the browser — clearing site data wipes it.

When URL loading is compiled in, `opendoc_remote_spec_history` separately stores the 12 most recent
remote sources. Their raw documents stay in the normal bounded cache rather than being duplicated in
history. Removing a URL-history entry removes its cache record, and clear-all uses a confirmation
before deleting every remote-history/cache pair.

---

## Theme system

Themes come from `src/data/themes.ts`. Each theme defines full **light** and **dark**
palettes. The **mode** can be:

| Mode     | Behavior                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| `system` | Follows the OS setting (`prefers-color-scheme`) live — this is the **default** |
| `light`  | Always the light palette                                                       |
| `dark`   | Always the dark palette                                                        |

The mode toggle button cycles `system → light/dark → dark/light`; the icon shows a monitor
while in system mode, and the palette updates immediately if the OS theme changes while the
app is open. The palette button in the navbar opens the theme picker, whose segmented
control offers the same `system / light / dark` modes next to the theme gallery.

Theme name and mode are remembered **per spec** (`selected_theme_name_<key>` and
`theme_mode_<key>`), so switching between APIs restores each one's own look.

---

## The "no specification" state

Until a spec is loaded the app shows a purpose-built **block page** instead of the normal
chrome:

- no sidebar, no search, no theme controls, no auth/download buttons — the navbar is
  reduced to the logo and the spec selector / open button,
- the page itself offers exactly two useful actions: **Open specification** (local mode)
  and **About OpenDoc UI**,
- in a pre-defined deployment with zero available specs it explains that the deployment
  has no configured specifications.

Everything else (tabs, search, runner, themes, settings) is simply unreachable until a spec
is loaded.

---

## URL routing & deep links

OpenDoc uses hash-based deep links — everything after the `#` is handled by the application and
never reaches the server, so the same URL works on any static host (GitHub Pages, nginx, S3, or even
`file://`) without rewrite rules, and refreshing or sharing a link always restores the exact view.
Legacy path-based `/parsable/...` links are still parsed for backward compatibility. Main shapes:

| Route                                           | Meaning                                    |
| ----------------------------------------------- | ------------------------------------------ |
| `#/`                                            | Home (no spec)                             |
| `#/parsable/<key>`                              | Home of the configured/local specification |
| `#/parsable/<key>/api/<endpointId>`             | A specific endpoint in a permanent tab     |
| `#/parsable/<key>/schema-explorer?schemas=name` | Schema Explorer with a schema open         |
| `#/parsable/<key>/notes`                        | Local endpoint notes and todos             |
| `#/parsable/<key>/compatibility`                | Endpoint Runner compatibility matrix       |
| `#/parsable/<key>/about`                        | About page for that specification          |
| `#/parsable/<key>/assistant`                    | OpenDoc UI assistant                       |
| `/oauth/callback`                               | Native OAuth authorization callback        |

Query parameters inside the hash include `?tab=examine|doc`, `?schemas=a,b`, and `?search=...`;
response deep links append `#response-<code>` after the route. Endpoint links are authoritative:
loading or refreshing one always opens that endpoint as a permanent tab. User navigation pushes
History API entries, while search/filter edits update the current entry; browser Back and Forward
restore views, endpoints, tabs, response links, schema stacks, and configured/local/remote
specifications without rewriting the destination URL.

In local mode the key is `local:<fileName>`, and the route maps it back into local history on reload
or browser history traversal.

---

## Keyboard shortcuts

| Shortcut                            | Action                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Ctrl / ⌘ + K`                      | Focus global search                                                                                                 |
| `Esc`                               | Close the top-most modal / overlay                                                                                  |
| `Alt + ←` / `Alt + →`               | Previous / next endpoint tab                                                                                        |
| `Ctrl + \`` / `Ctrl + Shift + \``   | Open the tab switcher and move to the next / previous tab (Windows Alt+Tab style; release to switch, Esc to cancel) |
| `Ctrl+Enter` (in runner)            | Send the request from the active pane                                                                               |
| `Ctrl+↑` / `Ctrl+↓` (in split view) | Move focus between docs and runner panes                                                                            |

The About page lists the full set, including mouse interactions (middle-click a sidebar
endpoint to pin a permanent tab, double-click to keep the preview tab, etc.).

---

## Browser persistence

All persistence goes through `src/utils/storage.ts` — an IndexedDB-first synchronous facade that
hydrates before React starts. It never throws, validates every JSON read, self-repairs corrupt
entries, and falls back to localStorage only when IndexedDB is unavailable or a write fails.
Large specification cache records and AI conversations also have dedicated IndexedDB records.
Older localStorage data is migrated once and removed after IndexedDB confirms the write.

State is split into three namespaces:

| Namespace                                                                 | Contains                                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opendoc:ui:<name>`                                                       | Global UI state — sidebar width & collapsed state, collapsed tag folders, last selected spec, split-view width, non-secret AI settings/profiles, and cached model catalogs |
| `opendoc:spec:<encoded spec key>:<encoded name>`                          | Per-spec state — theme name, theme mode, tab mode, open tabs, per-endpoint runner inputs, docs scroll position, and bounded conversation index                             |
| `opendoc_spec_cache_v2:<url>` / IndexedDB / local and remote history keys | Validated cache index, large spec cache, local-file history, and recent remote URLs                                                                                        |

Per-spec data is pruned automatically when a spec disappears from the configuration, and
legacy v0.1.0 keys are migrated into the namespaces once on first run. Known keys:

| Key                                                         | Purpose                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `opendoc:ui:sidebar_width` / `opendoc:ui:sidebar_collapsed` | Desktop sidebar state (global — not per spec)                                                   |
| `opendoc:ui:collapsed_tags`                                 | Collapsed tag folders in the sidebar navigation                                                 |
| `opendoc:ui:last_parsable`                                  | Last selected spec key                                                                          |
| `opendoc:ui:endpoint_split_width`                           | Split-view pane width                                                                           |
| `opendoc:ui:ai_settings` / `:ai_profiles`                   | Current AI settings and global provider profiles (secrets omitted unless explicitly remembered) |
| `opendoc:ui:ai_active_profile` / `:ai_model_catalogs`       | Selected profile and refreshed model catalogs                                                   |
| `opendoc:spec:<key>:theme` / `:theme_mode`                  | Theme name & mode per spec                                                                      |
| `opendoc:spec:<key>:tab_mode`                               | Last used tab mode (docs / examine / split)                                                     |
| `opendoc:spec:<key>:tabs`                                   | Open tabs (endpoints + view tabs) with active tab                                               |
| `opendoc:spec:<key>:inputs:<method>:<path>`                 | Saved runner inputs per endpoint                                                                |
| `opendoc:spec:<key>:response_history:<method>:<path>`       | Last 10 Runner outcomes per endpoint                                                            |
| `opendoc:spec:<key>:endpoint_notes`                         | Local Markdown notes and todos grouped by endpoint                                              |
| `opendoc:spec:<key>:hidden_endpoints`                       | Endpoint keys moved into the muted Hidden endpoints folder                                      |
| `opendoc:spec:<key>:scroll:<method>:<path>`                 | Docs scroll position per endpoint                                                               |
| `opendoc:spec:<key>:ai_conversations`                       | Saved AI conversations for this specification                                                   |
| `opendoc_spec_cache_v2:<url>`                               | Validated generic cache record; large raw copies use dedicated IndexedDB records                |
| `opendoc_local_history`                                     | Recently opened local files                                                                     |
| `opendoc_remote_spec_history`                               | Last 12 URL-loaded specifications; complete URLs stay in this browser                           |
| `sessionStorage:opendoc_ui_session_secrets`                 | Session-only AI keys/tokens when remember-secrets is off                                        |

---

## Project structure

```
compose.yaml             # cross-platform OpenDoc UI container deployment
docker/                  # production image, nginx, config, and helper scripts
public/                  # static assets; demo specifications live under public/demo/
downloaders/             # hardened Node/Python/PHP/Go/Java/.NET specification downloaders
ai-gateways/             # Express/FastAPI/Django/Laravel/Gin/Spring/.NET/Rails/Axum AI gateways
server/                  # the canonical Node AI gateway (ai-gateway.ts) and its policy module
site/                    # the product website deployed at the GitHub Pages root
scripts/
  builder/               # the `npm run make` CLI: build, start, Docker, artifacts
  clean.mjs · create-spa-fallback.mjs · verify-*.mjs   # build and CI support scripts
tests/                   # unit suites, conformance matrices, fixtures, Playwright browser suite
src/
  App.tsx                # root: config bootstrap, spec loading, state, routing
  components/            # domain folders: ai, app, common, endpoint, layout, modals, notes, schema
  pages/                 # Home, Search results, Schema explorer, Notes, About, Status, Compatibility
  hooks/                 # breakpoints, resize split, swipe-to-open, esc-to-close, tabs, routing
  contexts/              # endpoint notes and operation link contexts
  features/emoji/        # Apple-emoji sprite rendering, gated at build time by a Vite alias
  data/                  # theme palettes and About content
  types/                 # shared TypeScript types
  utils/
    openapi/             # Swagger→OpenAPI 3 normalization, ref resolution, validation
    runner/              # request planning and execution, compatibility report, mocks, auth, OAuth
    storage/             # IndexedDB adapters: cache, local/remote/response history, tabs
    specification/       # spec sources: remote loading, server resolution, the app spec
    export/              # code generation, llms.txt export, schema export, zip
    ai/                  # AI assistant bridge, providers, skills, settings persistence
    notes/ · theme/ · sidebar/ · endpoint/    # notes, theming, sidebar tree, endpoint helpers
```

---

## Architecture

The source tree follows one dependency direction:

```
components → hooks/contexts → utils → types
```

- `src/components` renders; it may import hooks, contexts, utils, and types.
- `src/hooks` and `src/contexts` coordinate state and call into utils.
- `src/utils` implements the logic — OpenAPI parsing and normalization, request
  planning and execution, persistence, theming, AI bridging. It never imports
  components, and it stays free of React except where a module is purely about
  presentation typing (`utils/theme/themeCss.ts` returns `React.CSSProperties`).
- `src/types` holds shared types and value objects with no runtime logic.

The codebase draws the same boundary the product draws: the **OpenAPI world**
(`utils/openapi/`, `types/openapi.ts`) understands specifications — parsing,
reference resolution, serialization, diagnostics, compatibility — while the
**OpenDoc world** (`utils/runner/`, `utils/storage/`, `utils/notes/`, `utils/ai/`,
`types/tabs.ts`, …) is the application built around them: the runner, workspace
tabs, notes, history, theming, and the AI assistant. The two meet only through
the shared types and the app shell; nothing in the OpenAPI engine knows about
tabs, notes, or AI providers.

Deliberately, there is no `domain/application/infrastructure/presentation`
layer split: at this scale each product domain maps one-to-one onto a `utils/`
folder, and the use cases are the hooks and contexts. New layers appear only
when a boundary gains a second implementation (a second parser, a second
storage backend, a second HTTP client) and the indirection pays for itself.

`npm run lint` enforces the utils boundary with
`scripts/verify-utils-contracts.mjs`.

---

## Deployment notes

- Serve `dist/` from any static host. The app needs **no API** of its own.
- **Pre-defined mode:** make sure `config.json` is reachable at the app's deployment base
  (normally `/config.json`; on a project Pages site, `/<repository>/config.json`). It must live
  in the public folder and contain `parsables` — an empty file still counts as pre-defined mode.
- **Remote spec URLs** must send CORS headers (`Access-Control-Allow-Origin`) or the
  browser will block the fetch. Relative URLs (`/specs/...`) avoid this entirely.
- **Local mode:** simply don't ship a config source — a 404 on `/config.json` is what
  enables local file loading.
- **Docker:** `docker/config.json` enables local files through hybrid mode and can be replaced with
  deployment-specific configured specifications.
- The API runner calls endpoints directly from the visitor's browser. If your API does not
  allow CORS, the runner will show the browser's CORS error — the docs still work.

### GitHub Pages demo

**Live demo:** [https://omidgfx.github.io/opendoc-ui/demo/](https://omidgfx.github.io/opendoc-ui/demo/)

The repository includes `.github/workflows/pages.yml`. On every push to `master` it builds OpenDoc
with the repository base path, enables `public/demo/openapi.yaml`, and deploys `dist/` through the
official GitHub Pages artifact workflow.

Enable it once:

1. Open **Repository Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `master`, or run **Deploy demo to GitHub Pages** manually from the Actions tab.
4. Open the **[live demo](https://omidgfx.github.io/opendoc-ui/demo/)** after the deployment succeeds.

The committed app remains in local mode during normal development. The workflow copies
`public/demo/config.pages.json` to `public/config.json` only inside the disposable Actions runner,
so the hosted demonstration opens the bundled Complete Capability Showcase automatically while hybrid mode still lets visitors open local specifications.

For a custom domain, set `VITE_BASE_PATH` to `/` in `pages.yml`. For a renamed repository, the
existing workflow automatically uses `/${{ github.event.repository.name }}/`.

---

## FAQ

**Why does the app open in local mode?**
No config source was found at startup (no `config.json`, no `window.INITIAL_CONFIG`).
That's the local experience — you can open spec files from disk. To use pre-defined specs,
add a `config.json` to the public folder.

**There is no Open button / I can't load local files.**
Pre-defined deployments disable local loading by default. Either remove the configuration to use
local mode, or add `"allowLocalSpecifications": true` to enable hybrid mode.

**The spec selector shows an entry that fails to load.**
Check the URL in `config.json` — relative paths are resolved against the site root, and
remote URLs must be CORS-enabled. The selector shows per-entry error messages.

**Why is Load from URL missing?**
It is a build-time capability. Set `VITE_LOAD_FROM_URL=true` before running `npm run dev` or
`npm run build`; changing the value after deployment cannot modify an existing static bundle.

**Why did the direct URL request fail while the downloader works?**
Browsers enforce CORS and mixed-content rules; backend downloaders are not subject to browser CORS
when contacting the target. The downloader itself must still allow the exact OpenDoc UI origin via
`OPENDOC_ALLOWED_ORIGINS`.

**Does the refresh button clear my history?**
No. Refresh only drops the spec cache; local history and settings are untouched.

**Why is my theme different per spec?**
Theme name and mode are stored per spec key — each API keeps its own look.

**Can I use Swagger 2.0 files?**
Yes. Files are normalized to OpenAPI 3 internally; both `swagger: "2.0"` and
`openapi: 3.x` documents are accepted, in JSON or YAML.

**Is anything sent to a server?**
Local files never leave the device. Configured/URL specifications are requested from their source
or configured downloader, and optional AI requests go only to the selected provider/gateway. There
is no analytics or telemetry code in the app.

---

## License

MIT © Pejman Chatrrouz — see the About page inside the app for the full text.

When enabled, Apple emoji artwork supplied through `emoji-datasource-apple` remains © Apple Inc. and is not covered by this project's MIT license. Upstream notes that the Apple artwork is not licensed for commercial use.
