import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';
import type {ResponseDefinition} from '../../../types';
import {useModalShortcuts} from '../../../hooks/useModalShortcuts';
interface ResponseCodeSheetProps {
    responses: Record<string, ResponseDefinition>;
    activeCode: string | null;
    expandedCodes: ReadonlySet<string>;
    onSelect: (code: string) => void;
}

const responseTone = (code: string) => {
    if (code === 'default' || code.startsWith('2')) return 'var(--method-get)';
    if (code.startsWith('3')) return 'var(--method-put)';
    return 'var(--method-delete)';
};

const responseClass = (code: string): string => {
    if (code === 'default') return 'Default';
    const group = code.charAt(0);
    if (group === '1') return 'Informational';
    if (group === '2') return 'Success';
    if (group === '3') return 'Redirection';
    if (group === '4') return 'Client error';
    if (group === '5') return 'Server error';
    return 'Response';
};

/**
 * The response navigator for phones. The vertical rail of the desktop view has
 * nowhere to live on a narrow pane, and tabs would hide most of the codes, so
 * the active response sits in a pill above the matrix and the full list opens
 * as a bottom sheet: colour-coded status, description and content types.
 */
export default function ResponseCodeSheet({responses, activeCode, expandedCodes, onSelect}: ResponseCodeSheetProps) {
    const entries = Object.entries(responses);
    const [open, setOpen] = useState(false);
    useModalShortcuts({isOpen: open, onClose: () => setOpen(false)});
    useEffect(() => {
        if (!open) return;
        const {overflow} = document.body.style;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = overflow;
        };
    }, [open]);
    if (entries.length === 0) return null;
    const current = activeCode && responses[activeCode] ? activeCode : entries[0][0];
    const currentResponse = responses[current];
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
                // Above the code viewer, whose gutter sits on a layer of its own.
                className="sticky top-2 z-40 flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left shadow-sm backdrop-blur transition-colors cursor-pointer border-[var(--border)] bg-[var(--surface)]/95 hover:border-[var(--primary)]/40"
            >
                <span
                    className="flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold"
                    style={{
                        color: responseTone(current),
                        borderColor: `color-mix(in srgb, ${responseTone(current)} 30%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${responseTone(current)} 12%, transparent)`,
                    }}
                >
                    {current}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-[var(--text-heading)]">
                        {currentResponse?.description || 'Response details'}
                    </span>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        {entries.length} response{entries.length === 1 ? '' : 's'} · tap to browse
                    </span>
                </span>
                <i className="ph ph-caret-up-down shrink-0 text-[14px] text-[var(--text-muted)]" />
            </button>

            {open &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div className="fixed inset-0 z-[3000] flex items-end" role="presentation">
                        <button
                            type="button"
                            aria-label="Close response list"
                            onClick={() => setOpen(false)}
                            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
                        />
                        <section
                            role="dialog"
                            aria-modal="true"
                            aria-label="Responses"
                            className="relative flex max-h-[76vh] w-full flex-col overflow-hidden rounded-t-2xl border-t shadow-2xl animate-in slide-in-from-bottom duration-200 border-[var(--border)] bg-[var(--surface)]"
                        >
                            <header className="flex items-center gap-2 border-b px-4 py-3 border-[var(--border)] bg-[var(--background)]">
                                <span
                                    aria-hidden
                                    className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--text-muted)]/30"
                                />
                                <h3 className="text-sm font-extrabold text-[var(--text-heading)]">Responses</h3>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    aria-label="Close response list"
                                    className="ms-auto flex size-8 items-center justify-center rounded-lg border cursor-pointer border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                                >
                                    <i className="ph ph-x text-[14px]" />
                                </button>
                            </header>
                            <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
                                {entries.map(([code, response]) => {
                                    const tone = responseTone(code);
                                    const contentTypes = Object.keys(response.content || {});
                                    return (
                                        <button
                                            key={code}
                                            type="button"
                                            aria-current={code === current}
                                            onClick={() => {
                                                onSelect(code);
                                                setOpen(false);
                                            }}
                                            className={clsx(
                                                'mb-1.5 flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer last:mb-0',
                                                code === current
                                                    ? 'border-[var(--primary)]/40 bg-[var(--primary)]/5'
                                                    : 'border-[var(--border)] hover:bg-[var(--surface-hover)]',
                                            )}
                                        >
                                            <span
                                                className="mt-0.5 flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold"
                                                style={{
                                                    color: tone,
                                                    borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
                                                    backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`,
                                                }}
                                            >
                                                {code}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span
                                                        className="text-[9px] font-black uppercase tracking-wider"
                                                        style={{color: tone}}
                                                    >
                                                        {responseClass(code)}
                                                    </span>
                                                    {expandedCodes.has(code) && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                            · open
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-heading)]">
                                                    {response.description || 'Response details'}
                                                </span>
                                                {contentTypes.length > 0 && (
                                                    <span className="mt-1 flex flex-wrap gap-1">
                                                        {contentTypes.map(type => (
                                                            <span
                                                                key={type}
                                                                className="rounded border px-1.5 py-0.5 font-mono text-[9px] border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]"
                                                            >
                                                                {type}
                                                            </span>
                                                        ))}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    </div>,
                    document.body,
                )}
        </>
    );
}
