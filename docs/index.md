← [Back to README](../README.md)

# OpenDoc UI documentation

The in-depth documentation for OpenDoc UI, split into focused pages. New to the project?
Start with [Quick start](quick-start.md).

## Getting started

- [Quick start](quick-start.md) — requirements, install, dev/build scripts, first run
- [Docker](docker.md) — containers, Compose, image config, helper scripts
- [Builder CLI](builder-cli.md) — the guided `npm run make` deployment CLI

## Configuration & loading

- [Configuration](configuration.md) — the three deployment modes and hybrid mode
- [Remote URL loading](remote-loading.md) — load specs from URLs at build time
- [Downloader services](downloaders.md) — six reference downloader implementations (Node, Python, PHP, Go, Java, .NET)

## Features

- [API runner](api-runner.md) — runner safety, OpenAPI behavior, compatibility
- [Endpoint notes & hidden endpoints](endpoint-notes.md) — private notes, todos, trash, hidden endpoints
- [AI assistant](ai-assistant.md) — assistant page, profiles, providers, skills, export
- [AI gateway](ai-gateway.md) — optional gateway, managed AI mode, framework examples
- [Theme system](themes.md) — palettes, tags, light/dark/system modes
- [Routing & deep links](routing.md) — hash routes, keyboard shortcuts, the no-spec state

## Data & internals

- [Spec loading, local history & persistence](data-and-state.md) — caching, revalidation, storage keys
- [Architecture](architecture.md) — project structure and dependency direction

## Operations

- [Deployment](deployment.md) — static hosting notes and the GitHub Pages demo
- [FAQ](faq.md) — common questions
