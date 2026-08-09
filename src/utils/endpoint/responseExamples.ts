import * as jsYaml from 'js-yaml';
import type {OpenApiSpec} from '@/src/types';
import {getRefName} from '@/src/utils/openapi';

export const createResponseExampleHelpers = (spec: OpenApiSpec) => {
    const getMockSnippet = (schema: any): string => {
        if (schema === undefined || schema === null)
            return 'null';
        const generateMockFromPattern = (pattern: string): string => {
            if (!pattern)
                return 'string';
            if (pattern.includes('uuid') || pattern.includes('UUID'))
                return '123e4567-e89b-12d3-a456-426614174000';
            if (pattern.includes('^[0-9]+$') || pattern.includes('^\\d+$'))
                return '12345';
            if (pattern.includes('^[a-zA-Z0-9]+$'))
                return 'string123';
            if (pattern.includes('@') || pattern.includes('email'))
                return 'user@example.com';
            if (pattern.includes('phone') || pattern.includes('^[\\+]?[0-9]'))
                return '+1234567890';
            if (pattern.includes('date') || pattern.includes('^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
                return '2026-07-03';
            let generated = '';
            let cleaned = pattern.replace(/^\^/, '').replace(/\$$/, '');
            let i = 0;
            while (i < cleaned.length) {
                let char = cleaned[i];
                if (char === '\\') {
                    let next = cleaned[i + 1];
                    if (next === 'd')
                        generated += '5';
                    else if (next === 'w')
                        generated += 'a';
                    else if (next === 's')
                        generated += ' ';
                    else
                        generated += next || '';
                    i += 2;
                } else if (char === '[') {
                    let endIdx = cleaned.indexOf(']', i);
                    if (endIdx !== -1) {
                        let content = cleaned.substring(i + 1, endIdx);
                        if (content.includes('0-9') || content.includes('\\d'))
                            generated += '9';
                        else if (content.includes('a-z'))
                            generated += 'x';
                        else if (content.includes('A-Z'))
                            generated += 'X';
                        else if (content.length > 0)
                            generated += content[0];
                        else
                            generated += 'a';
                        i = endIdx + 1;
                    } else {
                        generated += '[';
                        i++;
                    }
                } else if (cleaned[i] === '{') {
                    let endIdx = cleaned.indexOf('}', i);
                    if (endIdx !== -1) {
                        let countStr = cleaned.substring(i + 1, endIdx);
                        let count = parseInt(countStr, 10) || 1;
                        let lastChar = generated[generated.length - 1] || 'a';
                        for (let k = 0; k < count - 1; k++)
                            generated += lastChar;
                        i = endIdx + 1;
                    } else {
                        generated += '{';
                        i++;
                    }
                } else if (char === '(' || char === ')' || char === '?' || char === '*' || char === '+') {
                    i++;
                } else if (char === '|')
                    break;
                else {
                    generated += char;
                    i++;
                }
            }
            return generated || 'string';
        };
        const generateMock = (s: any, depth = 0, visited = new Set<string>()): any => {
            if (!s)
                return null;
            if (depth > 1000)
                return {};
            if (s.$ref) {
                const refName = getRefName(s.$ref);
                if (visited.has(refName))
                    return {};
                visited.add(refName);
                const refSchema = spec.components?.schemas?.[refName];
                if (refSchema)
                    return generateMock(refSchema, depth + 1, visited);
                return {};
            }
            if (s.const !== undefined)
                return s.const;
            if (s.enum && Array.isArray(s.enum) && s.enum.length > 0)
                return s.enum[0];
            if (s.example !== undefined)
                return s.example;
            if (s.default !== undefined)
                return s.default;
            if (s.allOf && Array.isArray(s.allOf)) {
                let merged = {};
                s.allOf.forEach((sub: any) => {
                    const subMock = generateMock(sub, depth + 1, new Set(visited));
                    if (typeof subMock === 'object' && subMock !== null)
                        merged = {...merged, ...subMock};
                    else if (subMock !== null)
                        merged = subMock;
                });
                return merged;
            }
            if (s.oneOf && Array.isArray(s.oneOf) && s.oneOf.length > 0)
                return generateMock(s.oneOf[0], depth + 1, new Set(visited));
            if (s.anyOf && Array.isArray(s.anyOf) && s.anyOf.length > 0)
                return generateMock(s.anyOf[0], depth + 1, new Set(visited));
            const typeVal = s.type;
            const resolvedType = Array.isArray(typeVal) ? typeVal.find(t => t !== 'null') : typeVal;
            if ((resolvedType === 'object' || resolvedType === undefined) && s.additionalProperties && typeof s.additionalProperties === 'object') {
                const obj: any = {};
                if (s.properties)
                    Object.entries(s.properties).forEach(([k, v]: [
                        string,
                        any
                    ]) => {
                        obj[k] = generateMock(v, depth + 1, new Set(visited));
                    });
                obj.key = generateMock(s.additionalProperties, depth + 1, new Set(visited));
                return obj;
            }
            if (resolvedType === 'object' || s.properties) {
                const obj: any = {};
                if (s.properties)
                    Object.entries(s.properties).forEach(([k, v]: [
                        string,
                        any
                    ]) => {
                        obj[k] = generateMock(v, depth + 1, new Set(visited));
                    });
                return obj;
            }
            if (resolvedType === 'array')
                return [generateMock(s.items || {}, depth + 1, new Set(visited))];
            if (resolvedType === 'string') {
                if (s.format === 'date-time')
                    return new Date().toISOString();
                if (s.format === 'uuid')
                    return '123e4567-e89b-12d3-a456-426614174000';
                if (s.pattern)
                    return generateMockFromPattern(s.pattern);
                return s.enum ? s.enum[0] : 'string';
            }
            if (resolvedType === 'integer' || resolvedType === 'number')
                return 0;
            if (resolvedType === 'boolean')
                return true;
            if (s.properties) {
                const obj: any = {};
                Object.entries(s.properties).forEach(([k, v]: [
                    string,
                    any
                ]) => {
                    obj[k] = generateMock(v, depth + 1, new Set(visited));
                });
                return obj;
            }
            return null;
        };
        try {
            return JSON.stringify(generateMock(schema), null, 2);
        } catch {
            return '{}';
        }
    };
    const getMockValue = (schema: any): any => {
        try {
            return JSON.parse(getMockSnippet(schema));
        } catch {
            return null;
        }
    };
    const getFirstExplicitExample = (contentObj: any): any => {
        if (!contentObj)
            return undefined;
        if (contentObj.example !== undefined)
            return contentObj.example;
        if (contentObj.examples && typeof contentObj.examples === 'object') {
            const first = Object.values(contentObj.examples)[0] as any;
            if (first) {
                if (first.value !== undefined)
                    return first.value;
                if (first.externalValue !== undefined)
                    return first.externalValue;
                return first;
            }
        }
        return undefined;
    };
    const escapeXml = (value: any) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const toXml = (value: any, nodeName = 'response', depth = 0): string => {
        const indent = '  '.repeat(depth);
        const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
        if (value === null || value === undefined)
            return `${indent}<${safeName} />`;
        if (Array.isArray(value)) {
            if (value.length === 0)
                return `${indent}<${safeName}></${safeName}>`;
            return value.map(item => toXml(item, safeName, depth)).join('\n');
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            if (entries.length === 0)
                return `${indent}<${safeName}></${safeName}>`;
            const children = entries.map(([key, child]) => toXml(child, key, depth + 1)).join('\n');
            return `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>`;
        }
        return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    };
    const getSchemaDisplayName = (schema: any, fallback = 'response') => {
        if (schema === undefined || schema === null)
            return fallback;
        if (schema.xml?.name)
            return schema.xml.name;
        if (schema.$ref)
            return getRefName(schema.$ref);
        if (schema.items?.$ref)
            return getRefName(schema.items.$ref);
        if (schema.title)
            return schema.title;
        return fallback;
    };
    const getLanguageForContentType = (contentType: string): string => {
        const c = contentType.toLowerCase();
        if (c.includes('json'))
            return 'json';
        if (c.includes('yaml') || c.includes('yml'))
            return 'yaml';
        if (c.includes('xml'))
            return 'xml';
        if (c.includes('html'))
            return 'html';
        if (c.includes('javascript'))
            return 'javascript';
        if (c.includes('x-www-form-urlencoded'))
            return 'http';
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
                    return JSON.stringify(JSON.parse(value), null, 2);
                } catch {
                    return JSON.stringify(value, null, 2);
                }
            }
            if (c.includes('xml') || c.includes('html') || c.includes('text') || c.includes('plain'))
                return value;
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
            return typeof value === 'object' ? `<pre>${escapeXml(JSON.stringify(value, null, 2))}</pre>` : String(value ?? '');
        if (c.includes('yaml') || c.includes('yml'))
            return jsYaml.dump(value);
        if (c.includes('text') || c.includes('plain'))
            return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
        return JSON.stringify(value, null, 2);
    };
    const humanizeSchemaName = (name: string): string => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase();
    const getSchemaNamesFromResponse = (resp: any): string[] => {
        if (!resp?.content)
            return [];
        const names = new Set<string>();
        Object.values(resp.content).forEach((contentObj: any) => {
            const schema = contentObj?.schema;
            if (schema === undefined || schema === null)
                return;
            if (schema.$ref)
                names.add(getRefName(schema.$ref));
            if (schema.oneOf && Array.isArray(schema.oneOf))
                schema.oneOf.forEach((sub: any) => {
                    if (sub.$ref)
                        names.add(getRefName(sub.$ref));
                    if (sub.title)
                        names.add(sub.title);
                });
            if (schema.anyOf && Array.isArray(schema.anyOf))
                schema.anyOf.forEach((sub: any) => {
                    if (sub.$ref)
                        names.add(getRefName(sub.$ref));
                    if (sub.title)
                        names.add(sub.title);
                });
            if (schema.allOf && Array.isArray(schema.allOf))
                schema.allOf.forEach((sub: any) => {
                    if (sub.$ref)
                        names.add(getRefName(sub.$ref));
                    if (sub.title)
                        names.add(sub.title);
                });
            if (schema.title)
                names.add(schema.title);
        });
        return Array.from(names);
    };
    const truncateText = (text: string, maxLength = 80) => {
        if (!text)
            return '';
        if (text.length <= maxLength)
            return text;
        return text.substring(0, maxLength) + '...';
    };
    return {
        getMockSnippet, getMockValue, getFirstExplicitExample, escapeXml, toXml,
        getSchemaDisplayName, getLanguageForContentType, getResponseExampleSnippet,
        humanizeSchemaName, getSchemaNamesFromResponse, truncateText,
    };
};
