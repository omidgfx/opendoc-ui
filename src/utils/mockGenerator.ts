import type {Diagnostic, OpenApiSpec} from '../types';
import {diagnostic} from '../types';
import {resolveReferenceResult} from './openapi';

const mockFromPattern = (pattern: string): string => {
    if (!pattern) return 'string';
    if (pattern.includes('uuid')) return '123e4567-e89b-12d3-a456-426614174000';
    if (/\[0-9\]|\\d/.test(pattern)) return '12345';
    if (/\[a-zA-Z0-9\]/.test(pattern)) return 'string123';
    if (pattern.includes('@') || pattern.includes('email')) return 'user@example.com';
    if (pattern.toLowerCase().includes('phone')) return '+1234567890';
    if (pattern.toLowerCase().includes('date')) return '2026-08-09';
    return 'string';
};

const schemaType = (schema: any): string | undefined =>
    Array.isArray(schema?.type) ? schema.type.find((item: string) => item !== 'null') : schema?.type;

const constrainedNumber = (schema: any): number => {
    let value = typeof schema.minimum === 'number' ? schema.minimum : 0;
    if (typeof schema.exclusiveMinimum === 'number')
        value = Math.max(value, schema.exclusiveMinimum + (schema.type === 'integer' ? 1 : Number.EPSILON));
    else if (schema.exclusiveMinimum === true && typeof schema.minimum === 'number')
        value = schema.minimum + (schema.type === 'integer' ? 1 : Number.EPSILON);
    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0)
        value = Math.ceil(value / schema.multipleOf) * schema.multipleOf;
    const maximum =
        typeof schema.exclusiveMaximum === 'number'
            ? schema.exclusiveMaximum - (schema.type === 'integer' ? 1 : Number.EPSILON)
            : typeof schema.maximum === 'number'
              ? schema.maximum -
                (schema.exclusiveMaximum === true ? (schema.type === 'integer' ? 1 : Number.EPSILON) : 0)
              : undefined;
    if (maximum !== undefined) value = Math.min(value, maximum);
    return schema.type === 'integer' ? Math.round(value) : value;
};

const constrainedString = (schema: any): string => {
    let value: string;
    if (schema.format === 'date-time') value = '2026-08-09T12:00:00.000Z';
    else if (schema.format === 'date') value = '2026-08-09';
    else if (schema.format === 'uuid') value = '123e4567-e89b-12d3-a456-426614174000';
    else if (schema.format === 'uri' || schema.format === 'url') value = 'https://example.com/path';
    else if (schema.format === 'email') value = 'user@example.com';
    else if (schema.pattern) value = mockFromPattern(schema.pattern);
    else value = 'string';
    const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
    if (value.length < min) value += 'x'.repeat(min - value.length);
    if (typeof schema.maxLength === 'number') value = value.slice(0, schema.maxLength);
    return value;
};

export type MockUsage = 'generic' | 'request' | 'response';

