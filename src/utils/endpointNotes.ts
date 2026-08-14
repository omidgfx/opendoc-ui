import type {EndpointNote, EndpointNoteColor, EndpointNoteDraft} from '../types';
import {specStorage} from './storage';

export const ENDPOINT_NOTES_STORAGE_NAME = 'endpoint_notes';
export const HIDDEN_ENDPOINTS_STORAGE_NAME = 'hidden_endpoints';
export const ENDPOINT_NOTE_PANEL_EXPANDED_STORAGE_NAME = 'endpoint_note_panel_expanded';
export const MAX_NOTES_PER_ENDPOINT = 100;
export const MAX_NOTE_TITLE_CHARS = 128;
export const MAX_NOTE_CONTENT_CHARS = 4096;

export interface EndpointNoteColorOption {
    id: EndpointNoteColor;
    label: string;
    tone: string;
    background: string;
    border: string;
    text: string;
    dot: string;
}

const noteColor = (id: EndpointNoteColor, label: string, tone: string): EndpointNoteColorOption => ({
    id,
    label,
    tone,
    background: `color-mix(in srgb, ${tone} 18%, transparent)`,
    border: `color-mix(in srgb, ${tone} 48%, var(--border))`,
    text: 'var(--text-heading)',
    dot: tone,
});

export const ENDPOINT_NOTE_COLORS: EndpointNoteColorOption[] = [
    noteColor('butter', 'Butter', '#f59e0b'),
    noteColor('apricot', 'Apricot', '#f97316'),
    noteColor('rose', 'Rose', '#ef4444'),
    noteColor('blush', 'Blush', '#ec4899'),
    noteColor('lilac', 'Lilac', '#d946ef'),
    noteColor('violet', 'Violet', '#8b5cf6'),
    noteColor('blue', 'Blue', '#3b82f6'),
    noteColor('sky', 'Sky', '#0ea5e9'),
    noteColor('mint', 'Mint', '#10b981'),
    noteColor('lime', 'Lime', '#84cc16'),
    noteColor('sand', 'Sand', '#eab308'),
    noteColor('slate', 'Slate', '#64748b'),
    noteColor('white', 'White', '#ffffff'),
    noteColor('black', 'Black', '#000000'),
];

const COLOR_IDS = new Set(ENDPOINT_NOTE_COLORS.map(color => color.id));
const storedNoteType = (value: unknown): value is EndpointNote['type'] | 'task' =>
    value === 'note' || value === 'todo' || value === 'task';
const validStoredNote = (value: any): boolean =>
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.path === 'string' &&
    typeof value.method === 'string' &&
    storedNoteType(value.type) &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    COLOR_IDS.has(value.color) &&
    typeof value.done === 'boolean' &&
    (typeof value.autoHideWhenTodosDone === 'boolean' || typeof value.autoHideWhenTasksDone === 'boolean') &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt);

export const noteCharacterCount = (value: string): number => Array.from(value).length;

export const endpointNoteKey = (path: string, method: string): string => `${method.toLowerCase()}:${path}`;

export const endpointHasNoteCapacity = (
    notes: Array<Pick<EndpointNote, 'path' | 'method'>>,
    path: string,
    method: string,
): boolean => {
    const key = endpointNoteKey(path, method);
    return notes.filter(note => endpointNoteKey(note.path, note.method) === key).length < MAX_NOTES_PER_ENDPOINT;
};

export const normalizeStoredEndpointNote = (value: any): EndpointNote => {
    const {autoHideWhenTasksDone, ...current} = value;
    return {
        ...current,
        type: value.type === 'task' ? 'todo' : value.type,
        autoHideWhenTodosDone: Boolean(value.autoHideWhenTodosDone ?? autoHideWhenTasksDone),
    } as EndpointNote;
};

export const readEndpointNotes = (specKey: string): EndpointNote[] => {
    if (!specKey) return [];
    const stored = specStorage.getJSON<any[]>(
        specKey,
        ENDPOINT_NOTES_STORAGE_NAME,
        [],
        value => Array.isArray(value) && value.every(validStoredNote),
    );
    const migrated = stored.some(value => value.type === 'task' || value.autoHideWhenTodosDone === undefined);
    const notes = stored.map(normalizeStoredEndpointNote);
    if (migrated) writeEndpointNotes(specKey, notes);
    return notes;
};

export const writeEndpointNotes = (specKey: string, notes: EndpointNote[]): boolean =>
    !!specKey && specStorage.setJSON(specKey, ENDPOINT_NOTES_STORAGE_NAME, notes);

export const readHiddenEndpoints = (specKey: string): string[] => {
    if (!specKey) return [];
    return specStorage.getJSON<string[]>(
        specKey,
        HIDDEN_ENDPOINTS_STORAGE_NAME,
        [],
        value => Array.isArray(value) && value.every(item => typeof item === 'string'),
    );
};

export const writeHiddenEndpoints = (specKey: string, endpointKeys: string[]): boolean =>
    !!specKey && specStorage.setJSON(specKey, HIDDEN_ENDPOINTS_STORAGE_NAME, Array.from(new Set(endpointKeys)).sort());

export const readExpandedEndpointNoteIds = (specKey: string): string[] => {
    if (!specKey) return [];
    return specStorage.getJSON<string[]>(
        specKey,
        ENDPOINT_NOTE_PANEL_EXPANDED_STORAGE_NAME,
        [],
        value => Array.isArray(value) && value.every(item => typeof item === 'string'),
    );
};

export const writeExpandedEndpointNoteIds = (specKey: string, noteIds: string[]): boolean =>
    !!specKey &&
    specStorage.setJSON(specKey, ENDPOINT_NOTE_PANEL_EXPANDED_STORAGE_NAME, Array.from(new Set(noteIds)).sort());

export const endpointNoteColor = (id: EndpointNoteColor): EndpointNoteColorOption =>
    ENDPOINT_NOTE_COLORS.find(color => color.id === id) || ENDPOINT_NOTE_COLORS[0];

export const endpointNoteTitle = (note: Pick<EndpointNote, 'title' | 'content' | 'type'>): string => {
    if (note.title.trim()) return note.title.trim();
    const firstLine = note.content
        .replace(/[#>*_`~\[\]]/g, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean);
    return firstLine?.slice(0, 72) || (note.type === 'todo' ? 'Untitled todo' : 'Untitled note');
};

export const createEndpointNote = (draft: EndpointNoteDraft): EndpointNote => {
    const now = Date.now();
    return {
        ...draft,
        id:
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${now}-${Math.random().toString(36).slice(2)}`,
        method: draft.method.toLowerCase(),
        title: draft.title.trim(),
        content: draft.content.trim(),
        done: false,
        createdAt: now,
        updatedAt: now,
    };
};
