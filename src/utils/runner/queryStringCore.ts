/**
 * Vendored core of the `query-string` package (https://www.npmjs.com/package/query-string),
 * adapted to this project's contracts: bracket array format, deep nesting for object items
 * (`filter[0][field]=status&filter[]=abcd`), `key[]=` kept as the empty-array marker and
 * RFC 3986 component encoding. Kept dependency-free so it belongs to this project.
 */

export interface QueryStringPair {
    name: string;
    value: string;
}

const encodeComponent = (value: string): string =>
    encodeURIComponent(value).replace(
        /[!'()*]/g,
        character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

const encodeName = (name: string): string => encodeComponent(name).replace(/%5B/g, '[').replace(/%5D/g, ']');

const scalarText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

export const queryPairsFromJson = (value: unknown): QueryStringPair[] => {
    const pairs: QueryStringPair[] = [];
    const walk = (prefix: string, item: unknown): void => {
        if (item === undefined) return;
        if (item === null) {
            pairs.push({name: prefix || 'value', value: ''});
            return;
        }
        if (Array.isArray(item)) {
            if (item.length === 0) {
                pairs.push({name: `${prefix}[]`, value: ''});
                return;
            }
            item.forEach((part, index) => {
                if (part !== null && typeof part === 'object') walk(`${prefix}[${index}]`, part);
                else pairs.push({name: `${prefix}[]`, value: scalarText(part)});
            });
            return;
        }
        if (typeof item === 'object') {
            const entries = Object.entries(item as Record<string, unknown>);
            if (entries.length === 0) {
                pairs.push({name: prefix || 'value', value: ''});
                return;
            }
            entries.forEach(([key, part]) => walk(prefix ? `${prefix}[${key}]` : key, part));
            return;
        }
        pairs.push({name: prefix || 'value', value: String(item)});
    };
    walk('', value);
    return pairs;
};

export const stringifyJsonToQueryString = (value: unknown): string =>
    queryPairsFromJson(value)
        .map(pair => `${encodeName(pair.name)}=${encodeComponent(pair.value)}`)
        .join('&');
