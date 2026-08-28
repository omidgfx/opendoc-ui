# Changelog

All notable changes to OpenDoc UI, newest first. The README keeps only the latest release summary;
this file preserves the complete history.

## [0.3.2] — 2026-08-28

Curated theme gallery with stable config tags, schema meta table layout, and CI contract polish.

- curates **17 product themes** (including Persian Red) with stable slug tags for `config.json`, a redesigned appearance picker with copyable tags, and legacy name/alias resolution;
- rebuilds the SchemaViewer **meta info box** as a two-column table (Schema / Required / combinator / About), drops the duplicate schema-wide table banner, and keeps required fields on a scrollable rail;
- mutes meta row labels while coloring icons only; sizes the label column to the longest header without collapsing width;
- satisfies CI **Prettier** on README and the **no native `title` tooltip** UI contract (Tip on required field names).

## [0.3.1] — 2026-08-28

Recursive schema guard, richer capability showcase, and marketing-site refresh.

- stops field-level **anyOf** (and oneOf) branch apply from overflowing the call stack on recursive shapes such as `TreeNode.parent: anyOf[null, TreeNode]` — cyclic `$ref` leaves stay unexpanded, safe branches still merge, and a depth fuse remains as a last resort;
- hardens `effectiveBranchSchema` with a seen-set so combinator merges keep stable `$ref` leaves on cycles;
- deepens the public **capability showcase** (v2 demo): Spotlight folder for SchemaViewer, field combinators, OAS 3.2 QUERY, bare `$ref` bodies, multi-format responses, `x-tagGroups`, and a clearer guided tour;
- refreshes the marketing website copy for SchemaViewer, field combinators, QUERY, Settings, serialization, and experimental YAML auto-repair;
- bumps the package, lockfile, README, and release metadata to `0.3.1`.

## [0.3.0] — 2026-08-28

Shared schema viewer, field-level combinators, OAS 3.2 QUERY, and load-time YAML repair.

- introduces a **shared SchemaViewer** for request bodies, responses, and the schema modal: generated examples with multi-format encodings, always-open meta stats, body-level oneOf/anyOf/allOf/not rails, and the same property table used in documentation;
- adds **field-level combinator menus** in the code viewer and schema table — exclusive oneOf picks, multi-select anyOf merge (with a real All on/off), allOf composition focus with path-scoped line dimming, and inspection-only `not`;
- locks combinator chrome to distinct method hues and controls (oneOf PUT/radio, anyOf GET/checkbox, allOf POST/radio, not DELETE);
- ships first-class **OAS 3.2 QUERY** (RFC 10008) discovery, documentation, and Runner support alongside additional operations, without weakening GET/HEAD body warnings;
- repairs invalid generator YAML where flow-style `oneOf`/`anyOf`/`allOf` omit sequence brackets (**experimental** auto-repair on load);
- expands bare `$ref` bodies for oneOf/anyOf/allOf/not, empty-servers sidebar label, natural numeric endpoint name sort, menu item spacing, form-urlencoded nulls as empty values, IndexedDB-first preferences with localStorage fallback, per-schema documentation default, and path-always sidebar search;
- bumps the package, lockfile, README, About features, and release metadata to `0.3.0`.

## [0.2.3] — 2026-08-21

Generated examples, named spec examples, and final schema-viewer polish.

- extends schema-aware branching into generated examples and generated code, with inline oneOf
  caret pickers inside code viewers and request/response example rendering that follows the active
  branch and the selected media type;
- adds dedicated request/response spec-example tabs for named OpenAPI `examples`, restores
  view-schema actions in the schema tab row, and keeps example selection inside the active example
  tab instead of crowding the surrounding controls;
- tightens schema-viewer layout and affordances: more stable property-table column sizing,
  icon-based oneOf radios, a persistent top-right sidebar toggle, side-by-side table/sidebar layout
  through tablet and desktop widths, and required code-gutter markers that keep their alignment
  through a preserved red asterisk slot;
- bumps the package, lockfile, README, and release metadata to `0.2.3`.

## [0.2.2] — 2026-08-21

Schema viewer redesign, branch-aware unification, and a practical property-grid sidebar.

- keeps the existing schema property table as the main view while moving schema-wide and
  selected-property detail into a practical right sidebar with sticky headers and a collapsible
  layout;
- makes `oneOf` selection part of the property table itself, with custom radio controls that re-render
  the unified property matrix and the active example representation from the selected branch across
  request bodies, responses, and schema modals;
