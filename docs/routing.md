← [Back to README](../README.md) · [Docs index](index.md)

---

# Routing, deep links & keyboard shortcuts

## The "no specification" state

Until a spec is loaded the app shows a purpose-built **block page** instead of the normal
chrome:

- no sidebar, no search, no theme controls, no auth/download buttons — the navbar is
  reduced to the logo and the spec selector / open button,
- the page itself offers exactly two useful actions: **Open specification** (local mode)
  and **About OpenDoc UI**,
- in a pre-defined deployment with zero available specs it explains that the deployment
  has no configured specifications.

Everything else (tabs, search, runner, themes, settings) is simply unreachable until a spec
is loaded.

---

## URL routing & deep links

OpenDoc uses hash-based deep links — everything after the `#` is handled by the application and
never reaches the server, so the same URL works on any static host (GitHub Pages, nginx, S3, or even
`file://`) without rewrite rules, and refreshing or sharing a link always restores the exact view.
Legacy path-based `/parsable/...` links are still parsed for backward compatibility. Main shapes:

| Route                                           | Meaning                                    |
| ----------------------------------------------- | ------------------------------------------ |
| `#/`                                            | Home (no spec)                             |
| `#/parsable/<key>`                              | Home of the configured/local specification |
| `#/parsable/<key>/api/<endpointId>`             | A specific endpoint in a permanent tab     |
| `#/parsable/<key>/schema-explorer?schemas=name` | Schema Explorer with a schema open         |
| `#/parsable/<key>/notes`                        | Local endpoint notes and todos             |
| `#/parsable/<key>/compatibility`                | Endpoint Runner compatibility matrix       |
| `#/parsable/<key>/about`                        | About page for that specification          |
| `#/parsable/<key>/assistant`                    | OpenDoc UI assistant                       |
| `/oauth/callback`                               | Native OAuth authorization callback        |

Query parameters inside the hash include `?tab=examine|doc`, `?schemas=a,b`, and `?search=...`;
response deep links append `#response-<code>` after the route. Endpoint links are authoritative:
loading or refreshing one always opens that endpoint as a permanent tab. User navigation pushes
History API entries, while search/filter edits update the current entry; browser Back and Forward
restore views, endpoints, tabs, response links, schema stacks, and configured/local/remote
specifications without rewriting the destination URL.

In local mode the key is `local:<fileName>`, and the route maps it back into local history on reload
or browser history traversal.

---

## Keyboard shortcuts

| Shortcut                            | Action                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Ctrl / ⌘ + K`                      | Focus global search                                                                                                 |
| `Esc`                               | Close the top-most modal / overlay                                                                                  |
| `Alt + ←` / `Alt + →`               | Previous / next endpoint tab                                                                                        |
| `Ctrl + \`` / `Ctrl + Shift + \``   | Open the tab switcher and move to the next / previous tab (Windows Alt+Tab style; release to switch, Esc to cancel) |
| `Ctrl+Enter` (in runner)            | Send the request from the active pane                                                                               |
| `Ctrl+↑` / `Ctrl+↓` (in split view) | Move focus between docs and runner panes                                                                            |

The About page lists the full set, including mouse interactions (middle-click a sidebar
endpoint to pin a permanent tab, double-click to keep the preview tab, etc.).
---

← [Back to README](../README.md)
