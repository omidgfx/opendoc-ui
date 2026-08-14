import {useMemo, useRef, useState} from 'react';
import type {EndpointNote, OpenApiSpec} from '../../types';
import {getOperation} from '../../utils/openapi';
import {
    buildEndpointNotesExport,
    classifyEndpointNotesBySpec,
    endpointNoteColor,
    endpointNoteKey,
    endpointNoteTitle,
    type EndpointNotesExportFile,
    parseEndpointNotesExport,
} from '../../utils/endpointNotes';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import CustomDropdown from '../../components/common/CustomDropdown';
import MethodBadge from '../../components/common/MethodBadge';
import Markdown from '../../components/common/Markdown';
import ConfirmModal from '../../components/common/ConfirmModal';
import NotesImportModal from '../../components/notes/NotesImportModal';
import OrphanedNotesModal from '../../components/notes/OrphanedNotesModal';
import TrashNotesModal from '../../components/notes/TrashNotesModal';
import {Tip} from '../../components/common/Tooltip';

interface EndpointNotesPageProps {
    spec: OpenApiSpec;
    onSelectEndpoint: (path: string, method: string) => void;
}

export default function EndpointNotesPage({spec, onSelectEndpoint}: EndpointNotesPageProps) {
    const {
        specKey,
        notes,
        trashedNotes,
        openCreateNote,
        openNote,
        requestToggleTodo,
        deleteAllNotes,
        deleteOrphaned,
        reassignNote,
        restoreNote,
        deleteNotePermanently,
        emptyTrash,
        importNotes,
        isEndpointHidden,
        unhideEndpoint,
    } = useEndpointNotes();
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
    const [confirmExportOrphans, setConfirmExportOrphans] = useState<EndpointNote[] | null>(null);
    const [showTrashModal, setShowTrashModal] = useState(false);
    const [showOrphanedModal, setShowOrphanedModal] = useState(false);
    const [pendingImport, setPendingImport] = useState<{
        file: EndpointNotesExportFile;
        matching: EndpointNote[];
        orphaned: EndpointNote[];
        duplicates: number;
    } | null>(null);
    const [importError, setImportError] = useState('');
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const classifiedNotes = useMemo(() => classifyEndpointNotesBySpec(spec, notes), [spec, notes]);
    const orphanedNotes = classifiedNotes.orphaned;
    const filteredNotes = notes.filter(note => {
        if (!getOperation(spec, note.path, note.method)) return false;
        if (filter === 'note' && note.type !== 'note') return false;
        if (filter === 'todo' && note.type !== 'todo') return false;
        if (filter === 'open' && (note.type !== 'todo' || note.done)) return false;
        if (filter === 'done' && (note.type !== 'todo' || !note.done)) return false;
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
    const todos = notes.filter(note => note.type === 'todo');
    const openTodos = todos.filter(note => !note.done).length;
    const downloadNotesExport = () => {
        const {orphaned} = classifyEndpointNotesBySpec(spec, notes);
        const orphanedNoteIds = orphaned.map(note => note.id);
        const exported = buildEndpointNotesExport({
            specKey,
            specTitle: spec.info?.title || 'OpenDoc UI',
            notes,
            orphanedNoteIds,
        });
        const blob = new Blob([exported], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const slug =
            String(spec.info?.title || 'specification')
                .replace(/[^a-z0-9_-]+/gi, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 48) || 'specification';
        anchor.href = url;
        anchor.download = `opendoc-notes-${slug}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };
    const handleExportNotes = () => {
        const {orphaned} = classifyEndpointNotesBySpec(spec, notes);
        if (orphaned.length > 0) setConfirmExportOrphans(orphaned);
        else downloadNotesExport();
    };
    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        event.target.value = '';
        setImportError('');
        if (!file) return;
        const parsed = parseEndpointNotesExport(await file.text());
        if (!parsed) {
            setImportError('This file is not a valid OpenDoc notes export.');
            return;
        }
        if (parsed.notes.length === 0) {
            setImportError('No valid notes found in the export file.');
            return;
        }
        const existingIds = new Set(notes.map(note => note.id));
        const duplicates = parsed.notes.filter(note => existingIds.has(note.id)).length;
        const {matching, orphaned} = classifyEndpointNotesBySpec(spec, parsed.notes);
        setPendingImport({file: parsed, matching, orphaned, duplicates});
    };
    return (
        <div className="flex-1 h-full overflow-y-auto p-3 sm:p-5 md:p-7 scrollbar-thin">
            <div className="mx-auto max-w-6xl space-y-4">
                <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
                    <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#f59e0b]/10 text-[#f59e0b]">
                                <i className="ph-fill ph-note text-[21px]" />
                            </span>
                            <div>
                                <h1 className="text-xl font-extrabold text-[var(--text-heading)]">Local Notes</h1>
                                <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-[var(--text-muted)]">
                                    Private Markdown notes and todos, organized by endpoint and stored only in this
                                    browser.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Tip content="Export all local notes as JSON">
                                <button
                                    type="button"
                                    aria-label="Export local notes"
                                    disabled={notes.length === 0}
                                    onClick={handleExportNotes}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 text-xs font-bold text-[var(--text-heading)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                                >
                                    <i className="ph ph-download-simple text-[15px]" />
                                    Export
                                </button>
                            </Tip>
                            <Tip content="Import local notes from a JSON export">
                                <button
                                    type="button"
                                    aria-label="Import local notes"
                                    onClick={() => importInputRef.current?.click()}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 text-xs font-bold text-[var(--text-heading)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                >
                                    <i className="ph ph-upload-simple text-[15px]" />
                                    Import
                                </button>
                            </Tip>
                            <button
                                type="button"
                                aria-label="New note"
                                onClick={() => openCreateNote()}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-xs font-bold text-[var(--primary-contrast)] transition-colors hover:brightness-110 cursor-pointer"
                            >
                                <i className="ph-fill ph-note text-[15px]" />
                                New note
                            </button>
                        </div>
                    </div>
                    <i className="ph-fill ph-note pointer-events-none absolute -bottom-10 right-4 text-[150px] text-[#f59e0b] opacity-[0.045]" />
                </header>

                <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                        ['All notes', notes.length, 'ph-fill ph-note', '#f59e0b'],
                        ['Simple notes', notes.length - todos.length, 'ph-fill ph-note', '#f59e0b'],
                        ['Todos', todos.length, 'ph-fill ph-check-square', 'var(--method-put)'],
                        ['Open todos', openTodos, 'ph ph-circle-dashed', 'var(--method-delete)'],
                    ].map(([label, value, icon, color]) => (
                        <div
                            key={String(label)}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                    {label}
                                </span>
                                <i className={`${icon} text-[14px]`} style={{color: String(color)}} />
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
                            placeholder="Search notes, todos, endpoints…"
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
                            {value: 'todo', label: 'All todos'},
                            {value: 'open', label: 'Open todos'},
                            {value: 'done', label: 'Completed todos'},
                        ]}
                        className="w-full sm:w-48"
                    />
                    <button
                        type="button"
                        aria-label="Open orphaned notes"
                        onClick={() => setShowOrphanedModal(true)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-bold text-[var(--method-put)] hover:bg-[var(--method-put)]/10 cursor-pointer"
                    >
                        <i className="ph ph-broken-heart text-[12px]" />
                        Orphaned{orphanedNotes.length > 0 ? ` (${orphanedNotes.length})` : ''}
                    </button>
                    <button
                        type="button"
                        aria-label="Open trash"
                        onClick={() => setShowTrashModal(true)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                        <i className="ph ph-trash text-[12px]" />
                        Trash{trashedNotes.length > 0 ? ` (${trashedNotes.length})` : ''}
                    </button>
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
                                                    tabIndex={0}
                                                    aria-label={`Open ${endpointNoteTitle(note)}`}
                                                    onClick={event => {
                                                        if (
                                                            (event.target as HTMLElement).closest(
                                                                'button, a, input, textarea',
                                                            )
                                                        )
                                                            return;
                                                        openNote(note.id);
                                                    }}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            openNote(note.id);
                                                        }
                                                    }}
                                                    className="relative overflow-hidden rounded-lg border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 cursor-pointer"
                                                    style={{
                                                        backgroundColor: color.background,
                                                        borderColor: color.border,
                                                        color: color.text,
                                                    }}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        data-note-corner-tone
                                                        className="pointer-events-none absolute -right-8 -top-8 size-16 rounded-full opacity-10"
                                                        style={{backgroundColor: color.tone}}
                                                    />
                                                    <div className="relative z-10 text-left">
                                                        <div className="flex min-h-5 items-center gap-2">
                                                            {note.type === 'todo' ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => requestToggleTodo(note.id)}
                                                                    aria-label={
                                                                        note.done
                                                                            ? 'Mark todo as not done'
                                                                            : 'Mark todo as done'
                                                                    }
                                                                    aria-pressed={note.done}
                                                                    className="flex size-5 shrink-0 items-center justify-center rounded-full border cursor-pointer"
                                                                    style={{
                                                                        borderColor: color.text,
                                                                        backgroundColor: note.done
                                                                            ? color.dot
                                                                            : 'color-mix(in srgb, var(--surface) 82%, transparent)',
                                                                    }}
                                                                >
                                                                    {note.done && (
                                                                        <i className="ph ph-check text-[12px] text-white" />
                                                                    )}
                                                                </button>
                                                            ) : (
                                                                <span
                                                                    data-note-title-marker
                                                                    className="size-2 shrink-0 rounded-full"
                                                                    style={{backgroundColor: color.dot}}
                                                                />
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => openNote(note.id)}
                                                                className={`min-w-0 flex-1 truncate text-left text-xs font-extrabold leading-5 ${note.done ? 'line-through opacity-60' : ''} cursor-pointer`}
                                                            >
                                                                {endpointNoteTitle(note)}
                                                            </button>
                                                        </div>
                                                        <div
                                                            className={`mt-1 line-clamp-4 text-[10px] leading-relaxed ${
                                                                note.type === 'todo' ? 'ps-7' : 'ps-4'
                                                            } ${note.done ? 'opacity-55' : 'opacity-80'}`}
                                                        >
                                                            <Markdown
                                                                text={note.content}
                                                                className="markdown-body-simple !text-[10px] !text-inherit"
                                                            />
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
                        <i className="ph-fill ph-note text-4xl text-[#f59e0b]/45" />
                        <h2 className="mt-3 text-sm font-extrabold text-[var(--text-heading)]">
                            {notes.length === 0 ? 'No local notes yet' : 'No notes match these filters'}
                        </h2>
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                            {notes.length === 0
                                ? 'Use New note or an endpoint context menu to create one.'
                                : 'Try another search or filter.'}
                        </p>
                    </div>
                )}
            </div>
            {importError && (
                <div className="mx-auto flex max-w-6xl items-start justify-between gap-3 rounded-xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 px-4 py-3">
                    <p className="text-[11px] leading-relaxed text-[var(--method-delete)]">{importError}</p>
                    <button
                        type="button"
                        aria-label="Dismiss import error"
                        onClick={() => setImportError('')}
                        className="shrink-0 rounded p-1 text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                    >
                        <i className="ph ph-x text-[13px]" />
                    </button>
                </div>
            )}
            <ConfirmModal
                isOpen={confirmDeleteAll}
                title="Move every local note to trash?"
                message={`All ${notes.length} notes and todos saved for this specification will be moved to the trash. You can restore them from the Trash modal.`}
                confirmLabel="Move to trash"
                destructive
                onConfirm={async () => {
                    await deleteAllNotes();
                    setConfirmDeleteAll(false);
                }}
                onClose={() => setConfirmDeleteAll(false)}
            />
            <ConfirmModal
                isOpen={confirmExportOrphans !== null}
                title="Export orphaned notes?"
                message={
                    confirmExportOrphans
                        ? `${confirmExportOrphans.length} ${confirmExportOrphans.length === 1 ? 'note belongs' : 'notes belong'} to endpoints that no longer exist in this specification. They stay in the export file and are marked as orphaned.`
                        : ''
                }
                confirmLabel="Export anyway"
                onConfirm={async () => {
                    downloadNotesExport();
                    setConfirmExportOrphans(null);
                }}
                onClose={() => setConfirmExportOrphans(null)}
            />
            <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={event => void handleImportFile(event)}
            />
            {pendingImport && (
                <NotesImportModal
                    file={pendingImport.file}
                    matching={pendingImport.matching}
                    orphaned={pendingImport.orphaned}
                    duplicates={pendingImport.duplicates}
                    currentSpecKey={specKey}
                    onImport={incoming => {
                        const outcome = importNotes(incoming);
                        if (outcome.imported === 0 && outcome.skipped === 0) setPendingImport(null);
                        return outcome;
                    }}
                    onClose={() => setPendingImport(null)}
                />
            )}
            {showOrphanedModal && (
                <OrphanedNotesModal
                    spec={spec}
                    specKey={specKey}
                    notes={orphanedNotes}
                    onReassign={reassignNote}
                    onDeleteForever={deleteOrphaned}
                    onClose={() => setShowOrphanedModal(false)}
                />
            )}
            {showTrashModal && (
                <TrashNotesModal
                    notes={trashedNotes}
                    onRestore={restoreNote}
                    onDeleteForever={deleteNotePermanently}
                    onEmptyTrash={emptyTrash}
                    onClose={() => setShowTrashModal(false)}
                />
            )}
        </div>
    );
}
