← [Back to README](../README.md) · [Docs index](index.md)

---

# Builder CLI — `npm run make`

For anyone who prefers answering questions over editing configuration files, the repository ships a
guided, cross-platform builder CLI. Run it with plain npm — it works identically on Windows,
macOS, and Linux:

```console
npm run make
```

The CLI walks through every deployment decision, produces a clean configured production build, and
then offers to start it. It is built exclusively on Node built-ins (no new dependencies), and it
**never touches the plain `npm run build` script** — build-time options are injected only into the
child build process, and runtime settings land in `.env`.

## What it asks

| Step               | What it gathers                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight          | Reuse of a previous configuration (with a summary and Use / Edit / Start fresh choices), Node version check, Docker engine + compose detection |
| Deployment profile | Static files only, Docker image, or both; clean the previous output first if desired                                                           |
| Frontend options   | Apple Emoji sprite (exclude for a leaner bundle, include for consistent Apple rendering), base path, and whether to enable Load-from-URL       |
| Downloader proxy   | A `{URL}` template validated with the same rules as `vite.config.ts`, plus optional framework example env files                                |
| AI gateway         | Provider, model, base URL, hidden API key, auto-generated gateway token, allowed origins, port, and limits — with optional framework examples  |
| Docker options     | Image name, container name, host port (with in-use detection), restart policy                                                                  |
| Review             | A full summary of every choice — origins, proxy examples, Docker status, secret status — before anything is built                              |
| Build              | Optional clean, then the existing `npm run build` with live output, followed by fresh-output verification and bundle/gzip sizes                |
| Start              | Local preview, dev server, Docker Compose (with `/healthz` polling before claiming success), or the AI gateway                                 |

## What it writes

- **`.env`** — runtime settings only (`AI_GATEWAY_*`, `AI_PROVIDER`, `AI_MODEL`, `OPENDOC_*`, and
  friends), exactly what the AI gateway and `compose.yaml` read at runtime. Builder-owned keys live
  in a clearly marked managed section; unrelated entries keep their exact formatting, the previous
  file is backed up as `.env.bak`, stale managed keys are removed when no longer applicable, and
  permissions are tightened to `0600` on Unix.
- **`builder.config.json`** (gitignored) — the full answer set for reproducible re-runs. Secrets are
  **never** stored here; tokens and API keys stay in `.env` and are loaded back from there on reuse.
- **`downloaders/<framework>/.env`** and **`ai-gateways/<framework>/.env`** — only when you ask for a
  framework example, pre-filled with your origins, token, provider and model.

## Guarantees

- `npm run build` stays byte-for-byte identical — build-time `VITE_*` options are passed only to the
  child process the CLI spawns.
- The build runs first; configuration is committed only after the output verifies (fresh-dist
  snapshot, `index.html` referencing `index.js`, non-empty artifacts), so a failed build cannot leave
  the project half-modified.
- Loaded configurations are schema-validated with a version/migration hook; an invalid stored config
  falls back to a fresh start with a clear warning.
- Origins must be strict `scheme://host`, base paths are normalized, downloader templates must
  contain exactly one `{URL}`, and gateway tokens enforce a safe character set.
- Child processes run from the project root; Ctrl+C tracks lifecycle state and terminates them.
  On Windows, child launches use a shell-backed helper required by Node's CVE-2024-27980 fix.
- A buffered piped-input fallback keeps the CLI scriptable (`printf '...' | npm run make`) and
  CI-friendly.

---

← [Back to README](../README.md)
