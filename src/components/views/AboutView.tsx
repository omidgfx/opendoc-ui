import {motion} from 'motion/react';
import Logo from '../../logo.svg?react';
import pkg from '../../../package.json';

interface AboutViewProps {
    specTitle?: string;
    parsableKey?: string;
}

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
    {
        icon: 'ph-fill ph-book-open-text',
        title: 'Documentation Browser',
        desc: 'Navigate tags, operations, parameters, request bodies and responses with live schema inspection.'
    },
    {
        icon: 'ph-fill ph-flask',
        title: 'Built-in API Runner',
        desc: 'Execute requests directly from the browser with cookie, bearer, API-key and basic auth support.'
    },
    {
        icon: 'ph-fill ph-code',
        title: 'Code & TypeScript Generator',
        desc: 'Export ready-to-run fetch / axios / Angular snippets and TypeScript models generated from your schemas.'
    },
    {
        icon: 'ph-fill ph-paint-bucket',
        title: 'Themes & Dark Mode',
        desc: '15+ hand-picked editor themes with per-spec preferences and instant light/dark toggling.'
    },
    {
        icon: 'ph-fill ph-magnifying-glass',
        title: 'Global Search',
        desc: 'Cmd/Ctrl+K to search paths, summaries, tags, and schema definitions with advanced filters.'
    },
    {
        icon: 'ph-fill ph-plugs-connected',
        title: 'Share Deep Links',
        desc: 'Every endpoint, tab, response and schema modal lives in the URL hash for perfect link sharing.'
    },
];

/* ------------------------------------------------------------------ *
 *  Keyboard shortcuts — grouped by the surface they apply to.
 *  `note` explains conditions and edge cases.
 * ------------------------------------------------------------------ */
type Shortcut = { k: string; d: string; note?: string };
type ShortcutGroup = { group: string; icon: string; items: Shortcut[] };

