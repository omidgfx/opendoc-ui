import * as jsYaml from 'js-yaml';
import {schemaDeclaresBinary} from './runnerResponse';
import {jsonToQueryString, jsonToXml, queryStringToJson, xmlToJson} from './bodyConverters';

export type BodyLanguage = 'json' | 'yaml' | 'xml' | 'plaintext' | 'javascript' | 'html';

export interface BodyFormat {
    mediaType: string;
    language: BodyLanguage;
    isJson: boolean;
    isYaml: boolean;
    isXml: boolean;
    isQuery: boolean;
    supportsSchema: boolean;
}

export type BodyEditorMode = 'form' | 'raw';
export const bodyTypeSupportsForm = (mediaType: string, schema?: any): boolean => {
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    return (
        schemaDeclaresBinary(schema) ||
        normalized.includes('json') ||
        normalized.includes('yaml') ||
        normalized.includes('xml') ||
        normalized === 'application/x-www-form-urlencoded' ||
        normalized === 'multipart/form-data' ||
        normalized === 'application/octet-stream'
    );
};
export const bodyEditorModeForMediaType = (current: BodyEditorMode, mediaType: string, schema?: any): BodyEditorMode =>
    current === 'raw' ? 'raw' : bodyTypeSupportsForm(mediaType, schema) ? 'form' : 'raw';
export const getBodyFormat = (mediaType: string): BodyFormat => {
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    const isJson = normalized === 'application/json' || normalized.endsWith('+json') || normalized === 'text/json';
    const isYaml = normalized.includes('yaml') || normalized === 'application/x-yaml';
    const isXml = normalized === 'application/xml' || normalized.endsWith('+xml') || normalized === 'text/xml';
    const isQuery = normalized === 'application/x-www-form-urlencoded';
    const language: BodyLanguage = isJson
        ? 'json'
        : isYaml
          ? 'yaml'
          : isXml
            ? 'xml'
            : normalized.includes('javascript')
              ? 'javascript'
              : normalized.includes('html')
                ? 'html'
                : 'plaintext';
    return {
        mediaType: normalized || 'text/plain',
        language,
        isJson,
        isYaml,
        isXml,
        isQuery,
        supportsSchema: isJson,
    };
};
export const getBodyEditorLanguage = (text: string, mediaType: string): BodyLanguage => {
    const format = getBodyFormat(mediaType);
    if (format.language !== 'plaintext') return format.language;
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    if (
        (normalized === 'application/x-www-form-urlencoded' || normalized === 'multipart/form-data') &&
        /^[\s]*[\[{]/.test(text)
    )
        return 'json';
    return format.language;
};
const isFormLikeMediaType = (mediaType: string): boolean => {
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    return normalized === 'application/x-www-form-urlencoded' || normalized === 'multipart/form-data';
};
const looksLikeJsonBody = (text: string): boolean => /^[\s]*[\[{]/.test(text);
export const validateBodyText = (text: string, mediaType: string): string | null => {
    if (!text.trim()) return null;
    const format = getBodyFormat(mediaType);
    try {
        if (format.isJson || (isFormLikeMediaType(mediaType) && looksLikeJsonBody(text))) JSON.parse(text);
        else if (format.isYaml) jsYaml.load(text);
        else if (format.isXml && typeof DOMParser !== 'undefined') {
            const document = new DOMParser().parseFromString(text, 'application/xml');
            if (document.querySelector('parsererror'))
                return document.querySelector('parsererror')?.textContent || 'Invalid XML.';
        }
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : 'Invalid request body.';
    }
};
export const formatBodyText = (
    text: string,
    mediaType: string,
): {
    text: string;
    error?: string;
} => {
    const format = getBodyFormat(mediaType);
    try {
        if (format.isJson) return {text: JSON.stringify(JSON.parse(text), null, 2)};
        if (format.isYaml) return {text: jsYaml.dump(jsYaml.load(text), {noRefs: true, lineWidth: 120})};
        if (format.isXml) {
            const trimmed = text.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) return {text: jsonToXml(JSON.parse(trimmed))};
            const compact = text.replace(/>\s+</g, '><').trim();
            return {text: compact};
        }
        if (format.isQuery || isFormLikeMediaType(mediaType)) {
            const trimmed = text.trim();
            if (looksLikeJsonBody(trimmed)) return {text: jsonToQueryString(JSON.parse(trimmed))};
            return {text: jsonToQueryString(queryStringToJson(text))};
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
    if (format.isXml) return xmlToJson(text);
    const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
    if (normalized === 'application/x-www-form-urlencoded' || normalized === 'multipart/form-data') {
        try {
            return JSON.parse(text);
        } catch {
            return queryStringToJson(text);
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
export const serializeUrlEncodedBody = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);
    return jsonToQueryString(value);
};
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
    Object.entries(selectedFiles).forEach(([stateKey, file]) => {
        if (!file || consumedFiles.has(stateKey)) return;
        const fieldName = stateKey.split('.').pop() || stateKey;
        form.append(fieldName, file);
    });
};
