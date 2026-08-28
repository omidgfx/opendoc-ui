/**
 * Map each source line of a generated example to a copyable accessor path.
 * Encodings: JSONPath, PHP `$x['a'][0]`, JS `x.a[0]`, Python, Go, XPath, …
 */

export type CodePathSegment = {kind: 'key'; name: string} | {kind: 'index'; index: number};

const ROOT_DEFAULT = 'payload';

const isIdent = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

export const safeRootName = (rootName?: string): string => {
    const cleaned = String(rootName || ROOT_DEFAULT).replace(/[^A-Za-z0-9_]/g, '_');
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned || ROOT_DEFAULT}`;
};

/**
 * Pretty-printed JSON (2-space) line → path segments.
 * Tracks object keys and array indices across `{` `[` `}` `]` `,`.
 */
export const jsonSegmentsPerLine = (code: string): CodePathSegment[][] => {
    const lines = String(code ?? '').split('\n');
    type Frame = {type: 'object'; key: string | null} | {type: 'array'; index: number; elementStarted: boolean};
    const stack: Frame[] = [];
    const out: CodePathSegment[][] = [];

    const currentPath = (): CodePathSegment[] => {
        const segments: CodePathSegment[] = [];
        for (const frame of stack) {
            if (frame.type === 'object') {
                if (frame.key != null) segments.push({kind: 'key', name: frame.key});
            } else {
                segments.push({kind: 'index', index: Math.max(0, frame.index)});
            }
        }
        return segments;
    };

    const parseKey = (trimmed: string): string | null => {
        const quote = trimmed[0];
        if (quote !== '"' && quote !== "'") return null;
        let i = 1;
        let outKey = '';
        while (i < trimmed.length) {
            const ch = trimmed[i];
            if (ch === '\\' && i + 1 < trimmed.length) {
                outKey += trimmed[i + 1];
                i += 2;
                continue;
            }
            if (ch === quote) {
                const rest = trimmed.slice(i + 1).trimStart();
                // JSON "key": …  | PHP 'key' => … | JS key after normalize
                if (rest.startsWith(':') || rest.startsWith('=>')) return outKey;
                return null;
            }
            outKey += ch;
            i += 1;
        }
        return null;
    };

    const scanLine = (
        trimmed: string,
        onToken: (kind: 'open-obj' | 'open-arr' | 'close-obj' | 'close-arr' | 'comma') => void,
    ): void => {
        let inString: '"' | "'" | null = null;
        let escape = false;
        for (let i = 0; i < trimmed.length; i += 1) {
            const ch = trimmed[i];
            if (inString) {
                if (escape) escape = false;
                else if (ch === '\\') escape = true;
                else if (ch === inString) inString = null;
                continue;
            }
            if (ch === '"' || ch === "'") {
                inString = ch;
                continue;
            }
            if (ch === '{') onToken('open-obj');
            else if (ch === '[') onToken('open-arr');
            else if (ch === '}') onToken('close-obj');
            else if (ch === ']') onToken('close-arr');
            else if (ch === ',') onToken('comma');
        }
    };

    const applyToken = (kind: 'open-obj' | 'open-arr' | 'close-obj' | 'close-arr' | 'comma'): void => {
        if (kind === 'open-obj') stack.push({type: 'object', key: null});
        else if (kind === 'open-arr') stack.push({type: 'array', index: 0, elementStarted: false});
        else if (kind === 'close-obj') {
            if (stack.length && stack[stack.length - 1].type === 'object') stack.pop();
        } else if (kind === 'close-arr') {
            if (stack.length && stack[stack.length - 1].type === 'array') stack.pop();
        } else if (kind === 'comma') {
            const frame = stack[stack.length - 1];
            if (frame?.type === 'object') frame.key = null;
            if (frame?.type === 'array' && frame.elementStarted) {
                frame.index += 1;
                frame.elementStarted = false;
            }
        }
    };

    for (const raw of lines) {
        const trimmed = raw.trim();

        // Leading closers only (not commas) so `],` / `},` still resolve to the closed node.
        let pastLeadingClosers = false;
        const deferredLeadingCommas: Array<'comma'> = [];
        scanLine(trimmed, kind => {
            if (pastLeadingClosers) return;
            if (kind === 'close-obj' || kind === 'close-arr') {
                applyToken(kind);
                return;
            }
            if (kind === 'comma') {
                deferredLeadingCommas.push('comma');
                return;
            }
            pastLeadingClosers = true;
        });

        const content = trimmed.replace(/^[\]\}\s,]*/, '');
        let key = parseKey(content);
        if (key == null) {
            const ident = content.match(/^([A-Za-z_][\w$]*)\s*:/);
            if (ident) key = ident[1];
        }
        if (key != null) {
            const top = stack[stack.length - 1];
            if (top?.type === 'object') top.key = key;
        }

        const top = stack[stack.length - 1];
        if (top?.type === 'array' && content.length > 0 && key == null && !top.elementStarted) {
            top.elementStarted = true;
        }

        out.push(currentPath());

        // Commas that sat between leading closers and content, then the rest of the line.
        deferredLeadingCommas.forEach(() => applyToken('comma'));

        let pastLeading = false;
        let skippedCommas = 0;
        scanLine(trimmed, kind => {
            if (!pastLeading) {
                if (kind === 'close-obj' || kind === 'close-arr') return;
                if (kind === 'comma') {
                    // Already applied via deferredLeadingCommas (only those before first non-closer).
                    if (skippedCommas < deferredLeadingCommas.length) {
                        skippedCommas += 1;
                        return;
                    }
                }
                pastLeading = true;
            }
            applyToken(kind);
        });
    }

    return out;
};

const escapeSingle = (value: string): string => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const escapeDouble = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const formatJsonPath = (segments: CodePathSegment[]): string => {
    if (!segments.length) return '$';
    let path = '$';
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path += isIdent(segment.name) ? `.${segment.name}` : `['${escapeSingle(segment.name)}']`;
        } else {
            path += `[${segment.index}]`;
        }
    }
    return path;
};

const formatPhpArray = (segments: CodePathSegment[], root: string): string => {
    let path = `$${root}`;
    for (const segment of segments) {
        if (segment.kind === 'key') path += `['${escapeSingle(segment.name)}']`;
        else path += `[${segment.index}]`;
    }
    return path;
};

const formatPhpObject = (segments: CodePathSegment[], root: string): string => {
    let path = `$${root}`;
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path += isIdent(segment.name) ? `->${segment.name}` : `->{'${escapeSingle(segment.name)}'}`;
        } else path += `[${segment.index}]`;
    }
    return path;
};

/** PHP 8 nullsafe object chain: $request?->status?->error */
const formatPhpNullsafe = (segments: CodePathSegment[], root: string): string => {
    let path = `$${root}`;
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path += isIdent(segment.name) ? `?->${segment.name}` : `?->{'${escapeSingle(segment.name)}'}`;
        } else path += `[${segment.index}]`;
    }
    return path;
};

const formatJs = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path += isIdent(segment.name) ? `.${segment.name}` : `['${escapeSingle(segment.name)}']`;
        } else path += `[${segment.index}]`;
    }
    return path;
};

const formatPython = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') path += `["${escapeDouble(segment.name)}"]`;
        else path += `[${segment.index}]`;
    }
    return path;
};

const formatGo = formatPython;

const formatRuby = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path += isIdent(segment.name) ? `[:${segment.name}]` : `[:'${escapeSingle(segment.name)}']`;
        } else path += `[${segment.index}]`;
    }
    return path;
};

const formatCSharp = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') path += `["${escapeDouble(segment.name)}"]`;
        else path += `[${segment.index}]`;
    }
    return path;
};

const formatJava = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') path += `.get("${escapeDouble(segment.name)}")`;
        else path += `.get(${segment.index})`;
    }
    return path;
};

const formatXmlXPath = (code: string): string[] => {
    const lines = String(code ?? '').split('\n');
    type Node = {name: string; index: number; childCounts: Record<string, number>};
    const stack: Node[] = [];
    const rootCounts: Record<string, number> = {};

    const pathOf = (): string =>
        stack.length === 0 ? '/' : stack.map(node => `/${node.name}[${node.index}]`).join('');

    const openTag = (name: string): void => {
        const parent = stack[stack.length - 1];
        if (parent) {
            parent.childCounts[name] = (parent.childCounts[name] || 0) + 1;
            stack.push({name, index: parent.childCounts[name], childCounts: {}});
        } else {
            rootCounts[name] = (rootCounts[name] || 0) + 1;
            stack.push({name, index: rootCounts[name], childCounts: {}});
        }
    };

    return lines.map(line => {
        // Left-to-right so `<status>401</status>` opens, records path, then closes.
        let pathForLine = pathOf();
        const tokenRe =
            /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)\b[^>]*\/>|<([A-Za-z_][\w:.-]*)\b[^>]*>/g;
        let match: RegExpExecArray | null;
        let sawTag = false;
        while ((match = tokenRe.exec(line)) !== null) {
            sawTag = true;
            if (match[0].startsWith('<!--') || match[0].startsWith('<![CDATA[')) continue;
            if (match[1]) {
                pathForLine = pathOf();
                if (stack.length) stack.pop();
                continue;
            }
            if (match[2]) {
                openTag(match[2]);
                pathForLine = pathOf();
                stack.pop();
                continue;
            }
            if (match[3]) {
                openTag(match[3]);
                pathForLine = pathOf();
            }
        }
        if (!sawTag) pathForLine = pathOf();
        return pathForLine;
    });
};

/** Indent-based YAML path (best-effort for dumped maps/lists). */
const yamlSegmentsPerLine = (code: string): CodePathSegment[][] => {
    const lines = String(code ?? '').split('\n');
    type Frame = {indent: number; segment: CodePathSegment};
    const stack: Frame[] = [];
    const listCounters = new Map<number, number>();

    return lines.map(line => {
        if (!line.trim() || line.trim().startsWith('#')) {
            return stack.map(frame => frame.segment);
        }
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        while (stack.length && stack[stack.length - 1].indent >= indent) {
            const removed = stack.pop();
            if (removed) listCounters.delete(removed.indent + 2);
        }

        const trimmed = line.trim();
        if (trimmed.startsWith('- ')) {
            const count = (listCounters.get(indent) ?? -1) + 1;
            listCounters.set(indent, count);
            stack.push({indent, segment: {kind: 'index', index: count}});
            const after = trimmed.slice(2);
            const keyMatch = after.match(/^["']?([^:"']+)["']?\s*:\s*/);
            if (keyMatch) {
                stack.push({indent: indent + 2, segment: {kind: 'key', name: keyMatch[1].trim()}});
            }
            return stack.map(frame => frame.segment);
        }

        const keyMatch = trimmed.match(/^["']?([^:"']+)["']?\s*:\s*/);
        if (keyMatch) {
            stack.push({indent, segment: {kind: 'key', name: keyMatch[1].trim()}});
            return stack.map(frame => frame.segment);
        }
        return stack.map(frame => frame.segment);
    });
};

/** TOML tables + dotted keys (`[error.nested]`, `status = 1`). */
const tomlSegmentsPerLine = (code: string): CodePathSegment[][] => {
    const lines = String(code ?? '').split('\n');
    let tablePath: CodePathSegment[] = [];

    return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return tablePath.map(s => ({...s}));

        // [[array.tables]]
        const arrTable = trimmed.match(/^\[\[([^\]]+)\]\]$/);
        if (arrTable) {
            tablePath = arrTable[1]
                .split('.')
                .filter(Boolean)
                .map(name => ({kind: 'key' as const, name}));
            // Represent array table as key path; index not tracked across multiple tables.
            return tablePath.map(s => ({...s}));
        }
        // [table] or [a.b]
        const table = trimmed.match(/^\[([^\]]+)\]$/);
        if (table) {
            tablePath = table[1]
                .split('.')
                .filter(Boolean)
                .map(name => ({kind: 'key' as const, name}));
            return tablePath.map(s => ({...s}));
        }

        const kv = trimmed.match(/^["']?([^="']+)["']?\s*=\s*/);
        if (kv) {
            const key = kv[1].trim();
            return [...tablePath, {kind: 'key' as const, name: key}];
        }
        return tablePath.map(s => ({...s}));
    });
};

export type CodePathStyleId =
    | 'jsonpath'
    | 'js-dot'
    | 'js-bracket'
    | 'js-optional-dot'
    | 'js-optional-bracket'
    | 'php-array'
    | 'php-object'
    | 'php-nullsafe'
    | 'python-dict'
    | 'python-get'
    | 'go-map'
    | 'csharp-index'
    | 'java-map'
    | 'java-path'
    | 'ruby-hash'
    | 'ruby-dig'
    | 'xpath'
    | 'form-key';

export interface CodePathStyle {
    id: CodePathStyleId;
    /** Short label in the path-style selector. */
    label: string;
    /** One-line sample shown as the option description. */
    example: string;
}

export interface CodeLinePathResult {
    /** 1-based index via paths[line - 1] */
    paths: string[];
    styleId: CodePathStyleId;
    styleLabel: string;
}

const PATH_STYLE_META: Record<CodePathStyleId, Omit<CodePathStyle, 'id'>> = {
    jsonpath: {label: 'JSONPath', example: '$.error.code'},
    'js-dot': {label: 'JS · dot', example: 'payload.error.code'},
    'js-bracket': {label: 'JS · bracket', example: "payload['error']['code']"},
    'js-optional-dot': {label: 'JS · optional', example: 'payload?.error?.code'},
    'js-optional-bracket': {label: 'JS · optional []', example: "payload?.['error']?.['code']"},
    'php-array': {label: 'PHP · array', example: "$payload['error']['code']"},
    'php-object': {label: 'PHP · object', example: '$payload->error->code'},
    'php-nullsafe': {label: 'PHP · nullsafe', example: '$payload?->error?->code'},
    'python-dict': {label: 'Python · []', example: 'payload["error"]["code"]'},
    'python-get': {label: 'Python · get', example: 'payload.get("error", {}).get("code")'},
    'go-map': {label: 'Go · map', example: 'payload["error"].(map[string]any)["code"]'},
    'csharp-index': {label: 'C# · index', example: 'payload["error"]["code"]'},
    'java-map': {label: 'Java · get', example: 'payload.get("error").get("code")'},
    'java-path': {label: 'Java · path', example: 'payload.at("/error/code")'},
    'ruby-hash': {label: 'Ruby · []', example: 'payload[:error][:code]'},
    'ruby-dig': {label: 'Ruby · dig', example: 'payload.dig(:error, :code)'},
    xpath: {label: 'XPath', example: '/root[1]/error[1]/code[1]'},
    'form-key': {label: 'Form key', example: 'error[code]'},
};

/**
 * Path styles for a generated-example encoding.
 * JSONPath is offered everywhere; other walkers stay language-scoped
 * (JS only on js/ts, PHP only on php, …).
 */
export const pathStylesForEncoding = (encodingId: string): CodePathStyle[] => {
    // Language-native walkers first; JSONPath is always offered as a common option.
    const ids = ((): CodePathStyleId[] => {
        switch (encodingId) {
            case 'json':
            case 'yaml':
            case 'toml':
            case 'rust-json':
                return ['jsonpath'];
            case 'form':
                return ['form-key', 'jsonpath'];
            case 'xml':
                return ['xpath', 'jsonpath'];
            case 'js-object':
            case 'ts-as-const':
                return ['js-dot', 'js-bracket', 'js-optional-dot', 'js-optional-bracket', 'jsonpath'];
            case 'php-array':
            case 'php-json':
            case 'php-object':
                return ['php-array', 'php-object', 'php-nullsafe', 'jsonpath'];
            case 'python-dict':
                return ['python-dict', 'python-get', 'jsonpath'];
            case 'go-map':
                return ['go-map', 'jsonpath'];
            case 'csharp-dict':
                return ['csharp-index', 'jsonpath'];
            case 'java-map':
                return ['java-map', 'java-path', 'jsonpath'];
            case 'ruby-hash':
                return ['ruby-hash', 'ruby-dig', 'jsonpath'];
            default:
                return ['jsonpath'];
        }
    })();
    return ids.map(id => ({id, ...PATH_STYLE_META[id]}));
};

export const defaultPathStyleId = (encodingId: string): CodePathStyleId =>
    pathStylesForEncoding(encodingId)[0]?.id || 'jsonpath';

export const resolvePathStyleId = (encodingId: string, preferred?: string | null): CodePathStyleId => {
    const styles = pathStylesForEncoding(encodingId);
    if (preferred && styles.some(style => style.id === preferred)) {
        return preferred as CodePathStyleId;
    }
    return styles[0]?.id || 'jsonpath';
};

const formatJsBracket = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') path += `['${escapeSingle(segment.name)}']`;
        else path += `[${segment.index}]`;
    }
    return path;
};

const formatJsOptionalDot = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path += isIdent(segment.name) ? `?.${segment.name}` : `?.['${escapeSingle(segment.name)}']`;
        } else path += `?.[${segment.index}]`;
    }
    return path;
};

const formatJsOptionalBracket = (segments: CodePathSegment[], root: string): string => {
    let path = root;
    for (const segment of segments) {
        if (segment.kind === 'key') path += `?.['${escapeSingle(segment.name)}']`;
        else path += `?.[${segment.index}]`;
    }
    return path;
};

const formatPythonGet = (segments: CodePathSegment[], root: string): string => {
    if (!segments.length) return root;
    let path = root;
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        const isLast = i === segments.length - 1;
        if (segment.kind === 'key') {
            const key = `"${escapeDouble(segment.name)}"`;
            path += isLast ? `.get(${key})` : `.get(${key}, {})`;
        } else {
            path += `[${segment.index}]`;
        }
    }
    return path;
};

const formatGoMap = (segments: CodePathSegment[], root: string): string => {
    if (!segments.length) return root;
    let path = root;
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        const next = segments[i + 1];
        if (segment.kind === 'key') {
            path += `["${escapeDouble(segment.name)}"]`;
            if (next) path += '.(map[string]any)';
        } else {
            path += `.([]any)[${segment.index}]`;
            if (next?.kind === 'key') path += '.(map[string]any)';
        }
    }
    return path;
};

const formatJavaPath = (segments: CodePathSegment[], root: string): string => {
    if (!segments.length) return root;
    const parts = segments.map(segment => (segment.kind === 'key' ? `/${segment.name}` : `/${segment.index}`));
    return `${root}.at("${parts.join('')}")`;
};

const formatRubyDig = (segments: CodePathSegment[], root: string): string => {
    if (!segments.length) return root;
    const args = segments
        .map(segment => {
            if (segment.kind === 'index') return String(segment.index);
            return isIdent(segment.name) ? `:${segment.name}` : `:'${escapeSingle(segment.name)}'`;
        })
        .join(', ');
    return `${root}.dig(${args})`;
};

const formatFormKey = (segments: CodePathSegment[]): string => {
    if (!segments.length) return '';
    let path = '';
    for (const segment of segments) {
        if (segment.kind === 'key') {
            path = path ? `${path}[${segment.name}]` : segment.name;
        } else {
            path = path ? `${path}[${segment.index}]` : String(segment.index);
        }
    }
    return path;
};

const formatByStyle = (styleId: CodePathStyleId, segments: CodePathSegment[], root: string): string => {
    switch (styleId) {
        case 'js-dot':
            return formatJs(segments, root);
        case 'js-bracket':
            return formatJsBracket(segments, root);
        case 'js-optional-dot':
            return formatJsOptionalDot(segments, root);
        case 'js-optional-bracket':
            return formatJsOptionalBracket(segments, root);
        case 'php-array':
            return formatPhpArray(segments, root);
        case 'php-object':
            return formatPhpObject(segments, root);
        case 'php-nullsafe':
            return formatPhpNullsafe(segments, root);
        case 'python-dict':
            return formatPython(segments, root);
        case 'python-get':
            return formatPythonGet(segments, root);
        case 'go-map':
            return formatGoMap(segments, root);
        case 'csharp-index':
            return formatCSharp(segments, root);
        case 'java-map':
            return formatJava(segments, root);
        case 'java-path':
            return formatJavaPath(segments, root);
        case 'ruby-hash':
            return formatRuby(segments, root);
        case 'ruby-dig':
            return formatRubyDig(segments, root);
        case 'form-key':
            return formatFormKey(segments);
        case 'xpath':
            // XPath is produced line-by-line, not from segments.
            return formatJsonPath(segments);
        case 'jsonpath':
        default:
            return formatJsonPath(segments);
    }
};

const stripAssignment = (code: string): string =>
    String(code ?? '')
        .replace(/^\s*(?:const|let|var)\s+[\w$]+(?:\s*:\s*[^=]+)?\s*=\s*/m, '')
        .replace(/^\s*(?:Map(?:<[^>]+>)?|Dictionary(?:<[^>]+>)?|var|let)\s+[\w$]+\s*=\s*/m, '')
        .replace(/^\s*\$[\w]+\s*=\s*/m, '')
        .replace(/^\s*[\w$]+(?:\s*:\s*[^=]+)?\s*(?:=|:=)\s*/m, '')
        .replace(/\s*as const;?\s*$/m, '')
        .replace(/;?\s*$/m, '');

/**
 * Peel language wrappers so the shared JSON walker can see structure.
 * C# dictionary initializers, Java put-chains, PHP json_decode, Go maps, …
 */
const normalizeLanguageSource = (code: string, encodingId: string): string => {
    let s = String(code ?? '');

    if (encodingId === 'php-json') {
        // $x = json_decode('{ ... }');  or json_decode("...")
        const decoded = s.match(/json_decode\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
        if (decoded) return decoded[2];
        // Fallback: extract first {...} block
        const brace = s.indexOf('{');
        const endBrace = s.lastIndexOf('}');
        if (brace >= 0 && endBrace > brace) return s.slice(brace, endBrace + 1);
    }

    s = stripAssignment(s)
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/\bnil\b/g, 'null')
        .replace(/\(object\)\s*/g, '');

    if (encodingId === 'csharp-dict') {
        // new Dictionary<string, object> { ["k"] = v, ... }  / new object[] { ... }
        s = s
            .replace(/new\s+Dictionary\s*<[^>]+>\s*(?:\[\])?/g, '')
            .replace(/new\s+object\s*\[\s*\]\s*/g, '')
            .replace(/\[\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*')\s*\]\s*=/g, '$1:')
            .replace(/,\s*$/gm, '');
    }

    if (encodingId === 'java-map') {
        // Prefer walking Map.of / List.of literals when the dump is put-chain based:
        // rebuild a JSON-ish object from put("k", v) lines at file scope.
        if (/\.put\s*\(/.test(s) || /map\.put\s*\(/.test(s)) {
            return javaPutChainToJsonish(s);
        }
        s = s
            .replace(/new\s+LinkedHashMap\s*<[^>]*>\s*\(\s*\)/g, '{}')
            .replace(/Map\.of\s*\(/g, '({')
            .replace(/List\.of\s*\(/g, '[');
        // Map.of pairs: "k", v, "k2", v2 → "k": v, "k2": v2  (best-effort inside {})
    }

    if (encodingId === 'go-map') {
        s = s
            .replace(/map\s*\[\s*string\s*\]\s*any\s*/g, '')
            .replace(/map\s*\[\s*string\s*\]\s*interface\s*\{\s*\}\s*/g, '');
    }

    // PHP / Ruby hash rockets → colon
    s = s.replace(/\s*=>\s*/g, ': ');

    // Single-quoted keys → double-quoted
    s = s.replace(/'((?:\\'|[^'])*)'\s*:/g, (_m, key: string) => {
        const unescaped = key.replace(/\\'/g, "'").replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${unescaped}":`;
    });

    // Convert associative `[` that introduce string keys into `{`.
    const out: string[] = [];
    const closerStack: Array<'}' | ']'> = [];
    let i = 0;
    let inString: '"' | "'" | null = null;
    let escape = false;

    const peekNonWs = (from: number): string => {
        let j = from;
        while (j < s.length && /\s/.test(s[j])) j += 1;
        return s.slice(j, j + 32);
    };

    while (i < s.length) {
        const ch = s[i];
        if (inString) {
            out.push(ch);
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === inString) inString = null;
            i += 1;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = ch;
            out.push(ch);
            i += 1;
            continue;
        }
        if (ch === '[') {
            const next = peekNonWs(i + 1);
            const isAssoc = /^"[^"]*"\s*:/.test(next) || /^'[^']*'\s*:/.test(next) || /^[A-Za-z_][\w$]*\s*:/.test(next);
            if (isAssoc) {
                out.push('{');
                closerStack.push('}');
            } else {
                out.push('[');
                closerStack.push(']');
            }
            i += 1;
            continue;
        }
        if (ch === ']') {
            const closer = closerStack.pop();
            out.push(closer || ']');
            i += 1;
            continue;
        }
        if (ch === '{') {
            closerStack.push('}');
            out.push(ch);
            i += 1;
            continue;
        }
        if (ch === '}') {
            closerStack.pop();
            out.push(ch);
            i += 1;
            continue;
        }
        out.push(ch);
        i += 1;
    }
    return out.join('');
};

