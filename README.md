# OpenDoc UI

A static-first documentation browser, API runner, and optional AI assistant for **Swagger 2.x** and
**OpenAPI 3.x** specifications (JSON or YAML). Point it at a spec — via configuration or straight
from your disk — and it renders the whole API: endpoints grouped by tag, schemas, examples,
authentication schemes, a built-in request runner, code/type generators, deep-linkable URLs,
full theming, and grounded AI answers. The documentation UI never requires a backend; AI can use
CORS-enabled providers directly or an optional gateway.

![Version](https://img.shields.io/badge/version-0.1.1-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
    - [Mode 1 — `public/config.json` (pre-defined specs)](#mode-1--publicconfigjson-pre-defined-specs)
    - [Mode 2 — `window.INITIAL_CONFIG` (pre-defined specs)](#mode-2--windowinitial_config-pre-defined-specs)
    - [Mode 3 — No configuration (local mode)](#mode-3--no-configuration-local-mode)
- [Spec loading, caching and the refresh button](#spec-loading-caching-and-the-refresh-button)
- [OpenDoc UI assistant](#opendoc-ui-assistant)
- [Optional AI gateway](#optional-ai-gateway)
- [Local history](#local-history)
- [Theme system](#theme-system)
- [The "no specification" state](#the-no-specification-state)
- [URL routing & deep links](#url-routing--deep-links)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Browser persistence](#browser-persistence)
- [Project structure](#project-structure)
- [Deployment notes](#deployment-notes)
- [FAQ](#faq)
- [License](#license)

---

## Features

- **Documentation browser** — tag folders with nested groups, endpoint list, parameter
  tables, request bodies, response examples and full schema inspection.
- **Built-in API runner** — execute requests straight from the browser with bearer token,
  API-key, basic auth and cookie support; view pretty-printed responses, status codes and
  response headers. CORS permitting, no proxy is needed.
- **Code & type generators** — fetch / axios / Angular snippets plus TypeScript models,
  generated from your schemas, downloadable as a zip.
- **Global search** — `Ctrl/⌘ + K` searches paths, summaries, tags and schema definitions,
  with method/tag/security filters that sync with the sidebar.
- **Themes** — 15+ hand-picked palettes, per-spec memory, light / dark / **system** modes.
- **Deep links** — every endpoint, open tab, response code and schema modal is encoded in the
  URL hash, so any view is shareable and re-openable.
- **View tabs** — the specification overview, global search, schema explorer, about page, and
  AI assistant open as tabs in the same bar as endpoints: preview/pin, close, reorder,
  middle-click and context-menu all behave identically.
- **OpenDoc UI assistant** — ask grounded questions using retrieved redacted endpoint/schema context,
  see source citations, use Swagger/REST skill packs, save conversations per spec, and prepare
  requests in the existing API Runner.
- **Local mode** — no configuration at all: open `.json` / `.yaml` / `.yml` files from your
  device, with a persistent history of everything you opened.
- **Spec caching** — remote specs use a bounded-TTL cache with ETag / Last-Modified
  revalidation; large raw documents use IndexedDB instead of consuming the localStorage quota.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build and preview:

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ locally
```

Type check and unit tests:

```bash
npm run lint
npm test
```

The documentation build has **no server-side requirement** — `dist/` is plain static files and can
be dropped on any static host (nginx, GitHub Pages, S3, `python -m http.server`, …). The optional
AI gateway is only needed for providers that do not support browser CORS or when you want keys to
remain server-side.

> The repository intentionally ships **without** a `config.json` or sample spec files, so each
> deployment keeps its own. Until you add one, the app runs in [local mode](#mode-3--no-configuration-local-mode).

---

## Configuration

OpenDoc UI supports **three deployment modes**. The mode is decided at startup, entirely by
what is present on the page:

| Mode                           | Trigger                                                     | What the user sees                                                 |
|--------------------------------|-------------------------------------------------------------|--------------------------------------------------------------------|
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

  "parsables": {
    "Player API": {
      "theme": "default",                       // optional, per-spec theme
      "url": "https://api.example.com/docs-json", // remote JSON or YAML
      "title": "Player API"                     // optional, shown in the selector
    },
    "Pet Store": {
      "url": "/specs/pet-store.json"            // local file inside public/
    },
    "Inline Spec": {
      "isCustom": true,                          // optional — treat the entry as inline
      "rawSpec": "{ \"openapi\": \"3.0.0\", ... }" // the spec itself, as a string
    }
  }
}
```

Supported keys per entry:

| Key        | Type    | Description                                                                                                                                         |
|------------|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| `url`      | string  | Where to fetch the spec from. Relative paths resolve against the site root; absolute URLs are fetched directly (the remote server must allow CORS). |
| `title`    | string  | Display name in the selector / navbar. Defaults to the object key.                                                                                  |
| `theme`    | string  | Theme name applied when this spec is opened. Defaults to the file-level `theme` / first built-in theme.                                             |
| `isCustom` | boolean | Marks the entry as inline (implies `rawSpec` is the source).                                                                                        |
| `rawSpec`  | string  | The full spec document as a string (JSON or YAML).                                                                                                  |

The **first entry** is selected on first visit; afterwards the app remembers the last
selection, and the URL hash wins over both.

### Mode 2 — `window.INITIAL_CONFIG` (pre-defined specs)

Identical shape to `config.json`, but injected as a JavaScript global **before** the app
script runs, e.g. in `index.html`:

```html

<script>
    window.INITIAL_CONFIG = {
        "theme": "default",
        "parsables": {
            "Pet Store": {"url": "/specs/pet-store.json"}
        }
    };
</script>
<script type="module" src="/src/main.tsx"></script>
```

Useful when you don't control the server routes (no `/config.json` available), or when the
configuration must be baked into the HTML itself.

**Precedence:** if `window.INITIAL_CONFIG` exists it is used and `/config.json` is never
fetched. Otherwise the app fetches `/config.json`; a 404 means local mode.

> ⚠️ **Important:** when *either* pre-defined source exists, local file loading is disabled.
> There is no "Open" button, no folder button in the modal and no way to load a spec from
> disk. Pre-defined deployments are locked to their configured specs — this is intentional,
> so a hosted instance can never be bypassed with a local file. If you want the local
> experience, deploy without any config source.

### Mode 3 — No configuration (local mode)

Run the app with **no** `window.INITIAL_CONFIG` and **no** `public/config.json` (a 404 on
`/config.json`). The app boots straight into the empty state and offers:

- an **Open** button in the navbar (where the spec selector would normally sit),
- a dedicated **"No specification loaded"** page with *Open specification* and
  *About OpenDoc UI* actions,
- the **spec selector modal** (opened from the navbar / mobile sidebar) containing a
  folder button for picking files, a drop-zone-style open card and the **recent history**,
- file support for `.json`, `.yaml` and `.yml` (Swagger 2.x and OpenAPI 3.x).

Files are read with the browser's File API — **nothing is uploaded anywhere**. Everything
stays in your browser. Each opened spec is recorded in the history (see
[Local history](#local-history)) so you can reopen it after a reload.

---

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

The API Runner serializes query, path, header, and cookie parameters using OpenAPI styles
including `form`, `simple`, `label`, `matrix`, `deepObject`, `spaceDelimited`, and
`pipeDelimited`, with `explode` and `allowReserved` handling. Swagger 2 `collectionFormat`
values are mapped during compatibility conversion. The response reader is bounded at 2 MiB,
detects `application/*+json`, shows the substituted request URL, and supports a Cancel button
plus a 30-second timeout. Binary bodies are represented as bounded metadata instead of being
converted to an unbounded text string.

Authentication keeps actual OpenAPI security-scheme IDs and can apply composed requirements
simultaneously. Browser mode deliberately cannot inject a `Cookie` header; it can send existing
same-site cookies with `credentials: include`, while manual cookie values are marked as agent-only.
OAuth/OIDC flows still require an access token or a trusted gateway; the browser does not silently
perform an authorization-code or refresh flow.

Documents are structurally validated before normalization, and local JSON Pointer references
support escaped pointer names and cycle guards. External references are resolved only from an
explicit preloaded document map; the app never fetches arbitrary `$ref` URLs while rendering.

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

## Spec loading, caching and the refresh button

When a configured spec has a `url`, the app uses the versioned `opendoc_spec_cache_v2:` /
IndexedDB cache. A fresh entry is used for five minutes; after that the app revalidates with
`If-None-Match` and/or `If-Modified-Since` when the server supplied those headers. A failed
revalidation may use the stale entry as an offline fallback, but stale data is never treated as
fresh indefinitely. Large raw documents are stored in IndexedDB and only small entries use a
localStorage fallback.

The **refresh button** (circular arrows, next to the spec selector in the navbar and in the
mobile sidebar toolbar) drops the cache and reloads: it clears every cached spec and
re-fetches the current one from the network. In local mode the same button re-reads the
opened file from disk (when the file handle is still available) or re-parses the stored
text. The icon spins while a refresh is in flight.

---

## Local history

In **local mode**, every spec opened from disk is saved to browser persistent storage
(`opendoc_local_history`), most recent first. IndexedDB is used through the storage facade when
available, with localStorage as a fallback. The spec selector modal lists the history with the
spec title, file name and relative open time; entries can be re-opened with one click or removed
individually, and the whole history can be cleared from the modal footer.

History specifics:

- limited to the **12 most recent** entries,
- entries whose raw text exceeds ~2 MB are stored with metadata only and re-opened from
  the original file if you still have it,
- deep links work across reloads: the URL hash references the history entry, so opening a
  shared link restores the right spec from history automatically,
- history is strictly local to the browser — clearing site data wipes it.

---

## Theme system

Themes come from `src/data/themes.ts`. Each theme defines full **light** and **dark**
palettes. The **mode** can be:

| Mode     | Behavior                                                                       |
|----------|--------------------------------------------------------------------------------|
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

The app is hash-routed. Main shapes:

| Hash                                              | Meaning                                    |
|---------------------------------------------------|--------------------------------------------|
| `#/`                                              | Home (no spec)                             |
| `#/parsable/<key>`                                | Home of the spec with the given config key |
| `#/parsable/<key>/api/<endpointId>`               | A specific endpoint (docs view)            |
| `#/parsable/<key>/about`                          | About page for that spec                   |
| `#/parsable/<key>/assistant`                      | OpenDoc UI assistant for that spec        |
| `#/parsable/<key>/schema-explorer?schemas=<name>` | Schema explorer with a schema open         |
| `#/about`                                         | About page without a spec                  |

Query params: `?tab=examine|doc`, `?schemas=a,b`, `?search=...` and `#response-<code>`.

In local mode the key is `local:<fileName>`, and it maps back into the local history on
reload.

---

## Keyboard shortcuts

| Shortcut                            | Action                                                                                                              |
|-------------------------------------|---------------------------------------------------------------------------------------------------------------------|
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
Large specification cache records and AI conversations also have dedicated IndexedDB records;
reset actions delete both the dedicated records and the fallback mirror.

State is split into three namespaces:

| Namespace                                               | Contains                                                                                                       |
|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `opendoc:ui:<name>`                                     | Global UI state — sidebar width & collapsed state, collapsed tag folders, last selected spec, split-view width, non-secret AI settings/profiles, and cached model catalogs |
| `opendoc:spec:<encoded spec key>:<encoded name>`        | Per-spec state — theme name, theme mode, tab mode, open tabs, per-endpoint runner inputs, docs scroll position, and bounded conversation fallback mirror |
| `opendoc_spec_cache_v2:<url>` / IndexedDB / `opendoc_local_history` | Small cache fallback, large spec cache, and local-file history                                  |

Per-spec data is pruned automatically when a spec disappears from the configuration, and
legacy v0.1.0 keys are migrated into the namespaces once on first run. Known keys:

| Key                                                         | Purpose                                           |
|-------------------------------------------------------------|---------------------------------------------------|
| `opendoc:ui:sidebar_width` / `opendoc:ui:sidebar_collapsed` | Desktop sidebar state (global — not per spec)     |
| `opendoc:ui:collapsed_tags`                                 | Collapsed tag folders in the sidebar navigation   |
| `opendoc:ui:last_parsable`                                  | Last selected spec key                            |
| `opendoc:ui:endpoint_split_width`                           | Split-view pane width                             |
| `opendoc:ui:ai_settings` / `:ai_profiles`                   | Current AI settings and global provider profiles (secrets omitted unless explicitly remembered)  |
| `opendoc:ui:ai_active_profile` / `:ai_model_catalogs`       | Selected profile and refreshed model catalogs     |
| `opendoc:spec:<key>:theme` / `:theme_mode`                  | Theme name & mode per spec                        |
| `opendoc:spec:<key>:tab_mode`                               | Last used tab mode (docs / examine / split)       |
| `opendoc:spec:<key>:tabs`                                   | Open tabs (endpoints + view tabs) with active tab |
| `opendoc:spec:<key>:inputs:<method>:<path>`                 | Saved runner inputs per endpoint                  |
| `opendoc:spec:<key>:scroll:<method>:<path>`                 | Docs scroll position per endpoint                 |
| `opendoc:spec:<key>:ai_conversations`                       | Saved AI conversations for this specification     |
| `opendoc_spec_cache_v2:<url>`                               | Small/legacy fallback copy of a remotely loaded spec; large copies use IndexedDB         |
| `opendoc_local_history`                                     | Recently opened local files                       |
| `sessionStorage:opendoc_ui_session_secrets`                | Session-only AI keys/tokens when remember-secrets is off |

---

## Project structure

```
public/                  # static assets; config.json lives here (pre-defined mode)
src/
  App.tsx                # root: config bootstrap, spec loading, state, routing
  components/
    layout/              # Topbar, Sidebar (desktop rail + mobile drawer)
    views/               # Home, Search results, About, No-spec block page
    endpoint/            # Docs tab, API runner tab, split view, endpoint tabs bar
    schema/              # Schema explorer, JSON editor, property tables
    modals/              # Spec selector, themes, auth, code generator, share, …
    common/              # Tooltips, markdown, method badges, dropdowns, …
  hooks/                 # breakpoints, resize split, swipe-to-open, esc-to-close
  utils/
    openapi/             # Swagger→OpenAPI 3 normalization, ref resolution
    specCache.ts         # bounded-TTL remote cache with IndexedDB/local fallback
    indexedDb.ts         # large persistent document adapter
    localHistory.ts      # local-file history persistence
    routing.ts           # hash routing helpers
  data/themes.ts         # theme palettes
  types/                 # shared TypeScript types
```

---

## Deployment notes

- Serve `dist/` from any static host. The app needs **no API** of its own.
- **Pre-defined mode:** make sure `config.json` is reachable at `/config.json` (i.e. it
  must live in the public folder, not somewhere deeper), and that it actually contains
  your `parsables` — an empty file still counts as pre-defined mode.
- **Remote spec URLs** must send CORS headers (`Access-Control-Allow-Origin`) or the
  browser will block the fetch. Relative URLs (`/specs/...`) avoid this entirely.
- **Local mode:** simply don't ship a config source — a 404 on `/config.json` is what
  enables local file loading.
- The API runner calls endpoints directly from the visitor's browser. If your API does not
  allow CORS, the runner will show the browser's CORS error — the docs still work.

---

## FAQ

**Why does the app open in local mode?**
No config source was found at startup (no `config.json`, no `window.INITIAL_CONFIG`).
That's the local experience — you can open spec files from disk. To use pre-defined specs,
add a `config.json` to the public folder.

**There is no Open button / I can't load local files.**
Your deployment has a config source (a `config.json` or `window.INITIAL_CONFIG`), which
disables local loading by design. Remove the config to enable local mode.

**The spec selector shows an entry that fails to load.**
Check the URL in `config.json` — relative paths are resolved against the site root, and
remote URLs must be CORS-enabled. The selector shows per-entry error messages.

**Does the refresh button clear my history?**
No. Refresh only drops the spec cache; local history and settings are untouched.

**Why is my theme different per spec?**
Theme name and mode are stored per spec key — each API keeps its own look.

**Can I use Swagger 2.0 files?**
Yes. Files are normalized to OpenAPI 3 internally; both `swagger: "2.0"` and
`openapi: 3.x` documents are accepted, in JSON or YAML.

**Is anything sent to a server?**
No. Specs are fetched by your browser, files opened locally never leave the device, and
there is no analytics or telemetry code in the app.

---

## License

MIT © Pejman Chatrrouz — see the About page inside the app for the full text.