- deepens schema unification so nested descendants such as
  `employees.*.employment.salary.amount` appear in the table while recursive references still stop at
  the first cycle;
- restores and polishes property-level tools and styling: pattern testing, serializer playground
  access, validation pills, clearer array item hints, scroll-safe copyable property names, and a
  shared table/sidebar frame;
- bumps the package, lockfile, README, and release metadata to `0.2.2`.

## [0.2.1] — 2026-08-20

Dialogs opened from inside the endpoint workspace, and the allOf request body.

- fixes the pattern tester, the serializer playground and the endpoint info modal being drawn under
  the topbar and under the mobile drawer: a dialog opened from inside the workspace was trapped in
  the workspace's own stacking layer, and now renders through a portal at the end of the document;
- reads an `allOf` request body as the object it assembles — the matrix shows that object with the
  required list declared beside the keyword, above a note naming the parts it was assembled from —
  instead of offering the parts as if they were alternatives, and marks a part that declares nothing
  as empty instead of opening an empty view for it;
- bumps the package, lockfile, README, and release metadata to `0.2.1`.

## [0.2.0] — 2026-08-20

Endpoint notes review: a settings page, serialization awareness, and a responsive documentation and
Runner surface. Large enough in scope to take a minor version.

- adds a **Settings page** with its own tab and deep links (`/#/<spec>/settings#<section>`) covering
  General, Appearance, Navigation, Code viewer, and AI, and retires the theme selector modal in
  favour of an in-page theme gallery;
- makes the schema/example switch a **scope** choice — per endpoint or globally for the
  documentation, per schema or globally for the schema modal — stored with the rest of the
  preferences in IndexedDB;
- fixes the documentation, the example viewer, and the Runner disagreeing about the request body:
  all three now resolve the same media type and the same declared example;
- teaches parameters their **serialization**: `style`/`explode` descriptors next to every parameter,
  a serializer playground that can hand its result to the Runner, a pattern tester, live pattern
  indicators, a structured (JSON/YAML) editor for object parameters, and a live final URL;
- fixes array parameters being seeded with JSON text, so `tagsCompact` sends `one,two,three`
  instead of splitting `["one","two"]` on its own commas, and exploded arrays send every value;
- splits the parameter matrix per location (path, query, header, cookie) with a setting to keep the
  unified table, and tags each location with its own icon and hue;
- reworks polymorphism: `oneOf`/`anyOf`/`allOf` selectors became a scrolling tab rail with an
  overflow menu, on responses as well, and nested combinators read correctly on a phone;
- adds a **mobile response navigator** — a pinned pill that follows the response you are reading and
  a bottom sheet to jump between responses;
- turns tables into cards when a pane runs out of room for its columns (parameters, schema
  properties, response headers, compatibility), with a setting to keep the table;
- makes the workspace container-aware: split view is offered only where it fits, the endpoint header
  actions stay on one row, the notes panel floats over the pane instead of squeezing it, and it now
  slides in and out like the sidebar;
- adds shared modal shortcuts (Escape, Ctrl/⌘+Enter, and the mobile back gesture), a scrolling tab
  strip that never hijacks the page scroll, and an overflow action menu for route actions;
- fixes several stacking and gesture defects: the code viewer gutter painting over pinned elements,
  the endpoint pane competing with the app chrome, and the sidebar edge swipe opening the drawer
  behind an open modal, sheet, or overlay;
- docks the endpoint notes panel beside the documentation on desktop, folds the colour mode into a
  single cycling button on a narrow topbar where the mark stands without the wordmark, and leads an
  `allOf` rail with the object it unifies, selected by default;
- fixes dragging a workspace tab crashing into the recovery screen, and hides the sidebar toggle
  where no sidebar exists while letting the narrow-width drawer open without a specification;
- renders one table layout at a time — the card and column variants are no longer both present with
  one of them hidden — and lets the keyboard focus and scroll a row that overflows sideways;
- indents XML examples, adds a code viewer gutter and indicator-icon settings, restores the tablet
  search panel, and bumps the package, lockfile, README, and release metadata to `0.2.0`.

## [0.1.16] — 2026-08-17

Brand identity refresh and logo rollout.

- replaces the active app, website, and favicon branding with the new OpenDoc UI mark designed by
  **Hossein Dehghan**;
- adds rounded, shadowed, theme-aware gradient logo shells to the app topbar and welcome/search landing;
- redesigns the welcome/search heading as two lines: the OpenDoc UI wordmark first, then the active
  specification title at a smaller size;
