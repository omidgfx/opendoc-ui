# Changelog

All notable changes to OpenDoc UI, newest first. The README keeps only the latest release summary;
this file preserves the complete history.

## [0.1.10] — 2026-08-14

Interactive builder CLI and cross-platform hardening.

- adds `npm run make`, a guided npm-only builder that collects deployment preferences (static files,
  Docker image, or both), frontend build options (Apple Emoji sprite, base path, Load-from-URL), an
  optional downloader proxy template with framework examples, an optional server-side AI gateway
  (provider, model, base URL, API key, auto-generated gateway token, allowed origins, port, limits,
  framework examples), and Docker options (image, container, host port, restart policy);
- keeps `npm run build` byte-for-byte unchanged — build-time `VITE_*` options are injected only into
  the child build process, and `.env` receives runtime settings only;
- writes a gitignored `builder.config.json` for reproducible re-runs, never stores secrets in it
  (tokens and API keys live in `.env` only), backs up `.env`, strips stale managed keys, and tightens
  permissions on Unix;
- verifies the build output with a fresh-dist snapshot and only then commits the configuration, so a
  failed build cannot leave the project half-modified;
- offers to start the result afterwards: local preview, dev server, Docker Compose (with `/healthz`
  polling), or the AI gateway;
- fixes child-process spawning on Windows (`npm.cmd` EINVAL after the CVE-2024-27980 fix) through a
  shell-backed spawn helper shared by the build, the gateway, and the Docker probes.

## [0.1.9] — 2026-08-14

Trash and orphaned notes, detached Runner Compatibility page, and request-matrix polish.

- adds a spec-scoped **Trash** with restore, permanent delete, and empty-trash actions — deleting a note
  no longer destroys it, and every destructive action asks for confirmation;
- adds a dedicated **Orphaned** list parallel to the trash: notes whose endpoint disappears from the
  loaded specification (removed, renamed, or imported from another spec) land there, can be re-assigned
  to another endpoint through a compact searchable picker, or deleted permanently with confirmation;
- **Move all to trash** only moves active notes; orphaned notes are never touched by bulk deletion, and
  restoring a trashed note whose endpoint is missing returns it to the Orphaned list;
- importing notes exported from another specification warns clearly that they may not belong to the
  current spec before anything is merged;
- detaches **Runner Compatibility** from the Overview view into its own sidebar page, with a matching
  collapsed-rail and mobile entry, and removes its back-to-overview button;
- exposes named oneOf/anyOf branch alternatives (referenced schema names) in the Runner request body and
  the View Documentation request-body matrix, keeps a restored body on its edited branch, and produces
  JSON `null` for pure-null alternatives;
- marks recursive and reused schemas with a loop icon across schema tables, example representations,
  schema modals, and the Runner's circular-reference guard;
- adds JSON export/import of all notes (`opendoc-endpoint-notes`) with orphaned-note detection;
- removes the hover focus-steal from Runner field frames so clicking the request body never jumps focus
  into its first input, and aligns the notes-sidebar resize handle with the main sidebar style;
- reorganizes the Local Notes page around a toolbar holding New note, Import, Export, Orphaned, Trash,
  and Move all to trash.

## [0.1.8] — 2026-08-14

Local notes workspace and recursive schema reliability.

- adds specification-scoped Markdown notes and todos with required titles, optional details, fourteen
  theme-safe tones, completion state, and confirmation-controlled endpoint auto-hiding;
- adds hidden endpoints, a muted final sidebar folder, individual restoration, and **Unhide all
  endpoints** navigation settings;
- introduces the tone-colored `NoteViewerModal`, including empty-note presentation and adjacent edit,
  delete, and close controls;
- adds a resizable endpoint-notes sidebar to single Documentation and API Runner views while retaining
  the notes modal in Split View;
- persists note expansion state and notes-sidebar width through IndexedDB, and fixes pointer dragging
  on the sidebar's wider resize handle;
- adds searchable endpoint selection to the specification-wide note creator while endpoint-specific
  note actions keep their endpoint fixed;
- adds Local Notes context-menu deletion with custom confirmation, viewport-aware endpoint menus, and
  scroll-safe custom dropdown dismissal;
- makes recursive property matrices, schema modals, generated defaults, and Runner forms cycle-safe
  without modifying the source OpenAPI document;
- strengthens clean-route browser history, configured/local/remote specification restoration, and
  IndexedDB-first persistence;
- keeps note button sizing stable across zero-to-three-digit counts and aligns note icon colors with
  each control's active text state;
- expands automated coverage for cyclic OpenAPI schemas, local-note persistence, note viewers, resize
  behavior, navigation history, and UI contracts.

## [0.1.7] — 2026

- adds specification-wide Runner compatibility reporting and binary/attachment response safeguards;
- renders confirmation modals at viewport level so they stay reachable in every layout.

## [0.1.6] — 2026

- makes Docker deployment reproducible and cross-platform (compose + helper scripts for Windows/macOS/Linux).

## [0.1.3] — 2026

- adds remote specification loading with downloader proxy services (Node, Python, PHP, Go, Java, .NET);
- adds framework-specific AI gateway backends (Express, FastAPI, Django, Laravel, Rails, Spring Boot,
  ASP.NET Core, Gin, Axum);
- adds lean build options (Apple Emoji sprite toggle, base path, single-bundle verification);
- adds response navigation improvements and default sidebar routes off.

## [0.1.0] – [0.1.2] — 2026

Initial public releases:

- serverless AI assistant integration with grounded endpoint context and a Runner action bridge;
- rebuilt API Runner forms with recursive request bodies and direct AI execution;
- recursive API forms, closable description tooltips, and route-in-endpoint tooltips;
- OpenAPI parameter resolution and permissive Runner validation;
- initial documentation browser, schema explorer, theming, and code generation.

---

Releases are tagged on GitHub: <https://github.com/omidgfx/opendoc-ui/releases>
