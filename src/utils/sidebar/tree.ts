import type {ActiveAuth, OpenApiSpec} from '@/src/types';
import {specStorage, uiStorage} from '@/src/utils/storage/index';
import {isOperationAuthenticated, isOperationProtected} from '@/src/utils/runner/auth';
import {getPathItemOperations} from '@/src/utils/openapi/operations';

export interface TreeNode {
    name: string;
    children: Record<string, TreeNode>;
    isHiddenGroup?: boolean;
    endpoints: Array<{
        path: string;
        method: string;
        operation: any;
        isProtected: boolean;
        isAuthorized: boolean;
        isHidden?: boolean;
    }>;
}

export type SidebarSortBy = 'name' | 'method' | 'route';
export type SidebarSortDirection = 'asc' | 'desc';
export type SidebarFolderBehavior = 'multiple' | 'single';

export interface SidebarConfig {
    displayRoutes: boolean;
    flattenTags: boolean;
    sortBy: SidebarSortBy;
    sortDirection: SidebarSortDirection;
    folderBehavior: SidebarFolderBehavior;
    pagesFirst: boolean;
    compactMethodNames: boolean;
    hideEndpointCount: boolean;
    hideProtectedIcon: boolean;
    hideDeprecatedEndpoints: boolean;
}

const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
    displayRoutes: true,
    flattenTags: false,
    sortBy: 'name',
    sortDirection: 'asc',
    folderBehavior: 'multiple',
    pagesFirst: true,
    compactMethodNames: false,
    hideEndpointCount: false,
    hideProtectedIcon: false,
    hideDeprecatedEndpoints: false,
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
export const compactMethodLabel = (method: string): string => {
    const labels: Record<string, string> = {
        delete: 'DEL',
        options: 'OPT',
        connect: 'CON',
        trace: 'TRA',
    };
    const normalized = method.toLowerCase();
    return (labels[normalized] || normalized.slice(0, 3)).toUpperCase();
};

export function normalizeSidebarConfig(value: Partial<SidebarConfig> | null | undefined): SidebarConfig {
    const displayRoutes =
        typeof value?.displayRoutes === 'boolean' ? value.displayRoutes : DEFAULT_SIDEBAR_CONFIG.displayRoutes;
    const requestedSortBy =
        value?.sortBy === 'method' || value?.sortBy === 'route' || value?.sortBy === 'name'
            ? value.sortBy
            : DEFAULT_SIDEBAR_CONFIG.sortBy;
    return {
        displayRoutes,
        flattenTags: typeof value?.flattenTags === 'boolean' ? value.flattenTags : DEFAULT_SIDEBAR_CONFIG.flattenTags,
        sortBy: !displayRoutes && requestedSortBy === 'route' ? 'name' : requestedSortBy,
        sortDirection:
            value?.sortDirection === 'desc' || value?.sortDirection === 'asc'
                ? value.sortDirection
                : DEFAULT_SIDEBAR_CONFIG.sortDirection,
        folderBehavior:
            value?.folderBehavior === 'single' || value?.folderBehavior === 'multiple'
                ? value.folderBehavior
                : DEFAULT_SIDEBAR_CONFIG.folderBehavior,
        pagesFirst: typeof value?.pagesFirst === 'boolean' ? value.pagesFirst : DEFAULT_SIDEBAR_CONFIG.pagesFirst,
        compactMethodNames:
            typeof value?.compactMethodNames === 'boolean'
                ? value.compactMethodNames
                : DEFAULT_SIDEBAR_CONFIG.compactMethodNames,
        hideEndpointCount:
            typeof value?.hideEndpointCount === 'boolean'
                ? value.hideEndpointCount
                : DEFAULT_SIDEBAR_CONFIG.hideEndpointCount,
        hideProtectedIcon:
            typeof value?.hideProtectedIcon === 'boolean'
                ? value.hideProtectedIcon
                : DEFAULT_SIDEBAR_CONFIG.hideProtectedIcon,
        hideDeprecatedEndpoints:
            typeof value?.hideDeprecatedEndpoints === 'boolean'
                ? value.hideDeprecatedEndpoints
                : DEFAULT_SIDEBAR_CONFIG.hideDeprecatedEndpoints,
    };
}

/** Broadcast so the sidebar menu and the settings page always show the same
 *  navigation configuration, whichever one the reader edited. */
export const SIDEBAR_CONFIG_EVENT = 'opendoc:sidebar-config-changed';

export function writeSidebarConfig(specKey: string, config: Partial<SidebarConfig>): SidebarConfig {
    const next = normalizeSidebarConfig(config);
    uiStorage.setJSON('sidebar_config', next);
    if (specKey) specStorage.setJSON(specKey, 'sidebar_config', next);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SIDEBAR_CONFIG_EVENT, {detail: {specKey, config: next}}));
    }
    return next;
}

export function readSidebarConfig(specKey: string = ''): SidebarConfig {
    const stored = uiStorage.getJSON<Partial<SidebarConfig>>('sidebar_config', {}, isRecord);
    if (Object.keys(stored).length > 0) return normalizeSidebarConfig(stored);
    if (specKey) {
        const specStored = specStorage.getJSON<Partial<SidebarConfig>>(specKey, 'sidebar_config', {}, isRecord);
        if (Object.keys(specStored).length > 0) return normalizeSidebarConfig(specStored);
    }
    return DEFAULT_SIDEBAR_CONFIG;
}

