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
export const resolved = (schema: any, spec: OpenApiSpec): any => {
    if (schema === true) return {'x-opendoc-boolean-schema': true};
    if (schema === false) return {'x-opendoc-boolean-schema': false, title: 'No value satisfies this schema'};
    const source = schema?.$ref ? resolveReference(schema, spec) || schema : (schema ?? {});
    if (!Array.isArray(source.allOf)) return source;
    const merged: any = {...source, properties: {...(source.properties || {})}, required: [...(source.required || [])]};
    delete merged.allOf;
    const conflicts: string[] = [];
    source.allOf.forEach((part: any) => {
        const child = resolved(part, spec);
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
    if (conflicts.length > 0) merged['x-opendoc-allOf-conflicts'] = Array.from(new Set(conflicts));
    return merged;
};
export const defaultBodyValue = (schema: any, spec: OpenApiSpec): any => {
    const current = resolved(schema, spec);
    if (current.example !== undefined) return current.example;
    if (current.default !== undefined) return current.default;
    if (Array.isArray(current.enum) && current.enum.length > 0) return current.enum[0];
    if (current.oneOf?.length) return defaultBodyValue(current.oneOf[0], spec);
    if (current.anyOf?.length) return defaultBodyValue(current.anyOf[0], spec);
    if (current.type === 'object' || current.properties) {
        return Object.fromEntries(
            Object.entries(current.properties || {})
                .filter(([, child]: [string, any]) => child?.readOnly !== true)
                .map(([key, child]) => [key, defaultBodyValue(child, spec)]),
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
