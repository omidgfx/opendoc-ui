import type {OpenApiSpec} from '../../types';

export interface ReferenceDocuments {
    /** Optional already-loaded external documents keyed by their URL. */
    [url: string]: any;
}

const decodePointerPart = (part: string): string => {
    try {
        return decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~');
    } catch {
        return part.replace(/~1/g, '/').replace(/~0/g, '~');
    }
};

const pointerParts = (pointer: string): string[] => {
    if (pointer === '' || pointer === '#') return [];
    const fragment = pointer.startsWith('#') ? pointer.slice(1) : pointer;
    if (!fragment.startsWith('/')) return [];
    return fragment.slice(1).split('/').map(decodePointerPart);
};

/** Return the final decoded JSON Pointer component for display purposes. */
export const getRefName = (refStr: string): string => {
    if (!refStr) return '';
    const hashIndex = refStr.indexOf('#');
    const pointer = hashIndex >= 0 ? refStr.slice(hashIndex) : refStr;
    const parts = pointerParts(pointer);
    return parts[parts.length - 1] || refStr.split('/').pop() || '';
};

/** Resolve an RFC 6901 JSON Pointer against an object. */
export const resolveJsonPointer = (document: any, pointer: string): any => {
    const parts = pointerParts(pointer);
    let current = document;
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        if (typeof current !== 'object' || !(part in current)) return null;
        current = current[part];
    }
    return current;
};

const splitReference = (ref: string): { documentUrl: string; pointer: string } => {
    const hash = ref.indexOf('#');
    if (hash < 0) return {documentUrl: ref, pointer: ''};
    return {documentUrl: ref.slice(0, hash), pointer: ref.slice(hash) || '#'};
};

/**
 * Resolve a local JSON Pointer, or an external reference when the caller has
 * supplied the external document in `documents`. Network fetching is not done
 * implicitly: a renderer must never perform surprising network requests while
 * walking an untrusted specification.
 */
export const resolveRefTarget = (
    ref: string,
    spec: OpenApiSpec | any | null,
    documents: ReferenceDocuments = {},
): any => {
    if (!ref || typeof ref !== 'string') return null;
    const {documentUrl, pointer} = splitReference(ref);
    const document = documentUrl ? documents[documentUrl] : spec;
    if (!document) return null;
    return resolveJsonPointer(document, pointer);
};

const resolveWithCycleGuard = (
    item: any,
    spec: OpenApiSpec | any | null,
    documents: ReferenceDocuments,
    visited: Set<string>,
    depth: number,
): any => {
    if (!item || typeof item !== 'object' || typeof item.$ref !== 'string') return item;
    if (depth > 64 || visited.has(item.$ref)) return item;
    const target = resolveRefTarget(item.$ref, spec, documents);
    if (!target) return item;
    const nextVisited = new Set(visited);
    nextVisited.add(item.$ref);
    const resolved = resolveWithCycleGuard(target, spec, documents, nextVisited, depth + 1);
    // OpenAPI permits siblings next to a $ref in newer versions. Keep them
    // visible instead of silently dropping metadata such as descriptions.
    const siblings = Object.fromEntries(Object.entries(item).filter(([key]) => key !== '$ref'));
    return Object.keys(siblings).length > 0 && resolved && typeof resolved === 'object' && !Array.isArray(resolved)
        ? {...resolved, ...siblings}
        : resolved;
};

/** Resolve a schema/reference without recursing forever on recursive schemas. */
export const resolveReference = (
    item: any,
    spec: OpenApiSpec | null,
    documents: ReferenceDocuments = {},
): any => resolveWithCycleGuard(item, spec, documents, new Set<string>(), 0);

export const resolveSchema = (refName: string, spec: OpenApiSpec | null): any => {
    if (!spec || !refName) return null;
    const pointerName = refName.replace(/~/g, '~0').replace(/\//g, '~1');
    const localRef = refName.startsWith('#') ? refName : `#/components/schemas/${pointerName}`;
    return resolveRefTarget(localRef, spec) || resolveRefTarget(`#/definitions/${pointerName}`, spec);
};

const resolveComponentReference = (item: any, spec: OpenApiSpec | null, documents: ReferenceDocuments, visited: Set<string>): any => {
    if (!item || typeof item.$ref !== 'string') return item;
    if (visited.has(item.$ref)) return item;
    const target = resolveRefTarget(item.$ref, spec, documents);
    if (!target) return item;
    const next = new Set(visited);
    next.add(item.$ref);
    return resolveComponentReference(target, spec, documents, next);
};

export const resolveParameter = (param: any, spec: OpenApiSpec | null): any =>
    resolveComponentReference(param, spec, {}, new Set<string>());

export const resolveRequestBody = (body: any, spec: OpenApiSpec | null): any =>
    resolveComponentReference(body, spec, {}, new Set<string>());

/** Merge path-level and operation-level parameters; operation entries win. */
export const getMergedParameters = (pathItem: any, operation: any, spec: OpenApiSpec | null): any[] => {
    const list: any[] = [];
    const seen = new Set<string>();
    const addParam = (param: any) => {
        const resolved = resolveParameter(param, spec);
        if (!resolved || !resolved.name) return;
        const key = `${resolved.name}\u0000${resolved.in}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(resolved);
    };
    // Add path-level first, then move operation overrides to the front while
    // keeping a stable order for the UI.
    const pathParams = Array.isArray(pathItem?.parameters) ? pathItem.parameters : [];
    const operationParams = Array.isArray(operation?.parameters) ? operation.parameters : [];
    pathParams.forEach(addParam);
    const operationResolved = operationParams.map(resolveParameter).filter(Boolean);
    operationResolved.forEach(param => {
        const key = `${param.name}\u0000${param.in}`;
        const index = list.findIndex(item => `${item.name}\u0000${item.in}` === key);
        if (index >= 0) list.splice(index, 1);
        list.push(param);
    });
    return list;
};
