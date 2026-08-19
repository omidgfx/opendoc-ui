import type {OpenApiSpec} from '@/src/types';
import {serializeOpenApiParameter} from '@/src/utils/openapi';

export interface SerializationDescriptor {
    /** True when the value reaches the server through a non-trivial encoding. */
    isSerialized: boolean;
    style: string;
    explode: boolean;
    allowReserved: boolean;
    /** Media type when the parameter uses `content` instead of `schema`. */
    contentType: string;
    /** Compact badge text, e.g. "deepObject · explode". */
    label: string;
    /** Sentence explaining what the encoding does to the value. */
    hint: string;
    icon: string;
}

const DEFAULT_STYLES: Record<string, string> = {
    path: 'simple',
    query: 'form',
    header: 'simple',
    cookie: 'form',
};

const STYLE_HINTS: Record<string, string> = {
    simple: 'Comma separated, without the parameter name repeated.',
    label: 'Prefixed with a dot for every value, as a URI label.',
    matrix: 'Prefixed with a semicolon and the parameter name, as a URI path segment.',
    form: 'Standard name=value pairs.',
    spaceDelimited: 'Values joined with spaces.',
    pipeDelimited: 'Values joined with pipes.',
    deepObject: 'Object properties become name[property]=value pairs.',
};

const parameterType = (parameter: any): string => {
    const schema = parameter?.schema ?? parameter?.content?.[Object.keys(parameter?.content || {})[0]]?.schema;
    const type = Array.isArray(schema?.type) ? schema.type.find((item: string) => item !== 'null') : schema?.type;
    return String(type || 'string');
};

/**
 * How a parameter is encoded on the wire. The documentation table, the Runner
 * field and the schema view all read this, so a serialized parameter is
 * announced the same way wherever it appears.
 */
export const describeParameterSerialization = (parameter: any): SerializationDescriptor => {
    const location = String(parameter?.in || 'query').toLowerCase();
    const contentType = Object.keys(parameter?.content || {})[0] || '';
    const style = String(parameter?.style || DEFAULT_STYLES[location] || 'form');
    const explode = parameter?.explode !== undefined ? Boolean(parameter.explode) : style === 'form';
    const allowReserved = Boolean(parameter?.allowReserved);
    const type = parameterType(parameter);
    const isStructured = type === 'array' || type === 'object';
    const defaultStyle = DEFAULT_STYLES[location] || 'form';
    const isSerialized =
        !!contentType || allowReserved || style !== defaultStyle || (isStructured && (explode || isStructured));
    const parts = [style];
    if (isStructured) parts.push(explode ? 'explode' : 'no explode');
    if (allowReserved) parts.push('reserved');
    return {
        isSerialized,
        style,
        explode,
        allowReserved,
        contentType,
        label: contentType || parts.join(' · '),
        hint: contentType
            ? `Serialized as ${contentType} before it is sent.`
            : `${STYLE_HINTS[style] || `Serialized with the ${style} style.`}${
                  isStructured ? ` explode is ${explode ? 'on' : 'off'}.` : ''
              }${allowReserved ? ' Reserved characters are kept unescaped.' : ''}`,
        icon: 'ph ph-arrows-split',
    };
};

export interface SerializationPreview {
    /** Serialized fragments, ready to print, e.g. `tags=a&tags=b`. */
    output: string;
    /** Where the fragments end up: the route, the query string, a header … */
    target: string;
    error: string | null;
}

const parseCandidate = (raw: string): any => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^[[{]/.test(trimmed)) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }
    return trimmed;
};

/** Runs the real serializer over a sample value, for the playground. */
export const previewParameterSerialization = (
    parameter: any,
    rawValue: string,
    _spec?: OpenApiSpec | null,
): SerializationPreview => {
    const location = String(parameter?.in || 'query').toLowerCase();
    try {
        const serialized = serializeOpenApiParameter(parameter, parseCandidate(rawValue));
        if (location === 'path') {
            return {output: serialized.pathValue ?? '', target: 'Path segment', error: null};
        }
        if (location === 'header') {
            return {
                output: Object.entries(serialized.headers)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\n'),
                target: 'Request headers',
                error: null,
            };
        }
        if (location === 'cookie') {
            return {
                output: serialized.cookies.map(pair => `${pair.name}=${pair.value}`).join('; '),
                target: 'Cookie header',
                error: null,
            };
        }
        return {
            output: serialized.query.map(pair => `${pair.name}=${pair.value}`).join('&'),
            target: 'Query string',
            error: null,
        };
    } catch (error) {
        return {
            output: '',
            target: '',
            error: error instanceof Error ? error.message : 'The value could not be serialized.',
        };
    }
};
