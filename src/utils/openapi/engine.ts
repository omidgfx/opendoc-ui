import type {Diagnostic, OpenApiSpec} from '../../types';
import {diagnostic} from '../../types';
import {normalizeOpenApiSpec} from './compat';

const MAX_EXTERNAL_DOCUMENTS = 16;
const MAX_EXTERNAL_BYTES = 5 * 1024 * 1024;
const EXTERNAL_TIMEOUT_MS = 10_000;

const containsExternalRef = (value: unknown, visited = new Set<object>()): boolean => {
    if (!value || typeof value !== 'object')
        return false;
    if (visited.has(value as object))
        return false;
    visited.add(value as object);
    if (Array.isArray(value))
        return value.some(item => containsExternalRef(item, visited));
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === '$ref' && typeof child === 'string' && !child.startsWith('#'))
            return true;
        if (containsExternalRef(child, visited))
            return true;
    }
    return false;
};

const safeReferenceFetch = (rootUri: string) => async (requested: string): Promise<Response> => {
    const root = new URL(rootUri);
    const target = new URL(requested, root);
    if (!['http:', 'https:'].includes(target.protocol))
        throw new Error(`External reference protocol '${target.protocol}' is not allowed.`);
    if (target.origin !== root.origin)
        throw new Error(`Cross-origin external reference '${target.href}' is blocked. Bundle it with the root document or serve it from ${root.origin}.`);

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
    try {
        const response = await fetch(target.href, {
            signal: controller.signal,
            credentials: 'omit',
            redirect: 'follow',
            cache: 'no-store',
        });
        if (response.url && new URL(response.url).origin !== root.origin)
            throw new Error(`External reference redirect left the allowed origin: ${response.url}`);
        if (!response.ok)
            throw new Error(`External reference returned HTTP ${response.status}: ${target.href}`);
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
): Promise<OpenApiEngineResult> => {
    const diagnostics: Diagnostic[] = [];
    try {
        const {validate, load, dereference} = await import('@scalar/openapi-parser');
        const validation = await validate(raw);
        (validation.errors || []).forEach(error => diagnostics.push(diagnostic(
            error.code ? `OAS_ENGINE_${error.code}` : 'OAS_ENGINE_VALIDATION',
            error.message,
            {severity: 'warning', source: {pointer: error.path?.join('/')}},
        )));

        if (!containsExternalRef(parsed))
            return {document: parsed, diagnostics, externalDocumentsLoaded: false};

        if (!sourceUri) {
            diagnostics.push(diagnostic(
                'OAS_EXTERNAL_REF_LOCAL_FILES_REQUIRED',
                'This local/inline specification contains external references. Open all related files through a bundled document; a browser cannot read sibling files without explicit selection.',
            ));
            return {document: parsed, diagnostics, externalDocumentsLoaded: false};
        }

        const {fetchUrls} = await import('@scalar/openapi-parser/plugins/fetch-urls');
        const absoluteSource = typeof window !== 'undefined'
            ? new URL(sourceUri, window.location.href).href
            : new URL(sourceUri).href;
        const loaded = await load(raw, {
            filename: absoluteSource,
            plugins: [fetchUrls({
                limit: MAX_EXTERNAL_DOCUMENTS,
                fetch: safeReferenceFetch(absoluteSource),
            })],
        });
        (loaded.errors || []).forEach(error => diagnostics.push(diagnostic(
            error.code ? `OAS_EXTERNAL_${error.code}` : 'OAS_EXTERNAL_REF_FAILED',
            error.message,
            {source: {uri: absoluteSource, pointer: error.path?.join('/')}},
        )));
        const resolved = dereference(loaded.filesystem);
        (resolved.errors || []).forEach(error => diagnostics.push(diagnostic(
            error.code ? `OAS_REF_${error.code}` : 'OAS_REF_RESOLUTION_FAILED',
            error.message,
            {source: {uri: absoluteSource, pointer: error.path?.join('/')}},
        )));
        if (!resolved.schema)
            return {document: parsed, diagnostics, externalDocumentsLoaded: false};

        let document: OpenApiSpec;
        if (String((resolved.schema as any).swagger || '').startsWith('2.'))
            document = normalizeOpenApiSpec(resolved.schema as any);
        else {
            const schema = resolved.schema as any;
            schema.paths ||= {};
            schema.components ||= {};
            document = schema as OpenApiSpec;
        }
        diagnostics.push(diagnostic(
            'OAS_EXTERNAL_REFS_RESOLVED',
            `Resolved ${Math.max(0, loaded.filesystem.length - 1)} external OpenAPI document(s) from the root origin.`,
            {severity: 'info', source: {uri: absoluteSource}},
        ));
        return {document, diagnostics, externalDocumentsLoaded: true};
    } catch (error) {
        diagnostics.push(diagnostic(
            'OAS_ENGINE_PROCESSING_FAILED',
            `${error instanceof Error ? error.message : 'OpenAPI engine failed'}. The original parseable document remains available; unresolved features will be reported where encountered.`,
            {severity: 'warning', source: sourceUri ? {uri: sourceUri} : undefined},
        ));
        return {document: parsed, diagnostics, externalDocumentsLoaded: false};
    }
};
