import type {OpenApiSpec} from '../../types';
import {resolveReference} from './refs';

export const resolveExampleObject = (example: any, spec: OpenApiSpec | null | undefined): any =>
    spec ? resolveReference(example, spec) || example : example;

export const exampleValueOf = (example: any, spec: OpenApiSpec | null | undefined): any => {
    const resolved = resolveExampleObject(example, spec);
    if (!resolved || typeof resolved !== 'object') return resolved;
    if (resolved.dataValue !== undefined) return resolved.dataValue;
    if (resolved.value !== undefined) return resolved.value;
    if (resolved.serializedValue !== undefined) return resolved.serializedValue;
    if (resolved.externalValue !== undefined) return resolved.externalValue;
    if (resolved.externalDataValue !== undefined) return resolved.externalDataValue;
    return resolved;
};

export const firstExampleValueOf = (
    examples: Record<string, any> | undefined,
    spec: OpenApiSpec | null | undefined,
): any => {
    const first = Object.values(examples || {})[0] as any;
    return first === undefined ? undefined : exampleValueOf(first, spec);
};
