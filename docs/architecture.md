← [Back to README](../README.md) · [Docs index](index.md)

---

# Project structure & architecture

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

← [Back to README](../README.md)
