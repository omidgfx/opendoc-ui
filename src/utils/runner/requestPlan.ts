import type {ActiveAuth, Diagnostic, OpenApiSpec, Operation} from '../../types';
import {diagnostic} from '../../types';
import {applyAuthToRequest} from './auth';
import {parseStructuredBody, serializeUrlEncodedBody} from './bodyFormats';
import {
    isJsonMediaType,
    normalizeParameterValue,
    queryStringFromPairs,
    serializeOpenApiParameter,
    type SerializedPair,
} from '../openapi/serialization';
import {getMergedParameters, resolveParameter, resolveReference, resolveRequestBody} from '../openapi';
import {resolveEffectiveServer, type ResolvedServer} from '../specification/serverResolver';
import {schemaDeclaresBinary} from './runnerResponse';

export type RunnerInputValue = unknown;
export type ParameterValueState = Record<string, RunnerInputValue>;

export const parameterStateKey = (location: string, name: string): string => `${location}:${name}`;

export interface RequestBodyIntent {
    kind: 'none' | 'raw' | 'urlencoded' | 'multipart' | 'binary';
    mediaType?: string;
    text?: string;
    value?: unknown;
    file?: File | Blob | null;
    files?: Record<string, File | Blob | null>;
    encoding?: Record<string, any>;
    binaryFields?: string[];
    binaryPaths?: string[];
}

export interface RequestIntent {
    method: string;
    server: ResolvedServer;
    pathTemplate: string;
    path: string;
    query: SerializedPair[];
    headers: Record<string, string>;
    cookies: SerializedPair[];
    body: RequestBodyIntent;
    fetchCredentials: RequestCredentials;
    diagnostics: Diagnostic[];
}

export interface RequestPlan {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: BodyInit | null;
    fetchCredentials: RequestCredentials;
    diagnostics: Diagnostic[];
    intent: RequestIntent;
}

export interface CompileRequestInput {
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    selectedServer?: string;
    serverVariables?: Record<string, string>;
    activeAuth: ActiveAuth;
    /** Canonical values keyed by location:name. */
    parameterValues?: ParameterValueState;
    /** Backward-compatible name-only values used by AI actions and old saved state. */
    params?: Record<string, RunnerInputValue>;
    /** Arbitrary headers and backward-compatible values for header parameters. */
    headers?: Record<string, string>;
    body?: string;
    bodyType?: string;
    selectedFile?: File | Blob | null;
    selectedFiles?: Record<string, File | Blob | null>;
}

const isMissing = (value: unknown): boolean => value === undefined || value === null || value === '';

const findHeaderName = (headers: Record<string, string>, requestedName: string): string | undefined =>
    Object.keys(headers).find(name => name.toLowerCase() === requestedName.toLowerCase());

const setHeader = (
    headers: Record<string, string>,
    name: string,
    value: string,
    diagnostics: Diagnostic[],
    source: string,
) => {
    const existing = findHeaderName(headers, name);
    if (existing) {
        if (headers[existing] === value) return;
        diagnostics.push(
            diagnostic('RUN_HEADER_VALUE_REPLACED', `${source} replaced the existing '${existing}' header value.`, {
                severity: 'info',
            }),
        );
        delete headers[existing];
    }
    headers[name] = value;
};

const valueForParameter = (input: CompileRequestInput, parameter: any): unknown => {
    const canonicalKey = parameterStateKey(parameter.in, parameter.name);
    if (input.parameterValues && Object.prototype.hasOwnProperty.call(input.parameterValues, canonicalKey))
        return input.parameterValues[canonicalKey];
    if (input.params && Object.prototype.hasOwnProperty.call(input.params, canonicalKey))
        return input.params[canonicalKey];
    if (input.params && Object.prototype.hasOwnProperty.call(input.params, parameter.name))
        return input.params[parameter.name];
    if (parameter.in === 'header') {
        const lowerCanonical = canonicalKey.toLowerCase();
        const lowerName = String(parameter.name).toLowerCase();
        if (input.parameterValues) {
            for (const k of Object.keys(input.parameterValues)) {
                if (k.toLowerCase() === lowerCanonical || k.toLowerCase() === lowerName) {
                    return input.parameterValues[k];
                }
            }
        }
        if (input.params) {
            for (const k of Object.keys(input.params)) {
                if (k.toLowerCase() === lowerCanonical || k.toLowerCase() === lowerName) {
                    return input.params[k];
                }
            }
        }
        const headerName = findHeaderName(input.headers || {}, parameter.name);
        if (headerName) return input.headers?.[headerName];
    }
    return undefined;
};