/**
 * Best-effort: turn Java put-chain dumps into a pretty JSON object so the
 * shared walker can assign paths. Nested put targets become nested objects
 * when the value opens another map builder; Map.of / List.of stay inline.
 */
const javaPutChainToJsonish = (code: string): string => {
    type Node = {kind: 'object'; entries: Array<{key: string; value: Node | string}>} | {kind: 'raw'; text: string};
    const root: Node = {kind: 'object', entries: []};
    const stack: Array<{node: Extract<Node, {kind: 'object'}>; indent: number}> = [{node: root, indent: -1}];

    const parseMapOf = (inner: string): string => {
        // "k", v, "k2", v2  → { "k": v, "k2": v2 }
        const parts: string[] = [];
        let i = 0;
        let expectKey = true;
        let key = '';
        while (i < inner.length) {
            while (i < inner.length && /[\s,]/.test(inner[i])) i += 1;
            if (i >= inner.length) break;
            if (inner[i] === '"' || inner[i] === "'") {
                const q = inner[i];
                let j = i + 1;
                while (j < inner.length && inner[j] !== q) {
                    if (inner[j] === '\\') j += 2;
                    else j += 1;
                }
                if (inner[j] === q) j += 1;
                const lit = inner.slice(i, j);
                if (expectKey) {
                    key = lit;
                    expectKey = false;
                } else {
                    parts.push(`${key}: ${lit}`);
                    expectKey = true;
                }
                i = j;
                continue;
            }
            // non-string value
            let j = i;
            let depth = 0;
            while (j < inner.length) {
                const c = inner[j];
                if (c === '(' || c === '{' || c === '[') depth += 1;
                else if (c === ')' || c === '}' || c === ']') {
                    if (depth === 0) break;
                    depth -= 1;
                } else if (c === ',' && depth === 0) break;
                j += 1;
            }
            const val = inner.slice(i, j).trim();
            if (expectKey) {
                key = JSON.stringify(val);
                expectKey = false;
            } else {
                parts.push(`${key}: ${val}`);
                expectKey = true;
            }
            i = j;
        }
        return `{ ${parts.join(', ')} }`;
    };

    const lines = code.split('\n');
    for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('Map<') || trimmed.startsWith('//')) continue;

        const put = trimmed.match(/\.put\s*\(\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*')\s*,\s*([\s\S]*?)\s*\)\s*;?\s*$/);
        if (!put) continue;
        let keyLit = put[1];
        if (keyLit.startsWith("'")) {
            keyLit = `"${keyLit.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`;
        }
        const key = JSON.parse(keyLit) as string;
        let valueExpr = put[2].trim();

        // Drop broken nested builder declarations glued into the value.
        if (/^Map\s*<|new\s+LinkedHashMap/.test(valueExpr) && !valueExpr.startsWith('Map.of')) {
            // Nested object starts — open a child object on the stack.
            const child: Extract<Node, {kind: 'object'}> = {kind: 'object', entries: []};
            const top = stack[stack.length - 1].node;
            top.entries.push({key, value: child});
            stack.push({node: child, indent: (raw.match(/^\s*/)?.[0].length ?? 0) + 1});
            continue;
        }

        if (valueExpr.startsWith('Map.of(') && valueExpr.endsWith(')')) {
            valueExpr = parseMapOf(valueExpr.slice('Map.of('.length, -1));
        } else if (valueExpr.startsWith('List.of(') && valueExpr.endsWith(')')) {
            valueExpr = `[${valueExpr.slice('List.of('.length, -1)}]`;
        }

        const top = stack[stack.length - 1].node;
        top.entries.push({key, value: {kind: 'raw', text: valueExpr}});
    }

    const render = (node: Node, pad: number): string => {
        if (node.kind === 'raw') return node.text;
        const indent = '  '.repeat(pad);
        const inner = '  '.repeat(pad + 1);
        if (!node.entries.length) return '{}';
        const lines = node.entries.map(entry => {
            const val =
                typeof entry.value === 'string'
                    ? entry.value
                    : entry.value.kind === 'raw'
                      ? entry.value.text
                      : render(entry.value, pad + 1);
            return `${inner}${JSON.stringify(entry.key)}: ${val}`;
        });
        return `{\n${lines.join(',\n')}\n${indent}}`;
    };

    // If nothing parsed, fall back to original.
    if (!root.entries.length) return code;
    return render(root, 0);
};

