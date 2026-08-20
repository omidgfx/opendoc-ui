import type {Diagnostic, OpenApiSpec} from '../../types';
import {diagnostic} from '../../types';
import {resolveReferenceResult} from '../openapi';

/**
 * Marks values generated in place of a pruned branch (a recursive reference
 * or the depth guard). The symbol key is invisible to JSON.stringify and to
 * mock validation, so tagged stubs serialize exactly like the plain `{}`
 * they used to be — but annotators can find them again.
 */
export const MOCK_STUB: unique symbol = Symbol('opendoc.mockStub');

/**
 * Per-property metadata attached (non-enumerably) to generated objects:
 * which keys are required by the schema and which were produced from a
 * referenced schema. Invisible to serialization and validation.
 */
export const MOCK_KEY_META: unique symbol = Symbol('opendoc.mockKeyMeta');

export type MockStubKind = 'recursive' | 'max-depth';

/** Kinds a gutter marker can report for a serialized mock line. */
export type MockLineMarkerKind =
    | MockStubKind
    | 'ref'
    | 'branch'
    | 'deprecated'
    | 'read-only'
    | 'write-only'
    | 'enum'
    | 'format'
    | 'pattern'
    | 'required';

export interface MockBranchOption {
    label: string;
    /** Set when the branch is a schema reference — enables linking to it. */
    schemaName?: string;
}

export interface MockBranchInfo {
    kind: 'oneOf' | 'anyOf';
    /** 0-based index of the branch the example expands. */
    index: number;
    count: number;
    /** Every branch, in declaration order. */
    options: MockBranchOption[];
}

export interface MockStubInfo {
    kind: MockStubKind;
    /** Display name of the schema reference that closed the cycle. */
    ref?: string;
}

export interface MockKeyMeta {
    /** Display name of the schema the property value was generated from. */
    ref?: string;
    /** True when the reference sits on the array items rather than the key. */
    refOnItems?: boolean;
    required?: boolean;
    branch?: MockBranchInfo;
    deprecated?: boolean;
    readOnly?: boolean;
    writeOnly?: boolean;
    /** Allowed values (enum) or the single const value. */
    enumValues?: unknown[];
    isConst?: boolean;
    format?: string;
    pattern?: string;
}

export interface MockLineMarker {
    /** 1-based line number inside the serialized snippet. */
    line: number;
    kind: MockLineMarkerKind;
    ref?: string;
    refOnItems?: boolean;
    branch?: MockBranchInfo;
    enumValues?: unknown[];
    isConst?: boolean;
    format?: string;
    pattern?: string;
}

const refDisplayName = (ref: string): string => {
    const tail = ref.split('/').pop() || ref;
    try {
        return decodeURIComponent(tail);
    } catch {
        return tail;
    }
};

const createMockStub = (kind: MockStubKind, ref?: string): Record<string, never> =>
    /* non-enumerable so object spreads (e.g. the allOf merge) never copy the
       stub tag onto composed objects; `MOCK_STUB in value` still finds it */
    Object.defineProperty({}, MOCK_STUB, {value: {kind, ref}}) as Record<string, never>;

const isMockStub = (value: unknown): value is Record<string, never> =>
    typeof value === 'object' && value !== null && MOCK_STUB in value;

/** True for inline branches that can only ever produce null. */
const isNullBranch = (branch: any): boolean => {
    if (branch === null || branch === undefined) return true;
    if (typeof branch !== 'object') return false;
    if (branch.const === null) return true;
    if (Array.isArray(branch.enum)) return branch.enum.every((item: unknown) => item === null);
    const type = branch.type;
    if (type === 'null') return true;
    return Array.isArray(type) && type.length > 0 && type.every((item: string) => item === 'null');
};

/**
 * Chooses the branch a combinator example should expand. Prefers the first
 * branch that can hold a real value, so `anyOf: [null, $ref]` patterns show
 * the referenced structure (and its recursion guards) instead of a bare null.
 */
const pickCombinatorBranch = (branches: any[]): any => branches.find(branch => !isNullBranch(branch)) ?? branches[0];

