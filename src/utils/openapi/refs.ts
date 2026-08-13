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
    if (pointer === '' || pointer === '#') return [];
    const fragment = pointer.startsWith('#') ? pointer.slice(1) : pointer;
    if (!fragment.startsWith('/')) return [];
    return fragment.slice(1).split('/').map(decodePointerPart);
};
export const getRefName = (refStr: string): string => {
    if (!refStr) return '';
    const hashIndex = refStr.indexOf('#');
    const pointer = hashIndex >= 0 ? refStr.slice(hashIndex) : refStr;
    const parts = pointerParts(pointer);
    return parts[parts.length - 1] || refStr.split('/').pop() || '';
};
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
const splitReference = (
    ref: string,
): {
    documentUrl: string;
    pointer: string;
} => {
    const hash = ref.indexOf('#');
    if (hash < 0) return {documentUrl: ref, pointer: ''};
    return {documentUrl: ref.slice(0, hash), pointer: ref.slice(hash) || '#'};
};
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
export type ReferenceResolutionStatus = 'resolved' | 'unresolved' | 'circular' | 'max-depth';

export interface ReferenceResolution {
    status: ReferenceResolutionStatus;
    value: any;
    ref?: string;
    chain: string[];
}

const mergeReferenceSiblings = (item: any, resolved: any): any => {
    const siblings = Object.fromEntries(Object.entries(item || {}).filter(([key]) => key !== '$ref'));
    return Object.keys(siblings).length > 0 && resolved && typeof resolved === 'object' && !Array.isArray(resolved)
        ? {...resolved, ...siblings}
        : resolved;
};

const resolveReferenceResultInternal = (
    item: any,
    spec: OpenApiSpec | any | null,
    documents: ReferenceDocuments,
    visited: Set<string>,
    chain: string[],
    depth: number,
): ReferenceResolution => {
    if (!item || typeof item !== 'object' || typeof item.$ref !== 'string')
        return {status: 'resolved', value: item, chain};
    const ref = item.$ref;
    if (depth >= 64) return {status: 'max-depth', value: item, ref, chain: [...chain, ref]};
    if (visited.has(ref)) return {status: 'circular', value: item, ref, chain: [...chain, ref]};
    const target = resolveRefTarget(ref, spec, documents);
    if (!target) return {status: 'unresolved', value: item, ref, chain: [...chain, ref]};
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    const child = resolveReferenceResultInternal(target, spec, documents, nextVisited, [...chain, ref], depth + 1);
    return {...child, value: mergeReferenceSiblings(item, child.value)};
};

export const resolveReferenceResult = (
    item: any,
    spec: OpenApiSpec | null,
    documents: ReferenceDocuments = {},
): ReferenceResolution => resolveReferenceResultInternal(item, spec, documents, new Set<string>(), [], 0);

export const resolveReference = (item: any, spec: OpenApiSpec | null, documents: ReferenceDocuments = {}): any =>
    resolveReferenceResult(item, spec, documents).value;