/**
 * Build per-line accessor strings for a generated example.
 * `pathStyleId` selects the formatter; `encodingId` picks how source is walked.
 */
export const buildCodeLinePaths = (
    code: string,
    encodingId: string,
    rootName = ROOT_DEFAULT,
    pathStyleId?: string | null,
): CodeLinePathResult => {
    const root = safeRootName(rootName);
    const styleId = resolvePathStyleId(encodingId, pathStyleId);
    const styleLabel = PATH_STYLE_META[styleId]?.label || 'Path';
    const lines = String(code ?? '').split('\n');
    if (lines.length === 0) return {paths: [], styleId, styleLabel};

    if (styleId === 'xpath' && (encodingId === 'xml' || /<\w/.test(code))) {
        return {paths: formatXmlXPath(code), styleId, styleLabel};
    }

    // XML + non-XPath styles: walk element structure, then format via style.
    if (encodingId === 'xml') {
        const xpathPaths = formatXmlXPath(code);
        const segmentsPerLine = xpathPaths.map(xpath => {
            if (!xpath || xpath === '/') return [] as CodePathSegment[];
            const parts = xpath.split('/').filter(Boolean);
            const segments: CodePathSegment[] = [];
            for (const part of parts) {
                const m = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
                if (!m) continue;
                const name = m[1];
                // Skip the document root element name for language accessors
                // (payload.status rather than payload.request.status) — keep for JSONPath.
                segments.push({kind: 'key', name});
                // Index on element is XPath sibling index; only keep when > 1 as array-ish.
            }
            return segments;
        });
        // For JSONPath keep full element chain; for language styles drop the root tag
        // if it matches the root variable name / first element.
        const paths = lines.map((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            let segments = segmentsPerLine[index] || [];
            if (!segments.length) {
                if (index === 0 || trimmed.startsWith('<?xml')) {
                    return formatByStyle(styleId, [], root);
                }
                return '';
            }
            if (styleId !== 'jsonpath' && segments[0]?.kind === 'key') {
                // Drop outer root element so accessors match the payload variable.
                segments = segments.slice(1);
                if (!segments.length) return formatByStyle(styleId, [], root);
            }
            return formatByStyle(styleId, segments, root);
        });
        return {paths, styleId, styleLabel};
    }

    if (encodingId === 'form' && (styleId === 'form-key' || (styleId === 'jsonpath' && !pathStyleId))) {
        // default form-key handled below for form-key; jsonpath on form uses key segments
    }

    if (encodingId === 'form' && styleId === 'form-key') {
        return {
            styleId,
            styleLabel,
            paths: lines.map(line => {
                const key = line.split('=')[0]?.trim();
                if (!key) return '';
                try {
                    return decodeURIComponent(key);
                } catch {
                    return key;
                }
            }),
        };
    }

    let segmentsPerLine: CodePathSegment[][];
    if (encodingId === 'yaml') {
        segmentsPerLine = yamlSegmentsPerLine(code);
    } else if (encodingId === 'toml') {
        segmentsPerLine = tomlSegmentsPerLine(code);
    } else if (encodingId === 'json') {
        segmentsPerLine = jsonSegmentsPerLine(code);
    } else if (encodingId === 'form') {
        segmentsPerLine = lines.map(line => {
            const key = line.split('=')[0]?.trim();
            if (!key) return [];
            try {
                return [{kind: 'key' as const, name: decodeURIComponent(key)}];
            } catch {
                return [{kind: 'key' as const, name: key}];
            }
        });
    } else {
        const jsonish = normalizeLanguageSource(code, encodingId);
        // When normalizer collapses to fewer lines (java put→json), map paths back by key match.
        const normalizedLines = jsonish.split('\n');
        if (normalizedLines.length === lines.length) {
            segmentsPerLine = jsonSegmentsPerLine(jsonish);
        } else {
            const normalizedSegs = jsonSegmentsPerLine(jsonish);
            // Build key → segments from normalized pretty JSON, then assign to source lines.
            const keyToSeg = new Map<string, CodePathSegment[]>();
            normalizedLines.forEach((nLine, idx) => {
                const segs = normalizedSegs[idx] || [];
                const lastKey = [...segs].reverse().find(s => s.kind === 'key');
                if (lastKey && lastKey.kind === 'key') {
                    // Prefer deepest unique path string as map key
                    keyToSeg.set(segs.map(s => (s.kind === 'key' ? s.name : `#${s.index}`)).join('\0'), segs);
                    keyToSeg.set(lastKey.name, segs);
                }
            });
            segmentsPerLine = lines.map(line => {
                const trimmed = line.trim();
                // C# ["key"] / Java put("key" / Go "key": / PHP 'key' / JS key:
                const patterns = [
                    /\[\s*["']([^"']+)["']\s*\]/,
                    /\.put\s*\(\s*["']([^"']+)["']/,
                    /["']([^"']+)["']\s*:/,
                    /["']([^"']+)["']\s*=>/,
                    /^([A-Za-z_][\w$]*)\s*:/,
                ];
                for (const re of patterns) {
                    const m = trimmed.match(re);
                    if (m) {
                        // Prefer longest path ending with this key
                        let best: CodePathSegment[] | undefined;
                        keyToSeg.forEach((segs, mapKey) => {
                            if (mapKey === m[1] || mapKey.endsWith(`\0${m[1]}`) || mapKey.split('\0').pop() === m[1]) {
                                if (!best || segs.length >= best.length) best = segs;
                            }
                        });
                        if (best) return best;
                        return [{kind: 'key', name: m[1]}];
                    }
                }
                return [];
            });
        }
    }

    while (segmentsPerLine.length < lines.length) segmentsPerLine.push([]);

    const paths = lines.map((line, index) => {
        const segments = segmentsPerLine[index] || [];
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (!segments.length) {
            if (
                index === 0 ||
                trimmed === '{' ||
                trimmed === '[' ||
                trimmed === '<?xml' ||
                /=\s*[\[{]/.test(trimmed) ||
                /new\s+\w+/.test(trimmed) ||
                /map\s*\[/.test(trimmed) ||
                /Map\s*</.test(trimmed) ||
                /Dictionary\s*</.test(trimmed)
            ) {
                return formatByStyle(styleId, [], root);
            }
            return '';
        }
        return formatByStyle(styleId, segments, root);
    });

    return {paths, styleId, styleLabel};
};

export const pathForLine = (result: CodeLinePathResult, line: number): string => {
    if (!line || line < 1) return '';
    return result.paths[line - 1] || '';
};
