← [Back to README](../README.md) · [Docs index](index.md)

# Quick start

## Requirements

- **Node.js 22+** with npm — the dev server, builder, and tooling run on Node; the built
  app itself is fully static.
- Optional: Docker Desktop / Docker Engine with the Compose plugin for the container path.

## Install

```bash
npm ci
```

(If you don't use lockfiles: `npm install`.)

## Development server

```bash
npm run dev
```

Serves the app at <http://localhost:3000> with hot reload.

## Production build

```bash
npm run build
```

Writes the static site to `dist/` and verifies the output bundle. Preview the production
build locally with:

```bash
npm run preview
```

## First run — local mode

Start the app (dev server or any static host for `dist/`) with **no** `config.json` present,
then use the **Open** button to load a Swagger 2.x / OpenAPI 3.x `.json`, `.yaml`, or `.yml`
file from your device. Files are read with the browser File API — nothing is uploaded — and
each opened spec is recorded in [local history](data-and-state.md#local-history).

## Serve configured specifications

Add a `public/config.json` describing the specs your deployment should offer — see
[Configuration](configuration.md) for the three modes and the hybrid option.

## Docker

```bash
docker compose up --build --detach
```

→ <http://localhost:3000>. Full details — image config, environment variables, and helper
scripts — in [Docker](docker.md).

## Guided builder CLI

Prefer answering a few questions over editing configuration files?

```bash
npm run make
```

Walks through every deployment decision and produces a configured production build.
See [Builder CLI](builder-cli.md).