const SHORTCUT_GROUPS: ShortcutGroup[] = [
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

/* ------------------------------------------------------------------ *
 *  Mouse & pointer interactions
 * ------------------------------------------------------------------ */
type MouseRow = { icon: string; act: string; where: string; desc: string };

const MOUSE_ACTIONS: MouseRow[] = [
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

/* ------------------------------------------------------------------ *
 *  Preview-tab lifecycle rules
 * ------------------------------------------------------------------ */
const PREVIEW_RULES: Array<{ icon: string; title: string; desc: string }> = [
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

const stagger = {visible: {transition: {staggerChildren: 0.06}}};
const fadeUp = {
    hidden: {opacity: 0, y: 12},
    visible: {opacity: 1, y: 0, transition: {duration: 0.4, ease: 'easeOut' as const}},
};

// Animations ~25% faster than before
const float1 = {
    initial: {x: 0, y: 0},
    animate: {
        x: [0, 50, -25, 35, 0],
        y: [0, -35, 25, -15, 0],
        transition: {duration: 14, repeat: Infinity, ease: 'easeInOut' as const},
    },
};
const float2 = {
    initial: {x: 0, y: 0},
    animate: {
        x: [0, -60, 35, -25, 0],
        y: [0, 45, -35, 25, 0],
        transition: {duration: 17, repeat: Infinity, ease: 'easeInOut' as const},
    },
};
const float3 = {
    initial: {x: 0, y: 0},
    animate: {
        x: [0, 35, -45, 25, 0],
        y: [0, -25, 35, -35, 0],
        transition: {duration: 20, repeat: Infinity, ease: 'easeInOut' as const},
    },
};
const float4 = {
    initial: {x: 0, y: 0},
    animate: {
        x: [0, -30, 50, -20, 0],
        y: [0, 30, -40, 15, 0],
        transition: {duration: 15, repeat: Infinity, ease: 'easeInOut' as const},
    },
};
const float5 = {
    initial: {x: 0, y: 0},
    animate: {
        x: [0, 25, -30, 40, 0],
        y: [0, -40, 20, -25, 0],
        transition: {duration: 19, repeat: Infinity, ease: 'easeInOut' as const},
    },
};
const float6 = {
    initial: {x: 0, y: 0},
    animate: {
        x: [0, -40, 20, -50, 0],
        y: [0, 20, -30, 35, 0],
        transition: {duration: 22, repeat: Infinity, ease: 'easeInOut' as const},
    },
};

const MIT_LICENSE = `MIT License

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

export default function AboutView({specTitle, parsableKey}: AboutViewProps) {
    return (
        <div className="flex-1 h-full overflow-y-auto scrollbar-thin relative">
            {/* Animated blurred background blobs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <motion.div
                    initial="initial" animate="animate" variants={float1}
                    className="absolute -top-20 -left-20 w-[380px] h-[380px] rounded-full blur-3xl opacity-25"
                    style={{background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)'}}
                />
                <motion.div
                    initial="initial" animate="animate" variants={float2}
                    className="absolute top-1/3 -right-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-20"
                    style={{background: 'radial-gradient(circle, var(--accent, #ec4899) 0%, transparent 70%)'}}
                />
                <motion.div
                    initial="initial" animate="animate" variants={float3}
                    className="absolute bottom-0 left-1/4 w-[320px] h-[320px] rounded-full blur-3xl opacity-15"
                    style={{background: 'radial-gradient(circle, var(--method-get, #10b981) 0%, transparent 70%)'}}
                />
                <motion.div
                    initial="initial" animate="animate" variants={float4}
                    className="absolute top-1/2 -left-10 w-[280px] h-[280px] rounded-full blur-3xl opacity-15"
                    style={{background: 'radial-gradient(circle, var(--method-post, #3b82f6) 0%, transparent 70%)'}}
                />
                <motion.div
                    initial="initial" animate="animate" variants={float5}
                    className="absolute top-10 right-1/4 w-[260px] h-[260px] rounded-full blur-3xl opacity-12"
                    style={{background: 'radial-gradient(circle, var(--method-put, #f59e0b) 0%, transparent 70%)'}}
                />
                <motion.div
                    initial="initial" animate="animate" variants={float6}
                    className="absolute bottom-10 -right-10 w-[340px] h-[340px] rounded-full blur-3xl opacity-12"
                    style={{background: 'radial-gradient(circle, var(--method-delete, #ef4444) 0%, transparent 70%)'}}
                />
            </div>

            <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-12 space-y-8 sm:space-y-10 relative z-10"
            >
                <motion.section variants={fadeUp} className="flex flex-col items-center gap-4 sm:gap-6">
                    <motion.div
                        initial={{scale: 0.92, opacity: 0}}
                        animate={{scale: 1, opacity: 1}}
                        transition={{duration: 0.6, ease: 'easeOut'}}
                        className="w-full mx-auto flex items-center justify-center"
                    >
                        <div className="flex flex-col gap-2 md:gap-3 text-center">
                            <div className={'text-3xl md:text-6xl font-black font-sans'}>
                                OpenDoc UI
                            </div>
                            <div className={'w-full mx-auto h-1 rounded-full bg-linear-210 from-[var(--primary)] to-[var(--method-get)]'}></div>
                            <div className={'text-[11px] font-black opacity-40 tracking-widest uppercase'}>OpenAPI Documentation Interface</div>
                        </div>
                    </motion.div>
                    <div className="text-center max-w-2xl">
                        <motion.p variants={fadeUp}
                                  className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)] mb-2">About
                        </motion.p>
                        <motion.h1 variants={fadeUp}
                                   className="text-xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-heading)]">
                            A clean, fast OpenAPI explorer
                        </motion.h1>
                        <motion.p variants={fadeUp}
                                  className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
                            Browse, read, test and share OpenAPI / Swagger specifications in a modern
                            interface — zero build required, everything runs in your browser.
                        </motion.p>
                        <motion.div variants={fadeUp}
                                    className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono">
                            <span
                                className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">version {pkg.version}</span>
                            {specTitle && (
                                <span
                                    className="px-2 py-0.5 rounded border border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)] truncate max-w-full">{specTitle}</span>
                            )}
                        </motion.div>
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">Why
                        OpenDoc UI?</h2>
                    <div
                        className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-3">
                        <p>
                            Most OpenAPI renderers either feel clunky, look dated, or force you into a
                            heavy server-side setup. OpenDoc UI is a single-page React application that
                            renders any valid OpenAPI 3.x (or Swagger 2.x) descriptor you throw at it
                            — whether that descriptor comes from a bundled config file, a remote URL
                            or a URL you paste in. Switch between multiple APIs in two clicks.
                        </p>
                        <p>
                            Every panel is built for day-to-day engineering work: sticky navigation
                            grouped by tag, method badges with colour-coded semantics, one-click copy
                            for every path, schema references you can drill into modally without losing
                            your place, and a full API runner that builds real HTTP requests from
                            your browser so you can probe an endpoint in seconds.
                        </p>
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">What
                        you can do</h2>
                    <motion.div variants={stagger} initial="hidden" whileInView="visible"
                                viewport={{once: true, amount: 0.2}}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FEATURES.map((f) => (
                            <motion.div key={f.title} variants={fadeUp}
                                        whileHover={{y: -2}}
                                        transition={{duration: 0.2}}
                                        className="rounded-xl border p-3 sm:p-4 bg-[var(--surface)]/70 border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors backdrop-blur-sm">
                                <div className="flex items-center gap-3 mb-1.5">
                                    <motion.span
                                        initial={{scale: 0.8}} whileInView={{scale: 1}} viewport={{once: true}}
                                        className="inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                                        <i className={`${f.icon} text-lg`}></i>
                                    </motion.span>
                                    <h3 className="text-xs sm:text-sm font-bold text-[var(--text-heading)] truncate">{f.title}</h3>
                                </div>
                                <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)] pl-11">{f.desc}</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">How
                        it works</h2>
                    <div
                        className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-3">
                        <p>
                            When you load a specification, OpenDoc UI fetches the descriptor (JSON or YAML),
                            normalises it to OpenAPI 3, and builds an in-memory model of every path, operation,
                            parameter, schema, security scheme and server. The UI then renders three first-class
                            surfaces — a documentation tab with human-readable Markdown and schema tables,
                            an API runner that composes real <code className="font-mono">fetch</code> requests,
                            and a schema explorer that lets you browse every model in <code
                            className="font-mono">components/schemas</code>.
                        </p>
                        <p>
                            Because rendering happens entirely in the browser you can host OpenDoc UI on any
                            static host (GitHub Pages, Netlify, S3, an internal nginx box) and point it at any
                            CORS-enabled API. Authentication is stored in memory only — tokens never leave
                            your machine unless you explicitly send a request.
                        </p>
                        <p>
                            Theme preferences, collapsed tag folders, sidebar width and the last-selected
                            endpoint live in <code className="font-mono">localStorage</code>, so the UI returns
                            to exactly how you left it on your next visit.
                        </p>
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">Keyboard
                        Shortcuts</h2>
                    <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                        Every shortcut below works on both Windows/Linux (<kbd className="font-mono">Ctrl</kbd>) and
                        macOS (<kbd className="font-mono">⌘</kbd>). Shortcuts that could interfere with typing are
                        automatically suppressed while a text field has focus.
                    </p>
                    <div className="space-y-3">
                        {SHORTCUT_GROUPS.map((g) => (
                            <motion.div key={g.group} variants={fadeUp}
                                        className="rounded-xl border overflow-hidden bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm">
                                <div
                                    className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--background)]/40">
                                    <i className={`${g.icon} text-[13px] text-[var(--primary)]`}></i>
                                    <h3 className="text-[11px] font-black uppercase tracking-wider text-[var(--text-heading)]">{g.group}</h3>
                                </div>
                                <div className="divide-y divide-[var(--border)]">
                                    {g.items.map((r) => (
                                        <div key={g.group + r.k + r.d} className="px-4 py-2.5 sm:py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <span
                                                    className="text-xs text-[var(--text)] font-medium">{r.d}</span>
                                                <kbd className="px-2 py-0.5 rounded font-mono text-[10px] bg-[var(--background)] border border-[var(--border)] text-[var(--text-heading)] shrink-0 whitespace-nowrap">{r.k}</kbd>
                                            </div>
                                            {r.note && (
                                                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] pe-2">{r.note}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">Mouse
                        &amp; Pointer</h2>
                    <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                        Pointer behaviour follows the conventions you already know from code editors and browsers:
                        a single click previews, a double or middle click commits, and a right click reveals the
                        bulk actions.
                    </p>
                    <div
                        className="rounded-xl border overflow-hidden bg-[var(--surface)]/70 border-[var(--border)] divide-y divide-[var(--border)] backdrop-blur-sm">
                        {MOUSE_ACTIONS.map((m) => (
                            <motion.div key={m.act + m.where + m.desc} variants={fadeUp}
                                        className="px-4 py-3 flex items-start gap-3">
                                <span
                                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] mt-0.5">
                                    <i className={`${m.icon} text-[14px]`}></i>
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                        <span
                                            className="text-xs font-bold text-[var(--text-heading)]">{m.act}</span>
                                        <span
                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text-muted)]">{m.where}</span>
                                    </div>
                                    <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">{m.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">Preview
                        Tabs Explained</h2>
                    <div
                        className="rounded-xl border p-4 sm:p-5 mb-3 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)]">
                        <p>
                            Tabs come in two flavours. A <span className="font-bold text-[var(--text-heading)]">preview
                            tab</span> — shown in <em>italics</em> — is a scratch slot for an endpoint you are just
                            skimming, and it gets reused the moment you look at something else. A <span
                            className="font-bold text-[var(--text-heading)]">permanent tab</span> stays until you
                            close it yourself. This lets you explore a large specification freely without drowning
                            in tabs, while still pinning the handful of endpoints you are actually working on.
                        </p>
                    </div>
                    <motion.div variants={stagger} initial="hidden" whileInView="visible"
                                viewport={{once: true, amount: 0.15}}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {PREVIEW_RULES.map((r) => (
                            <motion.div key={r.title} variants={fadeUp}
                                        whileHover={{y: -2}}
                                        transition={{duration: 0.2}}
                                        className="rounded-xl border p-3 sm:p-4 bg-[var(--surface)]/70 border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors backdrop-blur-sm">
                                <div className="flex items-center gap-3 mb-1.5">
                                    <span
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                                        <i className={`${r.icon} text-base`}></i>
                                    </span>
                                    <h3 className="text-xs sm:text-sm font-bold text-[var(--text-heading)]">{r.title}</h3>
                                </div>
                                <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)] pl-11">{r.desc}</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">Reading
                        the endpoint tree</h2>
                    <div
                        className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-3">
                        <p>
                            The sidebar groups every operation into folders derived from its tags — a tag containing
                            slashes (<code className="font-mono">Billing/Invoices</code>) becomes a nested folder, so
                            you can mirror your API’s real structure just by naming tags carefully.
                        </p>
                        <p>
                            When an endpoint is selected, the tree highlights the connector lines leading to it,
                            tracing a single path from the outermost folder down to that endpoint. Branches you are
                            not inside stay neutral, so the highlight tells you exactly where you are even when
                            hundreds of operations are expanded. The <code className="font-mono">+</code> / <code
                            className="font-mono">−</code> box of each folder on that path is tinted to match.
                        </p>
                        <p>
                            Searching or applying filters narrows the tree in place: folders whose contents no longer
                            match disappear, and everything that remains is auto-expanded so results are visible
                            without any clicking. Clearing the search restores your previously expanded folders.
                        </p>
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">About
                        the loaded specification</h2>
                    <div
                        className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-2 backdrop-blur-sm">
                        <p><span
                            className="font-bold text-[var(--text-heading)]">Title:</span> {specTitle || 'No specification loaded'}
                        </p>
                        <p>
                            <span className="font-bold text-[var(--text-heading)]">Config key:</span>{' '}
                            <code
                                className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)]">{parsableKey || '—'}</code>
                        </p>
                        <p className="text-[var(--text-muted)]">
                            OpenDoc UI parses Swagger 2.x and OpenAPI 3.x descriptors (JSON or YAML),
                            normalizes them to OpenAPI 3, and renders a fully client-side experience.
                            Requests made through the API Runner are sent directly from your browser
                            using the <code className="font-mono">fetch</code> API.
                        </p>
                    </div>
                </motion.section>

                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">License</h2>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] mb-3 leading-relaxed">
                        OpenDoc UI is open-source software released under the MIT License. You are free to
                        use, copy, modify, merge, publish, distribute, sublicense and/or sell copies of the
                        software, subject to the terms below.
                    </p>
                    <pre
                        className="rounded-xl border p-4 bg-[var(--background)] border-[var(--border)] text-[11px] leading-relaxed font-mono whitespace-pre overflow-x-auto text-[var(--text)] scrollbar-thin">
{MIT_LICENSE}
                    </pre>
                </motion.section>

                <motion.footer variants={fadeUp}
                               className="pt-4 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
                    <span>Built with React, Vite, Tailwind, Monaco Editor, and Phosphor Icons.</span>
                    <span className="flex items-center gap-2">
                        <span>By <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                                    className="font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors">Pejman
                            Chatrrouz</a></span>
                        <span className="font-mono">OpenDoc UI · {pkg.version}</span>
                    </span>
                </motion.footer>
            </motion.div>
        </div>
    );
}