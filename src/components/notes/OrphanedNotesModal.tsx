import {useState, type ReactNode} from 'react';
import type {EndpointNote, OpenApiSpec} from '../../types';
import {endpointNoteColor, endpointNoteTitle} from '../../utils/notes/index';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {useEscClose} from '../../hooks/useEscClose';
import ConfirmModal from '../common/ConfirmModal';
import MethodBadge from '../common/MethodBadge';
import ReassignEndpointPicker from './ReassignEndpointPicker';
import {Tip} from '../common/Tooltip';

interface OrphanedNotesModalProps {
    spec: OpenApiSpec;
    notes: EndpointNote[];
    onReassign: (noteId: string, path: string, method: string) => void;
    onDeleteForever: (noteId: string) => void;
    onClose: () => void;
}

export default function OrphanedNotesModal({
    spec,
    notes,
    onReassign,
    onDeleteForever,
    onClose,
}: OrphanedNotesModalProps) {
    const {pendingTodoCompletionId} = useEndpointNotes();
    const [reassigningId, setReassigningId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    useEscClose(true, onClose, !pendingTodoCompletionId && !confirmDeleteId);
    const body: ReactNode =
        notes.length > 0 ? (
            <div className="space-y-2">
                <p className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                    These notes belong to endpoints that no longer exist in the loaded specification. Re-assign them to
                    another endpoint or delete them permanently.
                </p>
                {notes.map(note => {
                    const color = endpointNoteColor(note.color);
                    const reassigning = reassigningId === note.id;
                    return (
                        <div
                            key={note.id}
                            className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
                        >
                            <div className="flex flex-wrap items-center gap-2">
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
                                        <code className="truncate text-[9px] text-[var(--method-delete)]">
                                            {note.path}
                                        </code>
                                        <span className="rounded bg-[var(--method-delete)]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--method-delete)]">
                                            missing
                                        </span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Tip content="Re-assign this note to another endpoint">
                                        <button
                                            type="button"
                                            aria-label={`Re-assign ${endpointNoteTitle(note)}`}
                                            onClick={() => setReassigningId(reassigning ? null : note.id)}
                                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--primary)]/10 px-2 text-[9px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/20 cursor-pointer"
                                        >
                                            <i className="ph ph-arrows-left-right text-[10px]" />
                                            Re-assign
                                        </button>
                                    </Tip>
                                    <Tip content="Delete permanently">
                                        <button
                                            type="button"
                                            aria-label={`Delete ${endpointNoteTitle(note)} permanently`}
                                            onClick={() => setConfirmDeleteId(note.id)}
                                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--method-delete)]/10 px-2 text-[9px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/20 cursor-pointer"
                                        >
                                            <i className="ph ph-trash text-[10px]" />
                                            Delete
                                        </button>
                                    </Tip>
                                </div>
                            </div>
                            {reassigning && (
                                <div className="mt-3 border-t border-[var(--border)] pt-3">
                                    <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Pick the endpoint this note belongs to
                                    </p>
                                    <ReassignEndpointPicker
                                        spec={spec}
                                        onSelect={(path, method) => {
                                            onReassign(note.id, path, method);
                                            setReassigningId(null);
                                        }}
                                        onCancel={() => setReassigningId(null)}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="flex flex-col items-center px-4 py-10 text-center">
                <i className="ph ph-broken-heart text-3xl text-[var(--text-muted)]/40" />
                <h3 className="mt-3 text-sm font-extrabold text-[var(--text-heading)]">No orphaned notes</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    Notes whose endpoint disappears from the specification land here for re-assignment.
                </p>
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
                aria-label="Orphaned notes"
                className="modal-surface flex w-full max-w-2xl max-h-[82vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-put)]/10 text-[var(--method-put)]">
                            <i className="ph ph-broken-heart text-[18px]" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-extrabold text-[var(--text-heading)]">
                                Orphaned notes
                            </h2>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                                {notes.length} {notes.length === 1 ? 'note' : 'notes'} without an endpoint in this
                                specification
                            </p>
                        </div>
                    </div>
                    <Tip content="Close">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close Orphaned notes"
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                        >
                            <i className="ph ph-x text-[15px]" />
                        </button>
                    </Tip>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">{body}</div>
                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center rounded-lg bg-[var(--primary)] px-4 text-[11px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                    >
                        Done
                    </button>
                </footer>
            </section>
            <ConfirmModal
                isOpen={confirmDeleteId !== null}
                title="Delete this note permanently?"
                message={
                    confirmDeleteId
                        ? `“${endpointNoteTitle(notes.find(note => note.id === confirmDeleteId) || ({} as EndpointNote))}” has no endpoint in this specification. It will be permanently removed and cannot be restored.`
                        : ''
                }
                confirmLabel="Delete permanently"
                destructive
                onConfirm={async () => {
                    if (confirmDeleteId) onDeleteForever(confirmDeleteId);
                    setConfirmDeleteId(null);
                }}
                onClose={() => setConfirmDeleteId(null)}
            />
        </div>
    );
}
