← [Back to README](../README.md) · [Docs index](index.md)

---

# Local endpoint notes and hidden endpoints

OpenDoc can keep private notes beside individual operations without changing the OpenAPI document.
Notes are scoped to the selected specification, stored in IndexedDB-backed local persistence, and
never uploaded. The **Local Notes** sidebar page groups notes by endpoint and supports search plus
simple-note/todo filters.

- Notes render Markdown and use one of **14 predefined translucent tones**, including white and black,
  from a compact inline selector. Tone opacity blends with the active light or dark theme instead of
  forcing pale cards.
- A note has a required title (128 characters), optional Markdown details (4,096 characters), and an
  endpoint maximum of 100 notes. Soft progress meters appear only after typing, with countdowns near
  each limit.
- A segmented control switches between a simple reference and a todo with a persistent done state.
- Todos can offer to hide their endpoint when all endpoint todos are done. Completing the final todo
  opens a confirmation with a default-checked hide option that can be unchecked.
- Endpoint context menus can create notes, open the endpoint note list, hide, or unhide the endpoint.
  Only the specification-wide **New note** action shows the searchable, always-expanded endpoint tree;
  its independently scrolling sidebar fills the create modal. Endpoint-specific actions keep their
  endpoint fixed. The tree follows sidebar sorting, tag, route, compact-method, count, protection,
  deprecation, and hidden-endpoint preferences.
- Endpoint headers use a fixed-width note counter, and noted endpoints receive a note marker in the
  sidebar before deprecation/security indicators. In a single documentation or Runner view, the
  counter toggles a resizable right notes sidebar; expanded-note state and sidebar width persist in
  IndexedDB. In Split View, the same action retains the endpoint-notes modal.
- Hidden endpoints move into one muted **Hidden endpoints** folder at the end of the tree. Use their
  context menu to restore one, or **Unhide all endpoints** from navigation settings.
- Endpoint note lists and the Local Notes page use custom confirmation dialogs for individual and
  bulk deletion. Opening a note uses the tone-colored `NoteViewerModal`, with header edit/delete controls,
  todo actions, and a centered empty-note state when no Markdown body exists.
- **Export / Import notes.** The Local Notes page can download every note and todo for the selected
  specification as a JSON file (`opendoc-endpoint-notes` format, e.g. `opendoc-notes-<title>.json`) and
  restore notes from such a file. Export detects notes whose endpoint no longer exists in the loaded
  specification, asks before writing them, and records their ids as `orphanedNoteIds` so nothing is
  silently lost. Import validates the file, classifies notes against the current specification
  (matching, orphaned, or already present), warns clearly when the file was exported from a different
  specification, and lets you import everything or only the matching notes; imported notes respect
  per-endpoint capacity limits and id deduplication.
- **Trash.** Deleting a note moves it to the spec-scoped trash instead of removing it forever. The
  Local Notes toolbar shows a **Trash** button that opens a modal with restore, permanent delete, and
  empty-trash actions; restore and permanent delete each ask for confirmation. **Move all to trash**
  only moves active notes — orphaned notes are never touched by bulk deletion.
- **Orphaned notes.** Notes whose endpoint disappears from the loaded specification (removed, renamed,
  or imported from another spec) are kept in a dedicated **Orphaned** list instead of mixing into the
  page. From the Orphaned modal each note can be re-assigned to another endpoint (compact searchable
  picker) or deleted permanently with confirmation, so nothing is lost when an endpoint is renamed.
  Restoring a trashed note whose endpoint is missing returns it to the Orphaned list.

Resetting one specification preserves its local notes by default. The reset confirmation includes an
unchecked **Clear local notes too** option for intentionally deleting them. Reset All still clears all
per-spec data, including notes.
---

← [Back to README](../README.md)
