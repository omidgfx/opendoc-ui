# OpenDoc UI

A fully client-side documentation browser and API runner for **Swagger 2.x** and **OpenAPI 3.x**
specifications (JSON or YAML). Point it at a spec — via configuration or straight from your disk —
and it renders the whole API: endpoints grouped by tag, schemas, examples, authentication
schemes, a built-in request runner, code/type generators, deep-linkable URLs and a full theme
system. No backend required.

![Version](https://img.shields.io/badge/version-0.1.0--beta-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
    - [Mode 1 — `public/config.json` (pre-defined specs)](#mode-1--publicconfigjson-pre-defined-specs)
    - [Mode 2 — `window.INITIAL_CONFIG` (pre-defined specs)](#mode-2--windowinitial_config-pre-defined-specs)
    - [Mode 3 — No configuration (local mode)](#mode-3--no-configuration-local-mode)
- [Spec loading, caching and the refresh button](#spec-loading-caching-and-the-refresh-button)
- [Local history](#local-history)
- [Theme system](#theme-system)
- [The "no specification" state](#the-no-specification-state)
- [URL routing & deep links](#url-routing--deep-links)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [localStorage keys](#localstorage-keys)
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
- **Local mode** — no configuration at all: open `.json` / `.yaml` / `.yml` files from your
  device, with a persistent history of everything you opened.
- **Spec caching** — remote specs are cached in `localStorage` and served instantly on
  revisit; a refresh button drops the cache and re-fetches.

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

Type check:

```bash
npm run lint
```

There is **no server-side logic** — `dist/` is plain static files and can be dropped on any
static host (nginx, GitHub Pages, S3, `python -m http.server`, …).

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

## Spec loading, caching and the refresh button

When a configured spec has a `url`, the app:

1. checks the `localStorage` cache for that exact URL — if present, the spec is rendered
   instantly (no network request),
2. otherwise fetches the URL with `cache: 'no-store'` and stores the raw text in the cache.

The cache lives under the `opendoc_spec_cache_v1:` prefix. It is per-URL, so switching
between configured specs never re-fetches a spec you already loaded once.

The **refresh button** (circular arrows, next to the spec selector in the navbar and in the
mobile sidebar toolbar) drops the cache and reloads: it clears every cached spec and
re-fetches the current one from the network. In local mode the same button re-reads the
opened file from disk (when the file handle is still available) or re-parses the stored
text. The icon spins while a refresh is in flight.

---

## Local history

In **local mode**, every spec opened from disk is saved to `localStorage`
(`opendoc_local_history`), most recent first. The spec selector modal lists the history
with the spec title, file name and relative open time; entries can be re-opened with one
click or removed individually, and the whole history can be cleared from the modal footer.

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
app is open.

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
| `#/parsable/<key>/schema-explorer?schemas=<name>` | Schema explorer with a schema open         |
| `#/about`                                         | About page without a spec                  |

Query params: `?tab=examine|doc`, `?schemas=a,b`, `?search=...` and `#response-<code>`.

In local mode the key is `local:<fileName>`, and it maps back into the local history on
reload.

---

## Keyboard shortcuts

| Shortcut                            | Action                                   |
|-------------------------------------|------------------------------------------|
| `Ctrl / ⌘ + K`                      | Focus global search                      |
| `Esc`                               | Close the top-most modal / overlay       |
| `Alt + ←` / `Alt + →`               | Previous / next endpoint tab             |
| `Ctrl+Enter` (in runner)            | Send the request from the active pane    |
| `Ctrl+↑` / `Ctrl+↓` (in split view) | Move focus between docs and runner panes |

The About page lists the full set, including mouse interactions (middle-click a sidebar
endpoint to pin a permanent tab, double-click to keep the preview tab, etc.).

---

## localStorage keys

| Key                                              | Purpose                                                             |
|--------------------------------------------------|---------------------------------------------------------------------|
| `opendoc_spec_cache_v1:<url>`                    | Cached raw text of a remotely loaded spec                           |
| `opendoc_local_history`                          | Recently opened local files (title, file name, raw text, timestamp) |
| `selected_parsable_key`                          | Last selected spec key                                              |
| `endpoint_tabs_<key>`                            | Open endpoint tabs + active tab + view modes per spec               |
| `preferred_tab_<key>`                            | Last used tab mode (docs / examine / split) per spec                |
| `selected_theme_name_<key>` / `theme_mode_<key>` | Theme name & mode per spec                                          |
| `sidebar_collapsed` / `sidebar_width`            | Desktop sidebar state                                               |
| `collapsed_tags`                                 | Collapsed tag folders in the sidebar navigation                     |
| `endpoint_split_docs_width`                      | Split-view pane width                                               |

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
    specCache.ts         # localStorage cache for remote specs
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
