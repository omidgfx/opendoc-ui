import * as jsYaml from 'js-yaml';

export type BodyLanguage = 'json' | 'yaml' | 'xml' | 'plaintext' | 'javascript' | 'html';

export interface BodyFormat {
    mediaType: string;
    language: BodyLanguage;
    isJson: boolean;
    isYaml: boolean;
    isXml: boolean;
    supportsSchema: boolean;
}

export const getBodyFormat = (mediaType: string): BodyFormat => {
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    const isJson = normalized === 'application/json' || normalized.endsWith('+json') || normalized === 'text/json';
    const isYaml = normalized.includes('yaml') || normalized === 'application/x-yaml';
    const isXml = normalized === 'application/xml' || normalized.endsWith('+xml') || normalized === 'text/xml';
    const language: BodyLanguage = isJson ? 'json' : isYaml ? 'yaml' : isXml ? 'xml' : normalized.includes('javascript') ? 'javascript' : normalized.includes('html') ? 'html' : 'plaintext';
    return {mediaType: normalized || 'text/plain', language, isJson, isYaml, isXml, supportsSchema: isJson};
};

export const validateBodyText = (text: string, mediaType: string): string | null => {
    if (!text.trim()) return null;
    const format = getBodyFormat(mediaType);
    try {
        if (format.isJson) JSON.parse(text);
        else if (format.isYaml) jsYaml.load(text);
        else if (format.isXml && typeof DOMParser !== 'undefined') {
            const document = new DOMParser().parseFromString(text, 'application/xml');
            if (document.querySelector('parsererror')) return document.querySelector('parsererror')?.textContent || 'Invalid XML.';
        }
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : 'Invalid request body.';
    }
};

export const formatBodyText = (text: string, mediaType: string): {text: string; error?: string} => {
    const format = getBodyFormat(mediaType);
    try {
        if (format.isJson) return {text: JSON.stringify(JSON.parse(text), null, 2)};
        if (format.isYaml) return {text: jsYaml.dump(jsYaml.load(text), {noRefs: true, lineWidth: 120})};
        if (format.isXml) {
            const compact = text.replace(/>\s+</g, '><').trim();
            return {text: compact};
        }
        return {text};
    } catch (error) {
        return {text, error: error instanceof Error ? error.message : 'Cannot format this body.'};
    }
};

export const parseStructuredBody = (text: string, mediaType: string): unknown => {
    const format = getBodyFormat(mediaType);
    if (format.isJson) return JSON.parse(text);
    if (format.isYaml) return jsYaml.load(text);
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    if (normalized === 'application/x-www-form-urlencoded' || normalized === 'multipart/form-data') {
        try { return JSON.parse(text); } catch {
            const parsed: Record<string, string | string[]> = {};
            new URLSearchParams(text).forEach((item, key) => {
                const previous = parsed[key];
                parsed[key] = previous === undefined
                    ? item
                    : Array.isArray(previous) ? [...previous, item] : [previous, item];
            });
            return parsed;
        }
    }
    return undefined;
};

const formScalar = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

/** Serialize an object-shaped form request body using the default OpenAPI form
 * convention: arrays repeat their property name and object values are JSON. */
export const serializeUrlEncodedBody = (value: unknown): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return formScalar(value);
    const encoded = new URLSearchParams();
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        if (Array.isArray(item)) item.forEach(part => encoded.append(key, formScalar(part)));
        else encoded.append(key, formScalar(item));
    });
    return encoded.toString();
};

/** Append a parsed request-body value to FormData. A selected file replaces the
 * corresponding text/schema value; arrays repeat the field as multipart allows. */
export const appendMultipartBody = (
    form: FormData,
    value: unknown,
    selectedFiles: Record<string, File | null> = {},
): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const consumedFiles = new Set<string>();
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const selected = selectedFiles[key];
        if (selected) {
            form.append(key, selected);
            consumedFiles.add(key);
            return;
        }
        if (Array.isArray(item)) {
            item.forEach(part => form.append(key, formScalar(part)));
        } else {
            form.append(key, formScalar(item));
        }
    });
    // Nested recursive fields use a dotted state key (for example
    // `documents.0.file`). Multipart field naming is API-specific; using the
    // final schema property is the most portable fallback while preserving
    // the selected File rather than silently dropping it.
    Object.entries(selectedFiles).forEach(([stateKey, file]) => {
        if (!file || consumedFiles.has(stateKey)) return;
        const fieldName = stateKey.split('.').pop() || stateKey;
        form.append(fieldName, file);
    });
};
