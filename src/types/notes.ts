export type EndpointNoteType = 'note' | 'task';

export type EndpointNoteColor =
    'butter' | 'apricot' | 'rose' | 'blush' | 'lilac' | 'violet' | 'blue' | 'sky' | 'mint' | 'lime' | 'sand' | 'slate';

export interface EndpointNote {
    id: string;
    path: string;
    method: string;
    type: EndpointNoteType;
    title: string;
    content: string;
    color: EndpointNoteColor;
    done: boolean;
    autoHideWhenTasksDone: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface EndpointNoteDraft {
    path: string;
    method: string;
    type: EndpointNoteType;
    title: string;
    content: string;
    color: EndpointNoteColor;
    autoHideWhenTasksDone: boolean;
}
