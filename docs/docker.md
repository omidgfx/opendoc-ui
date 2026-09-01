← [Back to README](../README.md) · [Docs index](index.md)

---

# Docker

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

← [Back to README](../README.md)
