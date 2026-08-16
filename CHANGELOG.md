# Changelog

All notable changes to OpenDoc UI, newest first. The README keeps only the latest release summary;
this file preserves the complete history.

## [0.1.13] — 2026-08-16

Server variable editing and schema-table polish.

- replaces the inline server-variable editors in the sidebar with a compact **Active Server**
  control — the server select with a configuration button at its right that opens a dedicated
  **Server Variables modal** (enum dropdown or free input per variable, live resolved-URL preview,
  apply/cancel), keeping the sidebar compact;
- fixes server-variable handling at the root: changing a variable no longer replaces the selected
  server template with the expanded URL (which silently reset the dropdown to the first server and
  dropped the editors); the template stays selected, variable values are kept per server URL, and
  the resolved URL flows into the Runner and code generation through the resolver's
  `selectedVariables` path;
- shows **patternProperties** keys and **`not` constraints** in the schema property table
  (LocalizedLabels' locale pattern, NotBlankMarker's rejection of the empty string) as descriptive
  blocks instead of an empty table;
- labels **mutual TLS credentials** as "Client certificate" in the auth modal instead of "unknown".

## [0.1.12] — 2026-08-16

Fully responsive marketing site, modular builder CLI, repository restructure, and enforced
architecture discipline.

- makes the **marketing site fully responsive on mobile** — horizontal overflow eliminated at 320,
  390, and 768 px across all seven pages, with ghost action buttons hidden on narrow screens, the
  mobile navigation scrolling within the viewport, and the table of contents reflowing below the
  header on small displays;
- splits the **builder CLI** into a modular `scripts/builder/` structure — index, ui, validators,
  config, env, docker, build, steps, artifacts, start, lifecycle, and paths modules — with no
  change in behavior;
- renames the two top-level reference directories to say what they are: `proxy/` → `downloaders/`
  (the six specification downloader services) and `ai-proxy/` → `ai-gateways/` (the nine AI gateway
  integrations), updating the builder, README, and website references;
- regroups `src/utils` by domain — new `ai/`, `export/`, `notes/`, `runner/`, `specification/`, and
  `storage/` folders absorb the flat utility files, with redundant feature prefixes dropped inside
  domain folders (`aiBridge.ts` → `utils/ai/bridge.ts`) and primary modules promoted to folder
  indexes (`storage.ts` → `utils/storage/index.ts`);
- moves the Apple-emoji sprite renderer into `src/features/emoji/` (the build-time Vite alias now
  points at `enabled.ts`/`disabled.ts` there) and the recursive demo specification into
  `public/demo/recursive-demo.json`;
- regenerates the README Project structure section and updates the website's Compatibility, Deploy,
  and Developers pages to the new paths;
- makes the architecture discipline explicit, documented, and enforced: the last two
  type-only `utils → components` imports move into `src/types/` (`CustomDropdownOption` into the
  new `types/ui.ts`, `TabItem`/`ViewTabKind` from the `types/tabs.ts` definitions they re-exported),
  a new Architecture section in the README documents the dependency direction
  (`components → hooks/contexts → utils → types`) and the OpenAPI world / OpenDoc world boundary,
  and `scripts/verify-utils-contracts.mjs` enforces both on every `npm run lint` — utils may not
  import components, and may not import React outside the themeCss allowlist.

## [0.1.11] — 2026-08-15

Product website, hash-based deep links, capability showcase demo, and sidebar routes on by default.

- adds the **OpenDoc UI website** at the GitHub Pages root: seven pages (Home, Features, Guide,
  Compatibility, Deploy, Developers, FAQ) introducing the product and documenting it end to end,
  with the Default Slate palette, dark/light/system theming, Phosphor icons, long-form copy, and a
  footer crediting Pejman Chatrrouz with the tiny "Made with ♥ in Iran" signature;
- **redesigns the website** with a depth-first visual language — layered shadows and soft glows
  instead of heavy borders, an aurora hero with a browser-frame mockup and floating status chips,
  centered segmented sub-navigation, scroll-reveal animations, a stats band, and theme-aware
  screenshots that swap between light and dark captures;
- links the application **sidebar footer** (OpenDoc UI name → website, GitHub stays the repo link)
  and the **About page** footer (Website + GitHub links) to the new site;
- deploys **site at the root and the demo under /demo/** in one GitHub Pages artifact;
- switches deep links **back to hash-based URLs** (`#/parsable/...`): the fragment never reaches
  the server, so shared and refreshed links work on any static host — GitHub Pages, nginx, S3, or
  even `file://` — with zero rewrite configuration; legacy path-based links are still parsed;
- fixes the nginx image to serve **correct MIME types** (`include /etc/nginx/mime.types`) so css,
  js, svg, fonts and images are no longer refused by the browser;
- replaces the demo with the **Complete Capability Showcase**, a feature-dense OpenAPI 3.2
  document (43 operations, 41 schemas) exercising every surface — all HTTP methods plus QUERY and
  additionalOperations, serialization styles, rich bodies, recursion, composition, every security
  scheme, callbacks, links, webhooks, response galleries, and the Runner compatibility report —
  extended with `patternProperties`/`unevaluatedProperties`/`not` cases, extra string formats, and
  a `4XX` range response;
- documents `npm run make` end to end in the README (question flow, artifacts, guarantees);
- shows **endpoint routes in the sidebar by default** — the "Show endpoint routes" setting now
  defaults to checked for new workspaces, while users who explicitly disabled it keep their choice.

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
