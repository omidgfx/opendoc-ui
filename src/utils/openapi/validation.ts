export interface OpenApiValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    version: 'openapi3.0' | 'openapi3.1' | 'openapi3.2' | 'swagger2' | 'unknown';
}

const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query']);
const isRecord = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const error = (errors: string[], message: string) => errors.push(message);

const detectVersion = (document: Record<string, any>): OpenApiValidationResult['version'] => {
    const openapi = String(document.openapi || '');
    if (/^3\.0(?:\.|$)/.test(openapi)) return 'openapi3.0';
    if (/^3\.1(?:\.|$)/.test(openapi)) return 'openapi3.1';
    if (/^3\.2(?:\.|$)/.test(openapi)) return 'openapi3.2';
    if (/^2\.0(?:\.|$)/.test(String(document.swagger || ''))) return 'swagger2';
    return 'unknown';
};

const validateOperationMap = (
    container: Record<string, any>,
    containerLabel: string,
    version: OpenApiValidationResult['version'],
    errors: string[],
) => {
    Object.entries(container).forEach(([path, pathItem]: [string, any]) => {
        if (containerLabel === 'Path' && !path.startsWith('/')) error(errors, `Path '${path}' must start with '/'.`);
        if (!isRecord(pathItem)) {
            error(errors, `${containerLabel} item '${path}' must be an object.`);
            return;
        }
        if (pathItem.parameters !== undefined && !Array.isArray(pathItem.parameters))
            error(errors, `${containerLabel} item '${path}'.parameters must be an array.`);
        Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
            if (!METHODS.has(method.toLowerCase())) return;
            if (method.toLowerCase() === 'query' && version !== 'openapi3.2') return;
            if (!isRecord(operation)) {
                error(errors, `Operation ${method.toUpperCase()} ${path} must be an object.`);
                return;
            }
            if ((version === 'openapi3.0' || version === 'openapi3.1') && operation.responses === undefined)
                error(errors, `Operation ${method.toUpperCase()} ${path} must define responses.`);
            if (operation.responses !== undefined && !isRecord(operation.responses))
                error(errors, `Operation ${method.toUpperCase()} ${path}.responses must be an object.`);
            if (isRecord(operation.responses)) {
                Object.entries(operation.responses).forEach(([status, response]: [string, any]) => {
                    if (!isRecord(response) && typeof response?.$ref !== 'string')
                        error(
                            errors,
                            `Response ${status} on ${method.toUpperCase()} ${path} must be an object or $ref.`,
                        );
                    else if (
                        isRecord(response) &&
                        response.$ref === undefined &&
                        typeof response.description !== 'string'
                    )
                        error(
                            errors,
                            `Response ${status} on ${method.toUpperCase()} ${path} must include description.`,
                        );
                });
            }
            if (operation.parameters !== undefined && !Array.isArray(operation.parameters))
                error(errors, `Operation ${method.toUpperCase()} ${path}.parameters must be an array.`);
            if (operation.security !== undefined && !Array.isArray(operation.security))
                error(errors, `Operation ${method.toUpperCase()} ${path}.security must be an array.`);
        });
    });
};

export const validateOpenApiDocument = (document: any): OpenApiValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!isRecord(document))
        return {valid: false, errors: ['The specification root must be an object.'], warnings, version: 'unknown'};

    const version = detectVersion(document);
    if (version === 'unknown') {
        const declared = document.openapi || document.swagger;
        error(
            errors,
            declared
                ? `Unsupported OpenAPI/Swagger version '${declared}'. OpenDoc currently recognizes Swagger 2.0 and OpenAPI 3.0, 3.1, and 3.2.`
                : 'The document must declare a supported openapi or swagger version.',
        );
    }
    if (!isRecord(document.info)) error(errors, '`info` must be an object.');
    else {
        if (typeof document.info.title !== 'string' || !document.info.title.trim())
            error(errors, '`info.title` must be a non-empty string.');
        if (typeof document.info.version !== 'string' || !document.info.version.trim())
            error(errors, '`info.version` must be a non-empty string.');
    }

    const pathsRequired = version === 'swagger2' || version === 'openapi3.0';
    if (document.paths === undefined) {
        if (pathsRequired) error(errors, '`paths` must be an object for Swagger 2.0 and OpenAPI 3.0 documents.');
    } else if (!isRecord(document.paths)) {
        error(errors, '`paths` must be an object when present.');
    } else {
        validateOperationMap(document.paths, 'Path', version, errors);
    }

    if (document.webhooks !== undefined) {
        if (version !== 'openapi3.1' && version !== 'openapi3.2')
            warnings.push('`webhooks` is only standardized in OpenAPI 3.1 and later.');
        if (!isRecord(document.webhooks)) error(errors, '`webhooks` must be an object when present.');
        else validateOperationMap(document.webhooks, 'Webhook', version, errors);
    }

    if (version.startsWith('openapi3')) {
        if (document.components !== undefined && !isRecord(document.components))
            error(errors, '`components` must be an object when present.');
        const schemes = document.components?.securitySchemes;
        if (schemes !== undefined && !isRecord(schemes))
            error(errors, '`components.securitySchemes` must be an object.');
        if (isRecord(schemes)) {
            Object.entries(schemes).forEach(([name, scheme]: [string, any]) => {
                if (!isRecord(scheme) && typeof scheme?.$ref !== 'string')
                    error(errors, `Security scheme '${name}' must be an object or $ref.`);
                const type = scheme?.type;
                const allowed = ['apiKey', 'http', 'oauth2', 'openIdConnect'];
                if (version !== 'openapi3.0') allowed.push('mutualTLS');
                if (type && !allowed.includes(type))
                    warnings.push(`Security scheme '${name}' uses unsupported or uncommon type '${type}'.`);
                if (type === 'apiKey' && (!scheme.name || !['query', 'header', 'cookie'].includes(scheme.in)))
                    error(errors, `API key scheme '${name}' needs name and in=query, header, or cookie.`);
            });
        }
    }
    if (document.security !== undefined && !Array.isArray(document.security))
        error(errors, '`security` must be an array when present.');
    return {valid: errors.length === 0, errors, warnings, version};
};

export const assertValidOpenApiDocument = (document: any): void => {
    const result = validateOpenApiDocument(document);
    if (!result.valid) throw new Error(`Invalid OpenAPI document:\n${result.errors.slice(0, 12).join('\n')}`);
};