/** Label (and schema name, for references) of a combinator branch. */
const branchOption = (branch: any): MockBranchOption => {
    if (branch === null || branch === undefined) return {label: 'null'};
    if (typeof branch !== 'object') return {label: String(branch)};
    if (branch.$ref) {
        const name = refDisplayName(String(branch.$ref));
        return {label: name, schemaName: name};
    }
    if (branch.title) return {label: String(branch.title)};
    if (isNullBranch(branch)) return {label: 'null'};
    const type = branch.type;
    if (Array.isArray(type)) return {label: type.join(' | ')};
    if (typeof type === 'string') return {label: type};
    return {label: 'schema'};
};

/**
 * Collects gutter-facing facts about a property: the referenced schema it
 * expands, the combinator branch the example chose, and constraints worth
 * surfacing (deprecated, readOnly/writeOnly, enum/const, format, pattern).
 * Facts are read from the inline schema, the resolved reference, or the
 * picked combinator branch — whichever actually describes the value.
 */
const collectKeyMeta = (child: any, spec: OpenApiSpec | null): MockKeyMeta => {
    const meta: MockKeyMeta = {};
    if (!child || typeof child !== 'object') return meta;

    const refName = (node: any): string | undefined => {
        if (!node || typeof node !== 'object') return undefined;
        if (node.$ref) return refDisplayName(String(node.$ref));
        const branches = Array.isArray(node.oneOf) ? node.oneOf : Array.isArray(node.anyOf) ? node.anyOf : null;
        if (branches && branches.length) {
            const picked = pickCombinatorBranch(branches);
            if (picked?.$ref) return refDisplayName(String(picked.$ref));
        }
        return undefined;
    };
    const own = refName(child);
    if (own) meta.ref = own;
    else {
        const items = refName(child.items);
        if (items) {
            meta.ref = items;
            meta.refOnItems = true;
        }
    }

    const branches = Array.isArray(child.oneOf) ? child.oneOf : Array.isArray(child.anyOf) ? child.anyOf : null;
    if (branches && branches.length > 1) {
        const picked = pickCombinatorBranch(branches);
        meta.branch = {
            kind: Array.isArray(child.oneOf) ? 'oneOf' : 'anyOf',
            index: Math.max(0, branches.indexOf(picked)),
            count: branches.length,
            options: branches.map(branchOption),
        };
    }

    /* the schema that actually describes the generated value */
    let facts: any = child;
    if (child.$ref) {
        const resolution = resolveReferenceResult(child, spec);
        if (resolution.status === 'resolved' && resolution.value !== child) facts = resolution.value;
    } else if (branches && branches.length) {
        let picked = pickCombinatorBranch(branches);
        if (picked?.$ref) {
            const resolution = resolveReferenceResult(picked, spec);
            if (resolution.status === 'resolved' && resolution.value !== picked) picked = resolution.value;
        }
        facts = picked ?? child;
    }
    if (child.deprecated === true || facts?.deprecated === true) meta.deprecated = true;
    if (child.readOnly === true || facts?.readOnly === true) meta.readOnly = true;
    if (child.writeOnly === true || facts?.writeOnly === true) meta.writeOnly = true;
    if (facts?.const !== undefined) {
        meta.enumValues = [facts.const];
        meta.isConst = true;
    } else if (Array.isArray(facts?.enum) && facts.enum.length) meta.enumValues = facts.enum;
    if (typeof facts?.format === 'string' && facts.format) meta.format = facts.format;
    if (typeof facts?.pattern === 'string' && facts.pattern) meta.pattern = facts.pattern;
    return meta;
};

const keyMetaHasFacts = (meta: MockKeyMeta): boolean =>
    Boolean(
        meta.ref ||
        meta.branch ||
        meta.deprecated ||
        meta.readOnly ||
        meta.writeOnly ||
        meta.enumValues ||
        meta.format ||
        meta.pattern,
    );

/**
 * Tiny regex sampler: synthesizes a string for the common constructs found
 * in API patterns (literals, escapes, classes, quantifiers, groups,
 * alternation). Returns undefined for constructs it does not understand.
 */
