import type { OpenApiSpec } from '../types';
import { getRefName, resolveSchema } from './openapi';

const mockFromPattern = (pattern: string): string => {
    if (!pattern) return 'string';
    if (pattern.includes('uuid')) return '123e4567-e89b-12d3-a456-426614174000';
    if (pattern.includes('^[0-9]+$')) return '12345';
    if (pattern.includes('^[a-zA-Z0-9]+$')) return 'string123';
    if (pattern.includes('@') || pattern.includes('email')) return 'user@example.com';
    if (pattern.includes('phone')) return '+1234567890';
    if (pattern.includes('date')) return '2026-07-03';
    return 'string';
};

/**
 * Generate a mock example value from a JSON-schema-shaped object,
 * honoring $ref, allOf/oneOf/anyOf, examples, defaults, enums, patterns.
 */
export function generateMock(
    s: any,
    spec: OpenApiSpec | null,
    depth = 0,
    visited = new Set<string>()
): any {
    if (!s) return null;
    if (depth > 1000) return {};

    if (s.$ref) {
        const refName = getRefName(s.$ref);
        if (visited.has(refName)) return {};
        visited.add(refName);
        const refSchema = resolveSchema(refName, spec);
        if (refSchema) return generateMock(refSchema, spec, depth + 1, visited);
        return {};
    }
    if (s.const !== undefined) return s.const;
    if (s.enum && s.enum.length) return s.enum[0];
    if (s.example !== undefined) return s.example;
    if (s.examples && s.examples.length) {
        const first = s.examples[0];
        return typeof first === 'object' && first !== null && 'value' in first ? first.value : first;
    }
    if (s.default !== undefined) return s.default;
    if (s.additionalProperties) {
        return { property1: generateMock(s.additionalProperties, spec, depth + 1, new Set(visited)) };
    }
    if (s.allOf) {
        let merged: any = {};
        s.allOf.forEach((sub: any) => {
            const subMock = generateMock(sub, spec, depth + 1, new Set(visited));
            if (typeof subMock === 'object' && subMock !== null) merged = { ...merged, ...subMock };
            else if (subMock !== null) merged = subMock;
        });
        return merged;
    }
    if (s.oneOf && s.oneOf.length) return generateMock(s.oneOf[0], spec, depth + 1, new Set(visited));
    if (s.anyOf && s.anyOf.length) return generateMock(s.anyOf[0], spec, depth + 1, new Set(visited));

    const typeVal = s.type;
    const resolvedType = Array.isArray(typeVal) ? typeVal.find((t: string) => t !== 'null') : typeVal;
    if (resolvedType === 'object' || s.properties) {
        const obj: any = {};
        if (s.properties) {
            Object.entries(s.properties).forEach(([k, v]: [string, any]) => {
                obj[k] = generateMock(v, spec, depth + 1, new Set(visited));
            });
        }
        return obj;
    }
    if (resolvedType === 'array') return [generateMock(s.items || {}, spec, depth + 1, new Set(visited))];
    if (resolvedType === 'string') {
        if (s.format === 'date-time' || s.format === 'date') return new Date().toISOString();
        if (s.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
        if (s.format === 'uri' || s.format === 'url') return 'https://example.com/path';
        if (s.format === 'email') return 'user@example.com';
        if (s.pattern) return mockFromPattern(s.pattern);
        return s.enum ? s.enum[0] : 'string';
    }
    if (resolvedType === 'integer' || resolvedType === 'number') return 0;
    if (resolvedType === 'boolean') return true;
    return null;
}

/** Produce a pretty-printed JSON mock snippet for a schema. */
export const getMockSnippet = (schema: any, spec: OpenApiSpec | null): string => {
    try {
        return JSON.stringify(generateMock(schema, spec), null, 2);
    } catch {
        return '{}';
    }
};
