← [Back to README](../README.md) · [Docs index](index.md)

---

# FAQ

**Why does the app open in local mode?**
No config source was found at startup (no `config.json`, no `window.INITIAL_CONFIG`).
That's the local experience — you can open spec files from disk. To use pre-defined specs,
add a `config.json` to the public folder.

**There is no Open button / I can't load local files.**
Pre-defined deployments disable local loading by default. Either remove the configuration to use
local mode, or add `"allowLocalSpecifications": true` to enable hybrid mode.

**The spec selector shows an entry that fails to load.**
Check the URL in `config.json` — relative paths are resolved against the site root, and
remote URLs must be CORS-enabled. The selector shows per-entry error messages.

**Why is Load from URL missing?**
It is a build-time capability. Set `VITE_LOAD_FROM_URL=true` before running `npm run dev` or
`npm run build`; changing the value after deployment cannot modify an existing static bundle.

**Why did the direct URL request fail while the downloader works?**
Browsers enforce CORS and mixed-content rules; backend downloaders are not subject to browser CORS
when contacting the target. The downloader itself must still allow the exact OpenDoc UI origin via
`OPENDOC_ALLOWED_ORIGINS`.

**Does the refresh button clear my history?**
No. Refresh only drops the spec cache; local history and settings are untouched.

**Why is my theme different per spec?**
Theme name and mode are stored per spec key — each API keeps its own look.

**Can I use Swagger 2.0 files?**
Yes. Files are normalized to OpenAPI 3 internally; both `swagger: "2.0"` and
`openapi: 3.x` documents are accepted, in JSON or YAML.

**Is anything sent to a server?**
Local files never leave the device. Configured/URL specifications are requested from their source
or configured downloader, and optional AI requests go only to the selected provider/gateway. There
is no analytics or telemetry code in the app.
---

← [Back to README](../README.md)
