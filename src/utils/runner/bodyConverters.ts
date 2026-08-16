/**
 * Body format converters: JSON <-> XML, JSON <-> YAML (via js-yaml) and
 * JSON <-> query-string (bracket notation). These keep the form editor and
 * the raw editor in sync across every media type an endpoint declares, so a
 * merge-patch body can be authored as a form, an XML body as XML, a
 * urlencoded body as `a=1&b[]=2&k[key]=foo`, and each converts to the others
 * without losing structure.
 */
import * as jsYaml from 'js-yaml';

const xmlEscape = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const xmlUnescape = (value: string): string =>
    value
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');

interface XmlHints {
    name?: string;
    attribute?: boolean;
    wrapped?: boolean;
    namespace?: string;
    prefix?: string;
}

const hintsOf = (schema: any): XmlHints =>
    schema && typeof schema === 'object' && schema.xml && typeof schema.xml === 'object' ? schema.xml : {};

const prefixed = (name: string, prefix: string): string => (prefix ? `${prefix}:${name}` : name);

/**
 * Serialize a JSON value as an XML document. When `schema` is provided its
 * OpenAPI `xml` object is honored: element names (xml.name), attributes
 * (xml.attribute), wrapped arrays (xml.wrapped) and the root namespace and
 * prefix. Keys starting with '@' are treated as attributes on their element.
 */
export const jsonToXml = (value: unknown, schema?: any): string => {
    const rootHints = hintsOf(schema);
    const prefix = rootHints.prefix || '';
    const rootName = prefixed(rootHints.name || 'root', prefix);
    const namespaceAttr =
        rootHints.namespace && rootHints.prefix ? ` xmlns:${rootHints.prefix}="${xmlEscape(rootHints.namespace)}"` : '';
    const lines: string[] = [];

    const attrString = (attrs: [string, unknown][]): string =>
        attrs.length > 0 ? ` ${attrs.map(([name, item]) => `${xmlEscape(name)}="${xmlEscape(item)}"`).join(' ')}` : '';

    const renderLeaf = (leaf: unknown, leafSchema: any, leafName: string, leafDepth: number): void => {
        if (leaf === null || leaf === undefined) return;
        if (Array.isArray(leaf)) {
            leaf.forEach(sub => renderLeaf(sub, leafSchema?.items, leafName, leafDepth));
            return;
        }
        if (typeof leaf === 'object') {
            renderObject(leaf as Record<string, unknown>, leafSchema, leafName, leafDepth);
            return;
        }
        lines.push(`${'  '.repeat(leafDepth)}<${leafName}>${xmlEscape(leaf)}</${leafName}>`);
    };

    const renderObject = (record: Record<string, unknown>, objectSchema: any, name: string, depth: number): void => {
        const indent = '  '.repeat(depth);
        const attributes: [string, unknown][] = [];
        const children: [string, unknown, any][] = [];
        Object.entries(record).forEach(([key, item]) => {
            if (item === null || item === undefined) return;
            if (key.startsWith('@')) {
                attributes.push([key.slice(1), item]);
                return;
            }
            const propertySchema = objectSchema?.properties?.[key];
            const hints = hintsOf(propertySchema);
            if (hints.attribute) {
                attributes.push([hints.name || key, item]);
                return;
            }
            children.push([key, item, propertySchema]);
        });
        if (children.length === 0) {
            lines.push(`${indent}<${name}${namespaceAttr}${attrString(attributes)} />`);
            return;
        }
        lines.push(`${indent}<${name}${namespaceAttr}${attrString(attributes)}>`);
        children.forEach(([key, item, propertySchema]) => {
            const hints = hintsOf(propertySchema);
            const elementName = prefixed(hints.name || key, prefix);
            const itemIndent = '  '.repeat(depth + 1);
            if (Array.isArray(item)) {
                if (hints.wrapped) {
                    const wrapper = prefixed(hints.name || key, prefix);
                    const itemName = prefixed(hintsOf(propertySchema?.items).name || 'item', prefix);
                    lines.push(`${itemIndent}<${wrapper}>`);
                    item.forEach(sub => renderLeaf(sub, propertySchema?.items, itemName, depth + 2));
                    lines.push(`${itemIndent}</${wrapper}>`);
                } else {
                    item.forEach(sub => renderLeaf(sub, propertySchema, elementName, depth + 1));
                }
                return;
            }
            renderLeaf(item, propertySchema, elementName, depth + 1);
        });
        lines.push(`${indent}</${name}>`);
    };

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        renderObject(value as Record<string, unknown>, schema, rootName, 0);
    } else {
        lines.push(`<${rootName}>${xmlEscape(value ?? '')}</${rootName}>`);
    }
    return lines.join('\n');
};

