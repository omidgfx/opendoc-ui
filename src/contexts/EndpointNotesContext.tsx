import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import type {EndpointNote, EndpointNoteDraft, OpenApiSpec} from '../types';
import {
    classifyEndpointNotesBySpec,
    createEndpointNote,
    endpointHasNoteCapacity,
    endpointNoteKey,
    MAX_NOTE_CONTENT_CHARS,
    MAX_NOTE_TITLE_CHARS,
    noteCharacterCount,
    readEndpointNotes,
    readExpandedEndpointNoteIds,
    readHiddenEndpoints,
    readTrashedNotes,
    reassignEndpointNote,
    writeEndpointNotes,
    writeExpandedEndpointNoteIds,
    writeHiddenEndpoints,
    writeTrashedNotes,
} from '../utils/endpointNotes';

export type EndpointNotesModalTarget =
    | {kind: 'list'; path: string; method: string}
    | {kind: 'detail'; noteId: string}
    | {kind: 'create'; path?: string; method?: string}
    | {kind: 'edit'; noteId: string};

interface EndpointNotesContextValue {
    specKey: string;
    notes: EndpointNote[];
    activeNotes: EndpointNote[];
    orphanedNotes: EndpointNote[];
    trashedNotes: EndpointNote[];
    hiddenEndpointKeys: string[];
    modalStack: EndpointNotesModalTarget[];
    pendingTodoCompletionId: string | null;
    notesForEndpoint: (path: string, method: string) => EndpointNote[];
    noteCountForEndpoint: (path: string, method: string) => number;
    isEndpointHidden: (path: string, method: string) => boolean;
    canAddNote: (path: string, method: string) => boolean;
    addNote: (draft: EndpointNoteDraft) => EndpointNote | null;
    updateNote: (noteId: string, draft: EndpointNoteDraft) => void;
    deleteNote: (noteId: string) => Promise<void>;
    deleteEndpointNotes: (path: string, method: string) => Promise<void>;
    deleteAllNotes: () => Promise<void>;
    deleteOrphaned: (noteId: string) => void;
    reassignNote: (noteId: string, path: string, method: string) => void;
    restoreNote: (noteId: string) => void;
    deleteNotePermanently: (noteId: string) => void;
    emptyTrash: () => void;
    importNotes: (notes: EndpointNote[]) => {imported: number; skipped: number};
    requestToggleTodo: (noteId: string) => void;
    confirmTodoCompletion: (hideEndpoint: boolean) => void;
    cancelTodoCompletion: () => void;
    hideEndpoint: (path: string, method: string) => void;
    unhideEndpoint: (path: string, method: string) => void;
    unhideAllEndpoints: () => void;
    openEndpointNotes: (path: string, method: string) => void;
    openCreateNote: (path?: string, method?: string) => void;
    openNote: (noteId: string) => void;
    openEditNote: (noteId: string) => void;
    closeNotesModal: () => void;
    closeAllNotesModals: () => void;
}

const noop = () => undefined;
const asyncNoop = async () => undefined;
const EndpointNotesContext = createContext<EndpointNotesContextValue>({
    specKey: '',
    notes: [],
    activeNotes: [],
    orphanedNotes: [],
    trashedNotes: [],
    hiddenEndpointKeys: [],
    modalStack: [],
    pendingTodoCompletionId: null,
    notesForEndpoint: () => [],
    noteCountForEndpoint: () => 0,
    isEndpointHidden: () => false,
    canAddNote: () => true,
    addNote: draft => createEndpointNote(draft),
    updateNote: noop,
    deleteNote: asyncNoop,
    deleteEndpointNotes: asyncNoop,
    deleteAllNotes: asyncNoop,
    deleteOrphaned: noop,
    reassignNote: noop,
    restoreNote: noop,
    deleteNotePermanently: noop,
    emptyTrash: noop,
    importNotes: () => ({imported: 0, skipped: 0}),
    requestToggleTodo: noop,
    confirmTodoCompletion: noop,
    cancelTodoCompletion: noop,
    hideEndpoint: noop,
    unhideEndpoint: noop,
    unhideAllEndpoints: noop,
    openEndpointNotes: noop,
    openCreateNote: noop,
    openNote: noop,
    openEditNote: noop,
    closeNotesModal: noop,
    closeAllNotesModals: noop,
});

