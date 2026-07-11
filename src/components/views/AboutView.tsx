// @ts-ignore
import Logo from '../../logo.svg?react';
import pkg from '../../../package.json';

interface AboutViewProps {
    specTitle?: string;
    parsableKey?: string;
}

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
    { icon: 'ph-book-open-text', title: 'Documentation Browser', desc: 'Navigate tags, operations, parameters, request bodies and responses with live schema inspection.' },
    { icon: 'ph-flask', title: 'Built-in API Runner', desc: 'Execute requests directly from the browser with cookie, bearer, API-key and basic auth support.' },
    { icon: 'ph-code', title: 'Code Generator', desc: 'Copy ready-to-run fetch / axios snippets with your auth headers and payload pre-filled.' },
    { icon: 'ph-paint-bucket', title: 'Themes & Dark Mode', desc: '15+ hand-picked editor themes with per-spec preferences and instant toggling.' },
    { icon: 'ph-magnifying-glass', title: 'Global Search', desc: 'Cmd/Ctrl+K to search paths, summaries, tags, and schema definitions.' },
    { icon: 'ph-plugs-connected', title: 'Share Deep Links', desc: 'Every endpoint, tab, response and schema modal lives in the URL hash for perfect link sharing.' },
];

export default function AboutView({ specTitle, parsableKey }: AboutViewProps) {
    return (
        <div className="flex-1 h-full overflow-y-auto scrollbar-thin">
            <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-16 space-y-12">
                {/* Hero */}
                <section className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="w-20 h-20 shrink-0 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shadow-sm">
                        <Logo className="w-14 h-14" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)] mb-1">
                            OpenDoc UI
                        </p>
                        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-heading)]">
                            A clean, fast OpenAPI explorer
                        </h1>
                        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl leading-relaxed">
                            Browse, read, test and share OpenAPI / Swagger specifications in a modern
                            interface — zero build required, zero server required, everything runs
                            in your browser.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                                version {pkg.version}
                            </span>
                            {specTitle && (
                                <span className="px-2 py-0.5 rounded border border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)]">
                                    {specTitle}
                                </span>
                            )}
                            {parsableKey && parsableKey !== specTitle && (
                                <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                                    {parsableKey}
                                </span>
                            )}
                        </div>
                    </div>
                </section>

                {/* Features grid */}
                <section>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">
                        What you can do
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FEATURES.map((f) => (
                            <div
                                key={f.title}
                                className="rounded-xl border p-4 bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors"
                            >
                                <div className="flex items-center gap-3 mb-1.5">
                                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                                        <i className={`${f.icon} text-lg`}></i>
                                    </span>
                                    <h3 className="text-sm font-bold text-[var(--text-heading)]">{f.title}</h3>
                                </div>
                                <p className="text-xs leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Shortcuts */}
                <section>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">
                        Keyboard Shortcuts
                    </h2>
                    <div className="rounded-xl border overflow-hidden bg-[var(--surface)] border-[var(--border)]">
                        {[
                            { k: 'Ctrl / ⌘ + K', d: 'Focus global search' },
                            { k: 'Esc', d: 'Close open modal (schema viewer, auth, etc.)' },
                            { k: 'Ctrl / ⌘ + Enter', d: 'Send request in API Runner' },
                        ].map((r, i, arr) => (
                            <div
                                key={r.k}
                                className={`flex items-center justify-between gap-4 px-4 py-3 text-xs ${i < arr.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                            >
                                <span className="text-[var(--text)]">{r.d}</span>
                                <kbd className="px-2 py-0.5 rounded font-mono text-[10px] bg-[var(--background)] border border-[var(--border)] text-[var(--text-heading)]">
                                    {r.k}
                                </kbd>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Specs */}
                <section>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">
                        About the loaded specification
                    </h2>
                    <div className="rounded-xl border p-5 bg-[var(--surface)] border-[var(--border)] text-xs leading-relaxed text-[var(--text)] space-y-2">
                        <p>
                            <span className="font-bold text-[var(--text-heading)]">Title:</span>{' '}
                            {specTitle || 'No specification loaded'}
                        </p>
                        <p>
                            <span className="font-bold text-[var(--text-heading)]">Configuration key:</span>{' '}
                            <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--background)] border border-[var(--border)]">
                                {parsableKey || '—'}
                            </code>
                        </p>
                        <p className="text-[var(--text-muted)]">
                            OpenDoc UI parses Swagger 2.x and OpenAPI 3.x descriptors (JSON or YAML),
                            normalizes them to OpenAPI 3, and renders a fully client-side experience.
                            Requests made through the API Runner are sent directly from your browser
                            using the <code className="font-mono">fetch</code> API.
                        </p>
                    </div>
                </section>

                <footer className="pt-4 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
                    <span>Built with React, Vite, Tailwind and Phosphor Icons.</span>
                    <span className="font-mono">OpenDoc UI · {pkg.version}</span>
                </footer>
            </div>
        </div>
    );
}
