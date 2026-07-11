import type { OpenApiSpec, EndpointRef, ParsedRoute } from '../types';

export const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/** Compute a stable endpoint id (uses operationId if present). */
export const getEndpointId = (operation: any, path: string, method: string): string => {
    if (operation?.operationId) return operation.operationId;
    return `${method}-${path.replace(/^\//, '').replace(/\//g, '-')}`;
};

/** Reverse lookup: find {path,method} given an endpoint id. */
export const resolveEndpointFromId = (
    id: string,
    spec: OpenApiSpec | null
): EndpointRef | null => {
    if (!spec?.paths) return null;
    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!HTTP_METHODS.includes(method)) continue;
            if (getEndpointId(operation, path, method) === id) {
                return { path, method };
            }
        }
    }
    return null;
};

/** Parse the window.location.hash into a structured route object. */
export const parseSmartRoute = (hash: string): ParsedRoute => {
    const empty: ParsedRoute = {
        parsableKey: '',
        showSchemaExplorer: false,
        showHome: true,
        showAbout: false,
        endpoint: null,
        tab: 'view',
        schemas: [],
        responseCode: null,
        legacyOperationId: null,
        searchQuery: '',
    };

    if (!hash || hash === '#/' || hash === '#') return empty;

    let raw = hash.substring(1);

    let responseCode: string | null = null;
    const responseMatch = raw.match(/#response-([a-zA-Z0-9_-]+)/);
    if (responseMatch) {
        responseCode = responseMatch[1];
        raw = raw.replace(/#response-([a-zA-Z0-9_-]+)/, '');
    }

    let tab: 'view' | 'examine' = 'view';
    let schemas: string[] = [];
    let searchQuery = '';
    const qMarkIndex = raw.indexOf('?');
    if (qMarkIndex !== -1) {
        const queryString = raw.substring(qMarkIndex + 1);
        raw = raw.substring(0, qMarkIndex);
        const searchParams = new URLSearchParams(queryString);
        if (searchParams.get('tab') === 'examine') tab = 'examine';
        const schemasParam = searchParams.get('schemas');
        if (schemasParam) schemas = schemasParam.split(',').filter(Boolean);
        if (searchParams.get('search')) searchQuery = searchParams.get('search') || '';
    }

    const parts = raw.split('/').filter(Boolean);

    // /about
    if (parts[0] === 'about') {
        return { ...empty, showHome: false, showAbout: true };
    }

    // Legacy /schema/:name
    if (parts[0] === 'schema' && parts[1]) {
        return { ...empty, showSchemaExplorer: true, showHome: false, schemas: [decodeURIComponent(parts[1])], responseCode, searchQuery };
    }
    // Legacy /spec/:parsable/.../operationId
    if (parts[0] === 'spec' && parts.length >= 4) {
        return { ...empty, parsableKey: decodeURIComponent(parts[1]), showHome: false, legacyOperationId: decodeURIComponent(parts[3]), responseCode, searchQuery };
    }
    // /schema-explorer (legacy global)
    if (parts[0] === 'schema-explorer') {
        return { ...empty, showSchemaExplorer: true, showHome: false, schemas, responseCode, searchQuery };
    }

    let parsableKey = '';
    let showSchemaExplorer = false;
    let showHome = false;
    let endpoint: EndpointRef | null = null;

    if (parts[0] === 'parsable' && parts[1]) {
        parsableKey = decodeURIComponent(parts[1]);
        if (parts[2] === 'schema-explorer') {
            showSchemaExplorer = true;
        } else if (parts[2] === 'api' && parts[3]) {
            return { parsableKey, showSchemaExplorer: false, showHome: false, showAbout: false, endpoint: null, tab, schemas, responseCode, legacyOperationId: decodeURIComponent(parts[3]), searchQuery };
        } else if (parts[2] === 'about') {
            return { parsableKey, showSchemaExplorer: false, showHome: false, showAbout: true, endpoint: null, tab, schemas, responseCode: null, legacyOperationId: null, searchQuery };
        } else {
            showHome = true;
        }
    } else {
        showHome = true;
    }

    return { parsableKey, showSchemaExplorer, showHome, showAbout: false, endpoint, tab, schemas, responseCode, legacyOperationId: null, searchQuery };
};

interface BuildRouteOpts {
    parsableKey: string;
    showHome: boolean;
    showAbout: boolean;
    showSchemaExplorer: boolean;
    endpoint: EndpointRef | null;
    tab: string;
    schemaModals: Array<{ schemaName: string; schema: any }>;
    responseCode?: string | null;
    searchQuery?: string;
    activeSpec?: OpenApiSpec | null;
}

/** Build a hash URL from state. */
export const generateSmartRoute = (state: BuildRouteOpts): string => {
    const { parsableKey, showHome, showAbout, showSchemaExplorer, endpoint, tab, schemaModals, responseCode, searchQuery, activeSpec } = state;
    if (!parsableKey) return showAbout ? '#/about' : '#/';
    if (showAbout) return `#/parsable/${encodeURIComponent(parsableKey)}/about`;

    let route = `#/parsable/${encodeURIComponent(parsableKey)}`;
    if (showSchemaExplorer) {
        route += `/schema-explorer`;
    } else if (endpoint) {
        let endpointId = '';
        if (activeSpec) {
            const pathItem = activeSpec.paths[endpoint.path];
            if (pathItem) {
                const op = (pathItem as any)[endpoint.method];
                if (op) endpointId = getEndpointId(op, endpoint.path, endpoint.method);
            }
        }
        if (!endpointId) endpointId = `${endpoint.method}-${endpoint.path.replace(/^\//, '').replace(/\//g, '-')}`;
        route += `/api/${encodeURIComponent(endpointId)}`;
    }

    const qp = new URLSearchParams();
    if (tab === 'examine') qp.set('tab', 'examine');
    if (schemaModals.length > 0) qp.set('schemas', schemaModals.map(m => m.schemaName).join(','));
    if (searchQuery && searchQuery.trim().length > 0) qp.set('search', searchQuery);
    const qs = qp.toString();
    if (qs) route += `?${qs}`;
    if (responseCode) route += `#response-${responseCode}`;
    return route;
};
