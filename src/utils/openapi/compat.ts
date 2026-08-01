import type {OpenApiSpec} from '../../types';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const isPlainObject = (value: any): value is Record<string, any> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
};

const clone = <T, >(value: T): T => {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
};

const rewriteRef = (ref: string): string => {
    if (!ref || typeof ref !== 'string') return ref;
    return ref
        .replace(/^#\/definitions\//, '#/components/schemas/')
        .replace(/^#\/parameters\//, '#/components/parameters/')
        .replace(/^#\/responses\//, '#/components/responses/')
        .replace(/^#\/securityDefinitions\//, '#/components/securitySchemes/');
};

const rewriteRefsDeep = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map(rewriteRefsDeep);
    }

    if (!isPlainObject(value)) {
        return value;
    }

    const next: any = {};
    Object.entries(value).forEach(([key, child]) => {
        if (key === '$ref' && typeof child === 'string') {
            next[key] = rewriteRef(child);
        } else {
            next[key] = rewriteRefsDeep(child);
        }
    });

    if (next.nullable === true && typeof next.type === 'string') {
        next.type = [next.type, 'null'];
    }

    return next;
};

const buildServerUrl = (scheme: string, host: string, basePath = '') => {
    const normalizedBase = basePath && basePath !== '/' ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';
    return `${scheme}://${host}${normalizedBase}`;
};

const getSwaggerServers = (doc: any) => {
    if (Array.isArray(doc.servers) && doc.servers.length > 0) {
        return doc.servers;
    }

    const host = doc.host;
    const basePath = doc.basePath || '';
    if (host) {
        const schemes = Array.isArray(doc.schemes) && doc.schemes.length > 0 ? doc.schemes : ['https'];
        return schemes.map((scheme: string) => ({url: buildServerUrl(scheme, host, basePath)}));
    }

    if (basePath) {
        return [{url: basePath}];
    }

    return undefined;
};

const swaggerSchemaFromParameter = (param: any): any => {
    if (!param) return {};
    if (param.schema) return rewriteRefsDeep(param.schema);

    if (param.type === 'file') {
        return {type: 'string', format: 'binary'};
    }

    const schemaKeys = [
        'type', 'format', 'items', 'collectionFormat', 'default', 'maximum', 'exclusiveMaximum',
        'minimum', 'exclusiveMinimum', 'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems',
        'uniqueItems', 'enum', 'multipleOf', 'allowEmptyValue', 'example', 'examples'
    ];

    const schema: any = {};
    schemaKeys.forEach((key) => {
        if (param[key] !== undefined) {
            schema[key] = rewriteRefsDeep(param[key]);
        }
    });

    return Object.keys(schema).length > 0 ? schema : {};
};

const normalizeParameter = (param: any): any => {
    if (!param) return param;
    if (param.$ref) return rewriteRefsDeep(param);

    const next = rewriteRefsDeep(param);
    if (!next.schema && next.in !== 'body' && next.in !== 'formData') {
        next.schema = swaggerSchemaFromParameter(next);
    }

    return next;
};

const resolveSwaggerParameter = (param: any, doc: any, visited = new Set<string>()): any => {
    if (!param?.$ref) return param;
    const rewritten = rewriteRef(param.$ref);
    const name = getRefName(rewritten);
    if (!name || visited.has(name)) return {$ref: rewritten};
    visited.add(name);
    const resolved = doc?.parameters?.[name] || doc?.components?.parameters?.[name];
    if (!resolved) return {$ref: rewritten};
    return resolveSwaggerParameter(resolved, doc, visited);
};

const convertSecurityScheme = (scheme: any): any => {
    const next = rewriteRefsDeep(scheme || {});

    if (next.type === 'basic') {
        return {
            ...next,
            type: 'http',
            scheme: 'basic'
        };
    }

    if (next.type === 'oauth2' && next.flow && !next.flows) {
        const flowNameMap: Record<string, string> = {
            implicit: 'implicit',
            password: 'password',
            application: 'clientCredentials',
            accessCode: 'authorizationCode'
        };
        const flowKey = flowNameMap[next.flow] || next.flow;
        const flow: any = {scopes: next.scopes || {}};
        if (next.authorizationUrl) flow.authorizationUrl = next.authorizationUrl;
        if (next.tokenUrl) flow.tokenUrl = next.tokenUrl;
        return {
            ...next,
            flows: {[flowKey]: flow}
        };
    }

    return next;
};

const convertHeaders = (headers: any): any => {
    if (!headers) return undefined;
    const next: any = {};
    Object.entries(headers).forEach(([name, header]: [string, any]) => {
        if (header?.$ref) {
            next[name] = rewriteRefsDeep(header);
            return;
        }
        const normalized = rewriteRefsDeep(header || {});
        if (!normalized.schema) {
            normalized.schema = swaggerSchemaFromParameter(normalized);
        }
        next[name] = normalized;
    });
    return next;
};

const convertResponse = (response: any, produces: string[] = ['application/json']): any => {
    if (!response) {
        return {description: 'Response'};
    }
    if (response.$ref) {
        return rewriteRefsDeep(response);
    }

    const next: any = rewriteRefsDeep(response);
    const schema = next.schema;
    delete next.schema;

    if (next.headers) {
        next.headers = convertHeaders(next.headers);
    }

    if (schema) {
        const mediaTypes = produces.length > 0 ? produces : ['application/json'];
        next.content = next.content || {};
        mediaTypes.forEach((mediaType) => {
            const mediaExample = next.examples?.[mediaType];
            next.content[mediaType] = {
                ...(next.content[mediaType] || {}),
                schema: rewriteRefsDeep(schema),
                ...(mediaExample !== undefined ? {example: mediaExample} : {})
            };
        });
    }

    if (!next.description) {
        next.description = 'Response';
    }

    return next;
};

const convertResponses = (responses: any, produces: string[] = ['application/json'], doc?: any): any => {
    const next: any = {};
    Object.entries(responses || {}).forEach(([code, response]: [string, any]) => {
        if (response?.$ref) {
            const rewritten = rewriteRef(response.$ref);
            const name = getRefName(rewritten);
            const resolved = name ? (doc?.responses?.[name] || doc?.components?.responses?.[name]) : null;
            next[code] = resolved ? convertResponse(resolved, produces) : {$ref: rewritten};
        } else {
            next[code] = convertResponse(response, produces);
        }
    });
    return Object.keys(next).length > 0 ? next : {default: {description: 'Default response'}};
};

const contentTypesForBody = (operation: any, doc: any) => {
    const consumes = operation?.consumes || doc?.consumes;
    return Array.isArray(consumes) && consumes.length > 0 ? consumes : ['application/json'];
};

const contentTypesForResponse = (operation: any, doc: any) => {
    const produces = operation?.produces || doc?.produces;
    return Array.isArray(produces) && produces.length > 0 ? produces : ['application/json'];
};

const convertBodyParametersToRequestBody = (parameters: any[], operation: any, doc: any): any | undefined => {
    const bodyParams = parameters.filter((p) => p && !p.$ref && p.in === 'body');
    const formParams = parameters.filter((p) => p && !p.$ref && p.in === 'formData');

    if (formParams.length > 0) {
        const required = formParams.filter((p) => p.required).map((p) => p.name);
        const hasFile = formParams.some((p) => p.type === 'file' || p.schema?.format === 'binary');
        const consumes = contentTypesForBody(operation, doc);
        const mediaTypes = consumes.length > 0
            ? consumes
            : [hasFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'];

        const schema: any = {
            type: 'object',
            properties: {}
        };
        if (required.length > 0) schema.required = required;

        formParams.forEach((param) => {
            schema.properties[param.name] = swaggerSchemaFromParameter(param);
        });

        const content: any = {};
        mediaTypes.forEach((mediaType: string) => {
            content[mediaType] = {schema: rewriteRefsDeep(schema)};
        });

        return {
            required: required.length > 0,
            content
        };
    }

    if (bodyParams.length > 0) {
        const bodyParam = bodyParams[0];
        const content: any = {};
        contentTypesForBody(operation, doc).forEach((mediaType: string) => {
            content[mediaType] = {schema: rewriteRefsDeep(bodyParam.schema || {})};
        });

        return {
            description: bodyParam.description,
            required: !!bodyParam.required,
            content
        };
    }

    return undefined;
};

const convertSwaggerOperation = (operation: any, pathItem: any, doc: any): any => {
    const op = rewriteRefsDeep(operation || {});
    const pathParameters = Array.isArray(pathItem?.parameters)
        ? pathItem.parameters.map((param: any) => resolveSwaggerParameter(param, doc))
        : [];
    const operationParameters = Array.isArray(op.parameters)
        ? op.parameters.map((param: any) => resolveSwaggerParameter(param, doc))
        : [];
    const allParameters = [...pathParameters, ...operationParameters];

    const requestBody = convertBodyParametersToRequestBody(allParameters, op, doc);

    const next: any = {
        ...op,
        parameters: operationParameters
            .filter((param: any) => param?.$ref || (param.in !== 'body' && param.in !== 'formData'))
            .map(normalizeParameter),
        responses: convertResponses(op.responses, contentTypesForResponse(op, doc), doc)
    };

    delete next.consumes;
    delete next.produces;

    if (requestBody) {
        next.requestBody = requestBody;
    }

    return next;
};

const normalizeOpenApiOperation = (operation: any, root: any): any => {
    const op = rewriteRefsDeep(operation || {});

    if (Array.isArray(op.parameters)) {
        op.parameters = op.parameters.map(normalizeParameter);
    }

    if (!op.responses || Object.keys(op.responses).length === 0) {
        op.responses = {default: {description: 'Default response'}};
    } else {
        const responses: any = {};
        Object.entries(op.responses).forEach(([code, response]: [string, any]) => {
            responses[code] = resolveResponseObject(response, root);
        });
        op.responses = responses;
    }

    if (op.requestBody) {
        op.requestBody = resolveRequestBodyObject(op.requestBody, root);
    }

    return op;
};

const getRefName = (ref: string) => (ref || '').split('/').pop() || '';

const resolveResponseObject = (response: any, root: any, visited = new Set<string>()): any => {
    if (!response?.$ref) return rewriteRefsDeep(response);
    const rewritten = rewriteRef(response.$ref);
    const name = getRefName(rewritten);
    if (!name || visited.has(name)) return {$ref: rewritten};
    visited.add(name);
    const resolved = root?.components?.responses?.[name] || root?.responses?.[name];
    if (!resolved) return {$ref: rewritten};
    return resolveResponseObject(resolved, root, visited);
};

const resolveRequestBodyObject = (requestBody: any, root: any, visited = new Set<string>()): any => {
    if (!requestBody?.$ref) return rewriteRefsDeep(requestBody);
    const rewritten = rewriteRef(requestBody.$ref);
    const name = getRefName(rewritten);
    if (!name || visited.has(name)) return {$ref: rewritten};
    visited.add(name);
    const resolved = root?.components?.requestBodies?.[name];
    if (!resolved) return {$ref: rewritten};
    return resolveRequestBodyObject(resolved, root, visited);
};

const convertSwagger2 = (input: any): OpenApiSpec => {
    const doc = clone(input);
    const components: any = rewriteRefsDeep(doc.components || {});

    components.schemas = {
        ...(rewriteRefsDeep(doc.definitions || {})),
        ...(components.schemas || {})
    };

    if (doc.parameters) {
        components.parameters = {
            ...(components.parameters || {}),
            ...Object.fromEntries(Object.entries(doc.parameters).map(([key, value]) => [key, normalizeParameter(value)]))
        };
    }

    if (doc.responses) {
        components.responses = {
            ...(components.responses || {}),
            ...Object.fromEntries(Object.entries(doc.responses).map(([key, value]) => [key, convertResponse(value, doc.produces || ['application/json'])]))
        };
    }

    if (doc.securityDefinitions) {
        components.securitySchemes = {
            ...(components.securitySchemes || {}),
            ...Object.fromEntries(Object.entries(doc.securityDefinitions).map(([key, value]) => [key, convertSecurityScheme(value)]))
        };
    }

    const paths: any = {};
    Object.entries(doc.paths || {}).forEach(([pathKey, pathItem]: [string, any]) => {
        const nextPathItem: any = {};

        if (Array.isArray(pathItem?.parameters)) {
            nextPathItem.parameters = pathItem.parameters
                .map((param: any) => resolveSwaggerParameter(param, doc))
                .filter((param: any) => param?.$ref || (param.in !== 'body' && param.in !== 'formData'))
                .map(normalizeParameter);
        }

        Object.entries(pathItem || {}).forEach(([method, operation]: [string, any]) => {
            const lowerMethod = method.toLowerCase();
            if (!HTTP_METHODS.includes(lowerMethod)) return;
            nextPathItem[lowerMethod] = convertSwaggerOperation(operation, pathItem, doc);
        });

        paths[pathKey] = nextPathItem;
    });

    return {
        openapi: '3.0.0',
        ...(rewriteRefsDeep(doc) as any),
        swagger: doc.swagger,
        servers: getSwaggerServers(doc),
        paths,
        components,
        security: rewriteRefsDeep(doc.security || [])
    } as any;
};

const normalizeOpenApiLike = (input: any): OpenApiSpec => {
    const doc: any = rewriteRefsDeep(clone(input));

    doc.openapi = doc.openapi || (doc.swagger ? '3.0.0' : '3.0.0');
    doc.info = doc.info || {title: 'OpenAPI Specification', version: '1.0.0'};
    doc.paths = doc.paths || {};
    doc.components = doc.components || {};

    if (doc.definitions && !doc.components.schemas) {
        doc.components.schemas = rewriteRefsDeep(doc.definitions);
    }

    if (doc.securityDefinitions && !doc.components.securitySchemes) {
        doc.components.securitySchemes = Object.fromEntries(
            Object.entries(doc.securityDefinitions).map(([key, value]) => [key, convertSecurityScheme(value)])
        );
    }

    if (doc.parameters && !doc.components.parameters) {
        doc.components.parameters = Object.fromEntries(
            Object.entries(doc.parameters).map(([key, value]) => [key, normalizeParameter(value)])
        );
    }

    if (doc.responses && !doc.components.responses) {
        doc.components.responses = Object.fromEntries(
            Object.entries(doc.responses).map(([key, value]) => [key, convertResponse(value as any, ['application/json'])])
        );
    }

    if (!doc.servers) {
        doc.servers = getSwaggerServers(doc);
    }

    Object.entries(doc.paths || {}).forEach(([pathKey, pathItem]: [string, any]) => {
        if (!isPlainObject(pathItem)) return;

        if (Array.isArray(pathItem.parameters)) {
            pathItem.parameters = pathItem.parameters.map(normalizeParameter);
        }

        Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
            const lowerMethod = method.toLowerCase();
            if (!HTTP_METHODS.includes(lowerMethod)) return;
            pathItem[lowerMethod] = normalizeOpenApiOperation(operation, doc);
        });

        doc.paths[pathKey] = pathItem;
    });

    return doc as OpenApiSpec;
};

export const normalizeOpenApiSpec = (input: any): OpenApiSpec => {
    if (!isPlainObject(input)) {
        throw new Error('Specification root must be an object.');
    }

    if (String(input.swagger || '').startsWith('2.')) {
        return convertSwagger2(input);
    }

    return normalizeOpenApiLike(input);
};

export const OPENAPI_HTTP_METHODS = HTTP_METHODS;
