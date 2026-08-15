import * as jsYaml from 'js-yaml';
import type {OpenApiSpec} from '../../types';
import {assertValidOpenApiDocument, normalizeOpenApiSpec, validateOpenApiDocument} from '../openapi';
import {registerRawSpecDocument} from './specSource';

export type ConfigSource = 'initial' | 'file' | 'hybrid' | 'none';

export interface LocalSpec {
    key: string;
    title: string;
    fileName: string;
    raw: string;
    file: File | null;
    bundle?: Record<string, string>;
}

export type EndpointKey = string;
export const endpointKey = (path: string, method: string): EndpointKey => `${method.toLowerCase()}:${path}`;
export const parseSpecDraft = (text: string): OpenApiSpec => {
    const trimmed = text.trim();
    const parsed = trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(text) : jsYaml.load(text);
    assertValidOpenApiDocument(parsed);
    const normalized = normalizeOpenApiSpec(parsed);
    registerRawSpecDocument(normalized, text, parsed, validateOpenApiDocument(parsed).version);
    return normalized;
};
