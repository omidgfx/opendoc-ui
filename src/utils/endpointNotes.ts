import type {EndpointNote, EndpointNoteColor, EndpointNoteDraft} from '../types';
import {specStorage} from './storage';

export const ENDPOINT_NOTES_STORAGE_NAME = 'endpoint_notes';
export const HIDDEN_ENDPOINTS_STORAGE_NAME = 'hidden_endpoints';

export interface EndpointNoteColorOption {
    id: EndpointNoteColor;
    label: string;
    background: string;
    border: string;
    text: string;
    dot: string;
}

export const ENDPOINT_NOTE_COLORS: EndpointNoteColorOption[] = [
    {id: 'butter', label: 'Butter', background: '#fef3c7', border: '#fcd34d', text: '#78350f', dot: '#f59e0b'},
    {id: 'apricot', label: 'Apricot', background: '#ffedd5', border: '#fdba74', text: '#7c2d12', dot: '#f97316'},
    {id: 'rose', label: 'Rose', background: '#fee2e2', border: '#fca5a5', text: '#7f1d1d', dot: '#ef4444'},
    {id: 'blush', label: 'Blush', background: '#fce7f3', border: '#f9a8d4', text: '#831843', dot: '#ec4899'},
    {id: 'lilac', label: 'Lilac', background: '#f3e8ff', border: '#d8b4fe', text: '#581c87', dot: '#a855f7'},
    {id: 'violet', label: 'Violet', background: '#ede9fe', border: '#c4b5fd', text: '#4c1d95', dot: '#8b5cf6'},
    {id: 'blue', label: 'Blue', background: '#dbeafe', border: '#93c5fd', text: '#1e3a8a', dot: '#3b82f6'},
    {id: 'sky', label: 'Sky', background: '#e0f2fe', border: '#7dd3fc', text: '#0c4a6e', dot: '#0ea5e9'},
    {id: 'mint', label: 'Mint', background: '#d1fae5', border: '#6ee7b7', text: '#064e3b', dot: '#10b981'},
    {id: 'lime', label: 'Lime', background: '#ecfccb', border: '#bef264', text: '#365314', dot: '#84cc16'},
    {id: 'sand', label: 'Sand', background: '#fef9c3', border: '#fde047', text: '#713f12', dot: '#eab308'},
    {id: 'slate', label: 'Slate', background: '#f1f5f9', border: '#cbd5e1', text: '#1e293b', dot: '#64748b'},
];

const COLOR_IDS = new Set(ENDPOINT_NOTE_COLORS.map(color => color.id));
const noteType = (value: unknown): value is EndpointNote['type'] => value === 'note' || value === 'task';
const validNote = (value: any): value is EndpointNote =>
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.path === 'string' &&
    typeof value.method === 'string' &&
    noteType(value.type) &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    COLOR_IDS.has(value.color) &&
    typeof value.done === 'boolean' &&
    typeof value.autoHideWhenTasksDone === 'boolean' &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt);

export const endpointNoteKey = (path: string, method: string): string => `${method.toLowerCase()}:${path}`;

export const readEndpointNotes = (specKey: string): EndpointNote[] => {
    if (!specKey) return [];
    return specStorage.getJSON<EndpointNote[]>(
        specKey,
        ENDPOINT_NOTES_STORAGE_NAME,
        [],
        value => Array.isArray(value) && value.every(validNote),
    );
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

export const endpointNoteColor = (id: EndpointNoteColor): EndpointNoteColorOption =>
    ENDPOINT_NOTE_COLORS.find(color => color.id === id) || ENDPOINT_NOTE_COLORS[0];

export const endpointNoteTitle = (note: Pick<EndpointNote, 'title' | 'content' | 'type'>): string => {
    if (note.title.trim()) return note.title.trim();
    const firstLine = note.content
        .replace(/[#>*_`~\[\]]/g, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean);
    return firstLine?.slice(0, 72) || (note.type === 'task' ? 'Untitled task' : 'Untitled note');
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
