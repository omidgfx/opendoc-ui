← [Back to README](../README.md) · [Docs index](index.md)

---

# Deployment notes

- Serve `dist/` from any static host. The app needs **no API** of its own.
- **Pre-defined mode:** make sure `config.json` is reachable at the app's deployment base
  (normally `/config.json`; on a project Pages site, `/<repository>/config.json`). It must live
  in the public folder and contain `parsables` — an empty file still counts as pre-defined mode.
- **Remote spec URLs** must send CORS headers (`Access-Control-Allow-Origin`) or the
  browser will block the fetch. Relative URLs (`/specs/...`) avoid this entirely.
- **Local mode:** simply don't ship a config source — a 404 on `/config.json` is what
  enables local file loading.
- **Docker:** `docker/config.json` enables local files through hybrid mode and can be replaced with
  deployment-specific configured specifications.
- The API runner calls endpoints directly from the visitor's browser. If your API does not
  allow CORS, the runner will show the browser's CORS error — the docs still work.

## GitHub Pages demo

**Live demo:** [https://omidgfx.github.io/opendoc-ui/demo/](https://omidgfx.github.io/opendoc-ui/demo/)

The repository includes `.github/workflows/pages.yml`. On every push to `master` it builds OpenDoc
with the repository base path, enables `public/demo/openapi.yaml`, and deploys `dist/` through the
official GitHub Pages artifact workflow.

Enable it once:

1. Open **Repository Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `master`, or run **Deploy demo to GitHub Pages** manually from the Actions tab.
4. Open the **[live demo](https://omidgfx.github.io/opendoc-ui/demo/)** after the deployment succeeds.

The committed app remains in local mode during normal development. The workflow copies
`public/demo/config.pages.json` to `public/config.json` only inside the disposable Actions runner,
so the hosted demonstration opens the bundled Complete Capability Showcase automatically while hybrid mode still lets visitors open local specifications.

For a custom domain, set `VITE_BASE_PATH` to `/` in `pages.yml`. For a renamed repository, the
existing workflow automatically uses `/${{ github.event.repository.name }}/`.
---

← [Back to README](../README.md)
