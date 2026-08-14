import type {EndpointNote} from '../../types';
import {endpointNoteColor, endpointNoteTitle} from '../../utils/endpointNotes';
import {useEscClose} from '../../hooks/useEscClose';
import Markdown from '../common/Markdown';
import MethodBadge from '../common/MethodBadge';
import {Tip} from '../common/Tooltip';

interface NoteViewerModalProps {
    note: EndpointNote;
    operationTitle: string;
    endpointHidden: boolean;
    escEnabled?: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onToggleTodo: () => void;
}

export default function NoteViewerModal({
    note,
    operationTitle,
    endpointHidden,
    escEnabled = true,
    onClose,
    onEdit,
    onDelete,
    onToggleTodo,
}: NoteViewerModalProps) {
    const color = endpointNoteColor(note.color);
    const title = endpointNoteTitle(note);
    const hasContent = !!note.content.trim();
    useEscClose(true, onClose, escEnabled);
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
                aria-label={title}
                className="modal-surface flex max-h-[82vh] min-h-[360px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-[var(--surface)] text-[var(--text)] shadow-2xl"
                style={{borderColor: color.border}}
                onMouseDown={event => event.stopPropagation()}
            >
                <div
                    className="flex min-h-0 flex-1 flex-col"
                    style={{backgroundColor: color.background, color: color.text}}
                >
                    <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
                        <div className="flex min-w-0 items-start gap-3">
                            <span
                                className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                                style={{backgroundColor: `color-mix(in srgb, ${color.tone} 24%, transparent)`}}
                            >
                                <i
                                    className={`${note.type === 'todo' ? 'ph-fill ph-check-circle' : 'ph-fill ph-note'} text-[18px]`}
                                    style={{color: color.tone}}
                                />
                            </span>
                            <div className="min-w-0">
                                <h2
                                    className={`truncate text-sm font-extrabold text-[var(--text-heading)] ${
                                        note.done ? 'line-through' : ''
                                    }`}
                                >
                                    {title}
                                </h2>
                                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{operationTitle}</p>
                                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                                    <MethodBadge method={note.method} size="xs" />
                                    <code className="max-w-full truncate text-[9px] text-[var(--text-muted)]">
                                        {note.path}
                                    </code>
                                    <span className="rounded-full bg-[var(--surface)]/45 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        {note.type === 'todo'
                                            ? note.done
                                                ? 'Todo · Done'
                                                : 'Todo · Open'
                                            : 'Simple note'}
                                    </span>
                                    {endpointHidden && (
                                        <span className="rounded-full bg-[var(--surface)]/45 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                            Endpoint hidden
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <Tip content="Delete note">
                                <button
                                    type="button"
                                    onClick={onDelete}
                                    aria-label="Delete note"
                                    className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--method-delete)] transition-colors hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                >
                                    <i className="ph ph-trash text-[14px]" />
                                </button>
                            </Tip>
                            <Tip content="Edit note">
                                <button
                                    type="button"
                                    onClick={onEdit}
                                    aria-label="Edit note"
                                    className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-heading)] transition-colors hover:bg-[var(--surface)]/55 hover:text-[var(--primary)] cursor-pointer"
                                >
                                    <i className="ph ph-pencil-simple text-[14px]" />
                                </button>
                            </Tip>
                            <Tip content="Close">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label={`Close ${title}`}
                                    className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)]/55 hover:text-[var(--primary)] cursor-pointer"
                                >
                                    <i className="ph ph-x text-[15px]" />
                                </button>
                            </Tip>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin sm:px-7">
                        {hasContent ? (
                            <Markdown
                                text={note.content}
                                className={`!text-inherit ${note.done ? 'line-through decoration-1' : ''}`}
                            />
                        ) : (
                            <div
                                data-empty-note-content
                                className="flex h-full min-h-44 items-center justify-center text-[var(--text-muted)]"
                            >
                                <i className="ph-fill ph-note text-5xl opacity-35" aria-label="Empty note" />
                            </div>
                        )}
                    </main>

                    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                        <div className="flex flex-wrap gap-3 text-[9px] text-[var(--text-muted)]">
                            <span>Created {new Date(note.createdAt).toLocaleString()}</span>
                            <span>Updated {new Date(note.updatedAt).toLocaleString()}</span>
                            {note.type === 'todo' && note.autoHideWhenTodosDone && (
                                <span className="text-[var(--primary)]">Auto-hide enabled</span>
                            )}
                        </div>
                        {note.type === 'todo' && (
                            <button
                                type="button"
                                onClick={onToggleTodo}
                                aria-label={note.done ? 'Mark as not done' : 'Mark as done'}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/35 px-3 text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface)]/60 cursor-pointer"
                            >
                                <span
                                    className="flex size-5 items-center justify-center rounded-full border"
                                    style={{
                                        borderColor: color.text,
                                        backgroundColor: note.done ? color.dot : 'transparent',
                                    }}
                                >
                                    {note.done && <i className="ph ph-check text-[12px] text-white" />}
                                </span>
                                {note.done ? 'Mark not done' : 'Mark as done'}
                            </button>
                        )}
                    </footer>
                </div>
            </section>
        </div>
    );
}