const collectAcceptTypes = (operation: Operation): string[] => {
    const result: string[] = [];
    const entries = Object.entries(operation.responses || {});
    const successful = entries.filter(([code]) => /^2(?:\d{2}|xx)$/i.test(code));
    const append = (response: any) => {
        Object.keys(response?.content || {}).forEach(mediaType => {
            if (!result.some(value => value.toLowerCase() === mediaType.toLowerCase())) result.push(mediaType);
        });
    };
    successful.forEach(([, response]) => append(response));
    entries.filter(([code]) => !/^2(?:\d{2}|xx)$/i.test(code)).forEach(([, response]) => append(response));
    if (
        (successful.length === 0 ||
            !successful.some(([, response]) => Object.keys((response as any)?.content || {}).length > 0)) &&
        !result.includes('*/*')
    )
        result.push('*/*');
    return result;
};

const checkPattern = (parameter: any, value: unknown, diagnostics: Diagnostic[]) => {
    const pattern = parameter?.schema?.pattern || parameter?.pattern;
    if (!pattern || isMissing(value)) return;
    try {
        if (!new RegExp(pattern).test(String(value))) {
            diagnostics.push(
                diagnostic(
                    'RUN_PARAMETER_PATTERN_MISMATCH',
                    `Parameter '${parameter.name}' does not match its documented pattern.`,
                    {source: {pointer: `/parameters/${parameter.in}:${parameter.name}`}},
                ),
            );
        }
    } catch {
        diagnostics.push(
            diagnostic(
                'OAS_PARAMETER_PATTERN_INVALID',
                `The documented pattern for '${parameter.name}' is not a valid regular expression.`,
            ),
        );
    }
};

