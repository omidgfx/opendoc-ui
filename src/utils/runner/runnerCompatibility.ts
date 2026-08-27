import type {OpenApiSpec, Operation} from '../../types';
import {
    collectReferenceIssuesIn,
    getDocumentOperations,
    getMergedParameters,
    resolveReference,
    resolveRequestBody,
} from '../openapi';
import {declaredContentIsBinary} from './runnerResponse';

export type RunnerCompatibilityCategory = 'partial' | 'browser' | 'binary' | 'unresolved';

export interface RunnerCompatibilityEndpoint {
    path: string;
    method: string;
    summary: string;
}

export interface RunnerCompatibilityFinding {
    id: string;
    category: RunnerCompatibilityCategory;
    title: string;
    detail: string;
    endpoints: RunnerCompatibilityEndpoint[];
}

export type RunnerCompatibilityRating = 'A' | 'B' | 'C' | 'D';

export interface RunnerEndpointCompatibility extends RunnerCompatibilityEndpoint {
    rating: RunnerCompatibilityRating;
    score: number;
    categories: RunnerCompatibilityCategory[];
    notes: string[];
    parameterCount: number;
    requestMediaTypes: string[];
    responseMediaTypes: string[];
    auth: string;
}

export interface RunnerCompatibilityReport {
    totalOperations: number;
    standardOperations: number;
    reviewOperations: number;
    browserLimitedOperations: number;
    binaryOperations: number;
    unresolvedOperations: number;
    findings: RunnerCompatibilityFinding[];
    endpoints: RunnerEndpointCompatibility[];
}

const SUPPORTED_PARAMETER_LOCATIONS = new Set(['path', 'query', 'querystring', 'header', 'cookie']);
const SUPPORTED_PARAMETER_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);
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
const categoryOrder: RunnerCompatibilityCategory[] = ['unresolved', 'partial', 'browser', 'binary'];

const responseCanBeSuccessful = (code: string): boolean =>
    /^2(?:\d{2}|xx)$/i.test(code) || code.toLowerCase() === 'default';

const normalizedSchemaTypes = (schema: any): string[] => {
    if (!schema || typeof schema !== 'object' || schema.type === undefined) return [];
    return Array.isArray(schema.type) ? schema.type.map(String) : [String(schema.type)];
};

