import type {EndpointRef, OpenApiSpec, ParsedRoute} from '../types';
import {getDocumentOperations, getOperation, OAS_FIXED_HTTP_METHODS} from './openapi/operations';

export const HTTP_METHODS = [...OAS_FIXED_HTTP_METHODS];
export const getEndpointId = (operation: any, path: string, method: string): string => {
    if (operation?.operationId)
        return operation.operationId;
    return `${method}-${path.replace(/^\//, '').replace(/\//g, '-')}`;
};
export const resolveEndpointFromId = (id: string, spec: OpenApiSpec | null): EndpointRef | null => {
    if (!spec?.paths)
        return null;
    for (const {path, method, operation} of getDocumentOperations(spec)) {
        if (getEndpointId(operation, path, method) === id)
            return {path, method};
    }
    return null;
};
export const parseSmartRoute = (hash: string): ParsedRoute => {
    const empty: ParsedRoute = {
        parsableKey: '',
        showSchemaExplorer: false,
        showHome: true,
        showAbout: false,
        showAssistant: false,
        endpoint: null,
        tab: 'view',
        schemas: [],
        responseCode: null,
        legacyOperationId: null,
        searchQuery: '',
        searchMethods: [],
        searchTags: [],
        searchSecured: null,
    };
    if (!hash || hash === '#/' || hash === '#')
        return empty;
    let raw = hash.substring(1);
    let responseCode: string | null = null;
    const responseMatch = raw.match(/#response-([a-zA-Z0-9_-]+)/);
    if (responseMatch) {
        responseCode = responseMatch[1];
        raw = raw.replace(/#response-([a-zA-Z0-9_-]+)/, '');
    }
    let tab: 'view' | 'examine' | 'both' = 'view';
    let schemas: string[] = [];
    let searchQuery = '';
    let searchMethods: string[] = [];
    let searchTags: string[] = [];
    let searchSecured: boolean | null = null;
    const qMarkIndex = raw.indexOf('?');
    if (qMarkIndex !== -1) {
        const queryString = raw.substring(qMarkIndex + 1);
        raw = raw.substring(0, qMarkIndex);
        const searchParams = new URLSearchParams(queryString);
        const tabParam = searchParams.get('tab');
        if (tabParam) {
            const tabParts = tabParam.split(',').map(s => s.trim()).filter(Boolean);
            const hasExamine = tabParts.includes('examine');
            const hasDoc = tabParts.includes('doc');
            if (hasExamine && hasDoc)
                tab = 'both';
            else if (hasExamine)
                tab = 'examine';
            else
                tab = 'view';
        }
        const schemasParam = searchParams.get('schemas');
        if (schemasParam)
            schemas = schemasParam.split(',').filter(Boolean);
        if (searchParams.get('search'))
            searchQuery = searchParams.get('search') || '';
        searchMethods = (searchParams.get('methods') || '').split(',').filter(Boolean);
        searchTags = (searchParams.get('tags') || '').split(',').filter(Boolean);
        const securedRaw = searchParams.get('secured');
        searchSecured = securedRaw === 'true' ? true : securedRaw === 'false' ? false : null;
    }
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] === 'about') {
        return {...empty, showHome: false, showAbout: true};
    }
    if (parts[0] === 'schema' && parts[1]) {
        return {
            ...empty,
            showSchemaExplorer: true,
            showHome: false,
            schemas: [decodeURIComponent(parts[1])],
            responseCode,
            searchQuery
        };
    }
    if (parts[0] === 'spec' && parts.length >= 4) {
        return {
            ...empty,
            parsableKey: decodeURIComponent(parts[1]),
            showHome: false,
            legacyOperationId: decodeURIComponent(parts[3]),
            responseCode,
            searchQuery
        };
    }
    if (parts[0] === 'schema-explorer') {
        return {...empty, showSchemaExplorer: true, showHome: false, schemas, responseCode, searchQuery};
    }
    if (parts[0] === 'assistant') {
        return {...empty, showAssistant: true, showHome: false, responseCode, searchQuery};
    }
    let parsableKey = '';
    let showSchemaExplorer = false;
    let showAssistant = false;
    let showHome = false;
    let endpoint: EndpointRef | null = null;
    if (parts[0] === 'parsable' && parts[1]) {
        parsableKey = decodeURIComponent(parts[1]);
        if (parts[2] === 'schema-explorer') {
            showSchemaExplorer = true;
        } else if (parts[2] === 'assistant') {
            showAssistant = true;
        } else if (parts[2] === 'api' && parts[3]) {
            return {
                parsableKey,
                showSchemaExplorer: false,
                showHome: false,
                showAbout: false,
                showAssistant: false,
                endpoint: null,
                tab,
                schemas,
                responseCode,
                legacyOperationId: decodeURIComponent(parts[3]),
                searchQuery,
                searchMethods,
                searchTags,
                searchSecured
            };
        } else if (parts[2] === 'about') {
            return {
                parsableKey,
                showSchemaExplorer: false,
                showHome: false,
                showAbout: true,
                showAssistant: false,
                endpoint: null,
                tab,
                schemas,
                responseCode: null,
                legacyOperationId: null,
                searchQuery,
                searchMethods,
                searchTags,
                searchSecured
            };
        } else {
            showHome = true;
        }
    } else {
        showHome = true;
    }
    return {
        parsableKey,
        showSchemaExplorer,
        showHome,
        showAbout: false,
        showAssistant,
        endpoint,
        tab,
        schemas,
        responseCode,
        legacyOperationId: null,
        searchQuery,
        searchMethods,
        searchTags,
        searchSecured
    };
};

