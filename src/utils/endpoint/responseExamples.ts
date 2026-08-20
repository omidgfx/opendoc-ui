import * as jsYaml from 'js-yaml';
import type {OpenApiSpec} from '@/src/types';
import {exampleValueOf, getRefName} from '@/src/utils/openapi';
import {formatXml} from '@/src/utils/endpoint/exampleFormatting';
import {
    extractMockLineMarkers,
    generateValidatedMock,
    getMockSnippet as generateMockSnippet,
    getMockSnippetWithMarkers as generateMockSnippetWithMarkers,
    prepareMockForAnnotation,
    type MockLineMarker,
} from '@/src/utils/runner/mockGenerator';

export const createResponseExampleHelpers = (spec: OpenApiSpec) => {
    const getMockSnippet = (schema: any): string => generateMockSnippet(schema, spec, 'response');
    const getMockValue = (schema: any): any => {
        try {
            return JSON.parse(getMockSnippet(schema));
        } catch {
            return null;
        }
    };
    const getFirstExplicitExample = (contentObj: any): any => {
        if (!contentObj) return undefined;
        if (contentObj.example !== undefined) return contentObj.example;
        if (contentObj.examples && typeof contentObj.examples === 'object') {
            const first = Object.values(contentObj.examples)[0] as any;
            if (first !== undefined) return exampleValueOf(first, spec);
        }
        return undefined;
    };
    const escapeXml = (value: any) =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    const toXml = (value: any, nodeName = 'response', depth = 0): string => {
        const indent = '  '.repeat(depth);
        const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
        if (value === null || value === undefined) return `${indent}<${safeName} />`;
        if (Array.isArray(value)) {
            if (value.length === 0) return `${indent}<${safeName}></${safeName}>`;
            return value.map(item => toXml(item, safeName, depth)).join('\n');
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            if (entries.length === 0) return `${indent}<${safeName}></${safeName}>`;
            const children = entries.map(([key, child]) => toXml(child, key, depth + 1)).join('\n');
            return `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>`;
        }
        return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    };
    const getSchemaDisplayName = (schema: any, fallback = 'response') => {
        if (schema === undefined || schema === null) return fallback;
        if (schema.xml?.name) return schema.xml.name;
        if (schema.$ref) return getRefName(schema.$ref);
        if (schema.items?.$ref) return getRefName(schema.items.$ref);
        if (schema.title) return schema.title;
        return fallback;
    };
    const getLanguageForContentType = (contentType: string): string => {
        const c = contentType.toLowerCase();
        if (c.includes('json')) return 'json';
        if (c.includes('yaml') || c.includes('yml')) return 'yaml';
        if (c.includes('xml')) return 'xml';
        if (c.includes('html')) return 'html';
        if (c.includes('javascript')) return 'javascript';
        if (c.includes('x-www-form-urlencoded')) return 'http';
        return 'text';
    };
    const getResponseExampleSnippet = (schema: any, contentObj: any, contentType: string): string => {
        const explicitExample = getFirstExplicitExample(contentObj);
        const hasExplicit = explicitExample !== undefined;
        const value = hasExplicit ? explicitExample : getMockValue(schema);
        const c = contentType.toLowerCase();
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (c.includes('json')) {
                try {
                    return JSON.stringify(JSON.parse(value), null, 4);
                } catch {
                    return JSON.stringify(value, null, 4);
                }
            }
            // Authors often store XML examples as one long line; print the
            // document the way a reader can actually follow it.
            if (c.includes('xml') || c.includes('html')) return formatXml(value);
            if (c.includes('text') || c.includes('plain')) return value;
            if (c.includes('yaml') || c.includes('yml'))
                return trimmed.startsWith('{') || trimmed.startsWith('[') ? jsYaml.dump(JSON.parse(value)) : value;
            return value;
        }
        if (c.includes('xml')) {
            if (Array.isArray(value)) {
                const itemName = getSchemaDisplayName(schema?.items || schema, 'item');
                const children = value.map(item => toXml(item, itemName, 1)).join('\n');
                return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n${children}\n</response>`;
            }
            return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, getSchemaDisplayName(schema))}`;
        }
        if (c.includes('html'))
            return typeof value === 'object'
                ? `<pre>${escapeXml(JSON.stringify(value, null, 4))}</pre>`
                : String(value ?? '');
        if (c.includes('yaml') || c.includes('yml')) return jsYaml.dump(value);
        if (c.includes('text') || c.includes('plain'))
            return typeof value === 'object' ? JSON.stringify(value, null, 4) : String(value ?? '');
        return JSON.stringify(value, null, 4);
    };
    const humanizeSchemaName = (name: string): string =>
        name
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .toLowerCase();
    const getMockSnippetWithMarkers = (schema: any): {code: string; markers: MockLineMarker[]} =>
        generateMockSnippetWithMarkers(schema, spec, 'response', 4);
    /**
     * Marker-aware variant of getResponseExampleSnippet. Serializes the same
     * generated example, but also reports which lines of the JSON / YAML / XML
     * output hold branches pruned by recursion or the depth guard, so the code
     * viewer can badge those line numbers.
     */
    const getResponseExampleSnippetWithMarkers = (
        schema: any,
        contentObj: any,
        contentType: string,
    ): {code: string; markers: MockLineMarker[]} => {
        const fallback = () => ({code: getResponseExampleSnippet(schema, contentObj, contentType), markers: []});
        if (getFirstExplicitExample(contentObj) !== undefined) return fallback();
        const generated = generateValidatedMock(schema, spec, 'response');
        if (generated.value === undefined) return fallback();
        const prepared = prepareMockForAnnotation(generated.value);
        const value: any = prepared.value;
        const c = contentType.toLowerCase();
        try {
            let raw: string;
            if (typeof value === 'string') return fallback();
            if (c.includes('xml')) {
                if (Array.isArray(value)) {
                    const itemName = getSchemaDisplayName(schema?.items || schema, 'item');
                    const children = value.map(item => toXml(item, itemName, 1)).join('\n');
                    raw = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n${children}\n</response>`;
                } else {
                    raw = `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, getSchemaDisplayName(schema))}`;
                }
            } else if (c.includes('html')) {
                return fallback();
            } else if (c.includes('yaml') || c.includes('yml')) {
                raw = jsYaml.dump(value);
            } else if (c.includes('text') || c.includes('plain')) {
                if (typeof value !== 'object' || value === null) return fallback();
                raw = JSON.stringify(value, null, 4);
            } else {
                raw = JSON.stringify(value, null, 4);
            }
            return extractMockLineMarkers(raw, prepared);
        } catch {
            return fallback();
        }
    };
    const getSchemaNamesFromResponse = (resp: any): string[] => {
        if (!resp?.content) return [];
        const names = new Set<string>();
        Object.values(resp.content).forEach((contentObj: any) => {
            const schema = contentObj?.schema;
            if (schema === undefined || schema === null) return;
            if (schema.$ref) names.add(getRefName(schema.$ref));
            if (schema.oneOf && Array.isArray(schema.oneOf))
                schema.oneOf.forEach((sub: any) => {
                    if (sub.$ref) names.add(getRefName(sub.$ref));
                    if (sub.title) names.add(sub.title);
                });
            if (schema.anyOf && Array.isArray(schema.anyOf))
                schema.anyOf.forEach((sub: any) => {
                    if (sub.$ref) names.add(getRefName(sub.$ref));
                    if (sub.title) names.add(sub.title);
                });
            if (schema.allOf && Array.isArray(schema.allOf))
                schema.allOf.forEach((sub: any) => {
                    if (sub.$ref) names.add(getRefName(sub.$ref));
                    if (sub.title) names.add(sub.title);
                });
            if (schema.title) names.add(schema.title);
        });
        return Array.from(names);
    };
    const truncateText = (text: string, maxLength = 80) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };
    return {
        getMockSnippet,
        getMockSnippetWithMarkers,
        getMockValue,
        getFirstExplicitExample,
        escapeXml,
        toXml,
        getSchemaDisplayName,
        getLanguageForContentType,
        getResponseExampleSnippet,
        getResponseExampleSnippetWithMarkers,
        humanizeSchemaName,
        getSchemaNamesFromResponse,
        truncateText,
    };
};
