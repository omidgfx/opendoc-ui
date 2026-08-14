export type ViewTabKind = 'home' | 'search' | 'schemas' | 'notes' | 'compatibility' | 'about' | 'assistant';

export interface TabItem {
    id: string;
    path: string;
    method: string;
    isPreview: boolean;
    label: string;
    kind?: 'endpoint' | ViewTabKind;
    query?: string;
    filters?: {
        methods: string[];
        tags: string[];
        onlyProtected: boolean | null;
    };
}

export const VIEW_TAB_META: Record<
    ViewTabKind,
    {
        icon: string;
        label: string;
    }
> = {
    home: {icon: 'ph-fill ph-house', label: 'Specification Overview'},
    search: {icon: 'ph-fill ph-magnifying-glass', label: 'Search'},
    schemas: {icon: 'ph-fill ph-diamonds-four', label: 'Schema Explorer'},
    notes: {icon: 'ph-fill ph-note-pencil', label: 'Local Notes'},
    compatibility: {icon: 'ph-fill ph-shield-check', label: 'Runner Compatibility'},
    about: {icon: 'ph-fill ph-info', label: 'About'},
    assistant: {icon: 'ph-fill ph-sparkle', label: 'AI Assistant'},
};
export const isViewTab = (tab: TabItem): boolean =>
    tab.kind === 'home' ||
    tab.kind === 'search' ||
    tab.kind === 'schemas' ||
    tab.kind === 'notes' ||
    tab.kind === 'compatibility' ||
    tab.kind === 'about' ||
    tab.kind === 'assistant';
