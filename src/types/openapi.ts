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
    highlight: string;
    select: string;
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

export type ThemeMode = 'light' | 'dark' | 'system';

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
    bearerFormat?: string;
    flows?: any;
    openIdConnectUrl?: string;
}

export interface ServerVariable {
    default: string;
    description?: string;
    enum?: string[];
}

export interface ServerDefinition {
    url: string;
    /** OpenAPI 3.2 stable server identifier. */
    name?: string;
    description?: string;
    variables?: Record<string, ServerVariable>;
}

export interface Parameter {
    name: string;
    in: 'path' | 'query' | 'querystring' | 'header' | 'cookie';
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    allowEmptyValue?: boolean;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    schema?: any;
    content?: Record<string, any>;
    example?: any;
    examples?: Record<string, any>;
}

export interface ResponseDefinition {
    description?: string;
    headers?: any;
    content?: {
        [contentType: string]: {
            schema?: any;
            example?: any;
            examples?: any;
            encoding?: any;
        };
    };
}

export interface RequestBodyDefinition {
    description?: string;
    required?: boolean;
    content: {
        [contentType: string]: {
            schema?: any;
            example?: any;
            examples?: any;
            encoding?: any;
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
    security?: Array<{
        [key: string]: string[];
    }>;
    servers?: ServerDefinition[];
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
    /** OpenAPI 3.2 QUERY method. */
    query?: Operation;
    /** OpenAPI 3.2 extension point for methods without fixed fields. */
    additionalOperations?: Record<string, Operation>;
    servers?: ServerDefinition[];
    parameters?: Parameter[];
}

export interface OpenApiSpec {
    openapi: string;
    swagger?: string;
    /** OpenAPI 3.2 document self URI. */
    $self?: string;
    jsonSchemaDialect?: string;
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
    servers?: ServerDefinition[];
    paths: {
        [path: string]: PathItem;
    };
    webhooks?: Record<string, PathItem | {$ref: string}>;
    security?: Array<{
        [key: string]: string[];
    }>;
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
        pathItems?: Record<string, PathItem | {$ref: string}>;
        /** OpenAPI 3.2 reusable Media Type Objects. */
        mediaTypes?: Record<string, any>;
    };
}

export type AuthCredentialType =
    'apiKey'
    | 'http'
    | 'oauth2'
    | 'openIdConnect'
    | 'cookie'
    | 'basic'
    | 'bearer'
    | 'unknown';

export interface AuthCredential {
    schemeId: string;
    type: AuthCredentialType;
    name?: string;
    in?: 'header' | 'query' | 'cookie';
    scheme?: string;
    value?: string;
    username?: string;
    password?: string;
    scopes?: string[];
}

export interface ActiveAuth {
    activeScheme: string;
    selectedSchemes: string[];
    schemeValues: {
        [schemeId: string]: AuthCredential;
    };
    requirementIndex?: number;
    cookieValues: {
        [key: string]: string;
    };
    bearerToken: string;
    apiKeyName: string;
    apiKeyValue: string;
    apiKeyIn: 'header' | 'query' | 'cookie';
    basicUsername: string;
    basicPassword: string;
}
