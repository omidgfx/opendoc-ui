import type {Diagnostic, OpenApiSpec} from '../../types';
import {diagnostic} from '../../types';
import {normalizeOpenApiSpec} from './compat';
import {parseSpecText} from '../specification/yamlText';

const MAX_EXTERNAL_DOCUMENTS = 16;
const MAX_EXTERNAL_BYTES = 5 * 1024 * 1024;
const EXTERNAL_TIMEOUT_MS = 10_000;
const MAX_ENGINE_VALIDATION_DETAILS = 12;

interface EngineValidationError {
    code?: string;
    message: string;
    path?: unknown;
}

const isBranchSelectionNoise = (message: string): boolean => {
    const normalized = message.trim();
    return (
        /^if must match ["'](?:then|else)["'] schema$/i.test(normalized) ||
        /^Property .+ is not expected to be here$/i.test(normalized) ||
        /^must match ["'](?:then|else)["'] schema$/i.test(normalized)
    );
};

/**
 * AJV-style OpenAPI meta-schemas can emit thousands of oneOf/if branch details
 * for one root problem. Keep only a small set of actionable, unique messages.
 */
export const summarizeEngineValidationErrors = (errors: EngineValidationError[]): Diagnostic[] => {
    const unique = new Map<string, EngineValidationError>();
    let branchNoise = 0;
    errors.forEach(error => {
        if (isBranchSelectionNoise(error.message)) {
            branchNoise += 1;
            return;
        }
        const pointer = formatEngineErrorPath(error.path) || '';
        const key = `${error.code || ''}\u0000${pointer}\u0000${error.message}`;
        if (!unique.has(key)) unique.set(key, error);
    });
    const actionable = Array.from(unique.values());
    const visible = actionable.slice(0, MAX_ENGINE_VALIDATION_DETAILS).map(error =>
        diagnostic(error.code ? `OAS_ENGINE_${error.code}` : 'OAS_ENGINE_VALIDATION', error.message, {
            severity: 'warning',
            source: {pointer: formatEngineErrorPath(error.path)},
        }),
    );
    const suppressed = branchNoise + Math.max(0, actionable.length - visible.length);
    if (suppressed > 0) {
        visible.push(
            diagnostic(
                'OAS_ENGINE_VALIDATION_SUMMARY',
                `${suppressed.toLocaleString()} repetitive validator detail${suppressed === 1 ? '' : 's'} hidden.`,
                {severity: 'info', details: {reported: errors.length, branchNoise, actionable: actionable.length}},
            ),
        );
    }
    return visible;
};

/** Parser versions do not always agree on whether an error path is an array or string. */
export const formatEngineErrorPath = (path: unknown): string | undefined => {
    if (Array.isArray(path)) return path.map(part => String(part)).join('/');
    if (typeof path === 'string') return path;
    if (path === undefined || path === null) return undefined;
    try {
        return String(path);
    } catch {
        return undefined;
    }
};

const containsExternalRef = (value: unknown, visited = new Set<object>()): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (visited.has(value as object)) return false;
    visited.add(value as object);
    if (Array.isArray(value)) return value.some(item => containsExternalRef(item, visited));
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === '$ref' && typeof child === 'string' && !child.startsWith('#')) return true;
        if (containsExternalRef(child, visited)) return true;
    }
    return false;
};

export type ExternalReferenceRequester = (url: string, init: RequestInit) => Promise<Response>;