const createBodyIntent = (input: CompileRequestInput, diagnostics: Diagnostic[]): RequestBodyIntent => {
    const requestBody = resolveRequestBody(input.operation.requestBody, input.spec);
    const content = requestBody?.content || {};
    const mediaType =
        input.bodyType ||
        Object.keys(content)[0] ||
        (input.selectedFile ? 'application/octet-stream' : 'application/json');
    const media = content[mediaType] || {};
    const text = input.body ?? '';
    if (media.schema === false) {
        diagnostics.push(
            diagnostic(
                'RUN_BODY_SCHEMA_IMPOSSIBLE',
                'The selected media type uses the boolean schema false; no body can validate against it.',
            ),
        );
    }

    if (
        requestBody?.required &&
        !text &&
        !input.selectedFile &&
        !Object.values(input.selectedFiles || {}).some(Boolean)
    ) {
        diagnostics.push(diagnostic('RUN_REQUIRED_BODY_MISSING', 'The required request body is empty.'));
    }

    const normalized = mediaType.toLowerCase().split(';', 1)[0].trim();
    const resolvedMediaSchema = media.schema ? resolveReference(media.schema, input.spec) || media.schema : null;
    if (
        input.selectedFile &&
        (normalized === 'application/octet-stream' || schemaDeclaresBinary(resolvedMediaSchema))
    ) {
        return {kind: 'binary', mediaType, file: input.selectedFile};
    }
    if (normalized === 'multipart/form-data') {
        let value: unknown = {};
        if (text) {
            try {
                value = parseStructuredBody(text, mediaType) ?? {};
            } catch (error) {
                diagnostics.push(
                    diagnostic(
                        'RUN_MULTIPART_TEXT_UNPARSED',
                        `Multipart field text could not be parsed (${error instanceof Error ? error.message : 'unknown error'}). It will be included as a raw 'body' field.`,
                    ),
                );
                value = {body: text};
            }
        }
        Object.entries(media.encoding || {}).forEach(([field, encoding]: [string, any]) => {
            if (encoding?.headers && Object.keys(encoding.headers).length > 0) {
                diagnostics.push(
                    diagnostic(
                        'RUN_MULTIPART_PART_HEADERS_UNSUPPORTED',
                        `Multipart field '${field}' declares custom part headers that browser FormData cannot represent.`,
                        {transport: 'browser'},
                    ),
                );
            }
        });
        const files = {...(input.selectedFiles || {})};
        const schemaProperties =
            resolvedMediaSchema && typeof resolvedMediaSchema === 'object' && resolvedMediaSchema.properties
                ? (resolvedMediaSchema.properties as Record<string, any>)
                : {};
        const binaryFields = Object.keys(schemaProperties).filter(name =>
            schemaDeclaresBinary(resolveReference(schemaProperties[name], input.spec) || schemaProperties[name]),
        );
        const binaryPaths: string[] = [];
        const seenSchemas = new Set<object>();
        const collectBinaryPaths = (schema: any, prefix: string, depth: number) => {
            if (!schema || typeof schema !== 'object' || depth > 16 || seenSchemas.has(schema)) return;
            if (schemaDeclaresBinary(schema)) {
                if (prefix) binaryPaths.push(prefix);
                return;
            }
            seenSchemas.add(schema);
            if (schema.properties && typeof schema.properties === 'object') {
                Object.entries(schema.properties).forEach(([key, child]: [string, any]) => {
                    collectBinaryPaths(
                        resolveReference(child, input.spec) || child,
                        prefix ? `${prefix}\u0000${key}` : key,
                        depth + 1,
                    );
                });
            }
        };
        collectBinaryPaths(resolvedMediaSchema, '', 0);
        if (input.selectedFile) {
            const targetKey = binaryFields.find(name => !files[name]) || (files.file ? undefined : 'file');
            if (targetKey) files[targetKey] = input.selectedFile;
        }
        return {kind: 'multipart', mediaType, value, files, encoding: media.encoding || {}, binaryFields, binaryPaths};
    }
    if (normalized === 'application/x-www-form-urlencoded') {
        let value: unknown = text;
        try {
            const trimmed = text.trim();
            value = trimmed
                ? trimmed.includes('=') || /^[\s]*[\[{]/.test(trimmed)
                    ? parseStructuredBody(text, mediaType)
                    : trimmed
                : {};
        } catch (error) {
            diagnostics.push(
                diagnostic(
                    'RUN_URLENCODED_TEXT_UNPARSED',
                    `The form body could not be parsed: ${error instanceof Error ? error.message : 'unknown error'}.`,
                ),
            );
        }
        return {kind: 'urlencoded', mediaType, text, value, encoding: media.encoding || {}};
    }
    if (!text && !input.selectedFile) return {kind: 'none', mediaType};

    if (isJsonMediaType(mediaType) && text) {
        try {
            JSON.parse(text);
        } catch (error) {
            diagnostics.push(
                diagnostic(
                    'RUN_BODY_JSON_INVALID',
                    `The body is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}.`,
                ),
            );
        }
    }
    return {kind: 'raw', mediaType, text};
};

const unresolvedExternalRefDiagnostics = (value: unknown, seen = new Set<object>()): Diagnostic[] => {
    if (!value || typeof value !== 'object' || seen.has(value as object)) return [];
    seen.add(value as object);
    if (Array.isArray(value)) return value.flatMap(item => unresolvedExternalRefDiagnostics(item, seen));
    const diagnostics: Diagnostic[] = [];
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        if (key === '$ref' && typeof child === 'string' && !child.startsWith('#')) {
            diagnostics.push(
                diagnostic('OAS_EXTERNAL_REF_UNRESOLVED', `External reference '${child}' is unresolved.`, {
                    source: {pointer: child},
                }),
            );
        } else {
            diagnostics.push(...unresolvedExternalRefDiagnostics(child, seen));
        }
    });
    return diagnostics;
};