interface XmlNode {
    name: string;
    attributes: Record<string, string>;
    children: Array<{name: string; value: unknown}>;
    text: string[];
}

const attachChild = (parent: Record<string, unknown>, name: string, child: unknown): void => {
    if (!Object.prototype.hasOwnProperty.call(parent, name)) {
        parent[name] = child;
        return;
    }
    const existing = parent[name];
    if (Array.isArray(existing)) existing.push(child);
    else parent[name] = [existing, child];
};

/**
 * Parse an XML document into a plain JSON value. Repeated sibling elements
 * become arrays, attributes become `@name` keys, text-only elements become
 * strings, and mixed content is preserved under `#text`. The `<?xml ...?>`
 * declaration, comments and CDATA sections are handled.
 */
export const xmlToJson = (text: string): unknown => {
    const source = String(text || '')
        .replace(/^\s*<\?xml[\s\S]*?\?>\s*/, '')
        .trim();
    if (!source) return undefined;
    const stack: XmlNode[] = [];
    let root: unknown = undefined;
    let index = 0;
    const declaredPrefixes = new Set<string>();

    const fail = (): Error => new Error('Malformed XML.');

    const stripPrefix = (name: string): string => {
        const colon = name.indexOf(':');
        return colon > 0 && declaredPrefixes.has(name.slice(0, colon)) ? name.slice(colon + 1) : name;
    };

    const finalize = (node: XmlNode): unknown => {
        const textValue = node.text.join('');
        const attributeKeys = Object.keys(node.attributes);
        if (node.children.length === 0) {
            if (textValue.trim() === '' && attributeKeys.length === 0) return '';
            if (textValue.trim() !== '' && attributeKeys.length === 0) return xmlUnescape(textValue);
            const value: Record<string, unknown> = {...node.attributes};
            if (textValue.trim() !== '') value['#text'] = xmlUnescape(textValue);
            return value;
        }
        const value: Record<string, unknown> = {...node.attributes};
        node.children.forEach(child => attachChild(value, child.name, child.value));
        if (textValue.trim() !== '') value['#text'] = xmlUnescape(textValue);
        return value;
    };

    const findTagEnd = (start: number): number => {
        let cursor = start + 1;
        let quote: string | null = null;
        while (cursor < source.length) {
            const char = source[cursor];
            if (quote) {
                if (char === quote) quote = null;
            } else if (char === '"' || char === "'") {
                quote = char;
            } else if (char === '>') {
                return cursor;
            }
            cursor += 1;
        }
        return -1;
    };

    const appendText = (raw: string): void => {
        const node = stack[stack.length - 1];
        if (node && raw.trim() !== '') node.text.push(raw);
    };

    while (index < source.length) {
        const char = source[index];
        if (char !== '<') {
            const next = source.indexOf('<', index);
            appendText(source.slice(index, next < 0 ? source.length : next));
            index = next < 0 ? source.length : next;
            continue;
        }
        if (source.startsWith('<!--', index)) {
            const end = source.indexOf('-->', index);
            if (end < 0) throw fail();
            index = end + 3;
            continue;
        }
        if (source.startsWith('<![CDATA[', index)) {
            const end = source.indexOf(']]>', index);
            if (end < 0) throw fail();
            appendText(source.slice(index + 9, end));
            index = end + 3;
            continue;
        }
        if (source.startsWith('</', index)) {
            const end = source.indexOf('>', index);
            if (end < 0) throw fail();
            const rawName = source.slice(index + 2, end).trim();
            const name = stripPrefix(rawName);
            const node = stack.pop();
            if (!node || node.name !== name) throw fail();
            const value = finalize(node);
            if (stack.length === 0) {
                root = value;
                break;
            }
            stack[stack.length - 1].children.push({name, value});
            index = end + 1;
            continue;
        }
        const end = findTagEnd(index);
        if (end < 0) throw fail();
        const raw = source.slice(index + 1, end).trim();
        const selfClosing = raw.endsWith('/');
        const body = (selfClosing ? raw.slice(0, -1) : raw).trim();
        const nameMatch = /^[^\s/]+/.exec(body);
        if (!nameMatch) throw fail();
        const name = nameMatch[0];
        const attributes: Record<string, string> = {};
        const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let attributeMatch: RegExpExecArray | null;
        while ((attributeMatch = attributePattern.exec(body.slice(name.length)))) {
            const attrName = attributeMatch[1];
            const attrValue = attributeMatch[2] !== undefined ? attributeMatch[2] : attributeMatch[3];
            if (attrName.startsWith('xmlns:')) declaredPrefixes.add(attrName.slice('xmlns:'.length));
            attributes[`@${attrName}`] = xmlUnescape(attrValue);
        }
        if (selfClosing) {
            const value = Object.keys(attributes).length > 0 ? attributes : '';
            if (stack.length === 0) {
                root = value;
                break;
            }
            stack[stack.length - 1].children.push({name: stripPrefix(name), value});
        } else {
            stack.push({name: stripPrefix(name), attributes, children: [], text: []});
        }
        index = end + 1;
    }
    if (stack.length > 0) throw fail();
    return root;
};

