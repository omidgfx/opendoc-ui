import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import type {EndpointNote, EndpointNoteDraft} from '../types';
import {
    createEndpointNote,
    endpointNoteKey,
    readEndpointNotes,
    readHiddenEndpoints,
    writeEndpointNotes,
    writeHiddenEndpoints,
} from '../utils/endpointNotes';

export type EndpointNotesModalTarget =
    | {kind: 'list'; path: string; method: string}
    | {kind: 'detail'; noteId: string}
    | {kind: 'create'; path: string; method: string}
    | {kind: 'edit'; noteId: string};

interface EndpointNotesContextValue {
    specKey: string;
    notes: EndpointNote[];
    hiddenEndpointKeys: string[];
    modalStack: EndpointNotesModalTarget[];
    notesForEndpoint: (path: string, method: string) => EndpointNote[];
    noteCountForEndpoint: (path: string, method: string) => number;
    isEndpointHidden: (path: string, method: string) => boolean;
    addNote: (draft: EndpointNoteDraft) => EndpointNote;
    updateNote: (noteId: string, draft: EndpointNoteDraft) => void;
    deleteNote: (noteId: string) => Promise<void>;
    deleteEndpointNotes: (path: string, method: string) => Promise<void>;
    deleteAllNotes: () => Promise<void>;
    toggleTaskDone: (noteId: string) => void;
    hideEndpoint: (path: string, method: string) => void;
    unhideEndpoint: (path: string, method: string) => void;
    unhideAllEndpoints: () => void;
    openEndpointNotes: (path: string, method: string) => void;
    openCreateNote: (path: string, method: string) => void;
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
    hiddenEndpointKeys: [],
    modalStack: [],
    notesForEndpoint: () => [],
    noteCountForEndpoint: () => 0,
    isEndpointHidden: () => false,
    addNote: draft => createEndpointNote(draft),
    updateNote: noop,
    deleteNote: asyncNoop,
    deleteEndpointNotes: asyncNoop,
    deleteAllNotes: asyncNoop,
    toggleTaskDone: noop,
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

export function EndpointNotesProvider({specKey, children}: {specKey: string; children: ReactNode}) {
    const [notes, setNotes] = useState<EndpointNote[]>(() => readEndpointNotes(specKey));
    const [hiddenEndpointKeys, setHiddenEndpointKeys] = useState<string[]>(() => readHiddenEndpoints(specKey));
    const [modalStack, setModalStack] = useState<EndpointNotesModalTarget[]>([]);
    useEffect(() => {
        setNotes(readEndpointNotes(specKey));
        setHiddenEndpointKeys(readHiddenEndpoints(specKey));
        setModalStack([]);
    }, [specKey]);
    const commitNotes = useCallback(
        (updater: (current: EndpointNote[]) => EndpointNote[]) => {
            setNotes(current => {
                const next = updater(current);
                writeEndpointNotes(specKey, next);
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
    const addNote = useCallback(
        (draft: EndpointNoteDraft) => {
            const note = createEndpointNote(draft);
            commitNotes(current => [note, ...current]);
            return note;
        },
        [commitNotes],
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
                              done: draft.type === 'task' ? note.done : false,
                              autoHideWhenTasksDone: draft.type === 'task' ? draft.autoHideWhenTasksDone : false,
                              updatedAt: Date.now(),
                          }
                        : note,
                ),
            );
        },
        [commitNotes],
    );
    const deleteNote = useCallback(
        async (noteId: string) => commitNotes(current => current.filter(note => note.id !== noteId)),
        [commitNotes],
    );
    const deleteEndpointNotes = useCallback(
        async (path: string, method: string) => {
            const key = endpointNoteKey(path, method);
            commitNotes(current => current.filter(note => endpointNoteKey(note.path, note.method) !== key));
        },
        [commitNotes],
    );
    const deleteAllNotes = useCallback(async () => commitNotes(() => []), [commitNotes]);
    const toggleTaskDone = useCallback(
        (noteId: string) => {
            const next = notes.map(note =>
                note.id === noteId && note.type === 'task' ? {...note, done: !note.done, updatedAt: Date.now()} : note,
            );
            commitNotes(() => next);
            const changed = next.find(note => note.id === noteId);
            if (changed?.type !== 'task' || !changed.done) return;
            const tasks = next.filter(
                note =>
                    note.type === 'task' &&
                    endpointNoteKey(note.path, note.method) === endpointNoteKey(changed.path, changed.method),
            );
            if (tasks.length > 0 && tasks.every(note => note.done) && tasks.some(note => note.autoHideWhenTasksDone))
                hideEndpoint(changed.path, changed.method);
        },
        [notes, commitNotes, hideEndpoint],
    );
    const openEndpointNotes = useCallback(
        (path: string, method: string) => setModalStack([{kind: 'list', path, method: method.toLowerCase()}]),
        [],
    );
    const openCreateNote = useCallback((path: string, method: string) => {
        setModalStack(current => {
            const target = {kind: 'create' as const, path, method: method.toLowerCase()};
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
            hiddenEndpointKeys,
            modalStack,
            notesForEndpoint,
            noteCountForEndpoint,
            isEndpointHidden,
            addNote,
            updateNote,
            deleteNote,
            deleteEndpointNotes,
            deleteAllNotes,
            toggleTaskDone,
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
            hiddenEndpointKeys,
            modalStack,
            notesForEndpoint,
            noteCountForEndpoint,
            isEndpointHidden,
            addNote,
            updateNote,
            deleteNote,
            deleteEndpointNotes,
            deleteAllNotes,
            toggleTaskDone,
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
