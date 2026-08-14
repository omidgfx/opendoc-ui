import {useEffect, useMemo, useState, type ReactNode} from 'react';
import type {EndpointNote, EndpointNoteColor, EndpointNoteDraft, EndpointNoteType, OpenApiSpec} from '../../types';
import {getDocumentOperations, getOperation} from '../../utils/openapi';
import {
    ENDPOINT_NOTE_COLORS,
    MAX_NOTE_CONTENT_CHARS,
    MAX_NOTE_TITLE_CHARS,
    MAX_NOTES_PER_ENDPOINT,
    endpointNoteColor,
    endpointNoteTitle,
    noteCharacterCount,
} from '../../utils/endpointNotes';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {useEscClose} from '../../hooks/useEscClose';
import Markdown from '../common/Markdown';
import MethodBadge from '../common/MethodBadge';
import ConfirmModal from '../common/ConfirmModal';
import {Tip} from '../common/Tooltip';
import NoteEndpointPicker from './NoteEndpointPicker';

function NotesDialog({
    title,
    subtitle,
    icon,
    onClose,
    children,
    footer,
    maxWidth = 'max-w-2xl',
    escEnabled = true,
}: {
    title: string;
    subtitle?: string;
    icon: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    maxWidth?: string;
    escEnabled?: boolean;
}) {
    const {pendingTodoCompletionId} = useEndpointNotes();
    useEscClose(true, onClose, escEnabled && !pendingTodoCompletionId);
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
                className={`modal-surface flex max-h-[82vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl`}
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className={`${icon} text-[18px]`} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-extrabold text-[var(--text-heading)]">{title}</h2>
                            {subtitle && (
                                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{subtitle}</p>
                            )}
                        </div>
                    </div>
                    <Tip content="Close">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={`Close ${title}`}
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                        >
                            <i className="ph ph-x text-[15px]" />
                        </button>
                    </Tip>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">{children}</div>
                {footer && (
                    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                        {footer}
                    </footer>
                )}
            </section>
        </div>
    );
}

function NoteCard({note, onOpen, onDelete}: {note: EndpointNote; onOpen: () => void; onDelete: () => void}) {
    const {requestToggleTodo} = useEndpointNotes();
    const color = endpointNoteColor(note.color);
    return (
        <div
            tabIndex={0}
            aria-label={`Open ${endpointNoteTitle(note)}`}
            onClick={event => {
                if ((event.target as HTMLElement).closest('button, a, input, textarea')) return;
                onOpen();
            }}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen();
                }
            }}
            className="group rounded-xl border p-3 text-left transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 cursor-pointer"
            style={{backgroundColor: color.background, borderColor: color.border, color: color.text}}
        >
            <div className="flex items-start gap-2">
                {note.type === 'todo' ? (
                    <button
                        type="button"
                        aria-label={note.done ? 'Mark todo as not done' : 'Mark todo as done'}
                        aria-pressed={note.done}
                        onClick={event => {
                            event.stopPropagation();
                            requestToggleTodo(note.id);
                        }}
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer"
                        style={{
                            borderColor: color.text,
                            backgroundColor: note.done
                                ? color.dot
                                : 'color-mix(in srgb, var(--surface) 82%, transparent)',
                        }}
                    >
                        {note.done && <i className="ph ph-check text-[12px] text-white" />}
                    </button>
                ) : (
                    <i className="ph-fill ph-note mt-0.5 shrink-0 text-[15px] text-[#f59e0b] transition-colors group-hover:text-[var(--primary)]" />
                )}
                <div className="min-w-0 flex-1 text-left">
                    <button
                        type="button"
                        onClick={onOpen}
                        className="flex max-w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 cursor-pointer"
                    >
                        <strong className={`truncate text-xs ${note.done ? 'line-through opacity-60' : ''}`}>
                            {endpointNoteTitle(note)}
                        </strong>
                        <span className="shrink-0 rounded-full bg-[var(--surface)]/55 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider">
                            {note.type === 'todo' ? 'Todo' : 'Note'}
                        </span>
                    </button>
                    <div
                        className={`mt-1 line-clamp-3 text-[10px] leading-relaxed ${note.done ? 'opacity-55' : 'opacity-80'}`}
                    >
                        <Markdown text={note.content} className="markdown-body-simple !text-[10px] !text-inherit" />
                    </div>
                </div>
                <Tip content="Delete note">
                    <button
                        type="button"
                        aria-label={`Delete ${endpointNoteTitle(note)}`}
                        onClick={event => {
                            event.stopPropagation();
                            onDelete();
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)]/35 opacity-0 transition-all hover:bg-[var(--surface)]/70 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                    >
                        <i className="ph ph-trash text-[13px]" />
                    </button>
                </Tip>
            </div>
        </div>
    );
}

