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
                    <div
                        className="rounded-xl border overflow-hidden bg-[var(--surface)]/70 border-[var(--border)] divide-y divide-[var(--border)] backdrop-blur-sm">
                        {[
                            {k: 'Ctrl / ⌘ + K', d: 'Focus global search'},
                            {k: 'Esc', d: 'Close open modal'},
                            {k: 'Ctrl / ⌘ + Enter', d: 'Send request in API Runner'},
                            {k: 'Swipe from left edge', d: 'Open sidebar on mobile'},
                        ].map((r) => (
                            <motion.div key={r.k} variants={fadeUp}
                                        className="flex items-center justify-between gap-4 px-4 py-2.5 sm:py-3 text-xs">
                                <span className="text-[var(--text)] truncate">{r.d}</span>
                                <kbd
                                    className="px-2 py-0.5 rounded font-mono text-[10px] bg-[var(--background)] border border-[var(--border)] text-[var(--text-heading)] shrink-0">{r.k}</kbd>
                            </motion.div>
                        ))}
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