export const analyzeRunnerCompatibility = (spec: OpenApiSpec): RunnerCompatibilityReport => {
    const operations = getDocumentOperations(spec);
    const findingMap = new Map<string, RunnerCompatibilityFinding>();
    const endpointCategories = new Map<string, Set<RunnerCompatibilityCategory>>();

    const addFinding = (
        id: string,
        category: RunnerCompatibilityCategory,
        title: string,
        detail: string,
        endpoint: RunnerCompatibilityEndpoint,
    ) => {
        const endpointKey = `${endpoint.method.toLowerCase()}:${endpoint.path}`;
        const categories = endpointCategories.get(endpointKey) || new Set<RunnerCompatibilityCategory>();
        categories.add(category);
        endpointCategories.set(endpointKey, categories);
        const existing = findingMap.get(id);
        if (existing) {
            if (!existing.endpoints.some(item => item.path === endpoint.path && item.method === endpoint.method))
                existing.endpoints.push(endpoint);
            return;
        }
        findingMap.set(id, {id, category, title, detail, endpoints: [endpoint]});
    };

    operations.forEach(({path, method, operation}) => {
        const endpoint: RunnerCompatibilityEndpoint = {
            path,
            method: method.toUpperCase(),
            summary: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
        };
        const pathItem = (spec.paths as any)?.[path] || {};

        if (collectReferenceIssuesIn({pathItem, operation}, spec).length > 0) {
            addFinding(
                'unresolved-references',
                'unresolved',
                'Unresolved or external references',
                'These operations still contain references that are unavailable in the loaded document. Bundle or select the related files before relying on generated forms or requests.',
                endpoint,
            );
        }

        const parameters = getMergedParameters(pathItem, operation, spec);
        parameters.forEach((parameter: any) => {
            const location = String(parameter.in || '');
            if (!SUPPORTED_PARAMETER_LOCATIONS.has(location)) {
                addFinding(
                    'unsupported-parameter-location',
                    'partial',
                    'Unknown parameter locations',
                    'The Runner only maps path, query, querystring, header, and cookie parameters to browser requests.',
                    endpoint,
                );
            }
            const types = normalizedSchemaTypes(parameter.schema ?? parameter);
            if (types.some(type => !SUPPORTED_PARAMETER_TYPES.has(type))) {
                addFinding(
                    'uncommon-parameter-types',
                    'partial',
                    'Uncommon parameter schema types',
                    'These parameters remain editable as permissive text, but their declared schema type has no specialized control.',
                    endpoint,
                );
            }
            if (parameter.content && Object.keys(parameter.content).length > 1) {
                addFinding(
                    'multi-content-parameters',
                    'partial',
                    'Parameters with multiple media types',
                    'OpenAPI parameters should select one content media type; the Runner serializes the first declared entry.',
                    endpoint,
                );
            }
            if (location === 'cookie') {
                addFinding(
                    'manual-cookie-parameters',
                    'browser',
                    'Manual cookie parameters',
                    'Browser fetch cannot inject a Cookie header. Only cookies already managed by the browser can be sent.',
                    endpoint,
                );
            }
            if (location === 'header' && FORBIDDEN_BROWSER_HEADERS.has(String(parameter.name || '').toLowerCase())) {
                addFinding(
                    'forbidden-browser-headers',
                    'browser',
                    'Browser-controlled headers',
                    'The browser may remove or reject these documented headers even when a value is entered.',
                    endpoint,
                );
            }
        });

        const requestBody = resolveRequestBody(operation.requestBody, spec);
        if ((method.toLowerCase() === 'get' || method.toLowerCase() === 'head') && requestBody) {
            addFinding(
                'get-head-request-bodies',
                'browser',
                'GET/HEAD request bodies',
                'Browser fetch does not permit a body on GET or HEAD, so the Runner omits it and reports a notice. Prefer OAS 3.2 QUERY when the operation is safe, idempotent, and needs a body.',
                endpoint,
            );
        }
        // QUERY (RFC 10008) is not a CORS safelisted method; cross-origin runs
        // always preflight. Same-origin is fine. Body is sent (unlike GET/HEAD).
        if (method.toLowerCase() === 'query') {
            addFinding(
                'query-cors-preflight',
                'browser',
                'QUERY CORS preflight',
                'QUERY with a body is sent by the browser Runner. Cross-origin calls require a successful OPTIONS preflight with Access-Control-Allow-Methods including QUERY (and the usual Allow-Headers for Content-Type / auth).',
                endpoint,
            );
        }
        Object.entries(requestBody?.content || {}).forEach(([, media]: [string, any]) => {
            if (
                media?.encoding &&
                Object.values(media.encoding).some(
                    (encoding: any) => encoding?.headers && Object.keys(encoding.headers).length > 0,
                )
            ) {
                addFinding(
                    'multipart-part-headers',
                    'partial',
                    'Multipart custom part headers',
                    'Browser FormData cannot emit arbitrary per-part headers. File and ordinary multipart fields are still sent.',
                    endpoint,
                );
            }
        });

        if ((operation as any).callbacks && Object.keys((operation as any).callbacks).length > 0) {
            addFinding(
                'callbacks-documentation-only',
                'partial',
                'Callback operations are documentation-only',
                'The primary operation is runnable, but callback operations initiated by the provider are not emitted by the outbound Runner.',
                endpoint,
            );
        }

        const responseEntries = Object.entries(operation.responses || {});
        const successfulResponses = responseEntries.filter(([code]) => responseCanBeSuccessful(code));
        if (successfulResponses.length === 0) {
            addFinding(
                'missing-success-responses',
                'partial',
                'No successful response is declared',
                'OpenDoc can execute these operations, but the specification does not describe a 2xx/default payload. It therefore cannot pre-classify text versus binary success data; actual response headers remain authoritative.',
                endpoint,
            );
        }
        let declaresBinaryResponse = false;
        successfulResponses.forEach(([, response]) => {
            const resolvedResponse = resolveReference(response, spec) || response;
            const dispositionHeader = Object.keys(resolvedResponse?.headers || {}).some(
                name => name.toLowerCase() === 'content-disposition',
            );
            if (dispositionHeader) declaresBinaryResponse = true;
            Object.entries(resolvedResponse?.content || {}).forEach(([mediaType, media]: [string, any]) => {
                const schema = media?.schema ? resolveReference(media.schema, spec) || media.schema : null;
                if (declaredContentIsBinary(mediaType, schema)) declaresBinaryResponse = true;
            });
        });
        if (declaresBinaryResponse) {
            addFinding(
                'binary-success-responses',
                'binary',
                'Declared binary or attachment responses',
                'The request is sent, but binary body streams are cancelled immediately after response headers and represented as metadata. OpenDoc never starts a browser file download.',
                endpoint,
            );
        }

        const effectiveSecurity = operation.security === undefined ? spec.security || [] : operation.security || [];
        type SecurityAssessment = {category: 'supported' | 'browser' | 'partial' | 'unresolved'; schemeIds: string[]};
        const assessments: SecurityAssessment[] = effectiveSecurity.map(requirement => {
            const schemeIds = Object.keys(requirement || {});
            let category: SecurityAssessment['category'] = 'supported';
            schemeIds.forEach(schemeId => {
                const rawScheme = spec.components?.securitySchemes?.[schemeId] as any;
                const scheme = rawScheme ? resolveReference(rawScheme, spec) || rawScheme : null;
                if (!scheme) category = 'unresolved';
                else if (category !== 'unresolved') {
                    const type = String(scheme.type || '').toLowerCase();
                    const cookie = type === 'apikey' && String(scheme.in || '').toLowerCase() === 'cookie';
                    const oauthInteractive =
                        type === 'oauth2' &&
                        Boolean(
                            scheme.flows?.authorizationCode?.authorizationUrl ||
                            scheme.flows?.implicit?.authorizationUrl,
                        );
                    if (cookie || type === 'mutualtls' || oauthInteractive)
                        category = category === 'partial' ? 'partial' : 'browser';
                    else if (type === 'oauth2' && !oauthInteractive) category = 'partial';
                    else if (!['apikey', 'http', 'oauth2', 'openidconnect'].includes(type)) category = 'partial';
                }
            });
            return {category, schemeIds};
        });
        const rank = {supported: 0, browser: 1, partial: 2, unresolved: 3};
        const best = assessments.sort((left, right) => rank[left.category] - rank[right.category])[0];
        if (best?.category === 'browser') {
            addFinding(
                'browser-managed-auth',
                'browser',
                'Browser-managed authentication',
                'The best available security alternative relies on browser-managed cookies, client certificates, or an interactive OAuth redirect and token-endpoint CORS.',
                endpoint,
            );
        } else if (best?.category === 'partial') {
            addFinding(
                'partial-security-schemes',
                'partial',
                'Security flow needs manual setup',
                'The best available security alternative requires a manually supplied token or a custom trusted transport.',
                endpoint,
            );
        } else if (best?.category === 'unresolved') {
            addFinding(
                'unresolved-security-schemes',
                'unresolved',
                'Missing security scheme definitions',
                'Every security alternative references an absent or unresolved scheme.',
                endpoint,
            );
        }
    });

    const endpointsWith = (...categories: RunnerCompatibilityCategory[]) =>
        Array.from(endpointCategories.values()).filter(value => categories.some(category => value.has(category)))
            .length;
    const standardOperations = operations.filter(({path, method}) => {
        const categories = endpointCategories.get(`${method.toLowerCase()}:${path}`);
        return (
            !categories || (!categories.has('partial') && !categories.has('browser') && !categories.has('unresolved'))
        );
    }).length;
    const findings = Array.from(findingMap.values()).sort((left, right) => {
        const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
        return (
            categoryDifference ||
            right.endpoints.length - left.endpoints.length ||
            left.title.localeCompare(right.title)
        );
    });
    const endpointReports: RunnerEndpointCompatibility[] = operations.map(({path, method, operation}) => {
        const key = `${method.toLowerCase()}:${path}`;
        const categories = Array.from(endpointCategories.get(key) || []).sort(
            (left, right) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right),
        );
        const has = (category: RunnerCompatibilityCategory) => categories.includes(category);
        const rating: RunnerCompatibilityRating = has('unresolved')
            ? 'D'
            : has('partial')
              ? 'C'
              : has('browser')
                ? 'B'
                : 'A';
        const score = has('unresolved') ? 35 : has('partial') ? 60 : has('browser') ? 78 : has('binary') ? 95 : 100;
        const pathItem = (spec.paths as any)?.[path] || {};
        const requestBody = resolveRequestBody(operation.requestBody, spec);
        const responseMediaTypes = Array.from(
            new Set(
                Object.values(operation.responses || {}).flatMap((response: any) => {
                    const resolved = resolveReference(response, spec) || response;
                    return Object.keys(resolved?.content || {});
                }),
            ),
        );
        const security = operation.security === undefined ? spec.security || [] : operation.security || [];
        const auth =
            security.length === 0
                ? 'Public'
                : security.map(requirement => Object.keys(requirement || {}).join(' + ') || 'Anonymous').join(' OR ');
        const notes = findings
            .filter(finding =>
                finding.endpoints.some(
                    endpoint => endpoint.path === path && endpoint.method.toLowerCase() === method.toLowerCase(),
                ),
            )
            .map(finding => finding.title);
        return {
            path,
            method: method.toUpperCase(),
            summary: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
            rating,
            score,
            categories,
            notes,
            parameterCount: getMergedParameters(pathItem, operation, spec).length,
            requestMediaTypes: Object.keys(requestBody?.content || {}),
            responseMediaTypes,
            auth,
        };
    });

    return {
        totalOperations: operations.length,
        standardOperations,
        reviewOperations: endpointsWith('partial', 'unresolved'),
        browserLimitedOperations: endpointsWith('browser'),
        binaryOperations: endpointsWith('binary'),
        unresolvedOperations: endpointsWith('unresolved'),
        findings,
        endpoints: endpointReports,
    };
};