const unresolvedParameterDiagnostics = (pathItem: any, operation: Operation, spec: OpenApiSpec): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const raw = [
        ...(Array.isArray(pathItem?.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(operation?.parameters) ? operation.parameters : []),
    ];
    raw.forEach((parameter: any) => {
        if (parameter?.$ref && resolveParameter(parameter, spec)?.$ref) {
            diagnostics.push(
                diagnostic(
                    'OAS_PARAMETER_REF_UNRESOLVED',
                    `Parameter reference '${parameter.$ref}' could not be resolved.`,
                    {source: {pointer: parameter.$ref}},
                ),
            );
        }
    });
    return diagnostics;
};

export const compileRequestIntent = (input: CompileRequestInput): RequestIntent => {
    // Document-wide parser diagnostics belong to the specification loader, not
    // to every endpoint execution. Runner diagnostics are compiled locally.
    const diagnostics: Diagnostic[] = [];
    const pathItem = (input.spec.paths as any)?.[input.path] || {};
    const server = resolveEffectiveServer({
        spec: input.spec,
        pathItem,
        operation: input.operation,
        selectedServer: input.selectedServer,
        selectedVariables: input.serverVariables,
    });
    diagnostics.push(
        ...server.diagnostics,
        ...unresolvedParameterDiagnostics(pathItem, input.operation, input.spec),
        ...unresolvedExternalRefDiagnostics(input.operation),
    );

    const mergedParameters = getMergedParameters(pathItem, input.operation, input.spec);
    let processedPath = input.path;
    const query: SerializedPair[] = [];
    const cookies: SerializedPair[] = [];
    const parameterHeaders: Record<string, string> = {};

    mergedParameters.forEach((parameter: any) => {
        const value = valueForParameter(input, parameter);
        if (isMissing(value) && !parameter.allowEmptyValue) {
            if (parameter.required) {
                diagnostics.push(
                    diagnostic(
                        'RUN_REQUIRED_PARAMETER_MISSING',
                        `Required ${parameter.in} parameter '${parameter.name}' is empty.`,
                        {
                            source: {pointer: `/parameters/${parameter.in}:${parameter.name}`},
                            blocking: parameter.in === 'path',
                        },
                    ),
                );
            }
            return;
        }
        checkPattern(parameter, value, diagnostics);
        try {
            const serialized = serializeOpenApiParameter(parameter, normalizeParameterValue(parameter, value));
            if (parameter.in === 'path' && serialized.pathValue !== undefined)
                processedPath = processedPath.split(`{${parameter.name}}`).join(serialized.pathValue);
            query.push(...serialized.query);
            Object.entries(serialized.headers).forEach(([name, headerValue]) =>
                setHeader(parameterHeaders, name, headerValue, diagnostics, `Parameter '${parameter.name}'`),
            );
            cookies.push(...serialized.cookies);
        } catch (error) {
            diagnostics.push(
                diagnostic(
                    'RUN_PARAMETER_SERIALIZATION_FAILED',
                    `Parameter '${parameter.name}' could not be serialized: ${error instanceof Error ? error.message : 'unknown error'}.`,
                ),
            );
        }
    });

    if (/\{[^{}]+}/.test(processedPath)) {
        diagnostics.push(
            diagnostic('RUN_PATH_PLACEHOLDER_UNRESOLVED', `Path contains unresolved placeholders: ${processedPath}.`, {
                blocking: true,
            }),
        );
    }

    const headers: Record<string, string> = {};
    const acceptTypes = collectAcceptTypes(input.operation);
    setHeader(
        headers,
        'Accept',
        acceptTypes.length > 0 ? acceptTypes.join(', ') : '*/*',
        diagnostics,
        'OpenAPI response content',
    );
    Object.entries(parameterHeaders).forEach(([name, value]) =>
        setHeader(headers, name, value, diagnostics, 'OpenAPI parameter'),
    );
    Object.entries(input.headers || {}).forEach(([name, value]) =>
        setHeader(headers, name, String(value), diagnostics, 'Explicit Runner header'),
    );

    const auth = applyAuthToRequest(input.spec, input.activeAuth, {headers, query, cookies}, input.operation);
    diagnostics.push(...auth.warnings.map(message => diagnostic('RUN_AUTH_NOTICE', message)));

    const body = createBodyIntent(input, diagnostics);
    return {
        method: input.method.toUpperCase(),
        server,
        pathTemplate: input.path,
        path: processedPath,
        query: auth.query,
        headers: auth.headers,
        cookies: auth.cookies,
        body,
        fetchCredentials: auth.credentials,
        diagnostics,
    };
};

