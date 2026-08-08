import type {ParsedRoute} from '../types';
import type {TabItem, ViewTabKind} from '../components/endpoint/EndpointTabs';

const VALID_VIEW_TAB_KINDS: ViewTabKind[] = ['home', 'search', 'schemas', 'about', 'assistant'];
const VALID_TAB_VIEW_MODES = ['docs', 'examine', 'both'] as const;

export type StoredTabViewMode = typeof VALID_TAB_VIEW_MODES[number];

export const isValidTabViewMode = (value: unknown): value is StoredTabViewMode =>
    VALID_TAB_VIEW_MODES.includes(value as StoredTabViewMode);

const isValidTabFilters = (filters: any): boolean =>
    !!filters
    && typeof filters === 'object'
    && !Array.isArray(filters)
    && Array.isArray(filters.methods)
    && filters.methods.every((value: unknown) => typeof value === 'string')
    && Array.isArray(filters.tags)
    && filters.tags.every((value: unknown) => typeof value === 'string')
    && (filters.onlyProtected === null || typeof filters.onlyProtected === 'boolean');

const isValidTabItem = (tab: any): tab is TabItem => {
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) return false;
    const validKind = tab.kind === undefined || tab.kind === 'endpoint' || VALID_VIEW_TAB_KINDS.includes(tab.kind);
    return validKind
        && typeof tab.id === 'string'
        && tab.id.length > 0
        && typeof tab.isPreview === 'boolean'
        && typeof tab.label === 'string'
        && typeof tab.path === 'string'
        && typeof tab.method === 'string'
        && (tab.query === undefined || typeof tab.query === 'string')
        && (tab.filters === undefined || isValidTabFilters(tab.filters));
};

export const isValidTabPersistence = (value: any): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.tabs)) return false;
    const ids = value.tabs.map((tab: any) => tab?.id)
        .filter((id: unknown): id is string => typeof id === 'string');
    if (ids.length !== value.tabs.length || new Set(ids).size !== ids.length || !value.tabs.every(isValidTabItem)) {
        return false;
    }
    if (value.activeTabId !== undefined && typeof value.activeTabId !== 'string') return false;
    if (value.viewModes !== undefined) {
        if (!value.viewModes || typeof value.viewModes !== 'object' || Array.isArray(value.viewModes)) return false;
        if (!Object.values(value.viewModes).every(isValidTabViewMode)) return false;
    }
    return true;
};

/** A plain `#/parsable/:key` route is only a spec selection and must not
 * overwrite that spec's restored session. */
export const hasExplicitSpecRoute = (route: ParsedRoute, hash: string): boolean =>
    !!(route.endpoint || route.legacyOperationId || route.showSchemaExplorer || route.showAbout
        || route.showAssistant || route.searchQuery || route.searchMethods.length || route.searchTags.length
        || route.searchSecured !== null || route.schemas.length || route.responseCode
        || /[?&]search(?:=|&|$)/.test(hash));