/** Serialize a JSON value as a query string using bracket notation:
 *  arrays become `j[]=v`, nested objects `k[key]=v`, nesting composes. */
export const jsonToQueryString = (value: unknown): string => {
    const pairs: string[] = [];
    const walk = (item: unknown, prefix: string): void => {
        if (item === null || item === undefined) return;
        if (Array.isArray(item)) {
            if (item.length === 0) {
                pairs.push(`${prefix}[]=`);
                return;
            }
            item.forEach(part => walk(part, `${prefix}[]`));
            return;
        }
        if (typeof item === 'object') {
            const entries = Object.entries(item as Record<string, unknown>);
            if (entries.length === 0) {
                pairs.push(`${prefix}=`);
                return;
            }
            entries.forEach(([key, part]) => walk(part, prefix ? `${prefix}[${key}]` : key));
            return;
        }
        pairs.push(`${prefix}=${encodeURIComponent(String(item))}`);
    };
    walk(value, '');
    return pairs.join('&');
};

const PUSH_MARKER = '__opendocPush';

const parseSegments = (segments: Array<string | number | null>, value: string): unknown => {
    if (segments.length === 0) return value;
    const [head, ...rest] = segments;
    if (head === null) return {[PUSH_MARKER]: parseSegments(rest, value)};
    if (typeof head === 'number') {
        const inner = parseSegments(rest, value);
        const array: unknown[] = [];
        array[head] = inner;
        return array;
    }
    return {[head]: parseSegments(rest, value)};
};

const pushInner = (value: unknown): unknown | undefined =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    (value as Record<string, unknown>)[PUSH_MARKER] !== undefined
        ? (value as Record<string, unknown>)[PUSH_MARKER]
        : undefined;

/** Turn nested `{__opendocPush: x}` markers into arrays (`{a: ['c']}`). */
const materializeMarkers = (value: unknown): unknown => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const pushed = pushInner(value);
        if (pushed !== undefined) return [materializeMarkers(pushed)];
        const output: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
            output[key] = materializeMarkers(item);
        });
        return output;
    }
    return value;
};

const mergeParsed = (target: Record<string, unknown>, key: string, parsed: unknown): void => {
    const existing = target[key];
    const pushed = pushInner(parsed);
    if (existing === undefined) {
        target[key] = pushed !== undefined ? [pushed] : materializeMarkers(parsed);
        return;
    }
    if (pushed !== undefined) {
        if (Array.isArray(existing)) existing.push(pushed);
        else target[key] = [existing, pushed];
        return;
    }
    if (Array.isArray(existing) && Array.isArray(parsed)) {
        (parsed as unknown[]).forEach((item, index) => {
            if (item !== undefined) (existing as unknown[])[index] = item;
        });
        return;
    }
    if (!Array.isArray(existing) && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        Object.entries(parsed as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
            if (Object.prototype.hasOwnProperty.call(existing, nestedKey))
                mergeParsed(existing as Record<string, unknown>, nestedKey, nestedValue);
            else existing[nestedKey] = materializeMarkers(nestedValue);
        });
        return;
    }
    if (Array.isArray(existing)) {
        existing.push(parsed);
        return;
    }
    target[key] = [existing, parsed];
};