export function generateMock(
    schema: any,
    spec: OpenApiSpec | null,
    depth = 0,
    visited = new Set<string>(),
    usage: MockUsage = 'generic',
): any {
    if (schema === true) return null;
    if (schema === false) throw new Error('No value can satisfy the boolean schema false.');
    if (schema === undefined || schema === null) return null;
    if (depth > 64) return {};
    if (schema.$ref) {
        const ref = String(schema.$ref);
        if (visited.has(ref)) return {};
        const nextVisited = new Set(visited);
        nextVisited.add(ref);
        const resolution = resolveReferenceResult(schema, spec);
        return resolution.status === 'resolved' && resolution.value !== schema
            ? generateMock(resolution.value, spec, depth + 1, nextVisited, usage)
            : {};
    }
    if (schema.const !== undefined) return schema.const;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (schema.example !== undefined) return schema.example;
    if (Array.isArray(schema.examples) && schema.examples.length) {
        const first = schema.examples[0];
        return typeof first === 'object' && first !== null && 'value' in first ? first.value : first;
    }
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.allOf)) {
        let merged: any = {};
        schema.allOf.forEach((sub: any) => {
            const subMock = generateMock(sub, spec, depth + 1, new Set(visited), usage);
            if (typeof subMock === 'object' && subMock !== null && !Array.isArray(subMock))
                merged = {...merged, ...subMock};
            else if (subMock !== null) merged = subMock;
        });
        return merged;
    }
    if (Array.isArray(schema.oneOf) && schema.oneOf.length)
        return generateMock(schema.oneOf[0], spec, depth + 1, new Set(visited), usage);
    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
        return generateMock(schema.anyOf[0], spec, depth + 1, new Set(visited), usage);

    const type = schemaType(schema);
    if (type === 'object' || schema.properties || schema.additionalProperties) {
        const object: Record<string, unknown> = {};
        Object.entries(schema.properties || {}).forEach(([key, child]: [string, any]) => {
            if (usage === 'request' && child?.readOnly === true) return;
            if (usage === 'response' && child?.writeOnly === true) return;
            object[key] = generateMock(child, spec, depth + 1, new Set(visited), usage);
        });
        if (
            schema.additionalProperties &&
            typeof schema.additionalProperties === 'object' &&
            Object.keys(object).length === 0
        )
            object.key = generateMock(schema.additionalProperties, spec, depth + 1, new Set(visited), usage);
        return object;
    }
    if (type === 'array') {
        const minItems = Math.max(0, typeof schema.minItems === 'number' ? schema.minItems : 1);
        const count = typeof schema.maxItems === 'number' ? Math.min(minItems, schema.maxItems) : minItems;
        return Array.from({length: count}, (_, index) => {
            const item = generateMock(schema.items || {}, spec, depth + 1, new Set(visited), usage);
            if (schema.uniqueItems && typeof item === 'string') return `${item}${index || ''}`;
            if (schema.uniqueItems && typeof item === 'number') return item + index;
            return item;
        });
    }
    if (type === 'string') return constrainedString(schema);
    if (type === 'integer' || type === 'number') return constrainedNumber(schema);
    if (type === 'boolean') return true;
    if (type === 'null') return null;
    return null;
}

const valueTypeMatches = (type: string, value: unknown): boolean => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === type;
};

