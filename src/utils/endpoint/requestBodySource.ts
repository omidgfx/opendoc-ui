import type {OpenApiSpec} from '@/src/types';
import {resolveReference, resolveRequestBody} from '@/src/utils/openapi';

export type RequestBodyVariantKind = 'oneOf' | 'anyOf' | 'allOf';

export interface RequestBodyVariants {
    kind: RequestBodyVariantKind;
    variants: any[];
}

export interface RequestBodySource {
    resolvedBody: any;
    mediaTypes: string[];
    mediaType: string;
    content: any;
    schema: any;
    variants: RequestBodyVariants | null;
    variantIndex: number;
    activeSchema: any;
    example: any;
}

/** Media types of a request body, in the order the specification declares them. */
export const getRequestBodyMediaTypes = (resolvedBody: any): string[] => Object.keys(resolvedBody?.content || {});

/** The single rule every view uses to pick a media type: keep the caller's
 *  choice while the body still declares it, otherwise fall back to the first
 *  declared one. Documentation, Runner and the generators must never disagree. */
export const resolveRequestBodyMediaType = (resolvedBody: any, preferred = ''): string => {
    const mediaTypes = getRequestBodyMediaTypes(resolvedBody);
    if (preferred && mediaTypes.includes(preferred)) return preferred;
    return mediaTypes[0] || '';
};

/** Explicit example of a media type object, covering both `example` and the
 *  `examples` map (including Swagger 2 style data/serialized values). */
export const getRequestBodyExample = (content: any): any => {
    if (!content) return undefined;
    if (content.example !== undefined) return content.example;
    const first = Object.values(content.examples || {})[0] as any;
    if (first) {
        if (first.dataValue !== undefined) return first.dataValue;
        if (first.value !== undefined) return first.value;
        if (first.serializedValue !== undefined) return first.serializedValue;
        if (first.externalValue !== undefined) return first.externalValue;
    }
    if (content.schema?.example !== undefined) return content.schema.example;
    return undefined;
};

/** Polymorphism branches of a request body schema, if it declares any. */
export const getRequestBodyVariants = (schema: any, spec: OpenApiSpec | null): RequestBodyVariants | null => {
    const resolvedSchema = schema ? resolveReference(schema, spec) || schema : null;
    if (resolvedSchema?.oneOf?.length) return {kind: 'oneOf', variants: resolvedSchema.oneOf};
    if (resolvedSchema?.anyOf?.length) return {kind: 'anyOf', variants: resolvedSchema.anyOf};
    if (resolvedSchema?.allOf?.length) return {kind: 'allOf', variants: resolvedSchema.allOf};
    return null;
};

/** Single source of truth for "what does this operation ask the consumer to
 *  send": the selected media type, its schema (narrowed to the selected
 *  polymorphism branch) and its example. */
export const resolveRequestBodySource = (
    operation: any,
    spec: OpenApiSpec | null,
    preferredMediaType = '',
    variantIndex = 0,
): RequestBodySource => {
    const resolvedBody = resolveRequestBody(operation?.requestBody, spec);
    const mediaTypes = getRequestBodyMediaTypes(resolvedBody);
    const mediaType = resolveRequestBodyMediaType(resolvedBody, preferredMediaType);
    const content = mediaType ? resolvedBody?.content?.[mediaType] : null;
    const schema = content?.schema ?? null;
    const variants = getRequestBodyVariants(schema, spec);
    const boundedVariantIndex = variants ? Math.min(Math.max(variantIndex, 0), variants.variants.length - 1) : 0;
    const activeSchema = variants && variants.kind !== 'allOf' ? variants.variants[boundedVariantIndex] : schema;
    return {
        resolvedBody,
        mediaTypes,
        mediaType,
        content,
        schema,
        variants,
        variantIndex: boundedVariantIndex,
        activeSchema,
        example: getRequestBodyExample(content),
    };
};
