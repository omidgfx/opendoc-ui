import {useMemo, useState} from 'react';
import type {OpenApiSpec} from '../../types';
import {getDocumentOperations, getOperation} from '../../utils/openapi';
import {endpointNoteColor, endpointNoteKey, endpointNoteTitle} from '../../utils/endpointNotes';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import CustomDropdown from '../../components/common/CustomDropdown';
import MethodBadge from '../../components/common/MethodBadge';
import Markdown from '../../components/common/Markdown';
import ConfirmModal from '../../components/common/ConfirmModal';
import {Tip} from '../../components/common/Tooltip';

interface EndpointNotesPageProps {
    spec: OpenApiSpec;
    onSelectEndpoint: (path: string, method: string) => void;
}

export default function EndpointNotesPage({spec, onSelectEndpoint}: EndpointNotesPageProps) {
    const {notes, openCreateNote, openNote, toggleTaskDone, deleteAllNotes, isEndpointHidden, unhideEndpoint} =
        useEndpointNotes();
    const operations = useMemo(() => getDocumentOperations(spec), [spec]);
    const operationOptions = useMemo(
        () =>
            operations.map(({path, method, operation}) => ({
                value: endpointNoteKey(path, method),
                label: `${method.toUpperCase()} · ${operation.summary || path}`,
                description: path,
            })),
        [operations],
    );
    const [selectedEndpointKey, setSelectedEndpointKey] = useState(operationOptions[0]?.value || '');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
    const filteredNotes = notes.filter(note => {
        if (filter === 'note' && note.type !== 'note') return false;
        if (filter === 'task' && note.type !== 'task') return false;
        if (filter === 'open' && (note.type !== 'task' || note.done)) return false;
        if (filter === 'done' && (note.type !== 'task' || !note.done)) return false;
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        const operation = getOperation(spec, note.path, note.method);
        return [note.title, note.content, note.path, note.method, operation?.summary || ''].some(value =>
            String(value).toLowerCase().includes(needle),
        );
    });
    const groups = useMemo(() => {
        const map = new Map<string, typeof notes>();
        filteredNotes.forEach(note => {
            const key = endpointNoteKey(note.path, note.method);
            map.set(key, [...(map.get(key) || []), note]);
        });
        return Array.from(map.entries()).sort(([, left], [, right]) => {
            const leftUpdated = Math.max(...left.map(note => note.updatedAt));
            const rightUpdated = Math.max(...right.map(note => note.updatedAt));
            return rightUpdated - leftUpdated;
        });
    }, [filteredNotes, notes]);
    const tasks = notes.filter(note => note.type === 'task');
    const openTasks = tasks.filter(note => !note.done).length;
    const selectedOperation = operations.find(
        operation => endpointNoteKey(operation.path, operation.method) === selectedEndpointKey,
    );
    return (
        <div className="flex-1 h-full overflow-y-auto p-3 sm:p-5 md:p-7 scrollbar-thin">
            <div className="mx-auto max-w-6xl space-y-4">
                <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                <i className="ph-fill ph-note-pencil text-[20px]" />
                            </span>
                            <div>
                                <h1 className="text-xl font-extrabold text-[var(--text-heading)]">Local Notes</h1>
                                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                    Private Markdown notes and tasks stored only in this browser.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <CustomDropdown
                            value={selectedEndpointKey}
                            onChange={setSelectedEndpointKey}
                            options={operationOptions}
                            ariaLabel="Choose endpoint for a new note"
                            placeholder="Choose endpoint"
                            className="min-w-0 sm:w-80"
                        />
                        <button
                            type="button"
                            disabled={!selectedOperation}
                            aria-label="New note"
                            onClick={() =>
                                selectedOperation && openCreateNote(selectedOperation.path, selectedOperation.method)
                            }
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[10px] font-bold text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                            <i className="ph ph-plus text-[13px]" />
                            New note
                        </button>
                    </div>
                </header>

                <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                        ['All notes', notes.length, 'ph-note-pencil', 'var(--primary)'],
                        ['Simple notes', notes.length - tasks.length, 'ph-note', 'var(--accent)'],
                        ['Tasks', tasks.length, 'ph-check-square', 'var(--method-put)'],
                        ['Open tasks', openTasks, 'ph-circle-dashed', 'var(--method-delete)'],
                    ].map(([label, value, icon, color]) => (
                        <div
                            key={String(label)}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                    {label}
                                </span>
                                <i className={`ph ${icon} text-[14px]`} style={{color: String(color)}} />
                            </div>
                            <strong className="mt-1 block text-xl text-[var(--text-heading)]">{value}</strong>
                        </div>
                    ))}
                </section>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-xs text-[var(--text-muted)]" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search notes, tasks, endpoints…"
                            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                        />
                    </div>
                    <CustomDropdown
                        value={filter}
                        onChange={setFilter}
                        ariaLabel="Filter local notes"
                        options={[
                            {value: 'all', label: 'All notes'},
                            {value: 'note', label: 'Simple notes'},
                            {value: 'task', label: 'All tasks'},
                            {value: 'open', label: 'Open tasks'},
                            {value: 'done', label: 'Completed tasks'},
                        ]}
                        className="w-full sm:w-48"
                    />
                    {notes.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setConfirmDeleteAll(true)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                        >
                            <i className="ph ph-trash text-[12px]" />
                            Delete all
                        </button>
                    )}
                </div>

                {groups.length > 0 ? (
                    <div className="space-y-4">
                        {groups.map(([key, endpointNotes]) => {
                            const first = endpointNotes[0];
                            const operation = getOperation(spec, first.path, first.method);
                            const hidden = isEndpointHidden(first.path, first.method);
                            return (
                                <section
                                    key={key}
                                    className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
                                >
                                    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                                        <MethodBadge method={first.method} size="xs" />
                                        <div className="min-w-0 flex-1">
                                            <h2 className="truncate text-xs font-extrabold text-[var(--text-heading)]">
                                                {operation?.summary || 'Unavailable endpoint'}
                                            </h2>
                                            <code className="mt-0.5 block truncate text-[9px] text-[var(--text-muted)]">
                                                {first.path}
                                            </code>
                                        </div>
                                        {hidden && (
                                            <span className="rounded-full bg-[var(--text-muted)]/10 px-2 py-1 text-[8px] font-bold text-[var(--text-muted)]">
                                                Hidden
                                            </span>
                                        )}
                                        <span className="rounded-full bg-[var(--primary)]/10 px-2 py-1 text-[8px] font-bold text-[var(--primary)]">
                                            {endpointNotes.length}
                                        </span>
                                        {hidden && (
                                            <Tip content="Return endpoint to its tag folder">
                                                <button
                                                    type="button"
                                                    onClick={() => unhideEndpoint(first.path, first.method)}
                                                    aria-label="Unhide endpoint"
                                                    className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                                                >
                                                    <i className="ph ph-eye text-[14px]" />
                                                </button>
                                            </Tip>
                                        )}
                                        <Tip content="Create another note">
                                            <button
                                                type="button"
                                                onClick={() => openCreateNote(first.path, first.method)}
                                                aria-label="Create note for endpoint"
                                                className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                                            >
                                                <i className="ph ph-plus text-[14px]" />
                                            </button>
                                        </Tip>
                                        <button
                                            type="button"
                                            disabled={!operation}
                                            onClick={() => onSelectEndpoint(first.path, first.method)}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[9px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                                        >
                                            Open endpoint
                                            <i className="ph ph-arrow-right" />
                                        </button>
                                    </header>
                                    <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
                                        {endpointNotes.map(note => {
                                            const color = endpointNoteColor(note.color);
                                            return (
                                                <article
                                                    key={note.id}
                                                    className="rounded-xl border p-3"
                                                    style={{
                                                        backgroundColor: color.background,
                                                        borderColor: color.border,
                                                        color: color.text,
                                                    }}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        {note.type === 'task' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleTaskDone(note.id)}
                                                                aria-label={
                                                                    note.done
                                                                        ? 'Mark task as not done'
                                                                        : 'Mark task as done'
                                                                }
                                                                aria-pressed={note.done}
                                                                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border cursor-pointer"
                                                                style={{
                                                                    borderColor: color.text,
                                                                    backgroundColor: note.done
                                                                        ? color.dot
                                                                        : 'rgba(255,255,255,.5)',
                                                                }}
                                                            >
                                                                {note.done && (
                                                                    <i className="ph ph-check text-[12px] text-white" />
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <span
                                                                className="mt-1 size-2 shrink-0 rounded-full"
                                                                style={{backgroundColor: color.dot}}
                                                            />
                                                        )}
                                                        <div className="min-w-0 flex-1 text-left">
                                                            <button
                                                                type="button"
                                                                onClick={() => openNote(note.id)}
                                                                className={`max-w-full truncate text-left text-xs font-extrabold ${note.done ? 'line-through opacity-60' : ''} cursor-pointer`}
                                                            >
                                                                {endpointNoteTitle(note)}
                                                            </button>
                                                            <div
                                                                className={`mt-1 line-clamp-4 text-[10px] leading-relaxed ${note.done ? 'opacity-55' : 'opacity-80'}`}
                                                            >
                                                                <Markdown
                                                                    text={note.content}
                                                                    className="markdown-body-simple !text-[10px] !text-inherit"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
                        <i className="ph ph-note-blank text-4xl text-[var(--text-muted)]/40" />
                        <h2 className="mt-3 text-sm font-extrabold text-[var(--text-heading)]">
                            {notes.length === 0 ? 'No local notes yet' : 'No notes match these filters'}
                        </h2>
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                            {notes.length === 0
                                ? 'Choose an endpoint above or use an endpoint context menu to create one.'
                                : 'Try another search or filter.'}
                        </p>
                    </div>
                )}
            </div>
            <ConfirmModal
                isOpen={confirmDeleteAll}
                title="Delete every local note?"
                message={`Delete all ${notes.length} notes and tasks saved for this specification?`}
                confirmLabel="Delete all notes"
                destructive
                onConfirm={async () => {
                    await deleteAllNotes();
                    setConfirmDeleteAll(false);
                }}
                onClose={() => setConfirmDeleteAll(false)}
            />
        </div>
    );
}