export const validateMockValue = (
    schema: any,
    value: unknown,
    spec: OpenApiSpec | null,
    path = '$',
    visited = new Set<string>(),
    usage: MockUsage = 'generic',
): string[] => {
    if (schema === true || schema === undefined || schema === null) return [];
    if (schema === false) return [`${path}: boolean schema false rejects every value`];
    if (schema.$ref) {
        const ref = String(schema.$ref);
        if (visited.has(ref)) return [];
        const resolution = resolveReferenceResult(schema, spec);
        if (resolution.status !== 'resolved') return [`${path}: unresolved schema reference ${schema.$ref}`];
        const next = new Set(visited);
        next.add(ref);
        return validateMockValue(resolution.value, value, spec, path, next, usage);
    }
    if (schema.const !== undefined && !Object.is(schema.const, value)) return [`${path}: value does not equal const`];
    if (Array.isArray(schema.enum) && !schema.enum.some((item: unknown) => Object.is(item, value)))
        return [`${path}: value is not in enum`];
    if (Array.isArray(schema.allOf))
        return schema.allOf.flatMap((part: any) => validateMockValue(part, value, spec, path, new Set(visited), usage));
    if (
        Array.isArray(schema.anyOf) &&
        !schema.anyOf.some(
            (part: any) => validateMockValue(part, value, spec, path, new Set(visited), usage).length === 0,
        )
    )
        return [`${path}: value does not satisfy anyOf`];
    if (Array.isArray(schema.oneOf)) {
        const matches = schema.oneOf.filter(
            (part: any) => validateMockValue(part, value, spec, path, new Set(visited), usage).length === 0,
        ).length;
        if (matches !== 1) return [`${path}: value satisfies ${matches} oneOf alternatives instead of exactly one`];
    }
    const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    if (schema.nullable === true) types.push('null');
    if (types.length > 0 && !types.some((type: string) => valueTypeMatches(type, value)))
        return [`${path}: value does not match type ${types.join(' | ')}`];

    const errors: string[] = [];
    if (typeof value === 'string') {
        if (typeof schema.minLength === 'number' && value.length < schema.minLength)
            errors.push(`${path}: shorter than minLength`);
        if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
            errors.push(`${path}: longer than maxLength`);
        if (schema.pattern) {
            try {
                if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern`);
            } catch {
                errors.push(`${path}: schema pattern is invalid`);
            }
        }
    }
    if (typeof value === 'number') {
        if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: below minimum`);
        if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: above maximum`);
        if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
            errors.push(`${path}: not above exclusiveMinimum`);
        if (schema.exclusiveMinimum === true && typeof schema.minimum === 'number' && value <= schema.minimum)
            errors.push(`${path}: not above exclusive minimum`);
        if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
            errors.push(`${path}: not below exclusiveMaximum`);
        if (schema.exclusiveMaximum === true && typeof schema.maximum === 'number' && value >= schema.maximum)
            errors.push(`${path}: not below exclusive maximum`);
        if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
            const quotient = value / schema.multipleOf;
            if (Math.abs(quotient - Math.round(quotient)) > 1e-9)
                errors.push(`${path}: not a multipleOf ${schema.multipleOf}`);
        }
    }
    if (Array.isArray(value)) {
        if (typeof schema.minItems === 'number' && value.length < schema.minItems)
            errors.push(`${path}: fewer than minItems`);
        if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
            errors.push(`${path}: more than maxItems`);
        if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length)
            errors.push(`${path}: items are not unique`);
        value.forEach((item, index) =>
            errors.push(
                ...validateMockValue(schema.items || true, item, spec, `${path}[${index}]`, new Set(visited), usage),
            ),
        );
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const object = value as Record<string, unknown>;
        (schema.required || []).forEach((key: string) => {
            const child = schema.properties?.[key];
            if (usage === 'request' && child?.readOnly === true) return;
            if (usage === 'response' && child?.writeOnly === true) return;
            if (!Object.prototype.hasOwnProperty.call(object, key))
                errors.push(`${path}.${key}: required property missing`);
        });
        Object.entries(schema.properties || {}).forEach(([key, child]: [string, any]) => {
            if (usage === 'request' && child?.readOnly === true) return;
            if (usage === 'response' && child?.writeOnly === true) return;
            if (Object.prototype.hasOwnProperty.call(object, key))
                errors.push(...validateMockValue(child, object[key], spec, `${path}.${key}`, new Set(visited), usage));
        });
        if (schema.additionalProperties === false) {
            Object.keys(object)
                .filter(key => !schema.properties?.[key])
                .forEach(key => errors.push(`${path}.${key}: additional property not allowed`));
        }
    }
    return errors;
};

export interface MockGenerationResult {
    ok: boolean;
    value?: unknown;
    diagnostics: Diagnostic[];
}

export const generateValidatedMock = (
    schema: any,
    spec: OpenApiSpec | null,
    usage: MockUsage = 'generic',
): MockGenerationResult => {
    try {
        const value = generateMock(schema, spec, 0, new Set(), usage);
        const errors = validateMockValue(schema, value, spec, '$', new Set(), usage);
        if (errors.length > 0) {
            return {
                ok: false,
                value,
                diagnostics: errors
                    .slice(0, 12)
                    .map(message => diagnostic('MOCK_SCHEMA_VALIDATION_FAILED', message, {severity: 'error'})),
            };
        }
        return {ok: true, value, diagnostics: []};
    } catch (error) {
        return {
            ok: false,
            diagnostics: [
                diagnostic(
                    'MOCK_GENERATION_IMPOSSIBLE',
                    error instanceof Error ? error.message : 'A valid mock could not be generated.',
                    {severity: 'error'},
                ),
            ],
        };
    }
};

export const getMockSnippet = (schema: any, spec: OpenApiSpec | null, usage: MockUsage = 'generic'): string => {
    const result = generateValidatedMock(schema, spec, usage);
    if (!result.ok) return `// Mock unavailable: ${result.diagnostics.map(item => item.message).join('; ')}`;
    try {
        return JSON.stringify(result.value, null, 2);
    } catch {
        return '// Mock unavailable: value could not be serialized';
    }
};