const sampleFromRegex = (pattern: string): string | undefined => {
    let i = 0;
    const source = pattern;
    const fail = Symbol('fail');
    const classChar = (body: string): string => {
        if (body.startsWith('^')) return 'a';
        /* first concrete character or range start / escape */
        for (let k = 0; k < body.length; k++) {
            const ch = body[k];
            if (ch === '\\') {
                const esc = body[k + 1];
                if (esc === 'd') return '0';
                if (esc === 'w') return 'a';
                if (esc === 's') return ' ';
                if (esc) return esc;
                continue;
            }
            if (k + 2 < body.length && body[k + 1] === '-') return ch;
            return ch;
        }
        return 'a';
    };
    const atom = (): string | typeof fail => {
        const ch = source[i];
        if (ch === undefined) return fail;
        if (ch === '(') {
            i++;
            if (source.startsWith('?:', i)) i += 2;
            else if (source[i] === '?') return fail; /* lookarounds etc. */
            const inner = sequence();
            if (inner === fail || source[i] !== ')') return fail;
            i++;
            return inner;
        }
        if (ch === '[') {
            const end = source.indexOf(']', i + 1);
            if (end === -1) return fail;
            const body = source.slice(i + 1, end);
            i = end + 1;
            return classChar(body);
        }
        if (ch === '\\') {
            const esc = source[i + 1];
            i += 2;
            if (esc === 'd') return '0';
            if (esc === 'w') return 'a';
            if (esc === 's') return ' ';
            if (esc === 'b' || esc === 'B') return '';
            if (esc === undefined) return fail;
            return esc;
        }
        if (ch === '.') {
            i++;
            return 'a';
        }
        if (ch === '^' || ch === '$') {
            i++;
            return '';
        }
        if ('*+?{)|'.includes(ch)) return fail;
        i++;
        return ch;
    };
    const quantified = (): string | typeof fail => {
        const base = atom();
        if (base === fail) return fail;
        const ch = source[i];
        if (ch === '{') {
            const end = source.indexOf('}', i);
            if (end === -1) return fail;
            const body = source.slice(i + 1, end);
            i = end + 1;
            const n = parseInt(body.split(',')[0], 10);
            if (!Number.isFinite(n) || n < 0 || n > 256) return fail;
            return base.repeat(n);
        }
        if (ch === '+') {
            i++;
            return base;
        }
        if (ch === '*' || ch === '?') {
            i++;
            return '';
        }
        return base;
    };
    const sequence = (): string | typeof fail => {
        let out = '';
        while (i < source.length && source[i] !== ')' && source[i] !== '|') {
            const part = quantified();
            if (part === fail) return fail;
            out += part;
        }
        if (source[i] === '|') {
            /* alternation: keep the first alternative, skip the rest */
            let depth = 0;
            while (i < source.length) {
                const ch = source[i];
                if (ch === '(') depth++;
                else if (ch === ')') {
                    if (depth === 0) break;
                    depth--;
                } else if (ch === '\\') i++;
                i++;
            }
        }
        return out;
    };
    const result = sequence();
    if (result === fail || i < source.length) return undefined;
    return result;
};