const safeReferenceFetch =
    (rootUri: string, requester: ExternalReferenceRequester = (url, init) => fetch(url, init)) =>
    async (requested: string): Promise<Response> => {
        const root = new URL(rootUri);
        const target = new URL(requested, root);
        if (!['http:', 'https:'].includes(target.protocol))
            throw new Error(`External reference protocol '${target.protocol}' is not allowed.`);
        if (target.origin !== root.origin)
            throw new Error(
                `Cross-origin external reference '${target.href}' is blocked. Bundle it with the root document or serve it from ${root.origin}.`,
            );

        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
        try {
            const response = await requester(target.href, {
                signal: controller.signal,
                credentials: 'omit',
                redirect: 'follow',
                cache: 'no-store',
            });
            const finalUri = response.headers.get('x-opendoc-final-url') || response.url;
            if (finalUri && new URL(finalUri).origin !== root.origin)
                throw new Error(`External reference redirect left the allowed origin: ${finalUri}`);
            if (!response.ok) throw new Error(`External reference returned HTTP ${response.status}: ${target.href}`);
            const declaredLength = Number(response.headers.get('content-length') || 0);
            if (declaredLength > MAX_EXTERNAL_BYTES)
                throw new Error(`External reference exceeds ${MAX_EXTERNAL_BYTES} bytes: ${target.href}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength > MAX_EXTERNAL_BYTES)
                throw new Error(`External reference exceeds ${MAX_EXTERNAL_BYTES} bytes: ${target.href}`);
            return new Response(bytes, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        } finally {
            globalThis.clearTimeout(timeout);
        }
    };

export interface OpenApiEngineResult {
    document: OpenApiSpec;
    diagnostics: Diagnostic[];
    externalDocumentsLoaded: boolean;
}

/**
 * Validates with a maintained OpenAPI engine and resolves same-origin remote
 * references when possible. Engine errors are diagnostics: OpenDoc keeps the
 * parseable document available and its Runner remains permissive.
 */
export const processWithOpenApiEngine = async (
    raw: string,
    parsed: OpenApiSpec,
    sourceUri?: string,
    externalReferenceRequester?: ExternalReferenceRequester,
): Promise<OpenApiEngineResult> => {
    const diagnostics: Diagnostic[] = [];
    let parser: typeof import('@scalar/openapi-parser');
    try {
        parser = await import('@scalar/openapi-parser');
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'OAS_ENGINE_UNAVAILABLE',
                error instanceof Error ? error.message : 'The optional OpenAPI parser could not be loaded.',
                {severity: 'warning', source: sourceUri ? {uri: sourceUri} : undefined},
            ),
        );
        return {document: parsed, diagnostics, externalDocumentsLoaded: false};
    }

    try {
        const validation = await parser.validate(raw);
        diagnostics.push(...summarizeEngineValidationErrors(validation.errors || []));
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'OAS_ENGINE_VALIDATION_FAILED',
                error instanceof Error ? error.message : 'Additional OpenAPI validation failed.',
                {severity: 'warning', source: sourceUri ? {uri: sourceUri} : undefined},
            ),
        );
    }

    if (!containsExternalRef(parsed)) return {document: parsed, diagnostics, externalDocumentsLoaded: false};

    if (!sourceUri) {
        diagnostics.push(
            diagnostic(
                'OAS_EXTERNAL_REF_LOCAL_FILES_REQUIRED',
                'This local/inline specification contains external references. Select all related files or use a bundled document.',
            ),
        );
        return {document: parsed, diagnostics, externalDocumentsLoaded: false};
    }

    try {
        const {fetchUrls} = await import('@scalar/openapi-parser/plugins/fetch-urls');
        const absoluteSource =
            typeof window !== 'undefined' ? new URL(sourceUri, window.location.href).href : new URL(sourceUri).href;
        const loaded = await parser.load(raw, {
            filename: absoluteSource,
            plugins: [
                fetchUrls({
                    limit: MAX_EXTERNAL_DOCUMENTS,
                    fetch: safeReferenceFetch(absoluteSource, externalReferenceRequester),
                }),
            ],
        });
        (loaded.errors || []).forEach(error =>
            diagnostics.push(
                diagnostic(error.code ? `OAS_EXTERNAL_${error.code}` : 'OAS_EXTERNAL_REF_FAILED', error.message, {
                    source: {uri: absoluteSource, pointer: formatEngineErrorPath(error.path)},
                }),
            ),
        );
        const resolved = parser.dereference(loaded.filesystem);
        (resolved.errors || []).forEach(error =>
            diagnostics.push(
                diagnostic(error.code ? `OAS_REF_${error.code}` : 'OAS_REF_RESOLUTION_FAILED', error.message, {
                    source: {uri: absoluteSource, pointer: formatEngineErrorPath(error.path)},
                }),
            ),
        );
        if (!resolved.schema) return {document: parsed, diagnostics, externalDocumentsLoaded: false};

        let document: OpenApiSpec;
        if (String((resolved.schema as any).swagger || '').startsWith('2.'))
            document = normalizeOpenApiSpec(resolved.schema as any);
        else {
            const schema = resolved.schema as any;
            schema.paths ||= {};
            schema.components ||= {};
            document = schema as OpenApiSpec;
        }
        diagnostics.push(
            diagnostic(
                'OAS_EXTERNAL_REFS_RESOLVED',
                `Resolved ${Math.max(0, loaded.filesystem.length - 1)} external OpenAPI document(s) from the root origin.`,
                {severity: 'info', source: {uri: absoluteSource}},
            ),
        );
        return {document, diagnostics, externalDocumentsLoaded: true};
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'OAS_EXTERNAL_REF_PROCESSING_FAILED',
                error instanceof Error ? error.message : 'External reference processing failed.',
                {severity: 'warning', source: {uri: sourceUri}},
            ),
        );
        return {document: parsed, diagnostics, externalDocumentsLoaded: false};
    }
};

export interface LocalOpenApiFile {
    name: string;
    raw: string;
}

const normalizeVirtualPath = (path: string): string => {
    const output: string[] = [];
    String(path)
        .replace(/\\/g, '/')
        .split('/')
        .forEach(segment => {
            if (!segment || segment === '.') return;
            if (segment === '..') output.pop();
            else output.push(segment);
        });
    return output.join('/');
};

const virtualDirname = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

const canonicalizeLocalReferences = (
    value: any,
    currentFile: string,
    references: Set<string>,
    availableNames: string[],
    seen = new Set<object>(),
): any => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach(item => canonicalizeLocalReferences(item, currentFile, references, availableNames, seen));
        return value;
    }
    Object.entries(value).forEach(([key, child]) => {
        if (key === '$ref' && typeof child === 'string' && !child.startsWith('#')) {
            const [file, fragment = ''] = child.split('#', 2);
            if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(file)) return;
            let canonical = normalizeVirtualPath(`${virtualDirname(currentFile)}/${file}`);
            if (!availableNames.includes(canonical)) {
                const basename = canonical.split('/').pop();
                const matches = availableNames.filter(name => name.split('/').pop() === basename);
                if (matches.length === 1) canonical = matches[0];
            }
            references.add(canonical);
            value[key] = `${canonical}${child.includes('#') ? `#${fragment}` : ''}`;
        } else {
            canonicalizeLocalReferences(child, currentFile, references, availableNames, seen);
        }
    });
    return value;
};

/** Resolve a user-approved local multi-file OpenAPI bundle entirely in memory. */
export const processLocalOpenApiBundle = async (
    files: LocalOpenApiFile[],
): Promise<OpenApiEngineResult & {rootName: string; rootRaw: string}> => {
    if (files.length === 0) throw new Error('No local OpenAPI files were selected.');
    const parsedFiles = files.map(file => {
        const name = normalizeVirtualPath(file.name) || 'openapi.yaml';
        const specification = parseSpecText(file.raw) as any;
        return {name, raw: file.raw, specification};
    });
    const root =
        parsedFiles.find(file => file.specification?.openapi || file.specification?.swagger) ||
        parsedFiles.find(file => /(^|\/)(openapi|swagger|root|index)\.(json|ya?ml)$/i.test(file.name)) ||
        parsedFiles[0];
    if (!root.specification?.openapi && !root.specification?.swagger)
        throw new Error('The selected files do not contain a root OpenAPI or Swagger document.');

    const availableNames = parsedFiles.map(file => file.name);
    const filesystem = parsedFiles.map(file => {
        const references = new Set<string>();
        const specification =
            typeof structuredClone === 'function'
                ? structuredClone(file.specification)
                : JSON.parse(JSON.stringify(file.specification));
        canonicalizeLocalReferences(specification, file.name, references, availableNames);
        return {
            dir: virtualDirname(file.name),
            filename: file.name,
            isEntrypoint: file === root,
            references: Array.from(references),
            specification,
        };
    });
    const diagnostics: Diagnostic[] = [];
    try {
        const {validate, dereference} = await import('@scalar/openapi-parser');
        const validation = await validate(filesystem as any);
        diagnostics.push(...summarizeEngineValidationErrors(validation.errors || []));
        const resolved = dereference(filesystem as any);
        (resolved.errors || []).forEach(error =>
            diagnostics.push(
                diagnostic(error.code ? `OAS_REF_${error.code}` : 'OAS_REF_RESOLUTION_FAILED', error.message, {
                    source: {pointer: formatEngineErrorPath(error.path)},
                }),
            ),
        );
        const resolvedRoot = resolved.schema || root.specification;
        const document = String((resolvedRoot as any).swagger || '').startsWith('2.')
            ? normalizeOpenApiSpec(resolvedRoot as any)
            : ({
                  ...(resolvedRoot as any),
                  paths: (resolvedRoot as any).paths || {},
                  components: (resolvedRoot as any).components || {},
              } as OpenApiSpec);
        diagnostics.push(
            diagnostic(
                'OAS_LOCAL_BUNDLE_RESOLVED',
                `Loaded ${files.length} user-selected local document(s); ${Math.max(0, files.length - 1)} can satisfy external references.`,
                {severity: 'info'},
            ),
        );
        return {
            document,
            diagnostics,
            externalDocumentsLoaded: files.length > 1,
            rootName: root.name,
            rootRaw: root.raw,
        };
    } catch (error) {
        const fallback = normalizeOpenApiSpec(root.specification);
        diagnostics.push(
            diagnostic(
                'OAS_LOCAL_BUNDLE_FAILED',
                `${error instanceof Error ? error.message : 'Local bundle resolution failed'}. The root document remains available.`,
            ),
        );
        return {
            document: fallback,
            diagnostics,
            externalDocumentsLoaded: false,
            rootName: root.name,
            rootRaw: root.raw,
        };
    }
};
