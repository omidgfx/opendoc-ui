import * as jsYaml from 'js-yaml';
import type {OpenApiSpec, Parsable} from '@/src/types';
import {assertValidOpenApiDocument, getDocumentOperations, normalizeOpenApiSpec} from '@/src/utils/openapi';
import {isOperationProtected} from '@/src/utils/auth';
import {fetchSpecText} from '@/src/utils/specCache';

export interface SpecificationSummary {
    title: string;
    version: string;
    formatVersion: string;
    description: string;
    endpointCount: number;
    schemaCount: number;
    tagCount: number;
    serverCount: number;
    securedEndpointCount: number;
    methods: string[];
}

export interface SummaryState {
    status: 'loading' | 'ready' | 'error';
    summary?: SpecificationSummary;
    message?: string;
}

export const summarizeSpecification = (spec: OpenApiSpec): SpecificationSummary => {
    let securedEndpointCount = 0;
    const tags = new Set<string>();
    const methods = new Set<string>();
    const operations = getDocumentOperations(spec);
    operations.forEach(({method, operation}) => {
        methods.add(method.toUpperCase());
        (operation.tags || ['General']).forEach(tag => tags.add(tag));
        if (isOperationProtected(spec, operation)) securedEndpointCount += 1;
    });
    return {
        title: spec.info?.title || 'Untitled API',
        version: spec.info?.version || 'Not specified',
        formatVersion: spec.openapi || spec.swagger || 'OpenAPI',
        description: spec.info?.description || 'No description is provided for this API specification.',
        endpointCount: operations.length,
        schemaCount: Object.keys(spec.components?.schemas || {}).length,
        tagCount: tags.size,
        serverCount: spec.servers?.length || 0,
        securedEndpointCount,
        methods: Array.from(methods).sort(),
    };
};
export const parseSpecification = (text: string): OpenApiSpec => {
    const trimmed = text.trim();
    const parsed = trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(text) : jsYaml.load(text);
    assertValidOpenApiDocument(parsed);
    return normalizeOpenApiSpec(parsed);
};
export const loadSpecification = async (item: Parsable): Promise<OpenApiSpec> => {
    if (item.rawSpec) return parseSpecification(item.rawSpec);
    if (!item.url) throw new Error('No source URL is configured.');
    return parseSpecification(await fetchSpecText(item.url));
};
export const formatRelativeTime = (timestamp: number): string => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
};
