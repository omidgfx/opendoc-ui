import {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import {motion} from 'motion/react';
import pkg from '@/package.json';
import BrandLogo from '@/src/components/brand/BrandLogo';
import {
    fadeUp,
    FEATURES,
    OPEN_DOC_GITHUB_URL,
    OPEN_DOC_WEBSITE_URL,
    MIT_LICENSE,
    MOUSE_ACTIONS,
    PREVIEW_RULES,
    SHORTCUT_GROUPS,
    stagger,
    TOC_SECTIONS,
} from '@/src/data/about';

export default function AboutView() {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const tocRailRef = useRef<HTMLDivElement | null>(null);
    const [activeSection, setActiveSection] = useState('why');
    useEffect(() => {
        const rail = tocRailRef.current;
        const el = rail?.querySelector(`[data-toc-dot="${activeSection}"]`);
        if (rail && el) {
            const target = (el as HTMLElement).offsetTop - rail.clientHeight / 2 + (el as HTMLElement).clientHeight / 2;
            rail.scrollTo({top: Math.max(0, target), behavior: 'smooth'});
        }
    }, [activeSection]);
    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return;
        const observer = new IntersectionObserver(
            entries => {
                const visible = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActiveSection(visible[0].target.id);
            },
            {root, rootMargin: '-20% 0px -60% 0px', threshold: 0},
        );
        TOC_SECTIONS.forEach(sec => {
            const el = root.querySelector(`#${sec.id}`);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);
    const scrollToSection = (id: string) => {
        const root = scrollRef.current;
        const el = root?.querySelector(`#${id}`);
        if (root && el) {
            const top =
                (el as HTMLElement).getBoundingClientRect().top -
                root.getBoundingClientRect().top +
                root.scrollTop -
                16;
            root.scrollTo({top, behavior: 'smooth'});
        }
    };
    return (
        <div className="flex-1 h-full overflow-hidden relative">
            <div ref={scrollRef} className="h-full w-full overflow-y-auto scrollbar-thin relative">
                <div className="max-w-full mx-auto px-4 sm:px-8 py-6 sm:py-12 relative z-10 lg:flex lg:items-start lg:gap-4">
                    <div className="hidden lg:flex flex-col w-36 shrink-0 relative lg:sticky lg:top-16 transition-all">
                        <div
                            ref={tocRailRef}
                            className="relative w-full overflow-y-auto scrollbar-thin py-3 max-h-[calc(100vh-6rem)]"
                        >
                            <nav className="flex flex-col items-center gap-2.5 px-2">
                                {TOC_SECTIONS.map(sec => {
                                    const active = activeSection === sec.id;
                                    return (
                                        <button
                                            key={sec.id}
                                            type="button"
                                            data-toc-dot={sec.id}
                                            onClick={() => scrollToSection(sec.id)}
                                            className={clsx(
                                                'group flex items-center text-start gap-2 w-full transition-all duration-200 cursor-pointer',
                                                active ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                                            )}
                                        >
                                            <span
                                                className={clsx(
                                                    'size-1.5 rounded-full shrink-0 border-1 transition-all duration-200',
                                                    active
                                                        ? 'bg-[var(--primary)] border-[var(--primary)]'
                                                        : 'border-[var(--text-muted)]/50 group-hover:border-[var(--text-heading)]',
                                                )}
                                            />

                                            <i
                                                className={clsx(
                                                    sec.icon + ' text-[16px] shrink-0 transition-colors duration-200',
                                                    active
                                                        ? 'text-[var(--primary)]'
                                                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-heading)]',
                                                )}
                                            ></i>
                                            <span
                                                className={clsx(
                                                    'min-w-0 flex-1 text-[10px] font-semibold leading-tight truncate transition-colors duration-200',
                                                    active
                                                        ? 'text-[var(--text-heading)]'
                                                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-heading)]',
                                                )}
                                            >
                                                {sec.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>
                    </div>

                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                        className="min-w-0 flex-1 space-y-8 sm:space-y-10"
                    >
                        <motion.section variants={fadeUp} className="flex flex-col items-center gap-4 sm:gap-6">
                            <motion.div
                                initial={{scale: 0.96, opacity: 0}}
                                animate={{scale: 1, opacity: 1}}
                                transition={{duration: 0.6, ease: 'easeOut'}}
                                className="brand-about-hero"
                            >
                                <BrandLogo
                                    type={null}
                                    logoFrame={false}
                                    logoClassName="brand-about-logo"
                                    wordmarkClassName="text-4xl sm:text-5xl md:text-6xl"
                                    className="brand-about-lockup relative z-10 max-w-full justify-center"
                                />
                                <span className="brand-about-hero-subtitle relative z-10 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] sm:text-[11px]">
                                    OpenAPI Documentation Interface
                                </span>
                            </motion.div>
                            <div className="text-center max-w-2xl">
                                <motion.p
                                    variants={fadeUp}
                                    className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)] mb-2"
                                >
                                    About
                                </motion.p>
                                <motion.h1
                                    variants={fadeUp}
                                    className="text-xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-heading)]"
                                >
                                    A clean, fast OpenAPI explorer
                                </motion.h1>
                                <motion.p
                                    variants={fadeUp}
                                    className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed"
                                >
                                    Browse, read, test and share OpenAPI / Swagger specifications in a modern interface
                                    — zero build required, everything runs in your browser.
                                </motion.p>
                                <motion.div
                                    variants={fadeUp}
                                    className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono"
                                >
                                    <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                                        version {pkg.version}
                                    </span>
                                </motion.div>
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="why">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                Why OpenDoc UI?
                            </h2>
                            <div className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-3">
                                <p>
                                    OpenDoc UI turns an OpenAPI / Swagger description into a browsable, testable
                                    workspace. The specification comes from where you deploy it: from the bundled
                                    configuration (several APIs, switchable in two clicks from the navbar) or, when no
                                    configuration is present, from a file you open straight from your disk. Core
                                    documentation is rendered and processed client-side — no backend or sign-up is
                                    required. If you choose to use the AI assistant, only the context required by your
                                    selected provider is sent to that provider, with secrets redacted by default.
                                </p>
                                <p>
                                    The interface is built for day-to-day engineering work: navigation grouped by tag,
                                    method badges with colour-coded semantics, one-click copy for every path, schemas
                                    you can drill into modally without losing your place, endpoint tabs so several pages
                                    stay open at once, a global search, and an API runner that sends real HTTP requests
                                    from your browser so you can probe an endpoint in seconds. Every view has a
                                    shareable deep link.
                                </p>
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="what">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                What you can do
                            </h2>
                            <motion.div
                                variants={stagger}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{once: true, amount: 0.2}}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                            >
                                {FEATURES.map(f => (
                                    <motion.div
                                        key={f.title}
                                        variants={fadeUp}
                                        whileHover={{y: -2}}
                                        transition={{duration: 0.2}}
                                        className="rounded-xl border p-3 sm:p-4 bg-[var(--surface)]/70 border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors backdrop-blur-sm"
                                    >
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <motion.span
                                                initial={{scale: 0.8}}
                                                whileInView={{scale: 1}}
                                                viewport={{once: true}}
                                                className="inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]"
                                            >
                                                <i className={`${f.icon} text-lg`}></i>
                                            </motion.span>
                                            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-heading)] truncate">
                                                {f.title}
                                            </h3>
                                        </div>
                                        <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)] pl-11">
                                            {f.desc}
                                        </p>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="how">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                How it works
                            </h2>
                            <div className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-3">
                                <p>
                                    When you load a specification, OpenDoc UI fetches the descriptor (JSON or YAML),
                                    normalises it to OpenAPI 3, and builds an in-memory model of every path, operation,
                                    parameter, schema, security scheme and server. The UI then renders three first-class
                                    surfaces — a documentation tab with human-readable Markdown and schema tables, an
                                    API runner that composes real <code className="font-mono">fetch</code> requests, and
                                    a schema explorer that lets you browse every model in{' '}
                                    <code className="font-mono">components/schemas</code>.
                                </p>
                                <p>
                                    Because rendering happens entirely in the browser you can host OpenDoc UI on any
                                    static host (GitHub Pages, Netlify, S3, an internal nginx box) and point it at any
                                    CORS-enabled API. Authentication is stored in memory only — tokens never leave your
                                    machine unless you explicitly send a request. AI can run directly against a
                                    CORS-enabled provider or through an optional server-side gateway. The repository
                                    includes Express plus adapters for popular PHP, Python, Go, Java, .NET, Ruby, and
                                    Rust frameworks.
                                </p>
                                <p>
                                    Theme preferences, collapsed tag folders, sidebar width, tabs, cache and chat
                                    history are stored in browser <code className="font-mono">IndexedDB</code>. An
                                    emergency localStorage fallback is used only when IndexedDB is unavailable, so the
                                    UI can still recover your workspace on the next visit.
                                </p>
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="ai">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                OpenDoc UI assistant
                            </h2>
                            <div className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-4">
                                <p>
                                    The sparkle button in the topbar opens a dedicated assistant workspace. It is
                                    static-build safe: the documentation browser continues to work without an AI
                                    provider, while the assistant can connect directly to a CORS-enabled provider or
                                    through an optional same-origin/external gateway.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                                        <h3 className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-2">
                                            <i className="ph ph-crosshair text-[var(--primary)]" />
                                            Contextual questions
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                                            Right-click an endpoint and choose Ask AI, or open the assistant while
                                            viewing an endpoint. Up to five endpoint contexts can be combined and are
                                            shown in the fixed chat header.
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                                        <h3 className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-2">
                                            <i className="ph ph-quotes text-[var(--primary)]" />
                                            Grounded answers
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                                            The assistant receives retrieved redacted endpoint/schema context,
                                            operational API skills, and an explicit action bridge for opening endpoints,
                                            filling the Runner, and proposing a request.
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                                        <h3 className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-2">
                                            <i className="ph ph-user-circle text-[var(--primary)]" />
                                            Profiles and models
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                                            Global profiles keep provider keys, models, gateway settings, temperatures,
                                            skills, and custom instructions together. Refresh models to discover current
                                            provider catalogs, or enter any model ID manually.
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                                        <h3 className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-2">
                                            <i className="ph ph-lock-key text-[var(--primary)]" />
                                            Safety and Runner
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                                            Secrets are redacted by default. The existing API Runner remains the final
                                            request gate; trusted Runner mode can skip the preparation confirmation for
                                            a conversation, but it never silently sends a request.
                                        </p>
                                    </div>
                                </div>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Conversations are stored per specification in IndexedDB first, exportable as
                                    Markdown, and removable individually. Provider settings and profiles are global to
                                    the browser. The free online starting point is OpenRouter’s{' '}
                                    <code className="font-mono">openrouter/free</code>; local Ollama and premium
                                    providers are also supported.
                                </p>
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="keyboard">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                Keyboard Shortcuts
                            </h2>
                            <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                                Every shortcut below works on both Windows/Linux (<kbd className="font-mono">Ctrl</kbd>)
                                and macOS (<kbd className="font-mono">⌘</kbd>). Shortcuts that could interfere with
                                typing are automatically suppressed while a text field has focus.
                            </p>
                            <div className="space-y-3">
                                {SHORTCUT_GROUPS.map(g => (
                                    <motion.div
                                        key={g.group}
                                        variants={fadeUp}
                                        className="rounded-xl border overflow-hidden bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm"
                                    >
                                        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--background)]/40">
                                            <i className={`${g.icon} text-[13px] text-[var(--primary)]`}></i>
                                            <h3 className="text-[11px] font-black uppercase tracking-wider text-[var(--text-heading)]">
                                                {g.group}
                                            </h3>
                                        </div>
                                        <div className="divide-y divide-[var(--border)]">
                                            {g.items.map(r => (
                                                <div key={g.group + r.k + r.d} className="px-4 py-2.5 sm:py-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <span className="text-xs text-[var(--text)] font-medium">
                                                            {r.d}
                                                        </span>
                                                        <kbd className="px-2 py-0.5 rounded font-mono text-[10px] bg-[var(--background)] border border-[var(--border)] text-[var(--text-heading)] shrink-0 whitespace-nowrap">
                                                            {r.k}
                                                        </kbd>
                                                    </div>
                                                    {r.note && (
                                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] pe-2">
                                                            {r.note}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="mouse">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                Mouse &amp; Pointer
                            </h2>
                            <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                                Pointer behaviour follows the conventions you already know from code editors and
                                browsers: a single click previews, a double or middle click commits, and a right click
                                reveals the bulk actions.
                            </p>
                            <div className="rounded-xl border overflow-hidden bg-[var(--surface)]/70 border-[var(--border)] divide-y divide-[var(--border)] backdrop-blur-sm">
                                {MOUSE_ACTIONS.map(m => (
                                    <motion.div
                                        key={m.act + m.where + m.desc}
                                        variants={fadeUp}
                                        className="px-4 py-3 flex items-start gap-3"
                                    >
                                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] mt-0.5">
                                            <i className={`${m.icon} text-[14px]`}></i>
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                <span className="text-xs font-bold text-[var(--text-heading)]">
                                                    {m.act}
                                                </span>
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text-muted)]">
                                                    {m.where}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
                                                {m.desc}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="preview">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                Preview Tabs Explained
                            </h2>
                            <div className="rounded-xl border p-4 sm:p-5 mb-3 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)]">
                                <p>
                                    Tabs come in two flavours. A{' '}
                                    <span className="font-bold text-[var(--text-heading)]">preview tab</span> — shown in{' '}
                                    <em>italics</em> — is a scratch slot for an endpoint you are just skimming, and it
                                    gets reused the moment you look at something else. A{' '}
                                    <span className="font-bold text-[var(--text-heading)]">permanent tab</span> stays
                                    until you close it yourself. This lets you explore a large specification freely
                                    without drowning in tabs, while still pinning the handful of endpoints you are
                                    actually working on.
                                </p>
                            </div>
                            <motion.div
                                variants={stagger}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{once: true, amount: 0.15}}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                            >
                                {PREVIEW_RULES.map(r => (
                                    <motion.div
                                        key={r.title}
                                        variants={fadeUp}
                                        whileHover={{y: -2}}
                                        transition={{duration: 0.2}}
                                        className="rounded-xl border p-3 sm:p-4 bg-[var(--surface)]/70 border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors backdrop-blur-sm"
                                    >
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                                                <i className={`${r.icon} text-base`}></i>
                                            </span>
                                            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-heading)]">
                                                {r.title}
                                            </h3>
                                        </div>
                                        <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)] pl-11">
                                            {r.desc}
                                        </p>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="reading">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                Reading the endpoint tree
                            </h2>
                            <div className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] backdrop-blur-sm text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-3">
                                <p>
                                    The sidebar groups every operation into folders derived from its tags — a tag
                                    containing slashes (<code className="font-mono">Billing/Invoices</code>) becomes a
                                    nested folder, so you can mirror your API’s real structure just by naming tags
                                    carefully.
                                </p>
                                <p>
                                    When an endpoint is selected, the tree highlights the connector lines leading to it,
                                    tracing a single path from the outermost folder down to that endpoint. Branches you
                                    are not inside stay neutral, so the highlight tells you exactly where you are even
                                    when hundreds of operations are expanded. The <code className="font-mono">+</code> /{' '}
                                    <code className="font-mono">−</code> box of each folder on that path is tinted to
                                    match.
                                </p>
                                <p>
                                    Searching or applying filters narrows the tree in place: folders whose contents no
                                    longer match disappear, and everything that remains is auto-expanded so results are
                                    visible without any clicking. Clearing the search restores your previously expanded
                                    folders.
                                </p>
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="theme-system">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                Theme system
                            </h2>
                            <div className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)]/70 border-[var(--border)] text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-2">
                                <p>
                                    OpenDoc UI uses a semantic theme system. Each theme supplies coordinated light and
                                    dark palettes for surfaces, text, borders, methods, selection, and search
                                    highlighting.
                                </p>
                                <p>
                                    The active theme and mode are stored per specification, so switching documents
                                    preserves the visual workspace you chose for each API. System mode follows your
                                    operating system, while explicit light and dark modes override it.
                                </p>
                            </div>
                        </motion.section>

                        <motion.section variants={fadeUp} id="license">
                            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">
                                License
                            </h2>
                            <p className="text-xs sm:text-sm text-[var(--text-muted)] mb-3 leading-relaxed">
                                OpenDoc UI is open-source software released under the MIT License. You are free to use,
                                copy, modify, merge, publish, distribute, sublicense and/or sell copies of the software,
                                subject to the terms below.
                            </p>
                            <pre className="rounded-xl border p-4 bg-[var(--background)] border-[var(--border)] text-[11px] leading-relaxed font-mono whitespace-pre overflow-x-auto text-[var(--text)] scrollbar-thin">
                                {MIT_LICENSE}
                            </pre>
                        </motion.section>

                        <motion.footer
                            variants={fadeUp}
                            className="pt-4 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2"
                        >
                            <span>Built with React, Vite, Tailwind, Monaco Editor, and Phosphor Icons.</span>
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span>
                                    By{' '}
                                    <a
                                        href="https://github.com/omidgfx"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors"
                                    >
                                        Pejman Chatrrouz
                                    </a>
                                </span>
                                <a
                                    href={OPEN_DOC_WEBSITE_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors"
                                >
                                    <i className="ph ph-globe-hemisphere-west text-[11px]" />
                                    Website
                                </a>
                                <a
                                    href={OPEN_DOC_GITHUB_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors"
                                >
                                    <i className="ph-fill ph-github-logo text-[11px]" />
                                    GitHub
                                </a>
                                <span className="font-mono">v{pkg.version}</span>
                            </span>
                        </motion.footer>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