const mockFromPattern = (pattern: string): string => {
    if (!pattern) return 'string';
    /* legacy heuristics first — they keep long-standing outputs stable;
       the regex sampler only steps in when the heuristic fails the pattern */
    let legacy: string;
    if (pattern.includes('uuid')) legacy = '123e4567-e89b-12d3-a456-426614174000';
    else if (/\[0-9\]|\\d/.test(pattern)) legacy = '12345';
    else if (/\[a-zA-Z0-9\]/.test(pattern)) legacy = 'string123';
    else if (pattern.includes('@') || pattern.includes('email')) legacy = 'user@example.com';
    else if (pattern.toLowerCase().includes('phone')) legacy = '+1234567890';
    else if (pattern.toLowerCase().includes('date')) legacy = '2026-08-09';
    else legacy = 'string';
    try {
        const regExp = new RegExp(pattern);
        if (regExp.test(legacy)) return legacy;
        const sampled = sampleFromRegex(pattern);
        if (sampled !== undefined && regExp.test(sampled)) return sampled;
    } catch {}
    return legacy;
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
    if (value.length < min) {
        if (schema.pattern) {
            /* pad without breaking the pattern: repeat the last character and
               keep the extension only if the regex still accepts it */
            try {
                const regExp = new RegExp(schema.pattern);
                let extended = value;
                const filler = extended.slice(-1) || 'x';
                while (extended.length < min) extended += filler;
                if (regExp.test(extended)) value = extended;
            } catch {
                value += 'x'.repeat(min - value.length);
            }
        } else {
            value += 'x'.repeat(min - value.length);
        }
    }
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
    if (depth > 64) return createMockStub('max-depth');
    if (schema.$ref) {
        const ref = String(schema.$ref);
        if (visited.has(ref)) return createMockStub('recursive', refDisplayName(ref));
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
        const mergedMeta: Record<string, MockKeyMeta> = {};
        schema.allOf.forEach((sub: any) => {
            const subMock = generateMock(sub, spec, depth + 1, new Set(visited), usage);
            if (typeof subMock === 'object' && subMock !== null && !Array.isArray(subMock)) {
                /* the key-meta symbol is non-enumerable, spread drops it — carry it over */
                Object.assign(mergedMeta, (subMock as any)[MOCK_KEY_META] || {});
                merged = {...merged, ...subMock};
            } else if (subMock !== null) merged = subMock;
        });
        if (typeof merged === 'object' && merged !== null && !Array.isArray(merged)) {
            /* required can live on the composing schema or any allOf part */
            const required = new Set<string>([
                ...(Array.isArray(schema.required) ? schema.required : []),
                ...schema.allOf.flatMap((sub: any) => (Array.isArray(sub?.required) ? sub.required : [])),
            ]);
            required.forEach(key => {
                if (!(key in merged)) return;
                mergedMeta[key] = {...(mergedMeta[key] || {}), required: true};
            });
            if (Object.keys(mergedMeta).length > 0) Object.defineProperty(merged, MOCK_KEY_META, {value: mergedMeta});
        }
        return merged;
    }
    if (Array.isArray(schema.oneOf) && schema.oneOf.length)
        return generateMock(pickCombinatorBranch(schema.oneOf), spec, depth + 1, new Set(visited), usage);
    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
        return generateMock(pickCombinatorBranch(schema.anyOf), spec, depth + 1, new Set(visited), usage);

    const type = schemaType(schema);
    if (type === 'object' || schema.properties || schema.additionalProperties) {
        const object: Record<string, unknown> = {};
        const keyMeta: Record<string, MockKeyMeta> = {};
        const requiredKeys = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
        Object.entries(schema.properties || {}).forEach(([key, child]: [string, any]) => {
            if (usage === 'request' && child?.readOnly === true) return;
            if (usage === 'response' && child?.writeOnly === true) return;
            object[key] = generateMock(child, spec, depth + 1, new Set(visited), usage);
            const meta = collectKeyMeta(child, spec);
            if (requiredKeys.has(key)) meta.required = true;
            if (keyMetaHasFacts(meta)) keyMeta[key] = meta;
        });
        if (Object.keys(keyMeta).length > 0)
            Object.defineProperty(object, MOCK_KEY_META, {value: keyMeta, enumerable: false});
        if (
            schema.additionalProperties &&
            typeof schema.additionalProperties === 'object' &&
            Object.keys(object).length === 0
        )
            object.key = generateMock(schema.additionalProperties, spec, depth + 1, new Set(visited), usage);
        return object;
    }
    if (type === 'array') {
        const tupleSchemas = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
        const minItems = Math.max(0, typeof schema.minItems === 'number' ? schema.minItems : tupleSchemas.length > 0 ? tupleSchemas.length : 1);
        const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : Infinity;
        const tupleCount = Math.min(tupleSchemas.length, maxItems);
        const values = tupleSchemas.slice(0, tupleCount).map((item: any, index: number) => {
            const generated = generateMock(item, spec, depth + 1, new Set(visited), usage);
            if (schema.uniqueItems && typeof generated === 'string') return `${generated}${index || ''}`;
            if (schema.uniqueItems && typeof generated === 'number') return generated + index;
            return generated;
        });
        const additionalCount = Math.max(0, Math.min(maxItems, minItems) - values.length);
        if (additionalCount > 0) {
            const additionalSchema = schema.items === false ? null : schema.items || {};
            for (let index = 0; index < additionalCount; index += 1) {
                const generated = additionalSchema
                    ? generateMock(additionalSchema, spec, depth + 1, new Set(visited), usage)
                    : null;
                if (schema.uniqueItems && typeof generated === 'string') values.push(`${generated}${values.length || ''}`);
                else if (schema.uniqueItems && typeof generated === 'number') values.push(generated + values.length);
                else values.push(generated);
            }
        }
        return values;
    }
    if (type === 'string') return constrainedString(schema);
    if (type === 'integer' || type === 'number') return constrainedNumber(schema);
    if (type === 'boolean') return true;
    if (type === 'null') return null;
    return null;
}

