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

export interface ExternalDocumentation {
    description?: string;
    url?: string;
}

export interface ContactObject {
    name?: string;
    url?: string;
    email?: string;
}

export interface LicenseObject {
    name: string;
    identifier?: string;
    url?: string;
}

export interface LogoDefinition {
    url: string;
    altText?: string;
    href?: string;
    backgroundColor?: string;
}

export interface ExampleDefinition {
    summary?: string;
    description?: string;
    value?: any;
    externalValue?: string;
    serializedValue?: any;
    dataValue?: any;
    externalDataValue?: any;
}

export interface MediaTypeDefinition {
    schema?: any;
    example?: any;
    examples?: Record<string, ExampleDefinition | any>;
    encoding?: any;
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

export interface LinkDefinition {
    operationRef?: string;
    operationId?: string;
    parameters?: Record<string, any>;
    requestBody?: any;
    description?: string;
    server?: ServerDefinition;
}

export interface CallbackDefinition {
    [expression: string]: PathItem | {$ref: string};
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
    content?: Record<string, MediaTypeDefinition | any>;
    example?: any;
    examples?: Record<string, ExampleDefinition | any>;
}

export interface ResponseDefinition {
    description?: string;
    headers?: any;
    content?: {
        [contentType: string]: MediaTypeDefinition;
    };
    links?: Record<string, LinkDefinition | {$ref: string}>;
}

export interface RequestBodyDefinition {
    description?: string;
    required?: boolean;
    content: {
        [contentType: string]: MediaTypeDefinition;
    };
}

export interface Operation {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentation;
    operationId?: string;
    parameters?: Parameter[];
    requestBody?: RequestBodyDefinition;
    responses: {
        [statusCode: string]: ResponseDefinition;
    };
    callbacks?: Record<string, CallbackDefinition | {$ref: string}>;
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

export interface TagDefinition {
    name: string;
    description?: string;
    externalDocs?: ExternalDocumentation;
}

export interface OpenApiInfo {
    title: string;
    summary?: string;
    description?: string;
    version: string;
    termsOfService?: string;
    contact?: ContactObject;
    license?: LicenseObject;
    'x-logo'?: LogoDefinition;
}

export interface TagGroupDefinition {
    name: string;
    tags: string[];
}

export interface OpenApiSpec {
    openapi: string;
    swagger?: string;
    /** OpenAPI 3.2 document self URI. */
    $self?: string;
    jsonSchemaDialect?: string;
    externalDocs?: ExternalDocumentation;
    info: OpenApiInfo;
    tags?: TagDefinition[];
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
        examples?: Record<string, ExampleDefinition | any>;
        links?: Record<string, LinkDefinition | {$ref: string}>;
        callbacks?: Record<string, CallbackDefinition | {$ref: string}>;
        pathItems?: Record<string, PathItem | {$ref: string}>;
        /** OpenAPI 3.2 reusable Media Type Objects. */
        mediaTypes?: Record<string, any>;
    };
    'x-tagGroups'?: TagGroupDefinition[];
    'x-generated-at'?: string;
    'x-complexity-notes'?: Record<string, any>;
}

export type AuthCredentialType =
    'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'cookie' | 'basic' | 'bearer' | 'mutualTLS' | 'unknown';

export interface AuthCredential {
    schemeId: string;
    type: AuthCredentialType;
    name?: string;
    in?: 'header' | 'query' | 'cookie';
    scheme?: string;
    value?: string;
    username?: string;
    password?: string;
    clientId?: string;
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