- adds a full-width About-page brand hero that uses the logo without a square shell and follows the
  current theme palette;
- updates marketing-site header/footer branding, favicon references, and static-site generation;
- renders the mark as a theme-aware component whose artwork palette maps to `--primary`, `--accent`,
  and the HTTP-method tokens, so it re-tints with the active theme and light/dark mode;
- fixes the mark rendering blank on mobile by scoping each instance's SVG gradients, filters, and
  clip paths to per-instance ids instead of resolving against the hidden topbar copy;
- moves contributor credits into a README Contributors section and drops the inline logo credit from
  the About page footer;
- bumps package, lockfile, README, and release metadata to `0.1.16`.

## [0.1.15] — 2026-08-17

Docker build portability and AI profile credential visibility.

- fixes Git Bash/MSYS2 path conversion rewriting `VITE_BASE_PATH=/` before it reaches
  `docker.exe`, while preserving normal conversion for Docker's file and context paths;
- fixes the **Custom OpenAI-compatible** AI provider preset, which was incorrectly marked
  as not requiring an API key, so the AI Settings modal now renders its masked API key
  field in Direct transport;
- keeps the request behavior aligned with the UI: when a key is supplied, the existing
  OpenAI-compatible adapter sends it as `Authorization: Bearer <key>`;
- keeps Ollama keyless for local development and bumps the package and lockfile metadata
  to `0.1.15`.

## [0.1.14] — 2026-08-17

Website redesign, code-viewer line markers, multi-format request bodies, and documentation-view polish.

- **redesigns the marketing website** around the product's own brand identity (indigo #4F46E5 →
  #6366F1 with the logo's cyan #0891B2 tail, emerald success states, ink neutrals): all-sans
  typography (Manrope display, Inter body, JetBrains Mono details) with CSS-variable design tokens,
  a light/dark/system theme toggle persisted to localStorage with a no-flash inline snippet, motion
  (scroll progress bar, scroll-reveal choreography, stat count-up, animated gradient headlines)
  gated behind `prefers-reduced-motion`, a landing hero embedding the live demo in an interactive
  browser frame, a bento capability grid with hand-built miniatures of the real UI (endpoint tree,
  Runner request, code generation, a Search tab modeled on the actual app, notes tones, deep-link
  card, theme previews), and the Features/Guide/Compatibility/Deploy/Developers/FAQ subpages rebuilt
  in the same system with scroll-spy sticky TOCs and redesigned tables;
- fixes the site along the way: stat numbers render in the right font, the hero no longer
  scroll-jumps when the demo iframe loads, and code blocks preserve line breaks;
- adds **line numbers with annotation icons** to the code viewer, with a **gutter marker suite**
  for schemas and runner responses: combinator branches (oneOf/anyOf alternatives named in the
  tooltip), deprecated properties, usage-aware read-only/write-only locks, enum/const value lists,
  mapped format icons, clickable pattern markers that open the Pattern Tester, response
  truncation, encoded-binary detection and diff markers against the previous run — all recursion-
  safe through nested anyOf/oneOf branches, with interaction polish (required dots, rich tooltips,
  cycle-safe breadcrumbs, color-only hover);
- supports **every request body format an endpoint declares** in the Runner: JSON, YAML, XML and
  `application/x-www-form-urlencoded` query strings with bracket notation
  (`a=1&b=4&j[]=1&a[]=5&k[key]=foo`), alongside the existing text, HTML, JavaScript, binary and
  multipart bodies;
- converts between body formats transparently — the form always edits a JSON model and serializes
  to the active media type (XML honors OpenAPI `xml` hints: element names, attributes, wrapped
  arrays, namespaces and prefixes), switching the media type dropdown converts the current payload
  instead of showing stale JSON, the raw toggle labels follow the format (Raw XML, Raw YAML, Raw
  Form), and seeding/Reset Examples use the selected media type's own example;
- converts **out of unknown textual formats** (text/plain, text/html, application/javascript, …)
  instead of passing stale text into a foreign editor: JSON-shaped text converts for real, any
  other payload becomes a plain string that serializes into the target format, so a spec with only
  XML and plain-text bodies converts cleanly in both directions;
- renders **open object bodies** in the documentation's schema property table (an "Additional
  Properties" block for merge-patch-style schemas) and shows the **request body example** when the
  media type declares one, so bodies like `application/merge-patch+json` are no longer invisible in
  the docs view;
- fixes parameter presentation: **long parameter descriptions** use the description tooltip instead
  of truncation, and **every parameter example type** renders properly — never `[object Object]`.

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
