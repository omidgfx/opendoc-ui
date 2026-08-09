import type {OpenApiSpec, Operation, PathItem} from '../../types';

export const OAS_FIXED_HTTP_METHODS = [
    'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query',
] as const;

export interface PathOperationEntry {
    method: string;
    operation: Operation;
    source: 'fixed' | 'additional';
}

export const getPathItemOperations = (pathItem: PathItem | any): PathOperationEntry[] => {
    if (!pathItem || typeof pathItem !== 'object')
        return [];
    const entries: PathOperationEntry[] = [];
    OAS_FIXED_HTTP_METHODS.forEach(method => {
        const operation = pathItem[method];
        if (operation && typeof operation === 'object')
            entries.push({method, operation, source: 'fixed'});
    });
    if (pathItem.additionalOperations && typeof pathItem.additionalOperations === 'object') {
        Object.entries(pathItem.additionalOperations).forEach(([method, operation]) => {
            const normalized = method.toLowerCase();
            if (!operation || typeof operation !== 'object')
                return;
            if (entries.some(entry => entry.method.toLowerCase() === normalized))
                return;
            entries.push({method: normalized, operation: operation as Operation, source: 'additional'});
        });
    }
    return entries;
};

export const getOperation = (
    spec: OpenApiSpec | null | undefined,
    path: string,
    method: string,
): Operation | null => {
    const pathItem = spec?.paths?.[path] as any;
    if (!pathItem)
        return null;
    const normalized = method.toLowerCase();
    return pathItem[normalized]
        || Object.entries(pathItem.additionalOperations || {}).find(([key]) => key.toLowerCase() === normalized)?.[1]
        || null;
};

export const getDocumentOperations = (spec: OpenApiSpec | null | undefined): Array<PathOperationEntry & {path: string}> => {
    if (!spec?.paths)
        return [];
    return Object.entries(spec.paths).flatMap(([path, pathItem]) => getPathItemOperations(pathItem)
        .map(entry => ({...entry, path})));
};
