import type {OpenApiSpec} from '@/src/types';
import {resolveReference} from '@/src/utils/openapi';
import {schemaDeclaresBinary} from '@/src/utils/runner/runnerResponse';

export type RequestBodyKind = 'json' | 'form' | 'multipart' | 'binary' | 'xml' | 'yaml' | 'text' | 'other';

export interface RequestBodyKindInfo {
    kind: RequestBodyKind;
    /** Short name of what the consumer has to send. */
    label: string;
    /** One sentence describing how the payload reaches the server. */
    hint: string;
    icon: string;
}

const KIND_INFO: Record<RequestBodyKind, Omit<RequestBodyKindInfo, 'kind'>> = {
    json: {
        label: 'JSON document',
        hint: 'Sent as a JSON request body.',
        icon: 'ph ph-brackets-curly',
    },
    form: {
        label: 'URL-encoded form',
        hint: 'Sent as name=value pairs in the request body, percent-encoded.',
        icon: 'ph ph-list-dashes',
    },
    multipart: {
        label: 'Multipart form',
        hint: 'Sent as multipart/form-data parts, one part per field, with a generated boundary.',
        icon: 'ph ph-paperclip',
    },
    binary: {
        label: 'Binary stream',
        hint: 'Sent as the raw bytes of a single file or stream, not as a document.',
        icon: 'ph ph-file-archive',
    },
    xml: {label: 'XML document', hint: 'Sent as an XML request body.', icon: 'ph ph-code'},
    yaml: {label: 'YAML document', hint: 'Sent as a YAML request body.', icon: 'ph ph-file-text'},
    text: {label: 'Plain text', hint: 'Sent as an unstructured text body.', icon: 'ph ph-text-align-left'},
    other: {label: 'Raw payload', hint: 'Sent verbatim as the request body.', icon: 'ph ph-file'},
};

export const requestBodyKindOf = (mediaType: string, schema?: any): RequestBodyKind => {
    const normalized = (mediaType || '').split(';', 1)[0].trim().toLowerCase();
    if (normalized === 'multipart/form-data' || normalized.startsWith('multipart/')) return 'multipart';
    if (normalized === 'application/x-www-form-urlencoded') return 'form';
    if (normalized === 'application/octet-stream' || schemaDeclaresBinary(schema)) return 'binary';
    if (normalized === 'application/json' || normalized.endsWith('+json') || normalized === 'text/json') return 'json';
    if (normalized === 'application/xml' || normalized.endsWith('+xml') || normalized === 'text/xml') return 'xml';
    if (normalized.includes('yaml')) return 'yaml';
    if (normalized.startsWith('text/')) return 'text';
    return 'other';
};

/** What the consumer must actually send for this media type. */
export const describeRequestBody = (mediaType: string, schema?: any): RequestBodyKindInfo => {
    const kind = requestBodyKindOf(mediaType, schema);
    return {kind, ...KIND_INFO[kind]};
};

export interface FormSkeletonField {
    name: string;
    type: string;
    required: boolean;
    /** Set for multipart parts that carry a file rather than a scalar. */
    isFile: boolean;
    /** Declared per-part content type, when the encoding object names one. */
    contentType?: string;
    description?: string;
}

const typeLabel = (schema: any, spec: OpenApiSpec | null): string => {
    const resolved = (schema && resolveReference(schema, spec)) || schema;
    if (!resolved || typeof resolved !== 'object') return 'any';
    if (schemaDeclaresBinary(resolved)) return 'binary';
    const type = Array.isArray(resolved.type) ? resolved.type.filter((t: string) => t !== 'null')[0] : resolved.type;
    if (type === 'array' && Array.isArray(resolved.prefixItems) && resolved.prefixItems.length > 0)
        return `tuple<${resolved.prefixItems.map((item: any) => typeLabel(item, spec)).join(', ')}>`;
    if (type === 'array') return `array<${typeLabel(resolved.items, spec)}>`;
    if (resolved.format) return `${type || 'string'} (${resolved.format})`;
    if (!type && (resolved.oneOf || resolved.anyOf || resolved.allOf)) return 'variant';
    return type || 'any';
};

/**
 * Field-by-field skeleton of a form request body, so the consumer can see the
 * shape of what to submit instead of guessing it from a JSON example that the
 * server will never receive in that form.
 */
export const buildFormSkeleton = (
    schema: any,
    spec: OpenApiSpec | null,
    encoding?: Record<string, any>,
): FormSkeletonField[] => {
    const resolved = (schema && resolveReference(schema, spec)) || schema;
    const properties = resolved?.properties;
    if (!properties || typeof properties !== 'object') return [];
    const required: string[] = Array.isArray(resolved.required) ? resolved.required : [];
    return Object.entries(properties).map(([name, raw]) => {
        const property = (raw && resolveReference(raw, spec)) || raw;
        const declaredContentType = encoding?.[name]?.contentType;
        const isFile =
            schemaDeclaresBinary(property) || /octet-stream|image\/|audio\/|video\//.test(declaredContentType || '');
        return {
            name,
            type: typeLabel(property, spec),
            required: required.includes(name),
            isFile,
            contentType: declaredContentType,
            description: (property as any)?.description,
        };
    });
};

/** The skeleton rendered as the wire shape of the request, ready for a code block. */
export const formSkeletonSnippet = (fields: FormSkeletonField[], kind: RequestBodyKind): string => {
    if (fields.length === 0) return '';
    if (kind === 'form') {
        return fields.map(field => `${field.name}=<${field.type}>${field.required ? '' : '   # optional'}`).join('\n');
    }
    return fields
        .map(field => {
            const disposition = field.isFile
                ? `Content-Disposition: form-data; name="${field.name}"; filename="<file>"`
                : `Content-Disposition: form-data; name="${field.name}"`;
            const contentType = field.contentType ? `\nContent-Type: ${field.contentType}` : '';
            return `--boundary\n${disposition}${contentType}\n\n<${field.type}>${field.required ? '' : '   # optional'}`;
        })
        .concat('--boundary--')
        .join('\n');
};
