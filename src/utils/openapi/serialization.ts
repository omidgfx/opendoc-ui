import type {Parameter} from '../../types';

export interface SerializedPair {
    name: string;
    value: string;
    allowReserved?: boolean;
}

export interface SerializedParameter {
    pathValue?: string;
    query: SerializedPair[];
    headers: Record<string, string>;
    cookies: SerializedPair[];
}

const DEFAULT_STYLE: Record<string, string> = {
    path: 'simple',
    query: 'form',
    header: 'simple',
    cookie: 'form',
};

const firstContentEntry = (parameter: any): { mediaType: string; media: any } | null => {
    const entry = Object.entries(parameter?.content || {})[0] as [string, any] | undefined;
    return entry ? {mediaType: entry[0], media: entry[1]} : null;
};

const schemaOf = (parameter: any): any => parameter?.schema || firstContentEntry(parameter)?.media?.schema || parameter || {};
const contentMediaTypeOf = (parameter: any): string => firstContentEntry(parameter)?.mediaType?.toLowerCase().split(';', 1)[0].trim() || '';
const typeOf = (parameter: any, value: any): string => {
    const schema = schemaOf(parameter);
    if (Array.isArray(schema.type)) {
        const nonNull = schema.type.find((type: string) => type !== 'null');
        if (nonNull) return nonNull;
    }
    if (schema.type) return schema.type;
    if (Array.isArray(value)) return 'array';
    if (value && typeof value === 'object') return 'object';
    return 'string';
};

const encodeComponent = (value: unknown, allowReserved = false): string => {
    const encoded = encodeURIComponent(String(value));
    if (!allowReserved) return encoded;
    return encoded.replace(/%3A|%2F|%3F|%23|%5B|%5D|%40|%21|%24|%26|%27|%28|%29|%2A|%2B|%2C|%3B|%3D/gi, token =>
        decodeURIComponent(token),
    );
};

const scalar = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '';
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

const valueEntries = (value: any): Array<[string, string]> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.entries(value).map(([key, item]) => [key, scalar(item)]);
};

const arrayValues = (value: any): string[] => Array.isArray(value)
    ? value.map(scalar)
    : typeof value === 'string' && value.trim().startsWith('[')
        ? (() => {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed.map(scalar) : [value];
            } catch {
                return [value];
            }
        })()
        : [scalar(value)];

const objectValue = (value: any): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // Fall through to a single scalar value.
        }
    }
    return {value};
};

const delimited = (items: string[], delimiter: string) => items.join(delimiter);
const queryEncoding = (location: string, allowReserved: boolean) =>
    (location === 'query' || location === 'querystring') && allowReserved;

const contentValue = (parameter: any, value: any): string => {
    const mediaType = contentMediaTypeOf(parameter);
    if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
        if (typeof value === 'string') {
            try {
                return JSON.stringify(JSON.parse(value));
            } catch {
                return value;
            }
        }
        return scalar(value);
    }
    if (mediaType === 'application/x-www-form-urlencoded' && value && typeof value === 'object' && !Array.isArray(value)) {
        return valueEntries(value).map(([key, item]) => `${encodeComponent(key)}=${encodeComponent(item)}`).join('&');
    }
    return scalar(value);
};

/**
 * Serialize one OpenAPI 3.x/3.2 parameter according to its `style` and
 * `explode` settings. The result is transport-neutral so the browser Runner
 * and background AI Runner share the exact same rules.
 */
