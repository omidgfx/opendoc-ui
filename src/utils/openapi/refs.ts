import type {OpenApiSpec} from '../../types';

export interface ReferenceDocuments {
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
    if (pointer === '' || pointer === '#')
        return [];
    const fragment = pointer.startsWith('#') ? pointer.slice(1) : pointer;
    if (!fragment.startsWith('/'))
        return [];
    return fragment.slice(1).split('/').map(decodePointerPart);
};
export const getRefName = (refStr: string): string => {
    if (!refStr)
        return '';
    const hashIndex = refStr.indexOf('#');
    const pointer = hashIndex >= 0 ? refStr.slice(hashIndex) : refStr;
    const parts = pointerParts(pointer);
    return parts[parts.length - 1] || refStr.split('/').pop() || '';
};
export const resolveJsonPointer = (document: any, pointer: string): any => {
    const parts = pointerParts(pointer);
    let current = document;
    for (const part of parts) {
        if (current === null || current === undefined)
            return null;
        if (typeof current !== 'object' || !(part in current))
            return null;
        current = current[part];
    }
    return current;
};
const splitReference = (ref: string): {
    documentUrl: string;
    pointer: string;
} => {
    const hash = ref.indexOf('#');
    if (hash < 0)
        return {documentUrl: ref, pointer: ''};
    return {documentUrl: ref.slice(0, hash), pointer: ref.slice(hash) || '#'};
};
export const resolveRefTarget = (ref: string, spec: OpenApiSpec | any | null, documents: ReferenceDocuments = {}): any => {
    if (!ref || typeof ref !== 'string')
        return null;
    const {documentUrl, pointer} = splitReference(ref);
    const document = documentUrl ? documents[documentUrl] : spec;
    if (!document)
        return null;
    return resolveJsonPointer(document, pointer);
};
const resolveWithCycleGuard = (item: any, spec: OpenApiSpec | any | null, documents: ReferenceDocuments, visited: Set<string>, depth: number): any => {
    if (!item || typeof item !== 'object' || typeof item.$ref !== 'string')
        return item;
    if (depth > 64 || visited.has(item.$ref))
        return item;
    const target = resolveRefTarget(item.$ref, spec, documents);
    if (!target)
        return item;
    const nextVisited = new Set(visited);
    nextVisited.add(item.$ref);
    const resolved = resolveWithCycleGuard(target, spec, documents, nextVisited, depth + 1);
    const siblings = Object.fromEntries(Object.entries(item).filter(([key]) => key !== '$ref'));
    return Object.keys(siblings).length > 0 && resolved && typeof resolved === 'object' && !Array.isArray(resolved)
        ? {...resolved, ...siblings}
        : resolved;
};
export const resolveReference = (item: any, spec: OpenApiSpec | null, documents: ReferenceDocuments = {}): any => resolveWithCycleGuard(item, spec, documents, new Set<string>(), 0);
export const resolveSchema = (refName: string, spec: OpenApiSpec | null): any => {
    if (!spec || !refName)
        return null;
    const pointerName = refName.replace(/~/g, '~0').replace(/\//g, '~1');
    const localRef = refName.startsWith('#') ? refName : `#/components/schemas/${pointerName}`;
    return resolveRefTarget(localRef, spec) || resolveRefTarget(`#/definitions/${pointerName}`, spec);
};
const resolveComponentReference = (item: any, spec: OpenApiSpec | null, documents: ReferenceDocuments, visited: Set<string>): any => {
    if (!item || typeof item.$ref !== 'string')
        return item;
    if (visited.has(item.$ref))
        return item;
    const target = resolveRefTarget(item.$ref, spec, documents);
    if (!target)
        return item;
    const next = new Set(visited);
    next.add(item.$ref);
    const resolved = resolveComponentReference(target, spec, documents, next);
    const siblings = Object.fromEntries(Object.entries(item).filter(([key]) => key !== '$ref'));
    return Object.keys(siblings).length > 0 && resolved && typeof resolved === 'object' && !Array.isArray(resolved)
        ? {...resolved, ...siblings}
        : resolved;
};
export const resolveParameter = (param: any, spec: OpenApiSpec | null): any => {
    const resolved = resolveComponentReference(param, spec, {}, new Set<string>());
    if (!resolved || typeof resolved !== 'object')
        return resolved;
    const contentMedia = Object.values(resolved.content || {})[0] as any;
    const parameterSchema = resolved.schema || contentMedia?.schema;
    if (parameterSchema?.$ref) {
        return {...resolved, schema: resolveReference(parameterSchema, spec)};
    }
    return parameterSchema && !resolved.schema ? {...resolved, schema: parameterSchema} : resolved;
};
export const resolveRequestBody = (body: any, spec: OpenApiSpec | null): any => {
    const resolved = resolveComponentReference(body, spec, {}, new Set<string>());
    if (!resolved || typeof resolved !== 'object' || !resolved.content)
        return resolved;
    const content = Object.fromEntries(Object.entries(resolved.content).map(([mediaType, media]: [
        string,
        any
    ]) => [
        mediaType,
        media?.$ref ? resolveReference(media, spec) : media
    ]));
    return {...resolved, content};
};
const parameterKey = (param: any): string | null => {
    if (!param?.name || !param?.in)
        return null;
    return `${String(param.name)}\u0000${String(param.in)}`;
};
export const getMergedParameters = (pathItem: any, operation: any, spec: OpenApiSpec | null): any[] => {
    const list: any[] = [];
    const indices = new Map<string, number>();
    const addParam = (param: any, override = false) => {
        const resolved = resolveParameter(param, spec);
        const key = parameterKey(resolved);
        if (!key)
            return;
        const existingIndex = indices.get(key);
        if (existingIndex !== undefined) {
            if (override)
                list[existingIndex] = resolved;
            return;
        }
        indices.set(key, list.length);
        list.push(resolved);
    };
    const pathParams = Array.isArray(pathItem?.parameters) ? pathItem.parameters : [];
    const operationParams = Array.isArray(operation?.parameters) ? operation.parameters : [];
    pathParams.forEach(param => addParam(param));
    operationParams.forEach(param => addParam(param, true));
    return list;
};
