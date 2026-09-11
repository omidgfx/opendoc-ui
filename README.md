<p align="center">
  <img src="public/opendoc-logo.svg" alt="OpenDoc UI logo" width="112" />
</p>

# [OpenDoc UI](https://omidgfx.github.io/opendoc-ui/)

A static-first documentation browser, API runner, and optional AI assistant for **Swagger 2.x** and
**OpenAPI 3.x** specifications (JSON or YAML). Point it at a spec — via configuration or straight
from your disk — and it renders the whole API: endpoints grouped by tag, schemas, examples,
authentication schemes, a built-in request runner, code/type generators, deep-linkable URLs,
full theming, and grounded AI answers. The documentation UI never requires a backend; AI can use
CORS-enabled providers directly or an optional gateway.

[![Website](https://img.shields.io/badge/website-omidgfx.github.io%2Fopendoc--ui-4f46e5)](https://omidgfx.github.io/opendoc-ui/)
![Version](https://img.shields.io/badge/version-0.3.6-blue) ![License](https://img.shields.io/badge/license-MIT-green) [![Live Demo](https://img.shields.io/badge/live-demo-7c3aed)](https://omidgfx.github.io/opendoc-ui/demo/)

**[Open the live demo →](https://omidgfx.github.io/opendoc-ui/demo/)** Browse the bundled Complete Capability Showcase specification or open your own JSON/YAML files directly in the hybrid demo.

---

## Features

- **Documentation browser** — tag folders with nested groups, endpoint list, parameter
  tables, request bodies, response examples and full schema inspection.
- **Unified schema viewer** — one SchemaViewer for request bodies, responses, and the schema
  modal, with generated examples, field combinator menus, and body-level oneOf/anyOf/allOf/not rails.
- **Built-in API runner** — execute requests straight from the browser with bearer token,
  API-key, basic auth and cookie support; use recursive nested-object/array forms, edit JSON/YAML/XML
  raw bodies with format-aware validation, and view bounded response details. CORS permitting, no
  proxy is needed. OAS 3.2 **QUERY** (RFC 10008) is first-class beside GET/POST and additional operations.
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
- **Request proxy** — the downloader service doubles as a proxy: the Runner hands it the compiled
  request, it executes the real API call server-side (no CORS limits), and answers through a JSON
  envelope; `VITE_REQUEST_PROXY` ships it in a build, `config.json {"proxy": {"enabled": false}}` or the
  Settings switch turns it off on the front-end while the backend keeps running;
- **Remote URL loading** — optional build-time capability with CORS guidance, downloaders/direct fallbacks,
  persistent URL history, cache revalidation, and hardened downloader examples in six backend languages.
- **Spec caching** — remote specs use a bounded-TTL cache with ETag / Last-Modified
  revalidation; persistent state and raw documents use IndexedDB instead of consuming the localStorage quota.
- **Reference-safe rendering** — unresolved, circular, and multi-file `$ref` graphs are diagnosed without taking down unrelated views; recursive property matrices and Runner forms stop at cycle boundaries, and missing local files can be added after the root is opened.
- **Clean routes** — endpoint, schema, compatibility, and assistant links use normal paths while retaining legacy hash-link compatibility.
- **Crash recovery** — view-level boundaries isolate malformed endpoint/schema content, while the global recovery screen remains the final fallback.

---

## Version 0.3.6

**Runner serialization reliability** on top of 0.3.5:

- one wire contract: a dependency-free vendored query-string core builds every query string
  (bracket arrays, deep nesting, mixed arrays) and the urlencoded bodies; empty arrays travel
  as `name[]=` markers, and object query parameters deep-bracket with the parameter name as
  prefix (`filter[status]=active&filter[range][min]=1`) instead of flattening;
- **type-aware Serializer playground**: array parameters edit with the Runner-form array
  editor, object parameters get the JSON editor, scalars keep the text input — touched values
  serialize identically to untouched defaults, and Use hands the value back unchanged;
- multipart fidelity: no phantom binary parts without a file, file parts keep the file's own
  Content-Type, Clear button, nested binary field names and non-Latin filenames without
  collisions;
- XML round trip: `xmlns` on the root only; schema-less object values render as JSON text in
  forms;
- headers and redirects: case-insensitive matching, forbidden headers stripped, cookie
  parameters on the `Cookie` header, final URL after redirects shown;
- forms and editor: `anyOf [null, object]` and `additionalProperties` variants fixed, tuple
  arrays fill sparse slots and guard removals, the JSON/YAML editor keeps invalid drafts as-is
  on language switch;
- endpoint view console is clean (missing React keys fixed);
- the managed AI policy probe stays by design — zero-config discovery for 0.3.5's Managed AI
  mode.

See [`CHANGELOG.md`](CHANGELOG.md) for the complete release history.

---

## Quick start

OpenDoc UI is a static Vite + TypeScript app — no backend required.

```bash
npm ci            # install dependencies
npm run dev       # dev server → http://localhost:3000
```

For a production build:

```bash
npm run build     # outputs the static site to dist/
npm run preview   # preview the production build locally
```

Open a Swagger 2.x / OpenAPI 3.x `.json`, `.yaml`, or `.yml` file straight from the app —
no configuration needed (local mode). To serve configured specs, add a `public/config.json`
(see [Configuration](docs/configuration.md)). Prefer containers?

```bash
docker compose up --build --detach   # → http://localhost:3000
```

Everything else — the guided builder CLI, remote URL loading, the AI assistant and gateway,
theming, routing, deployment, and the FAQ — lives in the [documentation](#documentation).

---

## Documentation

| Page                                                          | Covers                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Quick start](docs/quick-start.md)                            | Requirements, install, dev/build scripts, first run                     |
| [Docker](docs/docker.md)                                      | Docker Compose, image, config mount, helper scripts                     |
| [Builder CLI](docs/builder-cli.md)                            | The guided `npm run make` deployment CLI                                |
| [Configuration](docs/configuration.md)                        | Modes 1–3, hybrid mode, `config.json` & `window.INITIAL_CONFIG`         |
| [Remote URL loading](docs/remote-loading.md)                  | Load-from-URL, build-time settings, downloader-first behavior           |
| [Request proxy](docs/request-proxy.md)                        | Runner requests executed server-side by the downloader service          |
| [Proxy server services](docs/proxy-servers.md)                | Six reference implementations serving `GET /download` and `POST /proxy` |
| [Endpoint notes & hidden endpoints](docs/endpoint-notes.md)   | Local notes, todos, trash, orphaned notes, hidden endpoints             |
| [API runner](docs/api-runner.md)                              | Runner safety, OpenAPI behavior, authentication, compatibility          |
| [AI assistant](docs/ai-assistant.md)                          | Assistant page, profiles, providers, skills, export                     |
| [AI gateway](docs/ai-gateway.md)                              | Optional gateway, managed AI mode, framework examples                   |
| [Spec loading, history & persistence](docs/data-and-state.md) | Caching & revalidation, refresh button, storage keys                    |
| [Theme system](docs/themes.md)                                | Palettes, tags, light/dark/system modes                                 |
| [Routing & deep links](docs/routing.md)                       | Hash routes, keyboard shortcuts, the no-spec state                      |
| [Architecture](docs/architecture.md)                          | Project structure, dependency direction, OpenAPI vs OpenDoc worlds      |
| [Deployment](docs/deployment.md)                              | Static hosting notes, GitHub Pages demo                                 |
| [FAQ](docs/faq.md)                                            | Common questions                                                        |

Also see the [CHANGELOG](CHANGELOG.md) for the complete release history.

---

## Contributors

- **[Pejman Chatrrouz](https://github.com/omidgfx)** — Creator and maintainer.
- **Hossein Dehghan** — Logo design.
- **[Pedro J. Molina](https://github.com/pjmolina)** — Docker infrastructure and Bash-on-Windows build fixes.

---

## License

MIT © Pejman Chatrrouz — see the About page inside the app for the full text.

When enabled, Apple emoji artwork supplied through `emoji-datasource-apple` remains © Apple Inc. and is not covered by this project's MIT license. Upstream notes that the Apple artwork is not licensed for commercial use.
