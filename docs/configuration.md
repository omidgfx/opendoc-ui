← [Back to README](../README.md) · [Docs index](index.md)

---

# Configuration

OpenDoc UI supports **three deployment modes**. The mode is decided at startup, entirely by
what is present on the page:

| Mode                           | Trigger                                                     | What the user sees                                                 |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| **1. config.json**             | `public/config.json` exists and is served at `/config.json` | A spec selector in the navbar + switch modal, specs auto-load      |
| **2. `window.INITIAL_CONFIG`** | A global object injected before the app boots               | Same as mode 1; the inline object wins over `config.json`          |
| **3. Local mode**              | Neither of the above exists (no config source at all)       | An **Open** button instead of the selector; users open local files |

## Mode 1 — `public/config.json` (pre-defined specs)

Place a `config.json` in the **public** folder of the app (it is served at `/config.json`,
the path the app fetches on boot). The file describes every spec the deployment should offer:

```jsonc
{
  // Theme tag used for every spec in this file ("default" / "default-slate" = first built-in)
  "theme": "default-slate",

  // Optional: keep configured specs and also let visitors open local files
  "allowLocalSpecifications": true,

  "parsables": {
    "Player API": {
      "theme": "default-slate", // optional, per-spec theme tag
      "url": "https://api.example.com/docs-json", // remote JSON or YAML
      "title": "Player API", // optional, shown in the selector
    },
    "Pet Store": {
      "url": "/specs/pet-store.json", // local file inside public/
    },
    "Inline Spec": {
      "isCustom": true, // optional — treat the entry as inline
      "rawSpec": "{ \"openapi\": \"3.0.0\", ... }", // the spec itself, as a string
    },
  },
}
```

Supported keys per entry:

| Key        | Type    | Description                                                                                                                                                                     |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`      | string  | Where to fetch the spec from. Relative paths resolve against the site root; absolute URLs are fetched directly (the remote server must allow CORS).                             |
| `title`    | string  | Display name in the selector and navbar. Defaults to the object key.                                                                                                            |
| `theme`    | string  | Theme **tag** (slug) applied when this spec is opened, e.g. `dracula` or `persian-red`. Display names still resolve. Defaults to the file-level `theme` / first built-in theme. |
| `isCustom` | boolean | Marks the entry as inline (implies `rawSpec` is the source).                                                                                                                    |
| `rawSpec`  | string  | The full spec document as a string (JSON or YAML).                                                                                                                              |

The **first entry** is selected on first visit; afterwards the app remembers the last selection,
and an explicit clean route or legacy hash deep link is the source of truth.

## Mode 2 — `window.INITIAL_CONFIG` (pre-defined specs)

Identical shape to `config.json`, but injected as a JavaScript global **before** the app
script runs, e.g. in `index.html`:

```html
<script>
  window.INITIAL_CONFIG = {
    theme: 'default-slate',
    parsables: {
      'Pet Store': {url: '/specs/pet-store.json'},
    },
  };
</script>
<script type="module" src="/src/main.tsx"></script>
```

Useful when you don't control the server routes (no `/config.json` available), or when the
configuration must be baked into the HTML itself.

**Precedence:** if `window.INITIAL_CONFIG` exists it is used and `/config.json` is never
fetched. Otherwise the app fetches `/config.json`; a 404 means local mode.

> By default, pre-defined deployments remain locked to their configured specifications. Local
> file loading is enabled only when the configuration explicitly opts into hybrid mode.

## Hybrid option — configured and local specs

Set `"allowLocalSpecifications": true` in either configuration source to keep the configured
spec selector while also allowing visitors to open local JSON/YAML files. Hybrid mode includes
recent local-file history, preserves deep links to those files, and always keeps the configured
specifications available for switching back. Files remain entirely in the visitor's browser.

The **[live GitHub Pages demo](https://omidgfx.github.io/opendoc-ui/demo/)** uses this mode: it opens the bundled Complete Capability Showcase specification immediately, but visitors can still try OpenDoc UI with their own specifications.

## Mode 3 — No configuration (local mode)

Run the app with **no** `window.INITIAL_CONFIG` and **no** `public/config.json` (a 404 on
`/config.json`). The app boots straight into the empty state and offers:

- an **Open** button in the navbar (where the spec selector would normally sit),
- a dedicated **"No specification loaded"** page with _Open specification_ and
  _About OpenDoc UI_ actions,
- the **spec selector modal** (opened from the navbar / mobile sidebar) containing a
  folder button for picking files, a drop-zone-style open card and the **recent history**,
- file support for `.json`, `.yaml` and `.yml` (Swagger 2.x and OpenAPI 3.x), including selecting
  multiple related files for local external `$ref` resolution.

Files are read with the browser's File API — **nothing is uploaded anywhere**. Everything
stays in your browser. Each opened spec is recorded in the history (see
[Local history](data-and-state.md#local-history)) so you can reopen it after a reload.
---

← [Back to README](../README.md)