export function EndpointNotesProvider({
    specKey,
    spec,
    children,
}: {
    specKey: string;
    spec: OpenApiSpec | null;
    children: ReactNode;
}) {
    const [notes, setNotes] = useState<EndpointNote[]>(() => readEndpointNotes(specKey));
    const [trashedNotes, setTrashedNotes] = useState<EndpointNote[]>(() => readTrashedNotes(specKey));
    const [hiddenEndpointKeys, setHiddenEndpointKeys] = useState<string[]>(() => readHiddenEndpoints(specKey));
    const [modalStack, setModalStack] = useState<EndpointNotesModalTarget[]>([]);
    const [pendingTodoCompletionId, setPendingTodoCompletionId] = useState<string | null>(null);
    useEffect(() => {
        setNotes(readEndpointNotes(specKey));
        setTrashedNotes(readTrashedNotes(specKey));
        setHiddenEndpointKeys(readHiddenEndpoints(specKey));
        setModalStack([]);
        setPendingTodoCompletionId(null);
    }, [specKey]);
    const classified = useMemo(() => classifyEndpointNotesBySpec(spec, notes), [spec, notes]);
    const activeNotes = classified.matching;
    const orphanedNotes = classified.orphaned;
    const commitNotes = useCallback(
        (updater: (current: EndpointNote[]) => EndpointNote[]) => {
            setNotes(current => {
                const next = updater(current);
                writeEndpointNotes(specKey, next);
                const validNoteIds = new Set(next.map(note => note.id));
                const expandedNoteIds = readExpandedEndpointNoteIds(specKey);
                const cleanedExpandedNoteIds = expandedNoteIds.filter(noteId => validNoteIds.has(noteId));
                if (cleanedExpandedNoteIds.length !== expandedNoteIds.length)
                    writeExpandedEndpointNoteIds(specKey, cleanedExpandedNoteIds);
                return next;
            });
        },
        [specKey],
    );
    const commitTrashed = useCallback(
        (updater: (current: EndpointNote[]) => EndpointNote[]) => {
            setTrashedNotes(current => {
                const next = updater(current);
                writeTrashedNotes(specKey, next);
                return next;
            });
        },
        [specKey],
    );
    const commitHidden = useCallback(
        (updater: (current: string[]) => string[]) => {
            setHiddenEndpointKeys(current => {
                const next = Array.from(new Set(updater(current)));
                writeHiddenEndpoints(specKey, next);
                return next;
            });
        },
        [specKey],
    );
    const notesForEndpoint = useCallback(
        (path: string, method: string) => {
            const key = endpointNoteKey(path, method);
            return notes.filter(note => endpointNoteKey(note.path, note.method) === key);
        },
        [notes],
    );
    const noteCountForEndpoint = useCallback(
        (path: string, method: string) => notesForEndpoint(path, method).length,
        [notesForEndpoint],
    );
    const isEndpointHidden = useCallback(
        (path: string, method: string) => hiddenEndpointKeys.includes(endpointNoteKey(path, method)),
        [hiddenEndpointKeys],
    );
    const hideEndpoint = useCallback(
        (path: string, method: string) => commitHidden(current => [...current, endpointNoteKey(path, method)]),
        [commitHidden],
    );
    const unhideEndpoint = useCallback(
        (path: string, method: string) => {
            const key = endpointNoteKey(path, method);
            commitHidden(current => current.filter(item => item !== key));
        },
        [commitHidden],
    );
    const unhideAllEndpoints = useCallback(() => commitHidden(() => []), [commitHidden]);
    const canAddNote = useCallback(
        (path: string, method: string) => endpointHasNoteCapacity(notes, path, method),
        [notes],
    );
    const addNote = useCallback(
        (draft: EndpointNoteDraft) => {
            if (
                !draft.title.trim() ||
                noteCharacterCount(draft.title) > MAX_NOTE_TITLE_CHARS ||
                noteCharacterCount(draft.content) > MAX_NOTE_CONTENT_CHARS ||
                !canAddNote(draft.path, draft.method)
            )
                return null;
            const note = createEndpointNote(draft);
            commitNotes(current => [note, ...current]);
            return note;
        },
        [canAddNote, commitNotes],
    );
    const updateNote = useCallback(
        (noteId: string, draft: EndpointNoteDraft) => {
            commitNotes(current =>
                current.map(note =>
                    note.id === noteId
                        ? {
                              ...note,
                              ...draft,
                              method: draft.method.toLowerCase(),
                              title: draft.title.trim(),
                              content: draft.content.trim(),
                              done: draft.type === 'todo' ? note.done : false,
                              autoHideWhenTodosDone: draft.type === 'todo' ? draft.autoHideWhenTodosDone : false,
                              updatedAt: Date.now(),
                          }
                        : note,
                ),
            );
        },
        [commitNotes],
    );
    const trashNoteInto = useCallback(
        (note: EndpointNote) => {
            commitNotes(current => current.filter(item => item.id !== note.id));
            commitTrashed(current => (current.some(item => item.id === note.id) ? current : [note, ...current]));
        },
        [commitNotes, commitTrashed],
    );
    const deleteNote = useCallback(
        async (noteId: string) => {
            const note = notes.find(item => item.id === noteId);
            if (!note) return;
            if (orphanedNotes.some(item => item.id === noteId)) {
                commitNotes(current => current.filter(item => item.id !== noteId));
                return;
            }
            trashNoteInto(note);
        },
        [notes, orphanedNotes, trashNoteInto, commitNotes],
    );
    const deleteEndpointNotes = useCallback(
        async (path: string, method: string) => {
            const key = endpointNoteKey(path, method);
            const removed = notes.filter(note => endpointNoteKey(note.path, note.method) === key);
            commitNotes(current => current.filter(note => endpointNoteKey(note.path, note.method) !== key));
            removed.forEach(note =>
                commitTrashed(current => (current.some(item => item.id === note.id) ? current : [note, ...current])),
            );
        },
        [notes, commitNotes, commitTrashed],
    );
    const deleteAllNotes = useCallback(async () => {
        const removed = activeNotes;
        commitNotes(current => current.filter(note => !removed.some(item => item.id === note.id)));
        removed.forEach(note =>
            commitTrashed(current => (current.some(item => item.id === note.id) ? current : [note, ...current])),
        );
    }, [activeNotes, commitNotes, commitTrashed]);
    const deleteOrphaned = useCallback(
        (noteId: string) => commitNotes(current => current.filter(note => note.id !== noteId)),
        [commitNotes],
    );
    const reassignNote = useCallback(
        (noteId: string, path: string, method: string) => {
            commitNotes(current =>
                current.map(note => (note.id === noteId ? reassignEndpointNote(note, path, method) : note)),
            );
        },
        [commitNotes],
    );
    const restoreNote = useCallback(
        (noteId: string) => {
            const note = trashedNotes.find(item => item.id === noteId);
            if (!note) return;
            commitTrashed(current => current.filter(item => item.id !== noteId));
            commitNotes(current => (current.some(item => item.id === noteId) ? current : [note, ...current]));
        },
        [trashedNotes, commitTrashed, commitNotes],
    );
    const deleteNotePermanently = useCallback(
        (noteId: string) => commitTrashed(current => current.filter(note => note.id !== noteId)),
        [commitTrashed],
    );
    const emptyTrash = useCallback(() => commitTrashed(() => []), [commitTrashed]);
    const importNotes = useCallback(
        (incoming: EndpointNote[]) => {
            const existingIds = new Set([...notes.map(note => note.id), ...trashedNotes.map(note => note.id)]);
            const importedNotes: EndpointNote[] = [];
            let skipped = 0;
            incoming.forEach(note => {
                if (
                    existingIds.has(note.id) ||
                    !endpointHasNoteCapacity([...notes, ...importedNotes], note.path, note.method)
                ) {
                    skipped += 1;
                    return;
                }
                existingIds.add(note.id);
                importedNotes.push(note);
            });
            if (importedNotes.length > 0) commitNotes(current => [...importedNotes, ...current]);
            return {imported: importedNotes.length, skipped};
        },
        [notes, trashedNotes, commitNotes],
    );
    const completionWillAutoHide = useCallback(
        (noteId: string) => {
            const changed = notes.find(note => note.id === noteId);
            if (changed?.type !== 'todo' || changed.done || isEndpointHidden(changed.path, changed.method))
                return false;
            const todos = notes.filter(
                note =>
                    note.type === 'todo' &&
                    endpointNoteKey(note.path, note.method) === endpointNoteKey(changed.path, changed.method),
            );
            return (
                todos.length > 0 &&
                todos.every(note => note.id === noteId || note.done) &&
                todos.some(note => note.autoHideWhenTodosDone)
            );
        },
        [notes, isEndpointHidden],
    );
    const setTodoDone = useCallback(
        (noteId: string, done: boolean, hideWhenComplete: boolean) => {
            const changed = notes.find(note => note.id === noteId);
            if (changed?.type !== 'todo') return;
            commitNotes(current =>
                current.map(note => (note.id === noteId ? {...note, done, updatedAt: Date.now()} : note)),
            );
            if (done && hideWhenComplete) hideEndpoint(changed.path, changed.method);
        },
        [notes, commitNotes, hideEndpoint],
    );
    const requestToggleTodo = useCallback(
        (noteId: string) => {
            const note = notes.find(item => item.id === noteId);
            if (note?.type !== 'todo') return;
            if (note.done) {
                setTodoDone(noteId, false, false);
                return;
            }
            if (completionWillAutoHide(noteId)) setPendingTodoCompletionId(noteId);
            else setTodoDone(noteId, true, false);
        },
        [notes, completionWillAutoHide, setTodoDone],
    );
    const confirmTodoCompletion = useCallback(
        (hideEndpointOnCompletion: boolean) => {
            if (!pendingTodoCompletionId) return;
            setTodoDone(pendingTodoCompletionId, true, hideEndpointOnCompletion);
            setPendingTodoCompletionId(null);
        },
        [pendingTodoCompletionId, setTodoDone],
    );
    const cancelTodoCompletion = useCallback(() => setPendingTodoCompletionId(null), []);
    const openEndpointNotes = useCallback(
        (path: string, method: string) => setModalStack([{kind: 'list', path, method: method.toLowerCase()}]),
        [],
    );
    const openCreateNote = useCallback((path?: string, method?: string) => {
        setModalStack(current => {
            const target = {
                kind: 'create' as const,
                ...(path ? {path} : {}),
                ...(method ? {method: method.toLowerCase()} : {}),
            };
            const top = current[current.length - 1];
            return top?.kind === 'list' ? [...current, target] : [target];
        });
    }, []);
    const openNote = useCallback((noteId: string) => {
        setModalStack(current => {
            const target = {kind: 'detail' as const, noteId};
            return current.length > 0 ? [...current, target] : [target];
        });
    }, []);
    const openEditNote = useCallback(
        (noteId: string) => setModalStack(current => [...current, {kind: 'edit', noteId}]),
        [],
    );
    const closeNotesModal = useCallback(() => setModalStack(current => current.slice(0, -1)), []);
    const closeAllNotesModals = useCallback(() => setModalStack([]), []);
    const value = useMemo<EndpointNotesContextValue>(
        () => ({
            specKey,
            notes,
            activeNotes,
            orphanedNotes,
            trashedNotes,
            hiddenEndpointKeys,
            modalStack,
            pendingTodoCompletionId,
            notesForEndpoint,
            noteCountForEndpoint,
            isEndpointHidden,
            canAddNote,
            addNote,
            updateNote,
            deleteNote,
            deleteEndpointNotes,
            deleteAllNotes,
            deleteOrphaned,
            reassignNote,
            restoreNote,
            deleteNotePermanently,
            emptyTrash,
            importNotes,
            requestToggleTodo,
            confirmTodoCompletion,
            cancelTodoCompletion,
            hideEndpoint,
            unhideEndpoint,
            unhideAllEndpoints,
            openEndpointNotes,
            openCreateNote,
            openNote,
            openEditNote,
            closeNotesModal,
            closeAllNotesModals,
        }),
        [
            specKey,
            notes,
            activeNotes,
            orphanedNotes,
            trashedNotes,
            hiddenEndpointKeys,
            modalStack,
            pendingTodoCompletionId,
            notesForEndpoint,
            noteCountForEndpoint,
            isEndpointHidden,
            canAddNote,
            addNote,
            updateNote,
            deleteNote,
            deleteEndpointNotes,
            deleteAllNotes,
            deleteOrphaned,
            reassignNote,
            restoreNote,
            deleteNotePermanently,
            emptyTrash,
            importNotes,
            requestToggleTodo,
            confirmTodoCompletion,
            cancelTodoCompletion,
            hideEndpoint,
            unhideEndpoint,
            unhideAllEndpoints,
            openEndpointNotes,
            openCreateNote,
            openNote,
            openEditNote,
            closeNotesModal,
            closeAllNotesModals,
        ],
    );
    return <EndpointNotesContext.Provider value={value}>{children}</EndpointNotesContext.Provider>;
}

export const useEndpointNotes = () => useContext(EndpointNotesContext);
