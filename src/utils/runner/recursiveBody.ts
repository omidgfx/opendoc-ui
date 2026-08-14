import type {OpenApiSpec} from '@/src/types';
import {resolveReference} from '@/src/utils/openapi';
import type {PathPart} from '@/src/types/recursiveBody';

export const DESCRIPTION_TOOLTIP_THRESHOLD = 80;
export const containsMarkdown = (description?: string): boolean => {
    if (!description?.trim()) return false;
    return (
        /(^|\n)\s{0,3}(#{1,6}\s|>|[-+*]\s|\d+\.\s|```|~~~)/m.test(description) ||
        /\[[^\]]+\]\([^)]+\)/.test(description) ||
        /(^|\n)\s*\|.+\|\s*(\n|$)/m.test(description) ||
        /(\*\*|__|`)[^\n]+(\*\*|__|`)/.test(description)
    );
};
export const usesDescriptionTooltip = (description?: string): boolean =>
    !!description && (description.trim().length > DESCRIPTION_TOOLTIP_THRESHOLD || containsMarkdown(description));
export const RUNNER_BOOLEAN_SCHEMA = Symbol('runner-boolean-schema');
export const RUNNER_ALLOF_CONFLICTS = Symbol('runner-all-of-conflicts');

export const resolved = (schema: any, spec: OpenApiSpec, ancestorRefs = new Set<string>(), depth = 0): any => {
    if (schema === true) return {[RUNNER_BOOLEAN_SCHEMA]: true};
    if (schema === false) return {[RUNNER_BOOLEAN_SCHEMA]: false, title: 'No value satisfies this schema'};
    if (depth > 64) return schema ?? {};

    let source = schema ?? {};
    const refs = new Set(ancestorRefs);
    if (source?.$ref) {
        const ref = String(source.$ref);
        if (refs.has(ref)) return source;
        refs.add(ref);
        source = resolveReference(source, spec) || source;
    }
    if (!Array.isArray(source.allOf)) return source;

    const merged: any = {...source, properties: {...(source.properties || {})}, required: [...(source.required || [])]};
    delete merged.allOf;
    const conflicts: string[] = [];
    source.allOf.forEach((part: any) => {
        const child = resolved(part, spec, new Set(refs), depth + 1);
        const {properties, required, ...childMetadata} = child;
        Object.entries(childMetadata).forEach(([key, value]) => {
            if (merged[key] === undefined) merged[key] = value;
            else if (JSON.stringify(merged[key]) !== JSON.stringify(value)) conflicts.push(key);
        });
        Object.entries(properties || {}).forEach(([key, value]) => {
            if (
                merged.properties?.[key] !== undefined &&
                JSON.stringify(merged.properties[key]) !== JSON.stringify(value)
            )
                conflicts.push(`properties.${key}`);
            else merged.properties = {...(merged.properties || {}), [key]: value};
        });
        merged.required = Array.from(new Set([...(merged.required || []), ...(required || [])]));
    });
    if (conflicts.length > 0) merged[RUNNER_ALLOF_CONFLICTS] = Array.from(new Set(conflicts));
    return merged;
};

export const defaultBodyValue = (
    schema: any,
    spec: OpenApiSpec,
    depth = 0,
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): any => {
    if (depth > 64) return {};
    if (schema === true) return null;
    if (schema === false) return null;

    let source = schema ?? {};
    const refs = new Set(ancestorRefs);
    if (source?.$ref) {
        const ref = String(source.$ref);
        if (refs.has(ref)) return {};
        refs.add(ref);
        const target = resolveReference(source, spec);
        if (!target || target === source) return {};
        source = target;
    }
    if (source && typeof source === 'object') {
        if (ancestorObjects.has(source)) return {};
    }
    const objects = new Set(ancestorObjects);
    if (source && typeof source === 'object') objects.add(source);
    const current = resolved(source, spec, refs, depth);

    if (current.example !== undefined) return current.example;
    if (current.default !== undefined) return current.default;
    if (Array.isArray(current.enum) && current.enum.length > 0) return current.enum[0];
    if (current.oneOf?.length)
        return defaultBodyValue(current.oneOf[0], spec, depth + 1, new Set(refs), new Set(objects));
    if (current.anyOf?.length)
        return defaultBodyValue(current.anyOf[0], spec, depth + 1, new Set(refs), new Set(objects));
    if (current.type === 'null' || (Array.isArray(current.type) && current.type.every(item => item === 'null')))
        return null;
    if (current.type === 'object' || current.properties) {
        return Object.fromEntries(
            Object.entries(current.properties || {})
                .filter(([, child]: [string, any]) => child?.readOnly !== true)
                .map(([key, child]) => [
                    key,
                    defaultBodyValue(child, spec, depth + 1, new Set(refs), new Set(objects)),
                ]),
        );
    }
    if (current.type === 'array') return [];
    if (current.type === 'boolean') return false;
    if (current.type === 'integer' || current.type === 'number') return '';
    return '';
};
export const setAtPath = (root: any, path: PathPart[], nextValue: unknown): any => {
    if (path.length === 0) return nextValue;
    const [head, ...tail] = path;
    const copy = Array.isArray(root) ? [...root] : {...(root && typeof root === 'object' ? root : {})};
    copy[head] = setAtPath(copy[head], tail, nextValue);
    return copy;
};
export const removeAtPath = (root: any[], index: number): any[] => root.filter((_, itemIndex) => itemIndex !== index);

const variantSchemaMatchesValue = (variant: any, value: unknown, spec: OpenApiSpec): boolean => {
    if (value === null || value === undefined) return false;
    const schema = resolved(variant, spec);
    const types = Array.isArray(schema?.type) ? schema.type : [schema?.type];
    const nullOnly = types.length > 0 && types.every((item: string) => item === 'null');
    if (nullOnly) return false;
    if (typeof value === 'object' && !Array.isArray(value)) {
        if (schema?.type === 'object' || schema?.properties) {
            const required = Array.isArray(schema.required) ? schema.required : [];
            if (required.length > 0) return required.every(key => Object.prototype.hasOwnProperty.call(value, key));
            const propertyKeys = Object.keys(schema.properties || {});
            const valueKeys = Object.keys(value);
            return valueKeys.length > 0 && valueKeys.every(key => propertyKeys.includes(key));
        }
        return false;
    }
    if (Array.isArray(value)) return schema?.type === 'array';
    if (schema?.type === 'boolean') return typeof value === 'boolean';
    if (schema?.type === 'integer' || schema?.type === 'number') return typeof value === 'number';
    if (schema?.type === 'string') return typeof value === 'string';
    return false;
};

/**
 * True when the given oneOf/anyOf alternative's shape matches the current
 * value. Used to keep a saved or restored body on the branch it was edited
 * with instead of resetting to the first branch.
 */
export const runnerVariantMatchesValue = (variant: any, value: unknown, spec: OpenApiSpec): boolean =>
    variantSchemaMatchesValue(variant, value, spec);

/**
 * Pick the oneOf/anyOf alternative whose shape matches the current value so a
 * saved or restored body keeps showing the branch it was edited with. Returns
 * -1 when no branch clearly matches (callers fall back to their own state).
 */
export const runnerVariantIndexForValue = (variants: any[], value: unknown, spec: OpenApiSpec): number =>
    variants.findIndex(variant => variantSchemaMatchesValue(variant, value, spec));