const joinServerAndPath = (server: string, path: string): string => {
    if (!server) return path;
    if (!path) return server;
    if (server.endsWith('/') && path.startsWith('/')) return `${server.slice(0, -1)}${path}`;
    if (!server.endsWith('/') && !path.startsWith('/')) return `${server}/${path}`;
    return `${server}${path}`;
};

const appendQuery = (url: string, query: SerializedPair[]): string => {
    const serialized = queryStringFromPairs(query);
    if (!serialized) return url;
    return url.includes('?') ? `${url}&${serialized.slice(1)}` : `${url}${serialized}`;
};

const multipartScalar = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

const firstContentType = (encoding: any): string | undefined =>
    typeof encoding?.contentType === 'string' ? encoding.contentType.split(',')[0].trim() || undefined : undefined;

const encodingPairs = (name: string, value: unknown, encoding: any): SerializedPair[] => {
    const swaggerFormat = encoding?.['x-opendoc-collection-format'];
    if (swaggerFormat && Array.isArray(value)) {
        if (swaggerFormat === 'multi') return value.map(item => ({name, value: multipartScalar(item)}));
        const delimiter =
            swaggerFormat === 'ssv' ? ' ' : swaggerFormat === 'tsv' ? '\t' : swaggerFormat === 'pipes' ? '|' : ',';
        return [{name, value: value.map(multipartScalar).join(delimiter)}];
    }
    if (!encoding || (!encoding.style && encoding.explode === undefined && encoding.allowReserved === undefined))
        return [];
    const serialized = serializeOpenApiParameter(
        {
            name,
            in: 'query',
            schema: {type: Array.isArray(value) ? 'array' : value && typeof value === 'object' ? 'object' : 'string'},
            style: encoding.style || 'form',
            explode: encoding.explode,
            allowReserved: encoding.allowReserved,
        },
        value,
    );
    return serialized.query;
};

const appendMultipartValue = (form: FormData, name: string, value: unknown, encoding: any) => {
    const pairs = encodingPairs(name, value, encoding);
    const contentType = pairs.length > 0 ? undefined : firstContentType(encoding);
    const values =
        pairs.length > 0
            ? pairs
            : Array.isArray(value)
              ? value.map(item => ({name, value: multipartScalar(item)}))
              : [{name, value: multipartScalar(value)}];
    values.forEach(pair => {
        if (contentType && typeof Blob !== 'undefined')
            form.append(pair.name, new Blob([pair.value], {type: contentType}));
        else form.append(pair.name, pair.value);
    });
};

const multipartFileName = (file: File | Blob, fallback: string): string =>
    'name' in file && typeof (file as File).name === 'string' && (file as File).name !== ''
        ? (file as File).name
        : fallback;

const multipartFieldName = (segments: string[]): string => {
    if (segments.length < 2) return segments[0] ?? '';
    return `${segments[0]}${segments
        .slice(1)
        .map(segment => `[${segment}]`)
        .join('')}`;
};

const stripBinaryPlaceholders = (
    value: Record<string, unknown>,
    binaryPaths: string[],
    files: Record<string, File | Blob | null>,
    diagnostics: Diagnostic[],
): void => {
    binaryPaths.forEach(pathKey => {
        const segments = pathKey.split('\u0000');
        const displayPath = segments.join('.');
        const chain: {parent: Record<string, unknown>; key: string}[] = [];
        let target: Record<string, unknown> = value;
        for (let index = 0; index < segments.length - 1; index += 1) {
            const next = target[segments[index]];
            if (!next || typeof next !== 'object' || Array.isArray(next)) return;
            chain.push({parent: target, key: segments[index]});
            target = next as Record<string, unknown>;
        }
        const leafKey = segments[segments.length - 1];
        if (!Object.prototype.hasOwnProperty.call(target, leafKey)) return;
        delete target[leafKey];
        if (!files[pathKey]) {
            diagnostics.push(
                diagnostic(
                    'RUN_MULTIPART_BINARY_FIELD_EMPTY',
                    `Multipart field '${displayPath}' is binary but has no selected file; it was omitted from the request.`,
                    {severity: 'info', transport: 'browser'},
                ),
            );
        }
        for (let index = chain.length - 1; index >= 0; index -= 1) {
            const {parent, key} = chain[index];
            const child = parent[key];
            if (child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child).length === 0)
                delete parent[key];
        }
    });
};

