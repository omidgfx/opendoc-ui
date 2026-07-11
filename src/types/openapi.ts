export interface ThemeItem {
    background: string;
    surface: string;
    surfaceHover: string;
    border: string;
    text: string;
    textHeading: string;
    textMuted: string;
    primary: string;
    primaryHover: string;
    accent: string;
    sidebar: string;
    sidebarText: string;
    navbar: string;
    methodGet: string;
    methodPost: string;
    methodPut: string;
    methodDelete: string;
    methodPatch: string;
    methodHead: string;
    methodConnect: string;
    methodOptions: string;
    methodTrace: string;
}

export interface AppTheme {
    name: string;
    light: ThemeItem;
    dark: ThemeItem;
}

export interface Parsable {
    theme: string;
    url: string;
    title?: string;
    isCustom?: boolean;
    rawSpec?: string;
}

export interface ParsableConfig {
    [key: string]: Parsable;
}

export interface SecurityScheme {
    type: string;
    description?: string;
    name?: string;
    in?: string;
    scheme?: string;
    flows?: any;
}

export interface Parameter {
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema?: any;
    example?: any;
}

export interface ResponseDefinition {
    description: string;
    headers?: any;
    content?: {
        [contentType: string]: {
            schema: any;
        };
    };
}

export interface RequestBodyDefinition {
    description?: string;
    required?: boolean;
    content: {
        [contentType: string]: {
            schema: any;
            example?: any;
            examples?: any;
        };
    };
}

export interface Operation {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: any;
    operationId?: string;
    parameters?: Parameter[];
    requestBody?: RequestBodyDefinition;
    responses: {
        [statusCode: string]: ResponseDefinition;
    };
    security?: Array<{ [key: string]: string[] }>;
    deprecated?: boolean;
}

export interface PathItem {
    get?: Operation;
    post?: Operation;
    put?: Operation;
    delete?: Operation;
    patch?: Operation;
    options?: Operation;
    head?: Operation;
    trace?: Operation;
    parameters?: Parameter[];
}

export interface OpenApiSpec {
    openapi: string;
    swagger?: string;
    externalDocs?: any;
    info: {
        title: string;
        description?: string;
        version: string;
        contact?: {
            name?: string;
            url?: string;
            email?: string;
        };
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths: {
        [path: string]: PathItem;
    };
    security?: Array<{ [key: string]: string[] }>;
    components?: {
        schemas?: {
            [name: string]: any;
        };
        securitySchemes?: {
            [name: string]: SecurityScheme;
        };
        parameters?: {
            [name: string]: Parameter;
        };
        responses?: {
            [name: string]: ResponseDefinition;
        };
        requestBodies?: {
            [name: string]: RequestBodyDefinition;
        };
        headers?: {
            [name: string]: any;
        };
    };
}

export interface ActiveAuth {
    activeScheme: string; // "cookie" | "bearer" | "apikey" | "basic" | "none"
    cookieValues: { [key: string]: string };
    bearerToken: string;
    apiKeyName: string;
    apiKeyValue: string;
    apiKeyIn: 'header' | 'query';
    basicUsername: string;
    basicPassword: string;
}