export const resolveSchema = (refName: string, spec: OpenApiSpec | null): any => {
    if (!spec || !refName) return null;
    const pointerName = refName.replace(/~/g, '~0').replace(/\//g, '~1');
    const localRef = refName.startsWith('#') ? refName : `#/components/schemas/${pointerName}`;
    return resolveRefTarget(localRef, spec) || resolveRefTarget(`#/definitions/${pointerName}`, spec);
};
const resolveComponentReference = (
    item: any,
    spec: OpenApiSpec | null,
    documents: ReferenceDocuments,
    visited: Set<string>,
): any => {
    if (!item || typeof item.$ref !== 'string') return item;
    if (visited.has(item.$ref)) return item;
    const target = resolveRefTarget(item.$ref, spec, documents);
    if (!target) return item;
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
    if (!resolved || typeof resolved !== 'object') return resolved;
    const contentMedia = Object.values(resolved.content || {})[0] as any;
    const parameterSchema = resolved.schema ?? contentMedia?.schema;
    if (parameterSchema?.$ref) {
        return {...resolved, schema: resolveReference(parameterSchema, spec)};
    }
    return parameterSchema !== undefined && resolved.schema === undefined
        ? {...resolved, schema: parameterSchema}
        : resolved;
};
export const resolveRequestBody = (body: any, spec: OpenApiSpec | null): any => {
    const resolved = resolveComponentReference(body, spec, {}, new Set<string>());
    if (!resolved || typeof resolved !== 'object' || !resolved.content) return resolved;
    const content = Object.fromEntries(
        Object.entries(resolved.content).map(([mediaType, media]: [string, any]) => [
            mediaType,
            media?.$ref ? resolveReference(media, spec) : media,
        ]),
    );
    return {...resolved, content};
};
const parameterKey = (param: any): string | null => {
    if (!param?.name || !param?.in) return null;
    return `${String(param.name)}\u0000${String(param.in)}`;
};
export const getMergedParameters = (pathItem: any, operation: any, spec: OpenApiSpec | null): any[] => {
    const list: any[] = [];
    const indices = new Map<string, number>();
    const addParam = (param: any, override = false) => {
        const resolved = resolveParameter(param, spec);
        const key = parameterKey(resolved);
        if (!key) return;
        const existingIndex = indices.get(key);
        if (existingIndex !== undefined) {
            if (override) list[existingIndex] = resolved;
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

export interface ReferenceIssue {
    status: Exclude<ReferenceResolutionStatus, 'resolved'>;
    ref: string;
    path: string;
    chain: string[];
}

export const collectReferenceIssuesIn = (value: any, spec: OpenApiSpec | any, rootPath = '#'): ReferenceIssue[] => {
    const issues = new Map<string, ReferenceIssue>();
    const seenObjects = new Set<object>();
    const visit = (current: any, path: string) => {
        const value = current;
        if (!value || typeof value !== 'object' || seenObjects.has(value)) return;
        seenObjects.add(value);
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}/${index}`));
            return;
        }
        if (typeof value.$ref === 'string') {
            const result = resolveReferenceResult(value, spec);
            if (result.status !== 'resolved' && result.ref) {
                const issue = {status: result.status, ref: result.ref, path, chain: result.chain} as ReferenceIssue;
                issues.set(`${issue.status}\u0000${issue.ref}\u0000${issue.path}`, issue);
            }
            if (result.status === 'resolved' && result.value !== value) visit(result.value, path);
            return;
        }
        Object.entries(value).forEach(([key, child]) =>
            visit(child, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`),
        );
    };
    visit(value, rootPath);
    return Array.from(issues.values());
};

export const collectReferenceIssues = (spec: OpenApiSpec | any): ReferenceIssue[] =>
    collectReferenceIssuesIn(spec, spec);

export const missingReferenceDocuments = (spec: OpenApiSpec | any): string[] =>
    Array.from(
        new Set(
            collectReferenceIssues(spec)
                .filter(issue => issue.status === 'unresolved' && !issue.ref.startsWith('#'))
                .map(issue => issue.ref.split('#', 1)[0])
                .filter(Boolean),
        ),
    ).sort();

/** Create a derived, self-contained view where resolvable references are expanded. */
export const createBundledOpenApiDocument = (spec: OpenApiSpec): OpenApiSpec => {
    const cloned = new WeakMap<object, any>();
    const visit = (value: any, depth = 0): any => {
        if (!value || typeof value !== 'object' || depth > 128) return value;
        if (cloned.has(value)) return cloned.get(value);
        if (typeof value.$ref === 'string') {
            const result = resolveReferenceResult(value, spec);
            if (result.status === 'resolved' && result.value !== value) {
                if (result.value && typeof result.value === 'object' && cloned.has(result.value)) {
                    return Array.isArray(value) ? [...value] : {...value};
                }
                return visit(result.value, depth + 1);
            }
        }
        const output: any = Array.isArray(value) ? [] : {};
        cloned.set(value, output);
        if (Array.isArray(value)) value.forEach(item => output.push(visit(item, depth + 1)));
        else Object.entries(value).forEach(([key, child]) => (output[key] = visit(child, depth + 1)));
        return output;
    };
    return visit(spec) as OpenApiSpec;
};