interface BuildRouteOpts {
    parsableKey: string;
    showHome: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    showSchemaExplorer: boolean;
    endpoint: EndpointRef | null;
    tab: string;
    schemaModals: Array<{
        schemaName: string;
        schema: any;
    }>;
    responseCode?: string | null;
    searchQuery?: string;
    searchMethods?: string[];
    searchTags?: string[];
    searchSecured?: boolean | null;
    activeSpec?: OpenApiSpec | null;
}

export const generateSmartRoute = (state: BuildRouteOpts): string => {
    const {
        parsableKey,
        showHome,
        showAbout,
        showAssistant,
        showSchemaExplorer,
        endpoint,
        tab,
        schemaModals,
        responseCode,
        searchQuery,
        searchMethods,
        searchTags,
        searchSecured,
        activeSpec
    } = state;
    if (!parsableKey)
        return showAbout ? '#/about' : showAssistant ? '#/assistant' : '#/';
    if (showAbout)
        return `#/parsable/${encodeURIComponent(parsableKey)}/about`;
    if (showAssistant)
        return `#/parsable/${encodeURIComponent(parsableKey)}/assistant`;
    let route = `#/parsable/${encodeURIComponent(parsableKey)}`;
    if (showSchemaExplorer) {
        route += `/schema-explorer`;
    } else if (endpoint) {
        let endpointId = '';
        if (activeSpec) {
            const operation = getOperation(activeSpec, endpoint.path, endpoint.method);
            if (operation)
                endpointId = getEndpointId(operation, endpoint.path, endpoint.method);
        }
        if (!endpointId)
            endpointId = `${endpoint.method}-${endpoint.path.replace(/^\//, '').replace(/\//g, '-')}`;
        route += `/api/${encodeURIComponent(endpointId)}`;
    }
    const qp = new URLSearchParams();
    if (tab === 'examine')
        qp.set('tab', 'examine');
    else if (tab === 'both')
        qp.set('tab', 'examine,doc');
    if (schemaModals.length > 0)
        qp.set('schemas', schemaModals.map(m => m.schemaName).join(','));
    if (searchQuery && searchQuery.trim().length > 0)
        qp.set('search', searchQuery);
    if (searchMethods && searchMethods.length > 0)
        qp.set('methods', searchMethods.join(','));
    if (searchTags && searchTags.length > 0)
        qp.set('tags', searchTags.join(','));
    if (searchSecured === true)
        qp.set('secured', 'true');
    else if (searchSecured === false)
        qp.set('secured', 'false');
    const qs = qp.toString();
    if (qs)
        route += `?${qs}`;
    if (responseCode)
        route += `#response-${responseCode}`;
    return route;
};