function EndpointNotesList({
    spec,
    path,
    method,
    onClose,
}: {
    spec: OpenApiSpec;
    path: string;
    method: string;
    onClose: () => void;
}) {
    const {notesForEndpoint, canAddNote, openCreateNote, openNote, deleteNote, deleteEndpointNotes, isEndpointHidden} =
        useEndpointNotes();
    const notes = notesForEndpoint(path, method);
    const atCapacity = !canAddNote(path, method);
    const operation = getOperation(spec, path, method);
    const [deleteTarget, setDeleteTarget] = useState<EndpointNote | 'all' | null>(null);
    return (
        <>
            <NotesDialog
                title="Endpoint Notes"
                subtitle={operation?.summary || path}
                icon="ph-fill ph-note text-[#f59e0b]"
                onClose={onClose}
                footer={
                    <>
                        {notes.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setDeleteTarget('all')}
                                className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-bold text-[var(--method-delete)] transition-colors hover:bg-[var(--method-delete)]/10 cursor-pointer"
                            >
                                <i className="ph ph-trash text-[13px]" />
                                Delete all
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 rounded-xl border border-[var(--border)] px-4 text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            Close
                        </button>
                        <Tip
                            content={
                                atCapacity
                                    ? `This endpoint already has the maximum of ${MAX_NOTES_PER_ENDPOINT} notes.`
                                    : 'Create another endpoint note'
                            }
                        >
                            <button
                                type="button"
                                disabled={atCapacity}
                                onClick={() => openCreateNote(path, method)}
                                className="group inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[10px] font-bold text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                            >
                                <i className="ph-fill ph-note text-[13px] text-[#f59e0b] transition-colors group-hover:text-[var(--primary-contrast)] group-active:text-[var(--primary-contrast)] group-disabled:text-[var(--text-muted)]" />
                                Add note
                            </button>
                        </Tip>
                    </>
                }
            >
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                    <MethodBadge method={method} size="xs" />
                    <code className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-heading)]">{path}</code>
                    <span className="rounded-full bg-[var(--primary)]/10 px-2 py-1 text-[9px] font-bold text-[var(--primary)]">
                        {notes.length} note{notes.length === 1 ? '' : 's'}
                    </span>
                    {isEndpointHidden(path, method) && (
                        <span className="rounded-full bg-[var(--text-muted)]/10 px-2 py-1 text-[9px] font-bold text-[var(--text-muted)]">
                            Hidden endpoint
                        </span>
                    )}
                </div>
                {notes.length > 0 ? (
                    <div className="space-y-2">
                        {notes.map(note => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                onOpen={() => openNote(note.id)}
                                onDelete={() => setDeleteTarget(note)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)] px-5 py-12 text-center">
                        <i className="ph-fill ph-note text-3xl text-[#f59e0b]/55" />
                        <p className="mt-2 text-xs font-bold text-[var(--text-heading)]">No notes for this endpoint</p>
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                            Add a Markdown note or track endpoint work as a todo.
                        </p>
                    </div>
                )}
            </NotesDialog>
            <ConfirmModal
                isOpen={!!deleteTarget}
                title={deleteTarget === 'all' ? 'Delete all endpoint notes?' : 'Delete this note?'}
                message={
                    deleteTarget === 'all'
                        ? `Delete all ${notes.length} notes saved for ${method.toUpperCase()} ${path}?`
                        : 'This local note will be permanently removed from this browser.'
                }
                confirmLabel={deleteTarget === 'all' ? 'Delete all notes' : 'Delete note'}
                destructive
                onConfirm={async () => {
                    if (deleteTarget === 'all') await deleteEndpointNotes(path, method);
                    else if (deleteTarget) await deleteNote(deleteTarget.id);
                    setDeleteTarget(null);
                }}
                onClose={() => setDeleteTarget(null)}
            />
        </>
    );
}

