← [Back to README](../README.md) · [Docs index](index.md)

---

# Theme system

Themes come from `src/data/themes.ts`. Each theme has a display **name**, a stable **tag**
(`id` slug such as `dracula` or `ink-and-paper`), and full **light** / **dark** palettes.
Copy the tag from **Settings → Appearance** (or the gallery card) and paste it into
`config.json` as `"theme": "dracula"`. Display names and a few legacy aliases still resolve.
The **mode** can be:

| Mode     | Behavior                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| `system` | Follows the OS setting (`prefers-color-scheme`) live — this is the **default** |
| `light`  | Always the light palette                                                       |
| `dark`   | Always the dark palette                                                        |

The mode toggle button cycles `system → light/dark → dark/light`; the icon shows a monitor
while in system mode, and the palette updates immediately if the OS theme changes while the
app is open. The palette button in the navbar opens the theme picker, whose segmented
control offers the same `system / light / dark` modes next to the theme gallery.

Theme tag and mode are remembered **per spec** (`theme` and `theme_mode` under the
spec storage key), so switching between APIs restores each one's own look. Stored values
use the stable tag (e.g. `nord`); older display-name values still resolve.
---

← [Back to README](../README.md)