export const serializeOpenApiParameter = (parameter: any, value: any): SerializedParameter => {
    const location = String(parameter?.in || 'query');
    const style = String(parameter?.style || DEFAULT_STYLE[location] || 'form');
    const explode = parameter?.explode !== undefined
        ? Boolean(parameter.explode)
        : style === 'form' || style === 'cookie';
    const allowReserved = Boolean(parameter?.allowReserved);
    const name = String(parameter?.name || '');
    const type = typeOf(parameter, value);
    const result: SerializedParameter = {query: [], headers: {}, cookies: []};

    if (!name && location !== 'querystring') return result;

    // A Parameter Object using `content` has media-type serialization rather
    // than style/explode serialization. OpenAPI 3.2 also uses this form for
    // querystring parameters, where the parameter name is not emitted.
    if (parameter?.content) {
        const serialized = contentValue(parameter, value);
        if (location === 'querystring') {
            if (contentMediaTypeOf(parameter) === 'application/x-www-form-urlencoded' && value && typeof value === 'object' && !Array.isArray(value)) {
                valueEntries(value).forEach(([key, item]) => result.query.push({
                    name: key,
                    value: item,
                    allowReserved
                }));
            } else {
                result.query.push({name: '', value: serialized, allowReserved});
            }
        } else if (location === 'query') {
            result.query.push({name, value: serialized, allowReserved});
        } else if (location === 'header') {
            result.headers[name] = serialized;
        } else if (location === 'cookie') {
            result.cookies.push({name, value: serialized});
        } else if (location === 'path') {
            result.pathValue = encodeComponent(serialized, false);
        }
        return result;
    }

    if (location === 'querystring') {
        if (type === 'object') {
            valueEntries(objectValue(value)).forEach(([key, item]) => result.query.push({
                name: key,
                value: item,
                allowReserved
            }));
        } else {
            result.query.push({name: '', value: scalar(value), allowReserved});
        }
        return result;
    }

    const allowReservedForLocation = queryEncoding(location, allowReserved);
    if (type !== 'array' && type !== 'object') {
        const text = scalar(value);
        if (location === 'path') {
            if (style === 'label') result.pathValue = `.${encodeComponent(text, allowReservedForLocation)}`;
            else if (style === 'matrix') result.pathValue = `;${encodeComponent(name)}=${encodeComponent(text, allowReservedForLocation)}`;
            else result.pathValue = encodeComponent(text, allowReservedForLocation);
        } else if (location === 'header') {
            result.headers[name] = text;
        } else if (location === 'cookie') {
            result.cookies.push({name, value: text});
        } else {
            result.query.push({name, value: text, allowReserved: allowReservedForLocation});
        }
        return result;
    }

    if (type === 'array') {
        const values = arrayValues(value);
        const delimiter = style === 'spaceDelimited' ? ' ' : style === 'pipeDelimited' ? '|' : ',';
        if (location === 'query') {
            if (style === 'deepObject') {
                // OpenAPI leaves deepObject arrays undefined; indexed keys are
                // the least surprising interoperable representation.
                values.forEach((item, index) => result.query.push({
                    name: `${name}[${index}]`,
                    value: item,
                    allowReserved: allowReservedForLocation
                }));
            } else if (explode && style === 'form') {
                values.forEach(item => result.query.push({name, value: item, allowReserved: allowReservedForLocation}));
            } else {
                result.query.push({name, value: delimited(values, delimiter), allowReserved: allowReservedForLocation});
            }
        } else if (location === 'cookie') {
            if (explode && style === 'form') values.forEach(item => result.cookies.push({name, value: item}));
            else result.cookies.push({name, value: delimited(values, delimiter)});
        } else if (location === 'header') {
            result.headers[name] = delimited(values, delimiter);
        } else {
            if (style === 'label') result.pathValue = `.${values.map(item => encodeComponent(item, false)).join(explode ? '.' : ',')}`;
            else if (style === 'matrix') {
                result.pathValue = explode
                    ? values.map(item => `;${encodeComponent(name)}=${encodeComponent(item, false)}`).join('')
                    : `;${encodeComponent(name)}=${values.map(item => encodeComponent(item, false)).join(',')}`;
            } else result.pathValue = values.map(item => encodeComponent(item, false)).join(',');
        }
        return result;
    }

    const entries = valueEntries(objectValue(value));
    if (location === 'query') {
        if (style === 'deepObject') {
            entries.forEach(([key, item]) => result.query.push({
                name: `${name}[${key}]`,
                value: item,
                allowReserved: allowReservedForLocation
            }));
        } else if (explode && style === 'form') {
            entries.forEach(([key, item]) => result.query.push({
                name: key,
                value: item,
                allowReserved: allowReservedForLocation
            }));
        } else if (style === 'spaceDelimited' || style === 'pipeDelimited') {
            const delimiter = style === 'spaceDelimited' ? ' ' : '|';
            result.query.push({
                name,
                value: delimited(entries.flatMap(([key, item]) => [key, item]), delimiter),
                allowReserved: allowReservedForLocation
            });
        } else {
            const flattened = entries.flatMap(([key, item]) => [key, item]);
            result.query.push({name, value: delimited(flattened, ','), allowReserved: allowReservedForLocation});
        }
    } else if (location === 'cookie') {
        if (explode && style === 'form') entries.forEach(([key, item]) => result.cookies.push({
            name: key,
            value: item
        }));
        else result.cookies.push({name, value: delimited(entries.flatMap(([key, item]) => [key, item]), ',')});
    } else if (location === 'header') {
        result.headers[name] = explode
            ? entries.map(([key, item]) => `${key}=${item}`).join(',')
            : entries.flatMap(([key, item]) => [key, item]).join(',');
    } else {
        if (style === 'label') {
            result.pathValue = explode
                ? `.${entries.map(([key, item]) => `${encodeComponent(key, false)}=${encodeComponent(item, false)}`).join(',')}`
                : `.${entries.flatMap(([key, item]) => [encodeComponent(key, false), encodeComponent(item, false)]).join(',')}`;
        } else if (style === 'matrix') {
            result.pathValue = explode
                ? entries.map(([key, item]) => `;${encodeComponent(key, false)}=${encodeComponent(item, false)}`).join('')
                : `;${encodeComponent(name)}=${entries.flatMap(([key, item]) => [encodeComponent(key, false), encodeComponent(item, false)]).join(',')}`;
        } else {
            const flattened = explode
                ? entries.map(([key, item]) => `${key}=${item}`).join(',')
                : entries.flatMap(([key, item]) => [key, item]).join(',');
            result.pathValue = flattened;
        }
    }

    return result;
};

export const queryStringFromPairs = (pairs: SerializedPair[]): string => pairs.length === 0
    ? ''
    : `?${pairs.map(pair => pair.name
        ? `${encodeComponent(pair.name)}=${encodeComponent(pair.value, pair.allowReserved)}`
        : encodeComponent(pair.value, pair.allowReserved)).join('&')}`;

export const cookieHeaderFromPairs = (pairs: SerializedPair[]): string =>
    pairs.map(pair => `${pair.name}=${pair.value}`).join('; ');

export const isJsonMediaType = (contentType: string | null | undefined): boolean => {
    const mediaType = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
    return mediaType === 'application/json' || mediaType.endsWith('+json') || mediaType === 'text/json';
};

export const normalizeParameterValue = (parameter: Parameter | any, value: unknown): unknown => {
    const schema = schemaOf(parameter);
    if (typeof value !== 'string') return value;
    const contentType = contentMediaTypeOf(parameter);
    if (contentType === 'application/json' || contentType.endsWith('+json')) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    const schemaType = Array.isArray(schema.type) ? schema.type.find((type: string) => type !== 'null') : schema.type;
    const looksStructured = (schemaType === 'array' && value.trim().startsWith('['))
        || (schemaType === 'object' && (value.trim().startsWith('{') || value.trim().startsWith('[')));
    if (looksStructured) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
};