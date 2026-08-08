export interface OpenApiValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    version: 'openapi3' | 'swagger2' | 'unknown';
}

const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (errors: string[], message: string) => errors.push(message);
export const validateOpenApiDocument = (document: any): OpenApiValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!isRecord(document)) {
        return {valid: false, errors: ['The specification root must be an object.'], warnings, version: 'unknown'};
    }
    const version: OpenApiValidationResult['version'] = String(document.openapi || '').startsWith('3.')
        ? 'openapi3'
        : String(document.swagger || '').startsWith('2.')
            ? 'swagger2'
            : 'unknown';
    if (version === 'unknown')
        error(errors, 'The document must declare openapi 3.x or swagger 2.x.');
    if (!isRecord(document.info))
        error(errors, '`info` must be an object.');
    else {
        if (typeof document.info.title !== 'string' || !document.info.title.trim())
            error(errors, '`info.title` must be a non-empty string.');
        if (typeof document.info.version !== 'string' || !document.info.version.trim())
            error(errors, '`info.version` must be a non-empty string.');
    }
    if (!isRecord(document.paths))
        error(errors, '`paths` must be an object.');
    else {
        Object.entries(document.paths).forEach(([path, pathItem]: [
            string,
            any
        ]) => {
            if (!path.startsWith('/'))
                error(errors, `Path \'${path}\' must start with '/'.`);
            if (!isRecord(pathItem)) {
                error(errors, `Path item \'${path}\' must be an object.`);
                return;
            }
            if (pathItem.parameters !== undefined && !Array.isArray(pathItem.parameters)) {
                error(errors, `Path item \'${path}\'.parameters must be an array.`);
            }
            Object.entries(pathItem).forEach(([method, operation]: [
                string,
                any
            ]) => {
                if (!METHODS.has(method.toLowerCase()))
                    return;
                if (!isRecord(operation)) {
                    error(errors, `Operation ${method.toUpperCase()} ${path} must be an object.`);
                    return;
                }
                if (version === 'openapi3' && operation.responses === undefined) {
                    error(errors, `Operation ${method.toUpperCase()} ${path} must define responses.`);
                }
                if (operation.responses !== undefined && !isRecord(operation.responses)) {
                    error(errors, `Operation ${method.toUpperCase()} ${path}.responses must be an object.`);
                }
                if (isRecord(operation.responses)) {
                    Object.entries(operation.responses).forEach(([status, response]: [
                        string,
                        any
                    ]) => {
                        if (!isRecord(response) && typeof response?.$ref !== 'string')
                            error(errors, `Response ${status} on ${method.toUpperCase()} ${path} must be an object or $ref.`);
                        else if (isRecord(response) && response.$ref === undefined && typeof response.description !== 'string')
                            error(errors, `Response ${status} on ${method.toUpperCase()} ${path} must include description.`);
                    });
                }
                if (operation.parameters !== undefined && !Array.isArray(operation.parameters))
                    error(errors, `Operation ${method.toUpperCase()} ${path}.parameters must be an array.`);
            });
        });
    }
    if (version === 'openapi3') {
        if (document.components !== undefined && !isRecord(document.components))
            error(errors, '`components` must be an object when present.');
        const schemes = document.components?.securitySchemes;
        if (schemes !== undefined && !isRecord(schemes))
            error(errors, '`components.securitySchemes` must be an object.');
        if (isRecord(schemes)) {
            Object.entries(schemes).forEach(([name, scheme]: [
                string,
                any
            ]) => {
                if (!isRecord(scheme) && typeof scheme?.$ref !== 'string')
                    error(errors, `Security scheme \'${name}\' must be an object or $ref.`);
                const type = scheme?.type;
                if (type && !['apiKey', 'http', 'oauth2', 'openIdConnect'].includes(type))
                    warnings.push(`Security scheme '${name}' uses uncommon type '${type}'.`);
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
    if (!result.valid)
        throw new Error(`Invalid OpenAPI document:\n${result.errors.slice(0, 12).join('\n')}`);
};
