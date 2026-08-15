import {useState, type ReactNode} from 'react';
import type {EndpointNote} from '../../types';
import {endpointNoteColor, endpointNoteTitle} from '../../utils/notes/index';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {useEscClose} from '../../hooks/useEscClose';
import ConfirmModal from '../common/ConfirmModal';
import MethodBadge from '../common/MethodBadge';
import {Tip} from '../common/Tooltip';

interface TrashNotesModalProps {
    notes: EndpointNote[];
    onRestore: (noteId: string) => void;
    onDeleteForever: (noteId: string) => void;
    onEmptyTrash: () => void;
    onClose: () => void;
}

export default function TrashNotesModal({
    notes,
    onRestore,
    onDeleteForever,
    onEmptyTrash,
    onClose,
}: TrashNotesModalProps) {
    const {pendingTodoCompletionId} = useEndpointNotes();
    const [confirmEmpty, setConfirmEmpty] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState<{kind: 'restore' | 'delete'; note: EndpointNote} | null>(null);
    useEscClose(true, onClose, !pendingTodoCompletionId && !confirmEmpty && !confirmTarget);
    const body: ReactNode =
        notes.length > 0 ? (
            <div className="space-y-2">
                <p className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                    Deleted notes stay here until you restore or permanently delete them.
                </p>
                {notes.map(note => {
                    const color = endpointNoteColor(note.color);
                    return (
                        <div
                            key={note.id}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
                        >
                            <span
                                aria-hidden="true"
                                className="size-2 shrink-0 rounded-full"
                                style={{backgroundColor: color.dot}}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-[var(--text-heading)]">
                                    {note.type === 'todo' && (
                                        <i className="ph ph-check-square me-1 text-[10px] text-[var(--method-put)]" />
                                    )}
                                    {endpointNoteTitle(note)}
                                </p>
                                <div className="mt-1 flex items-center gap-1.5">
                                    <MethodBadge method={note.method} size="xs" />
                                    <code className="truncate text-[9px] text-[var(--text-muted)]">{note.path}</code>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                <Tip content="Restore this note">
                                    <button
                                        type="button"
                                        aria-label={`Restore ${endpointNoteTitle(note)}`}
                                        onClick={() => setConfirmTarget({kind: 'restore', note})}
                                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--method-get)]/10 px-2 text-[9px] font-bold text-[var(--method-get)] hover:bg-[var(--method-get)]/20 cursor-pointer"
                                    >
                                        <i className="ph ph-arrow-counter-clockwise text-[10px]" />
                                        Restore
                                    </button>
                                </Tip>
                                <Tip content="Delete permanently">
                                    <button
                                        type="button"
                                        aria-label={`Delete ${endpointNoteTitle(note)} permanently`}
                                        onClick={() => setConfirmTarget({kind: 'delete', note})}
                                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--method-delete)]/10 px-2 text-[9px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/20 cursor-pointer"
                                    >
                                        <i className="ph ph-trash text-[10px]" />
                                        Delete
                                    </button>
                                </Tip>
                            </div>
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="flex flex-col items-center px-4 py-10 text-center">
                <i className="ph ph-trash text-3xl text-[var(--text-muted)]/40" />
                <h3 className="mt-3 text-sm font-extrabold text-[var(--text-heading)]">Trash is empty</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    Notes you delete are kept here so you can restore them.
                </p>
            </div>
        );
    return (
        <>
            <div
                className="modal-backdrop fixed inset-0 z-[4000] bg-black/55 backdrop-blur-[2px]"
                onMouseDown={event => {
                    if (event.target === event.currentTarget) onClose();
                }}
            >
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-label="Trash"
                    className="modal-surface flex w-full max-w-xl max-h-[82vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
                    onMouseDown={event => event.stopPropagation()}
                >
                    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-delete)]/10 text-[var(--method-delete)]">
                                <i className="ph ph-trash text-[18px]" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-extrabold text-[var(--text-heading)]">Trash</h2>
                                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                                    {notes.length} {notes.length === 1 ? 'deleted note' : 'deleted notes'}
                                </p>
                            </div>
                        </div>
                        <Tip content="Close">
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close Trash"
                                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                            >
                                <i className="ph ph-x text-[15px]" />
                            </button>
                        </Tip>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">{body}</div>
                    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                        {notes.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setConfirmEmpty(true)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--method-delete)]/30 px-4 text-[11px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                            >
                                <i className="ph ph-trash-simple text-[12px]" />
                                Empty trash
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 items-center rounded-lg bg-[var(--primary)] px-4 text-[11px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                        >
                            Done
                        </button>
                    </footer>
                </section>
            </div>
            <ConfirmModal
                isOpen={confirmEmpty}
                title="Empty the trash?"
                message={`Permanently delete all ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} in the trash? This cannot be undone.`}
                confirmLabel="Empty trash"
                destructive
                onConfirm={async () => {
                    onEmptyTrash();
                    setConfirmEmpty(false);
                    onClose();
                }}
                onClose={() => setConfirmEmpty(false)}
            />
            <ConfirmModal
                isOpen={confirmTarget !== null}
                title={confirmTarget?.kind === 'restore' ? 'Restore this note?' : 'Delete this note permanently?'}
                message={
                    confirmTarget
                        ? confirmTarget.kind === 'restore'
                            ? `“${endpointNoteTitle(confirmTarget.note)}” will be moved back to ${confirmTarget.note.method.toUpperCase()} ${confirmTarget.note.path}.`
                            : `“${endpointNoteTitle(confirmTarget.note)}” will be permanently removed and cannot be restored.`
                        : ''
                }
                confirmLabel={confirmTarget?.kind === 'restore' ? 'Restore note' : 'Delete permanently'}
                destructive={confirmTarget?.kind === 'delete'}
                onConfirm={async () => {
                    if (!confirmTarget) return;
                    if (confirmTarget.kind === 'restore') onRestore(confirmTarget.note.id);
                    else onDeleteForever(confirmTarget.note.id);
                    setConfirmTarget(null);
                }}
                onClose={() => setConfirmTarget(null)}
            />
        </>
    );
}