const materializeMultipart = (body: RequestBodyIntent, diagnostics: Diagnostic[]): FormData => {
    const form = new FormData();
    const value =
        body.value && typeof body.value === 'object' && !Array.isArray(body.value)
            ? (body.value as Record<string, unknown>)
            : {};
    const files = body.files || {};
    if (body.binaryPaths && body.binaryPaths.length > 0)
        stripBinaryPlaceholders(value, body.binaryPaths, files, diagnostics);
    const consumed = new Set<string>();
    Object.entries(value).forEach(([name, item]) => {
        const file = files[name];
        const encoding = body.encoding?.[name];
        if (file) {
            form.append(name, file, multipartFileName(file, name));
            consumed.add(name);
        } else {
            appendMultipartValue(form, name, item, encoding);
        }
    });
    Object.entries(files).forEach(([stateKey, file]) => {
        if (!file || consumed.has(stateKey)) return;
        const segments = stateKey.split('\u0000');
        form.append(multipartFieldName(segments), file, multipartFileName(file, segments.join('.')));
    });
    return form;
};

const materializeUrlEncoded = (bodyIntent: RequestBodyIntent): string => {
    if (typeof bodyIntent.value === 'string') return bodyIntent.value;
    if (!bodyIntent.value || typeof bodyIntent.value !== 'object' || Array.isArray(bodyIntent.value))
        return serializeUrlEncodedBody(bodyIntent.value);
    const pairs: SerializedPair[] = [];
    Object.entries(bodyIntent.value as Record<string, unknown>).forEach(([name, value]) => {
        const encoding = bodyIntent.encoding?.[name];
        const styled = encodingPairs(name, value, encoding);
        if (styled.length > 0) {
            pairs.push(...styled);
            return;
        }
        const contentType = firstContentType(encoding);
        if (contentType === 'application/json' || contentType?.endsWith('+json')) {
            pairs.push({name, value: JSON.stringify(value)});
            return;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) pairs.push({name: `${name}[]`, value: ''});
            else value.forEach(part => pairs.push({name: `${name}[]`, value: multipartScalar(part)}));
            return;
        }
        if (value && typeof value === 'object') {
            pairs.push(...bracketPairs(name, value));
            return;
        }
        pairs.push({name, value: multipartScalar(value)});
    });
    return queryStringFromPairs(pairs).slice(1);
};

/** Serialize nested arrays and objects with bracket notation (`j[]=1&k[key]=foo`)
 *  so urlencoded bodies round-trip through the query-string raw editor. */
const bracketPairs = (name: string, value: unknown): SerializedPair[] => {
    const pairs: SerializedPair[] = [];
    const walk = (item: unknown, prefix: string) => {
        if (item === null || item === undefined) return;
        if (Array.isArray(item)) {
            if (item.length === 0) {
                pairs.push({name: `${prefix}[]`, value: ''});
                return;
            }
            item.forEach(part => walk(part, `${prefix}[]`));
            return;
        }
        if (typeof item === 'object') {
            Object.entries(item as Record<string, unknown>).forEach(([key, part]) => walk(part, `${prefix}[${key}]`));
            return;
        }
        pairs.push({name: prefix, value: String(item)});
    };
    walk(value, name);
    return pairs;
};

const cookieTargetMaterializable = (url: string): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return new URL(url, window.location.href).hostname === window.location.hostname;
    } catch {
        return false;
    }
};