export function buildTagTree(
    spec: OpenApiSpec | null,
    config: SidebarConfig,
    activeAuth?: ActiveAuth,
    hiddenEndpointKeys: ReadonlySet<string> = new Set(),
): TreeNode {
    const root: TreeNode = {name: '', children: {}, endpoints: []};
    if (!spec?.paths) return root;
    const byTag: Record<string, typeof root.endpoints> = {};
    const hiddenEndpoints: typeof root.endpoints = [];
    const groupedTags = Array.isArray(spec['x-tagGroups']) ? spec['x-tagGroups'] : [];
    const tagGroupByTag = new Map<string, string>();
    groupedTags.forEach(group => {
        if (!group?.name || !Array.isArray(group.tags)) return;
        group.tags.forEach(tag => {
            if (typeof tag === 'string' && tag && !tagGroupByTag.has(tag)) tagGroupByTag.set(tag, group.name);
        });
    });
    Object.entries(spec.paths).forEach(([pathStr, pathItem]) => {
        if (!pathItem) return;
        getPathItemOperations(pathItem).forEach(({method, operation}) => {
            const tags = operation.tags?.length ? operation.tags : ['General'];
            const isProtected = isOperationProtected(spec, operation);
            const isAuthorized = activeAuth ? isOperationAuthenticated(spec, activeAuth, operation) : false;
            const endpoint = {path: pathStr, method, operation, isProtected, isAuthorized};
            if (hiddenEndpointKeys.has(`${method.toLowerCase()}:${pathStr}`)) {
                hiddenEndpoints.push({...endpoint, isHidden: true});
                return;
            }
            tags.forEach((tag: string) => {
                if (!byTag[tag]) byTag[tag] = [];
                byTag[tag].push(endpoint);
            });
        });
    });
    Object.entries(byTag).forEach(([tag, endpoints]) => {
        const tagParts = config.flattenTags ? [tag] : tag.split('/').filter(Boolean);
        const groupName = tagGroupByTag.get(tag);
        const parts = [...(groupName ? [groupName] : []), ...(tagParts.length > 0 ? tagParts : ['General'])];
        let node = root;
        for (const part of parts) {
            if (!node.children[part]) node.children[part] = {name: part, children: {}, endpoints: []};
            node = node.children[part];
        }
        node.endpoints.push(...endpoints);
    });
    if (hiddenEndpoints.length > 0) {
        root.children['Hidden endpoints'] = {
            name: 'Hidden endpoints',
            children: {},
            endpoints: hiddenEndpoints,
            isHiddenGroup: true,
        };
    }
    const compareText = (a: string, b: string) => a.localeCompare(b, undefined, {sensitivity: 'base'});
    const direction = config.sortDirection === 'desc' ? -1 : 1;
    const endpointName = (endpoint: TreeNode['endpoints'][number]) => endpoint.operation?.summary || endpoint.path;
    const compareEndpoints = (a: TreeNode['endpoints'][number], b: TreeNode['endpoints'][number]) => {
        const primary =
            config.sortBy === 'method'
                ? compareText(a.method, b.method)
                : config.sortBy === 'route'
                  ? compareText(a.path, b.path)
                  : compareText(endpointName(a), endpointName(b));
        if (primary !== 0) return primary * direction;
        const byRoute = compareText(a.path, b.path);
        if (byRoute !== 0) return byRoute * direction;
        return compareText(a.method, b.method) * direction;
    };
    const sort = (n: TreeNode): TreeNode => {
        const sorted: Record<string, TreeNode> = {};
        Object.entries(n.children)
            .sort(([a, left], [b, right]) => {
                if (left.isHiddenGroup !== right.isHiddenGroup) return left.isHiddenGroup ? 1 : -1;
                return compareText(a, b) * direction;
            })
            .forEach(([key, child]) => {
                sorted[key] = sort(child);
            });
        n.children = sorted;
        n.endpoints = [...n.endpoints].sort(compareEndpoints);
        return n;
    };
    return sort(root);
}

export function endpointMatchesSidebarFilter(
    endpoint: TreeNode['endpoints'][number],
    query: string,
    _displayRoutes?: boolean,
): boolean {
    const terms = query
        .trim()
        .toLowerCase()
        .split(/[\s._-]+/)
        .filter(Boolean);
    if (terms.length === 0) return true;
    const summary = String(endpoint.operation?.summary || '').toLowerCase();
    const path = String(endpoint.path || '').toLowerCase();
    const method = String(endpoint.method || '').toLowerCase();
    const opId = String(endpoint.operation?.operationId || '').toLowerCase();
    // Path is always searchable — displayRoutes only affects sidebar chrome.
    const haystack = [path, summary || path, method, opId].filter(Boolean);
    return terms.every(term => haystack.some(value => value.includes(term)));
}

export function filterTagTree(node: TreeNode, predicate: (ep: TreeNode['endpoints'][number]) => boolean): TreeNode {
    const newChildren: Record<string, TreeNode> = {};
    Object.entries(node.children).forEach(([k, child]) => {
        const filteredChild = filterTagTree(child, predicate);
        if (filteredChild.endpoints.length > 0 || Object.keys(filteredChild.children).length > 0) {
            newChildren[k] = filteredChild;
        }
    });
    return {
        ...node,
        children: newChildren,
        endpoints: node.endpoints.filter(predicate),
    };
}
