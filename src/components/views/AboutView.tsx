import { motion } from 'motion/react';
import Banner from '../../assets/banner-logo.svg?react';
import pkg from '../../../package.json';

interface AboutViewProps {
    specTitle?: string;
    parsableKey?: string;
}

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
    { icon: 'ph-fill ph-book-open-text', title: 'Documentation Browser', desc: 'Navigate tags, operations, parameters, request bodies and responses with live schema inspection.' },
    { icon: 'ph-fill ph-flask', title: 'Built-in API Runner', desc: 'Execute requests directly from the browser with cookie, bearer, API-key and basic auth support.' },
    { icon: 'ph-fill ph-code', title: 'Code & TypeScript Generator', desc: 'Export ready-to-run fetch / axios snippets and TypeScript models generated from your schemas.' },
    { icon: 'ph-fill ph-paint-bucket', title: 'Themes & Dark Mode', desc: '15+ hand-picked editor themes with per-spec preferences and instant light/dark toggling.' },
    { icon: 'ph-fill ph-magnifying-glass', title: 'Global Search', desc: 'Cmd/Ctrl+K to search paths, summaries, tags, and schema definitions with advanced filters.' },
    { icon: 'ph-fill ph-plugs-connected', title: 'Share Deep Links', desc: 'Every endpoint, tab, response and schema modal lives in the URL hash for perfect link sharing.' },
];

const stagger = { visible: { transition: { staggerChildren: 0.06 } } };
const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export default function AboutView({ specTitle, parsableKey }: AboutViewProps) {
    return (
        <div className="flex-1 h-full overflow-y-auto scrollbar-thin">
            <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-12 space-y-10 sm:space-y-12"
            >
                {/* Hero */}
                <motion.section variants={fadeUp} className="flex flex-col items-center gap-4 sm:gap-6">
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-2xl aspect-[1100/320] flex items-center justify-center"
                    >
                        <Banner className="w-full h-auto drop-shadow-sm" />
                    </motion.div>
                    <div className="text-center max-w-2xl">
                        <motion.p variants={fadeUp} className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)] mb-2">About</motion.p>
                        <motion.h1 variants={fadeUp} className="text-xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-heading)]">
                            A clean, fast OpenAPI explorer
                        </motion.h1>
                        <motion.p variants={fadeUp} className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
                            Browse, read, test and share OpenAPI / Swagger specifications in a modern
                            interface — zero build required, everything runs in your browser.
                        </motion.p>
                        <motion.div variants={fadeUp} className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">version {pkg.version}</span>
                            {specTitle && (
                                <span className="px-2 py-0.5 rounded border border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)] truncate max-w-full">
                                    {specTitle}
                                </span>
                            )}
                        </motion.div>
                    </div>
                </motion.section>

                {/* Features */}
                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">What you can do</h2>
                    <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FEATURES.map((f, i) => (
                            <motion.div key={f.title} variants={fadeUp}
                                whileHover={{ y: -2 }}
                                transition={{ duration: 0.2 }}
                                className="rounded-xl border p-3 sm:p-4 bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors">
                                <div className="flex items-center gap-3 mb-1.5">
                                    <motion.span
                                        initial={{ scale: 0.8 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
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

                {/* Shortcuts */}
                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">Keyboard Shortcuts</h2>
                    <div className="rounded-xl border overflow-hidden bg-[var(--surface)] border-[var(--border)] divide-y divide-[var(--border)]">
                        {[
                            { k: 'Ctrl / ⌘ + K', d: 'Focus global search' },
                            { k: 'Esc', d: 'Close open modal' },
                            { k: 'Ctrl / ⌘ + Enter', d: 'Send request in API Runner' },
                            { k: 'Swipe from left edge', d: 'Open sidebar on mobile' },
                        ].map((r, i) => (
                            <motion.div key={r.k} variants={fadeUp}
                                className="flex items-center justify-between gap-4 px-4 py-2.5 sm:py-3 text-xs">
                                <span className="text-[var(--text)] truncate">{r.d}</span>
                                <kbd className="px-2 py-0.5 rounded font-mono text-[10px] bg-[var(--background)] border border-[var(--border)] text-[var(--text-heading)] shrink-0">{r.k}</kbd>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Spec info */}
                <motion.section variants={fadeUp}>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 sm:mb-4">About the loaded specification</h2>
                    <div className="rounded-xl border p-4 sm:p-5 bg-[var(--surface)] border-[var(--border)] text-xs sm:text-sm leading-relaxed text-[var(--text)] space-y-2">
                        <p><span className="font-bold text-[var(--text-heading)]">Title:</span> {specTitle || 'No specification loaded'}</p>
                        <p>
                            <span className="font-bold text-[var(--text-heading)]">Config key:</span>{' '}
                            <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)]">{parsableKey || '—'}</code>
                        </p>
                        <p className="text-[var(--text-muted)]">
                            OpenDoc UI parses Swagger 2.x and OpenAPI 3.x descriptors (JSON or YAML),
                            normalizes them to OpenAPI 3, and renders a fully client-side experience.
                            Requests made through the API Runner are sent directly from your browser
                            using the <code className="font-mono">fetch</code> API.
                        </p>
                    </div>
                </motion.section>

                <motion.footer variants={fadeUp} className="pt-4 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
                    <span>Built with React, Vite, Tailwind and Phosphor Icons.</span>
                    <span className="flex items-center gap-2">
                        <span>By <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer" className="font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors">Pejman Chatrrouz</a></span>
                        <span className="font-mono">OpenDoc UI · {pkg.version}</span>
                    </span>
                </motion.footer>
            </motion.div>
        </div>
    );
}
