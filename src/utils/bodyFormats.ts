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
            return Object.fromEntries(new URLSearchParams(text));
        }
    }
    return undefined;
};
