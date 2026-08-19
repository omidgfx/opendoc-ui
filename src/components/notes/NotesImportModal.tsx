import {useState, type ReactNode} from 'react';
import type {EndpointNote} from '../../types';
import {endpointNoteKey, type EndpointNotesExportFile} from '../../utils/notes/index';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import {Tip} from '../common/Tooltip';

const ORPHAN_PREVIEW_LIMIT = 6;

interface NotesImportModalProps {
    file: EndpointNotesExportFile;
    matching: EndpointNote[];
    orphaned: EndpointNote[];
    /** Notes whose id already exists in this specification. */
    duplicates: number;
    /** The specification key these notes are being imported into. */
    currentSpecKey: string;
    onImport: (notes: EndpointNote[]) => {imported: number; skipped: number};
    onClose: () => void;
}

export default function NotesImportModal({
    file,
    matching,
    orphaned,
    duplicates,
    currentSpecKey,
    onImport,
    onClose,
}: NotesImportModalProps) {
    const {pendingTodoCompletionId} = useEndpointNotes();
    const [result, setResult] = useState<{imported: number; skipped: number} | null>(null);
    useModalShortcuts({
        isOpen: true,
        onClose,
        onSubmit: () => (result ? onClose() : setResult(onImport(matching.length ? matching : file.notes))),
        enabled: !pendingTodoCompletionId,
    });
    const title = file.source.specTitle || 'Notes export file';
    const foreignSpec = !!file.source.specKey && file.source.specKey !== currentSpecKey;
    const footer = (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {result ? (
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 text-[11px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                >
                    Done
                </button>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-[11px] font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                        Cancel
                    </button>
                    {orphaned.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setResult(onImport(matching))}
                            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-[11px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            Import {matching.length} matching notes
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setResult(onImport(file.notes))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 text-[11px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                    >
                        <i className="ph ph-upload-simple text-[13px]" />
                        Import {file.notes.length} {file.notes.length === 1 ? 'note' : 'notes'}
                    </button>
                </>
            )}
        </div>
    );
    const body: ReactNode = result ? (
        <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-[var(--method-get)]/10 text-[var(--method-get)]">
                <i className="ph-fill ph-check-circle text-[26px]" />
            </span>
            <h3 className="mt-4 text-sm font-extrabold text-[var(--text-heading)]">
                Imported {result.imported} {result.imported === 1 ? 'note' : 'notes'}
            </h3>
            {result.skipped > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {result.skipped} {result.skipped === 1 ? 'note was' : 'notes were'} skipped (already present or over
                    the per-endpoint limit).
                </p>
            )}
        </div>
    ) : (
        <div className="space-y-4">
            {foreignSpec && (
                <div className="flex items-start gap-2 rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 px-3 py-2.5">
                    <i className="ph ph-warning-circle mt-0.5 shrink-0 text-[13px] text-[var(--method-put)]" />
                    <div className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                        <p className="font-bold text-[var(--text-heading)]">
                            These notes were exported from a different specification
                            {file.source.specTitle ? ` (${file.source.specTitle})` : ''}.
                        </p>
                        <p className="mt-1">
                            They may not belong to the endpoints of the current specification. Notes whose endpoints do
                            not exist here are kept as orphaned and can be re-assigned or deleted afterwards.
                        </p>
                    </div>
                </div>
            )}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text-heading)]">{file.notes.length}</span>{' '}
                    {file.notes.length === 1 ? 'note' : 'notes'} found in the export
                    {file.source.specKey && (
                        <>
                            {' '}
                            (from <span className="font-mono">{file.source.specKey}</span>)
                        </>
                    )}
                    {file.exportedAt && `, exported ${new Date(file.exportedAt).toLocaleString()}`}.
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--method-get)]/25 bg-[var(--method-get)]/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--method-get)]">
                            Match this specification
                        </span>
                        <strong className="text-lg text-[var(--text-heading)]">{matching.length}</strong>
                    </div>
                    <p className="mt-1 text-[9.5px] leading-relaxed text-[var(--text-muted)]">
                        Notes whose endpoint exists in the current specification.
                    </p>
                </div>
                <div className="rounded-xl border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--method-delete)]">
                            Orphaned notes
                        </span>
                        <strong className="text-lg text-[var(--text-heading)]">{orphaned.length}</strong>
                    </div>
                    <p className="mt-1 text-[9.5px] leading-relaxed text-[var(--text-muted)]">
                        Notes whose endpoint is not present in the current specification.
                    </p>
                </div>
            </div>
            {orphaned.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                        Orphaned endpoints
                    </span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from(new Set(orphaned.map(note => `${note.method.toUpperCase()} ${note.path}`)))
                            .sort()
                            .slice(0, ORPHAN_PREVIEW_LIMIT)
                            .map(endpoint => (
                                <span
                                    key={endpoint}
                                    className="rounded-md border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-2 py-1 font-mono text-[9px] text-[var(--text-muted)]"
                                >
                                    {endpoint}
                                </span>
                            ))}
                        {new Set(orphaned.map(note => endpointNoteKey(note.path, note.method))).size >
                            ORPHAN_PREVIEW_LIMIT && (
                            <span className="px-1 py-1 text-[9px] text-[var(--text-muted)]">
                                +{' '}
                                {new Set(orphaned.map(note => endpointNoteKey(note.path, note.method))).size -
                                    ORPHAN_PREVIEW_LIMIT}{' '}
                                more
                            </span>
                        )}
                    </div>
                    <p className="mt-2 text-[9.5px] leading-relaxed text-[var(--text-muted)]">
                        Orphaned notes stay available under “Unavailable endpoint” after import.
                    </p>
                </div>
            )}
            {duplicates > 0 && (
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text-heading)]">{duplicates}</span>{' '}
                    {duplicates === 1 ? 'note already exists' : 'notes already exist'} in this specification and will be
                    skipped.
                </p>
            )}
        </div>
    );
    return (
        <div
            className="modal-backdrop fixed inset-0 z-[4000] bg-black/55 backdrop-blur-[2px]"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label="Import local notes"
                className="modal-surface flex w-full max-w-xl max-h-[82vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className="ph ph-upload-simple text-[18px]" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-extrabold text-[var(--text-heading)]">
                                Import local notes
                            </h2>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{title}</p>
                        </div>
                    </div>
                    <Tip content="Close">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close Import local notes"
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                        >
                            <i className="ph ph-x text-[15px]" />
                        </button>
                    </Tip>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">{body}</div>
                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                    {footer}
                </footer>
            </section>
        </div>
    );
}
