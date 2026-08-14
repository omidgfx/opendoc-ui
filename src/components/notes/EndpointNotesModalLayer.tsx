import {useEffect, useMemo, useState, type ReactNode} from 'react';
import type {EndpointNote, EndpointNoteColor, EndpointNoteDraft, EndpointNoteType, OpenApiSpec} from '../../types';
import {getOperation} from '../../utils/openapi';
import {ENDPOINT_NOTE_COLORS, endpointNoteColor, endpointNoteTitle} from '../../utils/endpointNotes';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {useEscClose} from '../../hooks/useEscClose';
import Markdown from '../common/Markdown';
import MethodBadge from '../common/MethodBadge';
import CustomDropdown from '../common/CustomDropdown';
import ConfirmModal from '../common/ConfirmModal';
import {Tip} from '../common/Tooltip';

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
    const {toggleTaskDone} = useEndpointNotes();
    const color = endpointNoteColor(note.color);
    return (
        <div
            className="group rounded-xl border p-3 text-left transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-md"
            style={{backgroundColor: color.background, borderColor: color.border, color: color.text}}
        >
            <div className="flex items-start gap-2">
                {note.type === 'task' ? (
                    <button
                        type="button"
                        aria-label={note.done ? 'Mark task as not done' : 'Mark task as done'}
                        aria-pressed={note.done}
                        onClick={event => {
                            event.stopPropagation();
                            toggleTaskDone(note.id);
                        }}
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors cursor-pointer"
                        style={{
                            borderColor: color.text,
                            backgroundColor: note.done ? color.dot : 'rgba(255,255,255,.5)',
                        }}
                    >
                        {note.done && <i className="ph ph-check text-[12px] text-white" />}
                    </button>
                ) : (
                    <span className="mt-1 size-2 shrink-0 rounded-full" style={{backgroundColor: color.dot}} />
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
                        <span className="shrink-0 rounded-full bg-white/55 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider">
                            {note.type === 'task' ? 'Task' : 'Note'}
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
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/35 opacity-0 transition-all hover:bg-white/70 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
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
    const {notesForEndpoint, openCreateNote, openNote, deleteNote, deleteEndpointNotes, isEndpointHidden} =
        useEndpointNotes();
    const notes = notesForEndpoint(path, method);
    const operation = getOperation(spec, path, method);
    const [deleteTarget, setDeleteTarget] = useState<EndpointNote | 'all' | null>(null);
    return (
        <>
            <NotesDialog
                title="Endpoint Notes"
                subtitle={operation?.summary || path}
                icon="ph-fill ph-note-pencil"
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
                        <button
                            type="button"
                            onClick={() => openCreateNote(path, method)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[10px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                        >
                            <i className="ph ph-plus text-[13px]" />
                            Add note
                        </button>
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
                        <i className="ph ph-note-blank text-3xl text-[var(--text-muted)]/50" />
                        <p className="mt-2 text-xs font-bold text-[var(--text-heading)]">No notes for this endpoint</p>
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                            Add a Markdown note or track endpoint work as a task.
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

function NoteColorPicker({
    value,
    onChange,
    onClose,
}: {
    value: EndpointNoteColor;
    onChange: (value: EndpointNoteColor) => void;
    onClose: () => void;
}) {
    useEscClose(true, onClose);
    return (
        <div
            className="modal-backdrop fixed inset-0 z-[4500] bg-black/55 backdrop-blur-[2px]"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label="Choose note color"
                className="modal-surface w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div>
                        <h3 className="text-sm font-extrabold text-[var(--text-heading)]">Choose note color</h3>
                        <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">Twelve calm, predefined colors</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close note color picker"
                        className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                        <i className="ph ph-x" />
                    </button>
                </header>
                <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
                    {ENDPOINT_NOTE_COLORS.map(color => (
                        <button
                            key={color.id}
                            type="button"
                            aria-label={`${color.label} note color`}
                            aria-pressed={value === color.id}
                            onClick={() => {
                                onChange(color.id);
                                onClose();
                            }}
                            className="group rounded-xl border p-2 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 cursor-pointer"
                            style={{backgroundColor: color.background, borderColor: color.border, color: color.text}}
                        >
                            <span className="block h-10 rounded-lg bg-white/35" />
                            <span className="mt-1.5 flex items-center justify-between text-[9px] font-bold">
                                {color.label}
                                {value === color.id && <i className="ph-fill ph-check-circle" />}
                            </span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

function NoteEditor({
    note,
    path,
    method,
    onClose,
}: {
    note?: EndpointNote;
    path: string;
    method: string;
    onClose: () => void;
}) {
    const {addNote, updateNote} = useEndpointNotes();
    const [type, setType] = useState<EndpointNoteType>(note?.type || 'note');
    const [title, setTitle] = useState(note?.title || '');
    const [content, setContent] = useState(note?.content || '');
    const [color, setColor] = useState<EndpointNoteColor>(note?.color || 'butter');
    const [autoHideWhenTasksDone, setAutoHideWhenTasksDone] = useState(note?.autoHideWhenTasksDone || false);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const selectedColor = endpointNoteColor(color);
    const draft: EndpointNoteDraft = {
        path,
        method,
        type,
        title,
        content,
        color,
        autoHideWhenTasksDone: type === 'task' && autoHideWhenTasksDone,
    };
    const save = () => {
        if (!content.trim()) return;
        if (note) updateNote(note.id, draft);
        else addNote(draft);
        onClose();
    };
    return (
        <>
            <NotesDialog
                title={note ? 'Edit Note' : 'Create Note'}
                subtitle={`${method.toUpperCase()} ${path}`}
                icon={type === 'task' ? 'ph-fill ph-check-square' : 'ph-fill ph-note-pencil'}
                onClose={onClose}
                maxWidth="max-w-3xl"
                escEnabled={!colorPickerOpen}
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
                            disabled={!content.trim()}
                            onClick={save}
                            aria-label={note ? 'Save changes' : 'Create note'}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[10px] font-bold text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                        >
                            <i className="ph ph-floppy-disk text-[13px]" />
                            {note ? 'Save changes' : 'Create note'}
                        </button>
                    </>
                }
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]">
                    <div className="space-y-4">
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Note type
                            </span>
                            <CustomDropdown
                                value={type}
                                onChange={value => setType(value === 'task' ? 'task' : 'note')}
                                ariaLabel="Note type"
                                options={[
                                    {
                                        value: 'note',
                                        label: 'Simple note',
                                        description: 'Markdown reference or reminder',
                                    },
                                    {value: 'task', label: 'Task / todo', description: 'Can be marked as done'},
                                ]}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Title <span className="font-normal normal-case">(optional)</span>
                            </span>
                            <input
                                type="text"
                                value={title}
                                onChange={event => setTitle(event.target.value)}
                                placeholder={type === 'task' ? 'What needs to be done?' : 'Short note title'}
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Markdown content
                            </span>
                            <textarea
                                value={content}
                                onChange={event => setContent(event.target.value)}
                                placeholder="Write Markdown…"
                                rows={9}
                                autoFocus
                                className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                            />
                        </label>
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Background color
                            </span>
                            <button
                                type="button"
                                onClick={() => setColorPickerOpen(true)}
                                className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-transform hover:-translate-y-px cursor-pointer"
                                style={{
                                    backgroundColor: selectedColor.background,
                                    borderColor: selectedColor.border,
                                    color: selectedColor.text,
                                }}
                            >
                                <span className="size-7 rounded-lg bg-white/45" />
                                <span className="flex-1 text-xs font-bold">{selectedColor.label}</span>
                                <span className="text-[9px] opacity-70">Choose from 12 colors</span>
                                <i className="ph ph-caret-right text-[12px]" />
                            </button>
                        </div>
                        {type === 'task' && (
                            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                                <input
                                    type="checkbox"
                                    checked={autoHideWhenTasksDone}
                                    onChange={event => setAutoHideWhenTasksDone(event.target.checked)}
                                    className="mt-0.5 size-4 accent-[var(--primary)]"
                                />
                                <span>
                                    <span className="block text-[11px] font-bold text-[var(--text-heading)]">
                                        Auto-hide endpoint when all tasks are done
                                    </span>
                                    <span className="mt-0.5 block text-[9px] leading-relaxed text-[var(--text-muted)]">
                                        When the last task for this endpoint is completed, move the endpoint into the
                                        Hidden endpoints folder.
                                    </span>
                                </span>
                            </label>
                        )}
                    </div>
                    <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Preview
                        </span>
                        <div
                            className="mt-1.5 min-h-56 rounded-2xl border p-4"
                            style={{
                                backgroundColor: selectedColor.background,
                                borderColor: selectedColor.border,
                                color: selectedColor.text,
                            }}
                        >
                            <h3 className="text-sm font-extrabold">
                                {title.trim() || (type === 'task' ? 'Task preview' : 'Note preview')}
                            </h3>
                            {content.trim() ? (
                                <Markdown text={content} className="mt-2 !text-[11px] !text-inherit" />
                            ) : (
                                <p className="mt-2 text-[10px] opacity-60">Markdown preview appears here.</p>
                            )}
                        </div>
                    </div>
                </div>
            </NotesDialog>
            {colorPickerOpen && (
                <NoteColorPicker value={color} onChange={setColor} onClose={() => setColorPickerOpen(false)} />
            )}
        </>
    );
}

function NoteDetail({note, spec, onClose}: {note: EndpointNote; spec: OpenApiSpec; onClose: () => void}) {
    const {toggleTaskDone, openEditNote, deleteNote, isEndpointHidden} = useEndpointNotes();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const color = endpointNoteColor(note.color);
    const operation = getOperation(spec, note.path, note.method);
    return (
        <>
            <NotesDialog
                title={endpointNoteTitle(note)}
                subtitle={operation?.summary || `${note.method.toUpperCase()} ${note.path}`}
                icon={note.type === 'task' ? 'ph-fill ph-check-square' : 'ph-fill ph-note'}
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
                        {note.type === 'task' && (
                            <button
                                type="button"
                                onClick={() => toggleTaskDone(note.id)}
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
                        {note.type === 'task' ? (note.done ? 'Task · Done' : 'Task · Open') : 'Simple note'}
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
                    {note.type === 'task' && (
                        <button
                            type="button"
                            onClick={() => toggleTaskDone(note.id)}
                            className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white/45 px-3 py-2 text-[10px] font-bold hover:bg-white/70 cursor-pointer"
                        >
                            <span
                                className="flex size-5 items-center justify-center rounded-md border"
                                style={{
                                    borderColor: color.text,
                                    backgroundColor: note.done ? color.dot : 'transparent',
                                }}
                            >
                                {note.done && <i className="ph ph-check text-[12px] text-white" />}
                            </span>
                            {note.done ? 'Completed' : 'Mark task as done'}
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
                    {note.type === 'task' && note.autoHideWhenTasksDone && (
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

export default function EndpointNotesModalLayer({spec}: {spec: OpenApiSpec | null}) {
    const {notes, modalStack, closeNotesModal, closeAllNotesModals} = useEndpointNotes();
    const top = modalStack[modalStack.length - 1];
    const note = top && 'noteId' in top ? notes.find(item => item.id === top.noteId) : undefined;
    useEffect(() => {
        if (top && 'noteId' in top && !note) closeNotesModal();
    }, [top, note, closeNotesModal]);
    if (!top || !spec) return null;
    if (top.kind === 'list')
        return <EndpointNotesList spec={spec} path={top.path} method={top.method} onClose={closeAllNotesModals} />;
    if (top.kind === 'create') return <NoteEditor path={top.path} method={top.method} onClose={closeNotesModal} />;
    if (top.kind === 'edit' && note)
        return <NoteEditor note={note} path={note.path} method={note.method} onClose={closeNotesModal} />;
    if (top.kind === 'detail' && note) return <NoteDetail note={note} spec={spec} onClose={closeNotesModal} />;
    return null;
}