const KNOWN_SCHEMA_TYPES = new Set(['null', 'array', 'object', 'integer', 'number', 'string', 'boolean']);

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
    const hasUnknownType = types.some((type: string) => !KNOWN_SCHEMA_TYPES.has(type));
    if (!hasUnknownType && types.length > 0 && !types.some((type: string) => valueTypeMatches(type, value)))
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
        const tupleSchemas = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
        value.forEach((item, index) => {
            const itemSchema =
                index < tupleSchemas.length ? tupleSchemas[index] : schema.items === false ? false : schema.items || true;
            errors.push(...validateMockValue(itemSchema, item, spec, `${path}[${index}]`, new Set(visited), usage));
        });
        if (schema.items === false && value.length > tupleSchemas.length)
            errors.push(`${path}: additional tuple items are not allowed`);
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

/* ------------------------------------------------------------------ */
/* Line-marker annotation                                             */
/* ------------------------------------------------------------------ */

const MARK_TOKEN = (id: number) => `__ODUI_MARK_${id}__`;
const KEY_TOKEN = (id: number) => `__ODUI_KEY_${id}__`;
const MARK_JSON = /"__ODUI_MARK_(\d+)__"/;
const MARK_XML = />__ODUI_MARK_(\d+)__</;
const MARK_PHP = /'__ODUI_MARK_(\d+)__'/;
const MARK_PLAIN = /__ODUI_MARK_(\d+)__/;
const KEY_PLAIN = /__ODUI_KEY_(\d+)__/;

export interface PreparedMockValue {
    /** Deep copy of the mock where stubs and annotated keys carry tokens. */
    value: unknown;
    /** Value-stub metadata, indexed by placeholder id. */
    stubs: MockStubInfo[];
    /** Key metadata, indexed by key-token id. */
    keys: MockKeyMeta[];
}

/**
 * Replaces every tagged stub inside a generated mock with a unique placeholder
 * string, and suffixes annotated property names (required / referenced-schema)
 * with a key token, so any serializer (JSON, YAML, XML, PHP arrays, ...)
 * carries those positions through to the emitted text. Use
 * extractMockLineMarkers afterwards to strip the tokens and learn the lines.
 */
export const prepareMockForAnnotation = (value: unknown): PreparedMockValue => {
    const stubs: MockStubInfo[] = [];
    const keys: MockKeyMeta[] = [];
    const walk = (node: unknown): unknown => {
        if (node === null || typeof node !== 'object') return node;
        if (isMockStub(node)) {
            stubs.push((node as any)[MOCK_STUB] as MockStubInfo);
            return MARK_TOKEN(stubs.length - 1);
        }
        if (Array.isArray(node)) return node.map(walk);
        const keyMeta = (node as any)[MOCK_KEY_META] as Record<string, MockKeyMeta> | undefined;
        const out: Record<string, unknown> = {};
        Object.entries(node as Record<string, unknown>).forEach(([key, child]) => {
            const meta = keyMeta?.[key];
            let outKey = key;
            if (meta) {
                keys.push(meta);
                outKey = `${key}${KEY_TOKEN(keys.length - 1)}`;
            }
            out[outKey] = walk(child);
        });
        return out;
    };
    return {value: walk(value), stubs, keys};
};