const FORBIDDEN_BROWSER_HEADERS = new Set([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'permissions-policy',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via',
]);

export const materializeBrowserRequest = (intent: RequestIntent): RequestPlan => {
    const diagnostics = [...intent.diagnostics];
    const headers = {...intent.headers};
    Object.keys(headers).forEach(name => {
        const lower = name.toLowerCase();
        if (FORBIDDEN_BROWSER_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-')) {
            diagnostics.push(
                diagnostic(
                    'RUN_BROWSER_FORBIDDEN_HEADER',
                    `Header '${name}' cannot be sent by browser fetch (forbidden header name) and was removed from the request.`,
                    {transport: 'browser'},
                ),
            );
            delete headers[name];
        }
    });
    let body: BodyInit | null = null;
    const bodyIntent = intent.body;
    if (bodyIntent.kind === 'raw') {
        body = bodyIntent.text || '';
        if (bodyIntent.mediaType)
            setHeader(headers, 'Content-Type', bodyIntent.mediaType, diagnostics, 'Selected request body');
    } else if (bodyIntent.kind === 'urlencoded') {
        try {
            body = materializeUrlEncoded(bodyIntent);
        } catch {
            body = bodyIntent.text || '';
        }
        if (bodyIntent.mediaType)
            setHeader(headers, 'Content-Type', bodyIntent.mediaType, diagnostics, 'Selected request body');
    } else if (bodyIntent.kind === 'multipart') {
        body = materializeMultipart(bodyIntent, diagnostics);
        const contentTypeName = findHeaderName(headers, 'Content-Type');
        if (contentTypeName) {
            delete headers[contentTypeName];
            diagnostics.push(
                diagnostic(
                    'RUN_MULTIPART_CONTENT_TYPE_MANAGED',
                    'The explicit multipart Content-Type was removed so browser fetch can add the required boundary.',
                    {severity: 'info', transport: 'browser'},
                ),
            );
        }
    } else if (bodyIntent.kind === 'binary' && bodyIntent.file) {
        body = bodyIntent.file;
        if (bodyIntent.mediaType)
            setHeader(headers, 'Content-Type', bodyIntent.mediaType, diagnostics, 'Selected binary body');
    }

    if ((intent.method === 'GET' || intent.method === 'HEAD') && body !== null) {
        diagnostics.push(
            diagnostic(
                'RUN_BROWSER_METHOD_BODY_UNSUPPORTED',
                `Browser fetch does not permit a body on ${intent.method}; the body is omitted.`,
                {transport: 'browser'},
            ),
        );
        body = null;
        const contentTypeName = findHeaderName(headers, 'Content-Type');
        if (contentTypeName) delete headers[contentTypeName];
    }

    const baseUrl = joinServerAndPath(intent.server.url, intent.path);
    const url = appendQuery(baseUrl, intent.query);
    let fetchCredentials = intent.fetchCredentials;
    if (intent.cookies.length > 0) {
        fetchCredentials = 'include';
        const cookieNames = [...new Set(intent.cookies.map(cookie => cookie.name))].join(', ');
        if (cookieTargetMaterializable(url)) {
            diagnostics.push(
                diagnostic(
                    'RUN_COOKIE_PARAM_BROWSER_MANAGED',
                    `Cookie parameters (${cookieNames}) are browser-managed: the Runner writes them into the browser cookie jar for this host when the request runs, because scripts cannot set the Cookie header directly.`,
                    {transport: 'browser', severity: 'info'},
                ),
            );
        } else {
            diagnostics.push(
                diagnostic(
                    'RUN_COOKIE_PARAM_CROSS_ORIGIN',
                    `Cookie parameters (${cookieNames}) cannot be materialized for another host: the browser forbids setting the Cookie header, so only cookies already stored for the target host will be sent.`,
                    {transport: 'browser'},
                ),
            );
        }
    }
    return {
        method: intent.method,
        url,
        headers,
        body,
        fetchCredentials,
        diagnostics,
        intent,
    };
};

export const compileBrowserRequest = (input: CompileRequestInput): RequestPlan =>
    materializeBrowserRequest(compileRequestIntent(input));