/** Parse a query string with bracket notation back into a JSON value:
 *  `a=1&b=4&j[]=1&a[]=5&k[key]=foo` becomes nested arrays and objects. */
export const queryStringToJson = (text: string): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    const decode = (value: string): string => {
        try {
            return decodeURIComponent(value.replace(/\+/g, ' '));
        } catch {
            return value;
        }
    };
    String(text || '')
        .split('&')
        .forEach(pair => {
            if (!pair) return;
            const equals = pair.indexOf('=');
            const rawKey = equals >= 0 ? pair.slice(0, equals) : pair;
            const rawValue = equals >= 0 ? pair.slice(equals + 1) : '';
            const key = decode(rawKey);
            const value = decode(rawValue);
            const baseMatch = /^([^\[\]]+)/.exec(key);
            const base = baseMatch ? baseMatch[1] : key;
            const segments: Array<string | number | null> = [];
            const bracketPattern = /\[([^\]]*)\]/g;
            let bracketMatch: RegExpExecArray | null;
            while ((bracketMatch = bracketPattern.exec(key))) {
                const segment = bracketMatch[1];
                if (segment === '') segments.push(null);
                else if (/^\d+$/.test(segment)) segments.push(Number(segment));
                else segments.push(segment);
            }
            mergeParsed(result, base, parseSegments(segments, value));
        });
    return result;
};

const formatKey = (mediaType: string): string => {
    const normalized = String(mediaType || '')
        .toLowerCase()
        .split(';', 1)[0]
        .trim();
    if (normalized.includes('json')) return 'json';
    if (normalized.includes('yaml') || normalized === 'application/x-yaml') return 'yaml';
    if (normalized === 'application/xml' || normalized.endsWith('+xml') || normalized === 'text/xml') return 'xml';
    if (normalized === 'application/x-www-form-urlencoded') return 'query';
    return 'text';
};

export const parseBodyToJson = (text: string, mediaType: string): unknown => {
    const normalized = String(mediaType || '')
        .toLowerCase()
        .split(';', 1)[0]
        .trim();
    if (normalized.includes('json') || normalized === 'text/json') {
        try {
            return JSON.parse(text);
        } catch {
            return undefined;
        }
    }
    if (normalized.includes('yaml') || normalized === 'application/x-yaml') {
        try {
            return jsYaml.load(text);
        } catch {
            return undefined;
        }
    }
    if (normalized === 'application/xml' || normalized.endsWith('+xml') || normalized === 'text/xml') {
        try {
            const parsed = xmlToJson(text);
            return parsed === undefined ? undefined : parsed;
        } catch {
            return undefined;
        }
    }
    if (normalized === 'application/x-www-form-urlencoded') {
        try {
            return JSON.parse(text);
        } catch {
            try {
                return queryStringToJson(text);
            } catch {
                return undefined;
            }
        }
    }
    return undefined;
};

export const serializeBodyFromJson = (value: unknown, mediaType: string, schema?: any): string => {
    const normalized = String(mediaType || '')
        .toLowerCase()
        .split(';', 1)[0]
        .trim();
    if (normalized.includes('json') || normalized === 'text/json') return JSON.stringify(value, null, 2);
    if (normalized.includes('yaml') || normalized === 'application/x-yaml')
        return jsYaml.dump(value, {noRefs: true, lineWidth: 120}).replace(/\s+$/, '');
    if (normalized === 'application/xml' || normalized.endsWith('+xml') || normalized === 'text/xml')
        return jsonToXml(value, schema);
    if (normalized === 'application/x-www-form-urlencoded') return jsonToQueryString(value);
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
};

/** Convert body text between media types. The source is parsed with the
 *  source media type's parser (falling back to JSON), then serialized to the
 *  target media type. Unparseable text is returned unchanged. */
export const convertBodyText = (text: string, fromMediaType: string, toMediaType: string, schema?: any): string => {
    if (!text || !text.trim()) return text;
    if (formatKey(fromMediaType) === formatKey(toMediaType)) return text;
    const value = parseBodyToJson(text, fromMediaType);
    if (value === undefined) return text;
    return serializeBodyFromJson(value, toMediaType, schema);
};