/**
 * Scans serialized text for annotation tokens, records the 1-based line each
 * one landed on, and restores the text a reader should see. Key tokens can
 * appear more than once (e.g. XML opening and closing tags) — the marker is
 * recorded for the first occurrence only, every occurrence is stripped.
 */
export const extractMockLineMarkers = (
    code: string,
    prepared: Pick<PreparedMockValue, 'stubs' | 'keys'>,
): {code: string; markers: MockLineMarker[]} => {
    const {stubs, keys} = prepared;
    if ((stubs.length === 0 && keys.length === 0) || !code.includes('__ODUI_')) return {code, markers: []};
    const markers: MockLineMarker[] = [];
    const seenKeyIds = new Set<number>();
    const lines = code.split('\n').map((lineText, index) => {
        let text = lineText;
        for (;;) {
            /* key tokens: strip, record required / ref markers once per id */
            const keyMatch = text.match(KEY_PLAIN);
            if (keyMatch) {
                const id = Number(keyMatch[1]);
                const meta = keys[id];
                if (meta && !seenKeyIds.has(id)) {
                    seenKeyIds.add(id);
                    const line = index + 1;
                    /* type/format icons always lead the slot */
                    if (meta.format) markers.push({line, kind: 'format', format: meta.format});
                    if (meta.ref) markers.push({line, kind: 'ref', ref: meta.ref, refOnItems: meta.refOnItems});
                    if (meta.branch) markers.push({line, kind: 'branch', branch: meta.branch});
                    if (meta.deprecated) markers.push({line, kind: 'deprecated'});
                    if (meta.readOnly) markers.push({line, kind: 'read-only'});
                    if (meta.writeOnly) markers.push({line, kind: 'write-only'});
                    if (meta.enumValues)
                        markers.push({line, kind: 'enum', enumValues: meta.enumValues, isConst: meta.isConst});
                    if (meta.pattern) markers.push({line, kind: 'pattern', pattern: meta.pattern});
                    if (meta.required) markers.push({line, kind: 'required'});
                }
                text = text.replace(keyMatch[0], '');
                continue;
            }
            /* value stubs: restore the reader-facing text */
            let replacement = '{}';
            let match = text.match(MARK_JSON);
            if (!match) {
                match = text.match(MARK_XML);
                if (match) replacement = '><';
            }
            if (!match) {
                match = text.match(MARK_PHP);
                if (match) replacement = '[]';
            }
            if (!match) {
                match = text.match(MARK_PLAIN);
                if (match) replacement = '{}';
            }
            if (!match) return text;
            const stub = stubs[Number(match[1])];
            if (stub) markers.push({line: index + 1, ...stub});
            text = text.replace(match[0], replacement);
        }
    });
    return {code: lines.join('\n'), markers};
};

/**
 * Marker-aware variant of getMockSnippet: serializes the generated mock as
 * JSON and reports which lines hold pruned recursive / depth-guard branches.
 */
export const getMockSnippetWithMarkers = (
    schema: any,
    spec: OpenApiSpec | null,
    usage: MockUsage = 'generic',
    indent = 2,
): {code: string; markers: MockLineMarker[]} => {
    const result = generateValidatedMock(schema, spec, usage);
    /* a value that merely failed validation is still worth showing —
       dropping it would also drop every gutter marker on the example */
    if (result.value === undefined)
        return {
            code: `// Mock unavailable: ${result.diagnostics.map(item => item.message).join('; ')}`,
            markers: [],
        };
    try {
        const prepared = prepareMockForAnnotation(result.value);
        return extractMockLineMarkers(JSON.stringify(prepared.value, null, indent), prepared);
    } catch {
        return {code: '// Mock unavailable: value could not be serialized', markers: []};
    }
};