function LimitMeter({value, maximum, countdown}: {value: number; maximum: number; countdown: number}) {
    if (value === 0) return null;
    const ratio = Math.min(1, value / maximum);
    const hue = Math.round(215 * (1 - ratio));
    const remaining = maximum - value;
    const overloaded = remaining < 0;
    return (
        <span className="ms-auto flex items-center gap-2">
            {remaining <= countdown && (
                <span className={overloaded ? 'text-[var(--method-delete)]' : 'text-[var(--text-muted)]'}>
                    {overloaded ? `${Math.abs(remaining)} over` : remaining}
                </span>
            )}
            <span data-note-limit-meter className="h-1 w-16 overflow-hidden rounded-full bg-[var(--text-muted)]/15">
                <span
                    className="block h-full rounded-full transition-[width,background-color]"
                    style={{width: `${ratio * 100}%`, backgroundColor: `hsl(${hue} 82% 54%)`}}
                />
            </span>
        </span>
    );
}

function NoteEditor({
    note,
    spec,
    path,
    method,
    onClose,
}: {
    note?: EndpointNote;
    spec: OpenApiSpec;
    path?: string;
    method?: string;
    onClose: () => void;
}) {
    const {specKey, addNote, updateNote, canAddNote} = useEndpointNotes();
    const operations = useMemo(() => getDocumentOperations(spec), [spec]);
    const requestedEndpoint = useMemo(
        () =>
            operations.find(
                operation => operation.path === path && operation.method.toLowerCase() === method?.toLowerCase(),
            ),
        [operations, path, method],
    );
    const endpointSelectionLocked = !note && !!requestedEndpoint;
    const initialEndpoint = useMemo(() => {
        if (note) return {path: note.path, method: note.method};
        const fallback = requestedEndpoint || operations[0];
        return fallback ? {path: fallback.path, method: fallback.method} : null;
    }, [note, operations, requestedEndpoint]);
    const [selectedEndpoint, setSelectedEndpoint] = useState(initialEndpoint);
    const [type, setType] = useState<EndpointNoteType>(note?.type || 'note');
    const [title, setTitle] = useState(note?.title || '');
    const [content, setContent] = useState(note?.content || '');
    const [color, setColor] = useState<EndpointNoteColor>(note?.color || 'butter');
    const [autoHideWhenTodosDone, setAutoHideWhenTodosDone] = useState(note?.autoHideWhenTodosDone || false);
    const [saveAttempted, setSaveAttempted] = useState(false);
    const selectedColor = endpointNoteColor(color);
    const titleLength = noteCharacterCount(title);
    const contentLength = noteCharacterCount(content);
    const titleOverloaded = titleLength > MAX_NOTE_TITLE_CHARS;
    const contentOverloaded = contentLength > MAX_NOTE_CONTENT_CHARS;
    const titleMissing = !title.trim();
    const endpointAtCapacity =
        !note && !!selectedEndpoint && !canAddNote(selectedEndpoint.path, selectedEndpoint.method);
    const invalid = !selectedEndpoint || titleMissing || titleOverloaded || contentOverloaded || endpointAtCapacity;
    const showAlert =
        titleOverloaded ||
        contentOverloaded ||
        endpointAtCapacity ||
        (saveAttempted && (titleMissing || !selectedEndpoint));
    const save = () => {
        setSaveAttempted(true);
        if (invalid || !selectedEndpoint) return;
        const draft: EndpointNoteDraft = {
            path: selectedEndpoint.path,
            method: selectedEndpoint.method,
            type,
            title,
            content,
            color,
            autoHideWhenTodosDone: type === 'todo' && autoHideWhenTodosDone,
        };
        if (note) updateNote(note.id, draft);
        else if (!addNote(draft)) return;
        onClose();
    };
    const editor = (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <span
                        id="note-type-label"
                        className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
                    >
                        Note type
                    </span>
                    <div
                        role="group"
                        aria-labelledby="note-type-label"
                        className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5 text-xs"
                    >
                        <button
                            type="button"
                            aria-label="Simple note"
                            aria-pressed={type === 'note'}
                            onClick={() => setType('note')}
                            className={`group flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                                type === 'note'
                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)]'
                            }`}
                        >
                            <i
                                className={`ph-fill ph-note text-[15px] transition-colors ${
                                    type === 'note'
                                        ? 'text-[var(--primary-contrast)]'
                                        : 'text-[#f59e0b] group-hover:text-[var(--primary)]'
                                }`}
                            />
                            Simple note
                        </button>
                        <button
                            type="button"
                            aria-label="Todo"
                            aria-pressed={type === 'todo'}
                            onClick={() => setType('todo')}
                            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                                type === 'todo'
                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)]'
                            }`}
                        >
                            <i className="ph-fill ph-check-circle text-[15px]" />
                            Todo
                        </button>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Note tone
                        <span className="ms-auto font-semibold normal-case tracking-normal text-[var(--text-heading)]">
                            {selectedColor.label}
                        </span>
                    </span>
                    <div
                        role="group"
                        aria-label="Note tone"
                        className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                    >
                        {ENDPOINT_NOTE_COLORS.map(option => (
                            <Tip key={option.id} content={option.label}>
                                <button
                                    type="button"
                                    aria-label={`${option.label} note tone`}
                                    aria-pressed={color === option.id}
                                    onClick={() => setColor(option.id)}
                                    className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 cursor-pointer ${
                                        color === option.id ? 'scale-110' : ''
                                    }`}
                                    style={{backgroundColor: option.tone}}
                                >
                                    {color === option.id && <i className="ph-bold ph-check text-[10px] text-white" />}
                                </button>
                            </Tip>
                        ))}
                    </div>
                </div>
            </div>
            <label className="block space-y-1.5">
                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Title <span className="ms-1 text-[var(--method-delete)]">*</span>
                    <LimitMeter value={titleLength} maximum={MAX_NOTE_TITLE_CHARS} countdown={16} />
                </span>
                <input
                    type="text"
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder={type === 'todo' ? 'What needs to be done?' : 'Short note title'}
                    autoFocus={!!note || endpointSelectionLocked}
                    aria-invalid={titleOverloaded || (saveAttempted && titleMissing)}
                    className={`w-full rounded-xl border bg-[var(--background)] px-3 py-2.5 text-xs text-[var(--text-heading)] outline-none transition-colors ${
                        titleOverloaded || (saveAttempted && titleMissing)
                            ? 'border-[var(--method-delete)] focus:border-[var(--method-delete)]'
                            : 'border-[var(--border)] focus:border-[var(--primary)]'
                    }`}
                />
            </label>
            <label className="block space-y-1.5">
                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Markdown content <span className="ms-1 font-normal normal-case">(optional)</span>
                    <LimitMeter value={contentLength} maximum={MAX_NOTE_CONTENT_CHARS} countdown={50} />
                </span>
                <textarea
                    value={content}
                    onChange={event => setContent(event.target.value)}
                    placeholder="Write Markdown…"
                    rows={9}
                    aria-invalid={contentOverloaded}
                    className={`w-full resize-y rounded-xl border bg-[var(--background)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--text-heading)] outline-none transition-colors ${
                        contentOverloaded
                            ? 'border-[var(--method-delete)] focus:border-[var(--method-delete)]'
                            : 'border-[var(--border)] focus:border-[var(--primary)]'
                    }`}
                />
            </label>
            {type === 'todo' && (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                    <input
                        type="checkbox"
                        checked={autoHideWhenTodosDone}
                        onChange={event => setAutoHideWhenTodosDone(event.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--primary)]"
                    />
                    <span>
                        <span className="block text-[11px] font-bold text-[var(--text-heading)]">
                            Offer to hide endpoint when all todos are done
                        </span>
                        <span className="mt-0.5 block text-[9px] leading-relaxed text-[var(--text-muted)]">
                            Completing the last todo opens a confirmation with the hide option checked. Uncheck it to
                            complete the todo without hiding its endpoint.
                        </span>
                    </span>
                </label>
            )}
            {showAlert && (
                <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/7 px-3 py-2.5 text-[10px] leading-relaxed text-[var(--method-delete)]"
                >
                    <i className="ph ph-warning-circle mt-0.5 shrink-0 text-[15px]" />
                    <span>
                        {titleMissing && 'A title is required. '}
                        {titleOverloaded &&
                            `The title is ${titleLength - MAX_NOTE_TITLE_CHARS} ${titleLength - MAX_NOTE_TITLE_CHARS === 1 ? 'character' : 'characters'} over its ${MAX_NOTE_TITLE_CHARS}-character limit. `}
                        {contentOverloaded &&
                            `Markdown content is ${contentLength - MAX_NOTE_CONTENT_CHARS} ${contentLength - MAX_NOTE_CONTENT_CHARS === 1 ? 'character' : 'characters'} over its ${MAX_NOTE_CONTENT_CHARS}-character limit. `}
                        {endpointAtCapacity &&
                            `This endpoint already has the maximum of ${MAX_NOTES_PER_ENDPOINT} notes. `}
                        {!selectedEndpoint && 'Choose an endpoint before saving. '}
                        Extra text remains editable and copyable, but the note cannot be saved until these limits are
                        satisfied.
                    </span>
                </div>
            )}
            <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Preview</span>
                <div
                    className="mt-1.5 max-h-72 min-h-36 overflow-y-auto rounded-2xl border p-4 scrollbar-thin"
                    style={{
                        backgroundColor: selectedColor.background,
                        borderColor: selectedColor.border,
                        color: selectedColor.text,
                    }}
                >
                    <h3 className="text-sm font-extrabold">{title.trim() || 'Untitled note'}</h3>
                    {content ? (
                        <Markdown text={content} className="mt-2 !text-[11px] !text-inherit" />
                    ) : (
                        <p className="mt-2 text-[10px] opacity-60">This note has no Markdown details.</p>
                    )}
                </div>
            </div>
        </div>
    );
    return (
        <>
            <NotesDialog
                title={note ? 'Edit Note' : 'Create Note'}
                subtitle={
                    selectedEndpoint
                        ? `${selectedEndpoint.method.toUpperCase()} ${selectedEndpoint.path}`
                        : 'Choose an endpoint'
                }
                icon={type === 'todo' ? 'ph-fill ph-check-square' : 'ph-fill ph-note text-[#f59e0b]'}
                onClose={onClose}
                maxWidth={note || endpointSelectionLocked ? 'max-w-4xl' : 'max-w-6xl'}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 rounded-xl border border-[var(--border)] px-4 text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            aria-label={note ? 'Save changes' : 'Create note'}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[10px] font-bold transition-colors cursor-pointer ${
                                invalid
                                    ? 'bg-[var(--text-muted)]/20 text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)]'
                                    : 'bg-[var(--primary)] text-[var(--primary-contrast)] hover:brightness-110'
                            }`}
                        >
                            <i className="ph ph-floppy-disk text-[13px]" />
                            {note ? 'Save changes' : 'Create note'}
                        </button>
                    </>
                }
            >
                {note || endpointSelectionLocked ? (
                    editor
                ) : (
                    <div className="grid min-h-0 items-stretch gap-4 lg:grid-cols-[minmax(280px,.85fr)_minmax(0,1.5fr)]">
                        <NoteEndpointPicker
                            spec={spec}
                            specKey={specKey}
                            selected={selectedEndpoint}
                            onSelect={(nextPath, nextMethod) =>
                                setSelectedEndpoint({path: nextPath, method: nextMethod})
                            }
                        />
                        {editor}
                    </div>
                )}
            </NotesDialog>
        </>
    );
}

function NoteDetail({note, spec, onClose}: {note: EndpointNote; spec: OpenApiSpec; onClose: () => void}) {
    const {requestToggleTodo, openEditNote, deleteNote, isEndpointHidden} = useEndpointNotes();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const color = endpointNoteColor(note.color);
    const operation = getOperation(spec, note.path, note.method);
    return (
        <>
            <NotesDialog
                title={endpointNoteTitle(note)}
                subtitle={operation?.summary || `${note.method.toUpperCase()} ${note.path}`}
                icon={note.type === 'todo' ? 'ph-fill ph-check-square' : 'ph-fill ph-note text-[#f59e0b]'}
                onClose={onClose}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                        >
                            <i className="ph ph-trash text-[13px]" />
                            Delete
                        </button>
                        {note.type === 'todo' && (
                            <button
                                type="button"
                                onClick={() => requestToggleTodo(note.id)}
                                aria-label={note.done ? 'Mark as not done' : 'Mark as done'}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                <i
                                    className={`ph ${note.done ? 'ph-arrow-counter-clockwise' : 'ph-check'} text-[13px]`}
                                />
                                {note.done ? 'Mark not done' : 'Mark as done'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => openEditNote(note.id)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[10px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                        >
                            <i className="ph ph-pencil-simple text-[13px]" />
                            Edit
                        </button>
                    </>
                }
            >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <MethodBadge method={note.method} size="xs" />
                    <code className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-heading)]">{note.path}</code>
                    <span className="rounded-full bg-[var(--surface-hover)] px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                        {note.type === 'todo' ? (note.done ? 'Todo · Done' : 'Todo · Open') : 'Simple note'}
                    </span>
                    {isEndpointHidden(note.path, note.method) && (
                        <span className="rounded-full bg-[var(--text-muted)]/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            Endpoint hidden
                        </span>
                    )}
                </div>
                <article
                    className={`${note.done ? 'opacity-65' : ''} rounded-2xl border p-5`}
                    style={{backgroundColor: color.background, borderColor: color.border, color: color.text}}
                >
                    {note.type === 'todo' && (
                        <button
                            type="button"
                            onClick={() => requestToggleTodo(note.id)}
                            className="mb-4 inline-flex items-center gap-2 rounded-xl bg-[var(--surface)]/45 px-3 py-2 text-[10px] font-bold hover:bg-[var(--surface)]/70 cursor-pointer"
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
                            {note.done ? 'Completed' : 'Mark todo as done'}
                        </button>
                    )}
                    <Markdown
                        text={note.content}
                        className={`!text-inherit ${note.done ? 'line-through decoration-1' : ''}`}
                    />
                </article>
                <div className="mt-3 flex flex-wrap gap-3 text-[9px] text-[var(--text-muted)]">
                    <span>Created {new Date(note.createdAt).toLocaleString()}</span>
                    <span>Updated {new Date(note.updatedAt).toLocaleString()}</span>
                    {note.type === 'todo' && note.autoHideWhenTodosDone && (
                        <span className="text-[var(--primary)]">Auto-hide enabled</span>
                    )}
                </div>
            </NotesDialog>
            <ConfirmModal
                isOpen={confirmDelete}
                title="Delete this note?"
                message="This local note will be permanently removed from this browser."
                confirmLabel="Delete note"
                destructive
                onConfirm={async () => {
                    await deleteNote(note.id);
                    setConfirmDelete(false);
                    onClose();
                }}
                onClose={() => setConfirmDelete(false)}
            />
        </>
    );
}

function TodoCompletionConfirm() {
    const {notes, pendingTodoCompletionId, confirmTodoCompletion, cancelTodoCompletion} = useEndpointNotes();
    const [hideEndpoint, setHideEndpoint] = useState(true);
    const note = notes.find(item => item.id === pendingTodoCompletionId);
    useEffect(() => {
        if (pendingTodoCompletionId) setHideEndpoint(true);
    }, [pendingTodoCompletionId]);
    useEscClose(!!pendingTodoCompletionId, cancelTodoCompletion);
    if (!note || !pendingTodoCompletionId) return null;
    return (
        <div
            className="modal-backdrop fixed inset-0 z-[5000] bg-black/55 backdrop-blur-[2px]"
            onMouseDown={event => {
                if (event.target === event.currentTarget) cancelTodoCompletion();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="complete-todo-confirm-title"
                className="modal-surface modal-confirm-surface w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-get)]/10 text-[var(--method-get)]">
                        <i className="ph-fill ph-check-square text-[18px]" />
                    </span>
                    <div>
                        <h3
                            id="complete-todo-confirm-title"
                            className="text-sm font-extrabold text-[var(--text-heading)]"
                        >
                            Complete todo and hide endpoint?
                        </h3>
                        <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">
                            {note.method.toUpperCase()} {note.path}
                        </p>
                    </div>
                </header>
                <div className="space-y-3 px-4 py-4">
                    <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                        This is the last open todo for the endpoint, and automatic hiding is enabled. Confirm whether
                        completing it should also move the endpoint into Hidden endpoints.
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                        <input
                            type="checkbox"
                            checked={hideEndpoint}
                            onChange={event => setHideEndpoint(event.target.checked)}
                            className="mt-0.5 size-4 accent-[var(--primary)]"
                        />
                        <span>
                            <span className="block text-[11px] font-bold text-[var(--text-heading)]">
                                Hide endpoint after completion
                            </span>
                            <span className="mt-0.5 block text-[9px] text-[var(--text-muted)]">
                                Uncheck this to mark the todo done without hiding its endpoint.
                            </span>
                        </span>
                    </label>
                </div>
                <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <button
                        type="button"
                        onClick={cancelTodoCompletion}
                        className="h-9 rounded-xl border border-[var(--border)] px-4 text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => confirmTodoCompletion(hideEndpoint)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--method-get)] px-4 text-[10px] font-bold text-[var(--method-get-contrast)] hover:brightness-110 cursor-pointer"
                    >
                        <i className="ph ph-check text-[13px]" />
                        Mark as done
                    </button>
                </footer>
            </section>
        </div>
    );
}

export default function EndpointNotesModalLayer({spec}: {spec: OpenApiSpec | null}) {
    const {notes, modalStack, closeNotesModal, closeAllNotesModals} = useEndpointNotes();
    const top = modalStack[modalStack.length - 1];
    const note = top && 'noteId' in top ? notes.find(item => item.id === top.noteId) : undefined;
    useEffect(() => {
        if (top && 'noteId' in top && !note) closeNotesModal();
    }, [top, note, closeNotesModal]);
    let modal: ReactNode = null;
    if (top && spec) {
        if (top.kind === 'list')
            modal = <EndpointNotesList spec={spec} path={top.path} method={top.method} onClose={closeAllNotesModals} />;
        else if (top.kind === 'create')
            modal = <NoteEditor spec={spec} path={top.path} method={top.method} onClose={closeNotesModal} />;
        else if (top.kind === 'edit' && note)
            modal = (
                <NoteEditor spec={spec} note={note} path={note.path} method={note.method} onClose={closeNotesModal} />
            );
        else if (top.kind === 'detail' && note)
            modal = <NoteDetail note={note} spec={spec} onClose={closeNotesModal} />;
    }
    return (
        <>
            {modal}
            <TodoCompletionConfirm />
        </>
    );
}
