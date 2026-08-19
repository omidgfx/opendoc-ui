import * as jsYaml from 'js-yaml';

/**
 * Indents a single-line XML document. Specifications often carry their XML
 * examples as one long string, which is unreadable in a code viewer, so the
 * document is re-indented without touching its content.
 */
export const formatXml = (xml: string): string => {
    const source = String(xml ?? '').trim();
    if (!source) return '';
    // Documents are re-indented from scratch: a partially formatted example
    // (a declaration on its own line, the rest on one long line) is exactly
    // the case that needs fixing.
    const tokens = source
        .replace(/>\s+</g, '><')
        .replace(/></g, '>\n<')
        .split('\n')
        .map(token => token.trim())
        .filter(Boolean);
    const lines: string[] = [];
    let depth = 0;
    tokens.forEach(token => {
        const isDeclaration = token.startsWith('<?') || token.startsWith('<!');
        const isClosing = /^<\//.test(token);
        const isSelfClosing = /\/>$/.test(token);
        const isComplete = /^<([A-Za-z_][\w.:-]*)(\s[^>]*)?>[^<]*<\/\1>$/.test(token);
        if (isClosing) depth = Math.max(0, depth - 1);
        lines.push(`${'  '.repeat(depth)}${token}`);
        if (!isDeclaration && !isClosing && !isSelfClosing && !isComplete) depth += 1;
    });
    return lines.join('\n');
};

/** Language id the code viewer should highlight a media type with. */
export const exampleLanguageFor = (mediaType: string): string => {
    const normalized = (mediaType || '').toLowerCase();
    if (normalized.includes('json')) return 'json';
    if (normalized.includes('yaml') || normalized.includes('yml')) return 'yaml';
    if (normalized.includes('xml')) return 'xml';
    if (normalized.includes('html')) return 'html';
    if (normalized.includes('javascript')) return 'javascript';
    if (normalized.includes('x-www-form-urlencoded')) return 'http';
    return 'plaintext';
};

const toXmlNode = (value: any, nodeName: string, depth: number): string => {
    const indent = '  '.repeat(depth);
    const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
    if (value === null || value === undefined) return `${indent}<${safeName} />`;
    if (Array.isArray(value)) {
        if (value.length === 0) return `${indent}<${safeName}></${safeName}>`;
        return value.map(item => toXmlNode(item, safeName, depth)).join('\n');
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return `${indent}<${safeName}></${safeName}>`;
        const children = entries.map(([key, child]) => toXmlNode(child, key, depth + 1)).join('\n');
        return `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>`;
    }
    const escaped = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    return `${indent}<${safeName}>${escaped}</${safeName}>`;
};

const formUrlEncoded = (value: any): string => {
    if (!value || typeof value !== 'object') return String(value ?? '');
    return Object.entries(value)
        .map(
            ([key, item]) =>
                `${key}=${encodeURIComponent(typeof item === 'object' ? JSON.stringify(item) : String(item ?? ''))}`,
        )
        .join('&');
};

/**
 * Renders an example the way the media type would actually carry it, always
 * formatted: JSON re-indented, XML indented (whether it came as a string or as
 * a value), YAML dumped, form bodies as pairs.
 */
export const formatExample = (value: any, mediaType: string, rootName = 'example'): string => {
    const language = exampleLanguageFor(mediaType);
    if (value === undefined) return '';
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (language === 'json') {
            try {
                return JSON.stringify(JSON.parse(trimmed), null, 4);
            } catch {
                return trimmed;
            }
        }
        if (language === 'xml' || language === 'html') return formatXml(trimmed);
        if (language === 'yaml') {
            if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
            try {
                return jsYaml.dump(JSON.parse(trimmed));
            } catch {
                return trimmed;
            }
        }
        return trimmed;
    }
    if (language === 'xml') {
        const body = Array.isArray(value)
            ? `<${rootName}>\n${value.map(item => toXmlNode(item, 'item', 1)).join('\n')}\n</${rootName}>`
            : toXmlNode(value, rootName, 0);
        return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
    }
    if (language === 'yaml') return jsYaml.dump(value);
    if (language === 'http') return formUrlEncoded(value);
    if (language === 'plaintext' && typeof value !== 'object') return String(value ?? '');
    return JSON.stringify(value, null, 4);
};
