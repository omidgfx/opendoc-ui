import {isJsonMediaType} from '../openapi/serialization';

const normalizedMediaType = (value: string | null | undefined): string =>
    String(value || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();

export const isTextualResponseMediaType = (contentType: string | null | undefined): boolean => {
    const mediaType = normalizedMediaType(contentType);
    if (!mediaType) return false;
    return (
        isJsonMediaType(mediaType) ||
        mediaType.startsWith('text/') ||
        mediaType.endsWith('+xml') ||
        mediaType.includes('javascript') ||
        mediaType.includes('graphql') ||
        mediaType.includes('event-stream') ||
        mediaType.includes('yaml') ||
        mediaType.includes('ndjson') ||
        mediaType.includes('json-seq') ||
        mediaType === 'application/xml' ||
        mediaType === 'application/sql' ||
        mediaType === 'application/x-www-form-urlencoded'
    );
};

export const isBinaryResponseMediaType = (contentType: string | null | undefined): boolean => {
    const mediaType = normalizedMediaType(contentType);
    return !!mediaType && !isTextualResponseMediaType(mediaType);
};

export const isAttachmentDisposition = (contentDisposition: string | null | undefined): boolean =>
    /(?:^|;)\s*attachment(?:\s*;|$)/i.test(String(contentDisposition || ''));

export const responseHeadersIndicateBinary = (
    contentType: string | null | undefined,
    contentDisposition: string | null | undefined,
): boolean => isAttachmentDisposition(contentDisposition) || isBinaryResponseMediaType(contentType);

export const schemaDeclaresBinary = (schema: any, seen = new Set<object>()): boolean => {
    if (!schema || typeof schema !== 'object' || seen.has(schema)) return false;
    seen.add(schema);
    if (schema.format === 'binary' || schema.contentEncoding === 'binary') return true;
    return ['oneOf', 'anyOf', 'allOf'].some(key =>
        Array.isArray(schema[key]) ? schema[key].some((item: any) => schemaDeclaresBinary(item, seen)) : false,
    );
};

export const declaredContentIsBinary = (mediaType: string, schema?: any): boolean =>
    schemaDeclaresBinary(schema) || isBinaryResponseMediaType(mediaType);

export const declaredContentLength = (value: string | null | undefined): number | undefined => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};
