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

const schemaOf = (parameter: any): any => parameter?.schema || parameter || {};
const typeOf = (parameter: any, value: any): string => {
    const schema = schemaOf(parameter);
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

const scalar = (value: unknown): string => value === null || value === undefined ? '' : String(value);

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

/**
 * Serialize one OpenAPI 3 parameter according to its `style` and `explode`
 * settings. The result is deliberately transport-neutral so the browser
 * runner and tests can share the exact same rules.
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

    if (!name) return result;

    if (type !== 'array' && type !== 'object') {
        const text = scalar(value);
        if (location === 'path') {
            if (style === 'label') result.pathValue = `.${encodeComponent(text, allowReserved)}`;
            else if (style === 'matrix') result.pathValue = `;${encodeComponent(name)}=${encodeComponent(text, allowReserved)}`;
            else result.pathValue = encodeComponent(text, allowReserved);
        } else if (location === 'header') {
            result.headers[name] = text;
        } else if (location === 'cookie') {
            result.cookies.push({name, value: text});
        } else {
            result.query.push({name, value: text, allowReserved});
        }
        return result;
    }

    if (type === 'array') {
        const values = arrayValues(value);
        const delimiter = style === 'spaceDelimited' ? ' ' : style === 'pipeDelimited' ? '|' : ',';
        if (location === 'query') {
            if (style === 'deepObject') {
                values.forEach((item, index) => result.query.push({
                    name: `${name}[${index}]`,
                    value: item,
                    allowReserved
                }));
            } else if (explode && style === 'form') {
                values.forEach(item => result.query.push({name, value: item, allowReserved}));
            } else {
                result.query.push({name, value: delimited(values, delimiter), allowReserved});
            }
        } else if (location === 'cookie') {
            if (explode && style === 'form') values.forEach(item => result.cookies.push({name, value: item}));
            else result.cookies.push({name, value: delimited(values, delimiter)});
        } else if (location === 'header') {
            result.headers[name] = delimited(values, delimiter);
        } else {
            const joined = delimited(values, delimiter);
            if (style === 'label') result.pathValue = `.${joined}`;
            else if (style === 'matrix') result.pathValue = `;${encodeComponent(name)}=${joined}`;
            else result.pathValue = joined;
        }
        return result;
    }

    const entries = valueEntries(objectValue(value));
    if (location === 'query') {
        if (style === 'deepObject') {
            entries.forEach(([key, item]) => result.query.push({name: `${name}[${key}]`, value: item, allowReserved}));
        } else if (explode && style === 'form') {
            entries.forEach(([key, item]) => result.query.push({name: key, value: item, allowReserved}));
        } else {
            const flattened = entries.flatMap(([key, item]) => [key, item]);
            result.query.push({name, value: delimited(flattened, ','), allowReserved});
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
        const flattened = explode
            ? entries.map(([key, item]) => `${key}=${item}`).join(',')
            : entries.flatMap(([key, item]) => [key, item]).join(',');
        if (style === 'label') result.pathValue = `.${flattened}`;
        else if (style === 'matrix') result.pathValue = `;${encodeComponent(name)}=${flattened}`;
        else result.pathValue = flattened;
    }

    return result;
};

export const queryStringFromPairs = (pairs: SerializedPair[]): string => pairs.length === 0
    ? ''
    : `?${pairs.map(pair => `${encodeComponent(pair.name)}=${encodeComponent(pair.value, pair.allowReserved)}`).join('&')}`;

export const cookieHeaderFromPairs = (pairs: SerializedPair[]): string =>
    pairs.map(pair => `${pair.name}=${pair.value}`).join('; ');

export const isJsonMediaType = (contentType: string | null | undefined): boolean => {
    const mediaType = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
    return mediaType === 'application/json' || mediaType.endsWith('+json') || mediaType === 'text/json';
};

export const normalizeParameterValue = (parameter: Parameter | any, value: unknown): unknown => {
    const schema = schemaOf(parameter);
    if (typeof value !== 'string') return value;
    if (schema.type === 'array' && value.trim().startsWith('[')) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    if (schema.type === 'object' && value.trim().startsWith('{')) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
};
