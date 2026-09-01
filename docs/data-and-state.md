← [Back to README](../README.md) · [Docs index](index.md)

---

# Spec loading, local history & persistence

## Spec loading, caching and the refresh button

When a configured spec has a `url`, the app uses the versioned `opendoc_spec_cache_v2:` /
IndexedDB cache. A fresh entry is used for five minutes; after that the app revalidates with
`If-None-Match` and/or `If-Modified-Since` when the server supplied those headers. A failed
revalidation may use the stale entry as an offline fallback, but stale data is never treated as
fresh indefinitely. Validated cache indexes and large raw documents are stored in IndexedDB;
localStorage is used only as an emergency fallback when IndexedDB is unavailable or a write fails.

The **refresh button** (circular arrows, next to the spec selector in the navbar and in the
mobile sidebar toolbar) drops the cache and reloads: it clears every cached spec and
re-fetches the current one from the network. In local mode the same button re-reads the
opened file from disk (when the file handle is still available) or re-parses the stored
text. The icon spins while a refresh is in flight.

---

## Local history

In **local mode**, every spec opened from disk is saved to browser persistent storage
(`opendoc_local_history`), most recent first. IndexedDB is the primary store; localStorage is used
only as an emergency fallback when IndexedDB is unavailable or a write fails. The spec selector modal lists the history with the
spec title, file name and relative open time; entries can be re-opened with one click or removed
individually, and the whole history can be cleared from the modal footer.

History specifics:

- limited to the **12 most recent** entries,
- entries whose raw text exceeds ~2 MB are stored with metadata only and re-opened from
  the original file if you still have it,
- deep links work across reloads: the URL hash references the history entry, so opening a
  shared link restores the right spec from history automatically,
- history is strictly local to the browser — clearing site data wipes it.

When URL loading is compiled in, `opendoc_remote_spec_history` separately stores the 12 most recent
remote sources. Their raw documents stay in the normal bounded cache rather than being duplicated in
history. Removing a URL-history entry removes its cache record, and clear-all uses a confirmation
before deleting every remote-history/cache pair.

## Browser persistence

All persistence goes through `src/utils/storage.ts` — an IndexedDB-first synchronous facade that
hydrates before React starts. It never throws, validates every JSON read, self-repairs corrupt
entries, and falls back to localStorage only when IndexedDB is unavailable or a write fails.
Large specification cache records and AI conversations also have dedicated IndexedDB records.
Older localStorage data is migrated once and removed after IndexedDB confirms the write.

State is split into three namespaces:

| Namespace                                                                 | Contains                                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opendoc:ui:<name>`                                                       | Global UI state — sidebar width & collapsed state, collapsed tag folders, last selected spec, split-view width, non-secret AI settings/profiles, and cached model catalogs |
| `opendoc:spec:<encoded spec key>:<encoded name>`                          | Per-spec state — theme name, theme mode, tab mode, open tabs, per-endpoint runner inputs, docs scroll position, and bounded conversation index                             |
| `opendoc_spec_cache_v2:<url>` / IndexedDB / local and remote history keys | Validated cache index, large spec cache, local-file history, and recent remote URLs                                                                                        |

Per-spec data is pruned automatically when a spec disappears from the configuration, and
legacy v0.1.0 keys are migrated into the namespaces once on first run. Known keys:

| Key                                                         | Purpose                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `opendoc:ui:sidebar_width` / `opendoc:ui:sidebar_collapsed` | Desktop sidebar state (global — not per spec)                                                   |
| `opendoc:ui:collapsed_tags`                                 | Collapsed tag folders in the sidebar navigation                                                 |
| `opendoc:ui:last_parsable`                                  | Last selected spec key                                                                          |
| `opendoc:ui:endpoint_split_width`                           | Split-view pane width                                                                           |
| `opendoc:ui:ai_settings` / `:ai_profiles`                   | Current AI settings and global provider profiles (secrets omitted unless explicitly remembered) |
| `opendoc:ui:ai_active_profile` / `:ai_model_catalogs`       | Selected profile and refreshed model catalogs                                                   |
| `opendoc:spec:<key>:theme` / `:theme_mode`                  | Theme name & mode per spec                                                                      |
| `opendoc:spec:<key>:tab_mode`                               | Last used tab mode (docs / examine / split)                                                     |
| `opendoc:spec:<key>:tabs`                                   | Open tabs (endpoints + view tabs) with active tab                                               |
| `opendoc:spec:<key>:inputs:<method>:<path>`                 | Saved runner inputs per endpoint                                                                |
| `opendoc:spec:<key>:response_history:<method>:<path>`       | Last 10 Runner outcomes per endpoint                                                            |
| `opendoc:spec:<key>:endpoint_notes`                         | Local Markdown notes and todos grouped by endpoint                                              |
| `opendoc:spec:<key>:hidden_endpoints`                       | Endpoint keys moved into the muted Hidden endpoints folder                                      |
| `opendoc:spec:<key>:scroll:<method>:<path>`                 | Docs scroll position per endpoint                                                               |
| `opendoc:spec:<key>:ai_conversations`                       | Saved AI conversations for this specification                                                   |
| `opendoc_spec_cache_v2:<url>`                               | Validated generic cache record; large raw copies use dedicated IndexedDB records                |
| `opendoc_local_history`                                     | Recently opened local files                                                                     |
| `opendoc_remote_spec_history`                               | Last 12 URL-loaded specifications; complete URLs stay in this browser                           |
| `sessionStorage:opendoc_ui_session_secrets`                 | Session-only AI keys/tokens when remember-secrets is off                                        |

---

← [Back to README](../README.md)
