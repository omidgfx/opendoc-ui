export type CapabilityStatus = 'supported' | 'partial' | 'unsupported' | 'transport-dependent';
export type OpenApiDialect = 'swagger2' | 'oas3.0' | 'oas3.1' | 'oas3.2';
export type CapabilityConsumer = 'parse' | 'document' | 'execute' | 'mock' | 'codegen';

export interface OpenApiCapability {
    id: string;
    label: string;
    dialects: OpenApiDialect[];
    consumers: CapabilityConsumer[];
    status: CapabilityStatus;
    note?: string;
}

/**
 * Public support contract. Features not listed are preserved where possible
 * and diagnosed when encountered; they are never silently advertised as full.
 */
export const OPENAPI_CAPABILITIES: OpenApiCapability[] = [
    {
        id: 'operations.fixed',
        label: 'Standard operations',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['parse', 'document', 'execute', 'codegen'],
        status: 'supported',
    },
    {
        id: 'operations.query',
        label: 'QUERY operation',
        dialects: ['oas3.2'],
        consumers: ['parse', 'document', 'execute', 'codegen'],
        status: 'supported',
        note: 'Documented and executed with a request body via browser fetch. Cross-origin QUERY is not CORS-safelisted, so the target must allow it on preflight (Access-Control-Allow-Methods).',
    },
    {
        id: 'operations.additional',
        label: 'Additional HTTP operations',
        dialects: ['oas3.2'],
        consumers: ['parse', 'document', 'execute', 'codegen'],
        status: 'supported',
    },
    {
        id: 'webhooks',
        label: 'Webhooks',
        dialects: ['oas3.1', 'oas3.2'],
        consumers: ['parse', 'document'],
        status: 'supported',
        note: 'Documented but intentionally not emitted by the outbound API Runner.',
    },
    {
        id: 'parameters.serialization',
        label: 'Parameter style/explode serialization',
        dialects: ['oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['execute', 'codegen'],
        status: 'supported',
    },
    {
        id: 'swagger.collections',
        label: 'Swagger collectionFormat',
        dialects: ['swagger2'],
        consumers: ['execute', 'codegen'],
        status: 'supported',
    },
    {
        id: 'references.remote',
        label: 'Remote external references',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['parse', 'document', 'execute', 'mock', 'codegen'],
        status: 'partial',
        note: 'Same-origin, bounded loading only; cross-origin documents must be bundled.',
    },
    {
        id: 'references.local',
        label: 'Local multi-file references',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['parse', 'document', 'execute', 'mock', 'codegen'],
        status: 'supported',
        note: 'All related files must be selected by the user.',
    },
    {
        id: 'schema.boolean',
        label: 'Boolean schemas',
        dialects: ['oas3.1', 'oas3.2'],
        consumers: ['document', 'execute', 'mock', 'codegen'],
        status: 'supported',
    },
    {
        id: 'schema.jsonschema',
        label: 'Full JSON Schema vocabulary',
        dialects: ['oas3.1', 'oas3.2'],
        consumers: ['mock', 'codegen'],
        status: 'partial',
        note: 'Unsupported generation constraints produce diagnostics rather than invented valid output.',
    },
    {
        id: 'multipart.encoding',
        label: 'Multipart encoding',
        dialects: ['oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['execute', 'codegen'],
        status: 'partial',
        note: 'Browser FormData cannot emit arbitrary custom part headers.',
    },
    {
        id: 'responses.binary',
        label: 'Binary and attachment responses',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['execute'],
        status: 'supported',
        note: 'Browser requests are sent, then detected binary streams are cancelled after headers and shown as metadata; no file download is started.',
    },
    {
        id: 'runner.compatibility-report',
        label: 'Specification Runner compatibility report',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['document', 'execute'],
        status: 'supported',
        note: 'Static findings disclose partial, browser-limited, binary, and unresolved operation features.',
    },
    {
        id: 'security.cookies',
        label: 'Manual Cookie header',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['execute'],
        status: 'transport-dependent',
        note: 'Direct browser mode sends only browser-managed cookies.',
    },
    {
        id: 'security.mtls',
        label: 'Mutual TLS selection',
        dialects: ['oas3.1', 'oas3.2'],
        consumers: ['execute'],
        status: 'transport-dependent',
        note: 'Controlled by the browser and operating system.',
    },
    {
        id: 'oauth.flows',
        label: 'Interactive OAuth/OIDC flows',
        dialects: ['swagger2', 'oas3.0', 'oas3.1', 'oas3.2'],
        consumers: ['execute'],
        status: 'partial',
        note: 'Browser authorization-code + PKCE and implicit flows are supported, including OpenID Connect discovery when the provider exposes browser-friendly discovery and token-endpoint CORS. Non-browser flows still require a manual token.',
    },
];

export const capabilitiesFor = (dialect: OpenApiDialect, consumer?: CapabilityConsumer) =>
    OPENAPI_CAPABILITIES.filter(
        capability => capability.dialects.includes(dialect) && (!consumer || capability.consumers.includes(consumer)),
    );
