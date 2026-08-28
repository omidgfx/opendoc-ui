export const TOC_SECTIONS: Array<{
    id: string;
    label: string;
    icon: string;
}> = [
    {id: 'why', label: 'Why', icon: 'ph ph-lightbulb'},
    {id: 'what', label: 'What it does', icon: 'ph ph-cube'},
    {id: 'how', label: 'How it works', icon: 'ph ph-gear-six'},
    {id: 'ai', label: 'AI assistant', icon: 'ph ph-sparkle'},
    {id: 'keyboard', label: 'Keyboard', icon: 'ph ph-keyboard'},
    {id: 'mouse', label: 'Mouse', icon: 'ph ph-cursor-click'},
    {id: 'preview', label: 'Preview', icon: 'ph ph-eye'},
    {id: 'reading', label: 'Reading', icon: 'ph ph-book-open'},
    {id: 'theme-system', label: 'Theme system', icon: 'ph ph-paint-brush'},
    {id: 'license', label: 'License', icon: 'ph ph-scroll'},
];
export const FEATURES: Array<{
    icon: string;
    title: string;
    desc: string;
    /** Soft badge — e.g. Experimental for auto-repair. */
    badge?: string;
}> = [
    {
        icon: 'ph-fill ph-book-open-text',
        title: 'Documentation Browser',
        desc: 'Navigate tags, operations, parameters, request bodies and responses with live schema inspection.',
    },
    {
        icon: 'ph-fill ph-flask',
        title: 'Built-in API Runner',
        desc: 'Execute requests directly from the browser with cookie, bearer, API-key and basic auth support.',
    },
    {
        icon: 'ph-fill ph-tree-structure',
        title: 'Unified Schema Viewer',
        desc: 'One schema surface for request bodies, responses, and the schema modal — generated examples, field menus, and combinator rails that stay in sync.',
    },
    {
        icon: 'ph-fill ph-git-branch',
        title: 'Field combinators',
        desc: 'oneOf, anyOf, allOf, and not at body and field level: exclusive picks, multi-select merge, composition focus with dimming, and inspection-only negation.',
    },
    {
        icon: 'ph-fill ph-magnifying-glass-plus',
        title: 'OAS 3.2 QUERY',
        desc: 'First-class HTTP QUERY (RFC 10008) alongside GET/POST and additional operations, with request-body documentation and Runner support.',
    },
    {
        icon: 'ph-fill ph-wrench',
        title: 'YAML auto-repair',
        desc: 'When a generator emits flow-style oneOf/anyOf/allOf without sequence brackets, OpenDoc quietly rewrites the text so the document can still load.',
        badge: 'Experimental',
    },
    {
        icon: 'ph-fill ph-code',
        title: 'Code & TypeScript Generator',
        desc: 'Export ready-to-run fetch / axios / Angular snippets and TypeScript models generated from your schemas.',
    },
    {
        icon: 'ph-fill ph-sparkle',
        title: 'OpenDoc UI Assistant',
        desc: 'Ask grounded API questions with citations, endpoint context, model profiles, Markdown export, and safe Runner preparation.',
    },
    {
        icon: 'ph-fill ph-paint-bucket',
        title: 'Themes & Dark Mode',
        desc: '15+ hand-picked editor themes with per-spec preferences and instant light/dark toggling.',
    },
    {
        icon: 'ph-fill ph-magnifying-glass',
        title: 'Global Search',
        desc: 'Cmd/Ctrl+K to search paths, summaries, tags, and schema definitions with advanced filters.',
    },
    {
        icon: 'ph-fill ph-plugs-connected',
        title: 'Share Deep Links',
        desc: 'Every endpoint, tab, response and schema modal lives in the URL hash for perfect link sharing.',
    },
    {
        icon: 'ph-fill ph-note',
        title: 'Local Notes & Todos',
        desc: 'Private per-endpoint Markdown notes and todos with fourteen tones and hide-on-complete workflows, plus JSON export/import that detects orphaned notes.',
    },
];
type Shortcut = {
    k: string;
    d: string;
    note?: string;
};
type ShortcutGroup = {
    group: string;
    icon: string;
    items: Shortcut[];
};
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        group: 'Global',
        icon: 'ph-fill ph-globe-hemisphere-west',
        items: [
            {
                k: 'Ctrl / ⌘ + K',
                d: 'Focus the global search field',
                note: 'Ignored while you are already typing in an input or textarea, so it never steals focus mid-edit. Inside the Schema Explorer the same combo focuses that page’s own schema filter instead.',
            },
            {
                k: 'Esc',
                d: 'Close the top-most modal',
                note: 'Modals are a stack. If you have drilled into nested schemas, Esc pops one level at a time; pressing it on the last remaining level closes the stack completely. Help, pattern-tester and share dialogs always consume Esc first.',
            },
        ],
    },
    {
        group: 'Endpoint tabs',
        icon: 'ph-fill ph-browsers',
        items: [
            {
                k: 'Alt + ←',
                d: 'Switch to the previous tab',
                note: 'Wraps around from the first tab to the last. Disabled while any modal is open, and when only one tab exists.',
            },
            {
                k: 'Alt + →',
                d: 'Switch to the next tab',
                note: 'Wraps around from the last tab to the first. Disabled while any modal is open, and when only one tab exists.',
            },
            {
                k: 'Ctrl + `',
                d: 'Open the tab switcher and move to the next tab',
                note: 'Windows Alt+Tab style: keep Ctrl held and press ` again to keep cycling; release Ctrl to switch, or Esc to cancel back to the previous tab. Ctrl+Tab also works where the browser allows it (Chrome/Edge reserve it for their own tab strip).',
            },
            {
                k: 'Ctrl + Shift + `',
                d: 'Open the tab switcher and move to the previous tab',
                note: 'The backward twin of Ctrl+` — cycles in reverse, wraps around, and commits on release.',
            },
        ],
    },
    {
        group: 'Documentation tab',
        icon: 'ph-fill ph-book-open-text',
        items: [
            {
                k: 'Ctrl / ⌘ + ↓',
                d: 'Collapse current response, jump to the next one',
                note: 'Cycles through the operation’s response codes and wraps at the end. Only active when the documentation pane is the focused pane, and ignored while typing in a textarea or rich-text field.',
            },
            {
                k: 'Ctrl / ⌘ + ↑',
                d: 'Collapse current response, jump to the previous one',
                note: 'Same as above in the opposite direction, wrapping from the first response back to the last.',
            },
            {
                k: 'Ctrl / ⌘ + Shift + ↓ / ↑',
                d: 'Move between responses, leaving them open',
                note: 'Identical navigation, except the response you are leaving stays expanded — handy for comparing two payloads side by side.',
            },
        ],
    },
    {
        group: 'API Runner',
        icon: 'ph-fill ph-flask',
        items: [
            {
                k: 'Ctrl / ⌘ + Enter',
                d: 'Send the request',
                note: 'Works from anywhere inside the runner, including the body editor. Only active when the runner is the focused pane, and ignored while a request is already in flight.',
            },
        ],
    },
    {
        group: 'Schema modals',
        icon: 'ph-fill ph-tree-structure',
        items: [
            {
                k: 'Ctrl / ⌘ + ←',
                d: 'Go back one level in the schema breadcrumb',
                note: 'Available once you have drilled into a nested schema. The breadcrumb is driven by the URL hash, so this maps onto real browser history — the browser’s own Back button does exactly the same thing.',
            },
        ],
    },
];
type MouseRow = {
    icon: string;
    act: string;
    where: string;
    desc: string;
};
export const MOUSE_ACTIONS: MouseRow[] = [
    {
        icon: 'ph-fill ph-cursor-click',
        act: 'Single click',
        where: 'Sidebar tree · Search results',
        desc: 'Opens the endpoint in a preview tab. Because there is only ever one preview slot, clicking a second endpoint reuses the same tab rather than piling up new ones.',
    },
    {
        icon: 'ph-fill ph-cursor-click',
        act: 'Double click',
        where: 'Sidebar tree · Search results',
        desc: 'Opens the endpoint directly as a permanent tab, skipping the preview stage entirely.',
    },
    {
        icon: 'ph-fill ph-mouse-middle-click',
        act: 'Middle click',
        where: 'Sidebar tree · Search results',
        desc: 'Same as double-click — opens a permanent tab immediately. Mirrors the middle-click-to-open-in-new-tab convention from browsers and editors.',
    },
    {
        icon: 'ph-fill ph-mouse-middle-click',
        act: 'Middle click',
        where: 'A tab',
        desc: 'Closes that tab, whether it is a preview tab or a permanent one.',
    },
    {
        icon: 'ph-fill ph-cursor-click',
        act: 'Double click',
        where: 'A preview tab',
        desc: 'Promotes the preview tab to a permanent tab in place. It keeps its current position and the preview slot becomes free again.',
    },
    {
        icon: 'ph-fill ph-arrows-left-right',
        act: 'Drag & drop',
        where: 'Tab bar',
        desc: 'Reorders tabs. Dragging a preview tab also promotes it to permanent, since deliberately positioning a tab implies you want to keep it. Any preview tab that remains is always kept as the right-most tab.',
    },
    {
        icon: 'ph-fill ph-mouse-right-click',
        act: 'Right click',
        where: 'A tab',
        desc: 'Opens the tab context menu: Close All to the Left, Close All to the Right, and Close Others. Entries grey out when they would do nothing — for instance “Close All to the Left” on the first tab.',
    },
    {
        icon: 'ph-fill ph-mouse-scroll',
        act: 'Scroll wheel',
        where: 'Tab bar',
        desc: 'Vertical wheel movement is translated into horizontal scrolling, so you can reach off-screen tabs without touching a scrollbar or holding Shift.',
    },
    {
        icon: 'ph-fill ph-folder-open',
        act: 'Click',
        where: 'A folder in the tree',
        desc: 'Expands or collapses that tag folder. The open/closed state of every folder is remembered between visits.',
    },
    {
        icon: 'ph-fill ph-arrows-horizontal',
        act: 'Drag edge',
        where: 'Sidebar · Split view',
        desc: 'Drag the sidebar’s right edge to resize it between 220px and 480px. In side-by-side mode, drag the divider between the two panes to rebalance them. Both widths are remembered.',
    },
    {
        icon: 'ph-fill ph-hand-swipe-right',
        act: 'Swipe from left edge',
        where: 'Mobile & tablet',
        desc: 'Opens the navigation drawer. The gesture must start within 28px of the screen edge and travel at least 50px horizontally, so it will not fire during ordinary vertical scrolling.',
    },
];
export const PREVIEW_RULES: Array<{
    icon: string;
    title: string;
    desc: string;
}> = [
    {
        icon: 'ph-fill ph-eye',
        title: 'One preview tab at a time',
        desc: 'A preview tab is a temporary slot for something you are only glancing at. There is never more than one, and its label is shown in italics so you can tell it apart at a glance.',
    },
    {
        icon: 'ph-fill ph-arrows-clockwise',
        title: 'Previews are recycled, not stacked',
        desc: 'Single-clicking another endpoint reuses the existing preview tab instead of opening a new one. Browsing twenty endpoints in a row therefore leaves you with exactly one tab, not twenty.',
    },
    {
        icon: 'ph-fill ph-push-pin',
        title: 'Three ways to make it permanent',
        desc: 'Double-click the tab itself, drag it to a new position, or open the same endpoint again with a double-click or middle-click from the sidebar. Any of these converts the tab in place and frees the preview slot.',
    },
    {
        icon: 'ph-fill ph-arrow-line-right',
        title: 'The preview tab is always last',
        desc: 'Opening a permanent tab while a preview is open inserts the new tab before it, pushing the preview to the far right. Your pinned work stays grouped together on the left and the throwaway tab never gets buried in the middle.',
    },
    {
        icon: 'ph-fill ph-target',
        title: 'Re-opening an endpoint focuses it',
        desc: 'If an endpoint is already open in any tab, clicking it again simply activates that tab. You will never end up with the same endpoint open twice.',
    },
    {
        icon: 'ph-fill ph-floppy-disk',
        title: 'Tabs survive a reload',
        desc: 'Your open tabs, which one is active, each tab’s view mode and its preview state are all saved per specification. Reload the page and you return to the same working set — with the preview tab still parked at the end.',
    },
];
export const stagger = {visible: {transition: {staggerChildren: 0.06}}};
export const fadeUp = {
    hidden: {opacity: 0, y: 12},
    visible: {opacity: 1, y: 0, transition: {duration: 0.4, ease: 'easeOut' as const}},
};
/** Public website for the OpenDoc UI project (marketing site + manual). */
export const OPEN_DOC_WEBSITE_URL = 'https://omidgfx.github.io/opendoc-ui/';
/** Live application demo (same site, /demo/ path). */
export const OPEN_DOC_DEMO_URL = 'https://omidgfx.github.io/opendoc-ui/demo/';
/** Source repository on GitHub. */
export const OPEN_DOC_GITHUB_URL = 'https://github.com/omidgfx/opendoc-ui';

export const MIT_LICENSE = `MIT License

Copyright (c) ${new Date().getFullYear()} Pejman Chatrrouz (OpenDoc UI)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
