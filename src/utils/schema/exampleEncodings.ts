import * as jsYaml from 'js-yaml';

/**
 * Formats a generated mock value for the schema viewer’s example pane.
 * Each entry is a popular wire or language shape the reader may copy.
 */

export interface ExampleEncoding {
    id: string;
    /** Short label in the format selector. */
    label: string;
    /** Group heading in the selector. */
    group: 'Wire' | 'Data' | 'Languages';
    /** Prism language id. */
    language: string;
    format: (value: unknown, rootName: string) => string;
}

const escapeXml = (value: unknown) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const safeIdent = (name: string, fallback = 'value'): string => {
    const cleaned = String(name || fallback).replace(/[^A-Za-z0-9_]/g, '_');
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned || fallback}`;
};

const toXml = (value: any, nodeName = 'root', depth = 0): string => {
    const indent = '  '.repeat(depth);
    const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
    if (value === null || value === undefined) return `${indent}<${safeName} />`;
    if (Array.isArray(value)) {
        if (value.length === 0) return `${indent}<${safeName}></${safeName}>`;
        return value.map(item => toXml(item, 'item', depth)).join('\n');
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return `${indent}<${safeName}></${safeName}>`;
        const children = entries.map(([key, child]) => toXml(child, key, depth + 1)).join('\n');
        return `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>`;
    }
    return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
};

const toPhpArray = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '    '.repeat(n);
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(item => `${pad(indentLevel + 1)}${toPhpArray(item, indentLevel + 1)}`);
        return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '[]';
        const items = keys.map(key => {
            const escapedKey = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `${pad(indentLevel + 1)}'${escapedKey}' => ${toPhpArray(value[key], indentLevel + 1)}`;
        });
        return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
    }
    return 'null';
};

const toPhpStdClass = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '    '.repeat(n);
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return toPhpArray(value, indentLevel);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(item => `${pad(indentLevel + 1)}${toPhpStdClass(item, indentLevel + 1)}`);
        return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) return '(object) []';
    const lines = keys.map(key => {
        const escapedKey = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `${pad(indentLevel + 1)}'${escapedKey}' => ${toPhpStdClass(value[key], indentLevel + 1)}`;
    });
    return `(object) [\n${lines.join(',\n')}\n${pad(indentLevel)}]`;
};

const jsLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '  '.repeat(n);
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    if (typeof value === 'bigint') return `${value}n`;
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(item => `${pad(indentLevel + 1)}${jsLiteral(item, indentLevel + 1)}`);
        return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        const items = keys.map(key => {
            const safeKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
            return `${pad(indentLevel + 1)}${safeKey}: ${jsLiteral(value[key], indentLevel + 1)}`;
        });
        return `{\n${items.join(',\n')}\n${pad(indentLevel)}}`;
    }
    return 'null';
};

const pythonLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '    '.repeat(n);
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(item => `${pad(indentLevel + 1)}${pythonLiteral(item, indentLevel + 1)}`);
        return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        const items = keys.map(
            key => `${pad(indentLevel + 1)}${JSON.stringify(key)}: ${pythonLiteral(value[key], indentLevel + 1)}`,
        );
        return `{\n${items.join(',\n')}\n${pad(indentLevel)}}`;
    }
    return 'None';
};

const goLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '\t'.repeat(n);
    if (value === null || value === undefined) return 'nil';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]any{}';
        const items = value.map(item => `${pad(indentLevel + 1)}${goLiteral(item, indentLevel + 1)},`);
        return `[]any{\n${items.join('\n')}\n${pad(indentLevel)}}`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return 'map[string]any{}';
        const items = keys.map(
            key => `${pad(indentLevel + 1)}${JSON.stringify(key)}: ${goLiteral(value[key], indentLevel + 1)},`,
        );
        return `map[string]any{\n${items.join('\n')}\n${pad(indentLevel)}}`;
    }
    return 'nil';
};

const csharpLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '    '.repeat(n);
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return 'new object[] {}';
        const items = value.map(item => `${pad(indentLevel + 1)}${csharpLiteral(item, indentLevel + 1)}`);
        return `new object[] {\n${items.join(',\n')}\n${pad(indentLevel)}}`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return 'new Dictionary<string, object>()';
        const items = keys.map(
            key => `${pad(indentLevel + 1)}[${JSON.stringify(key)}] = ${csharpLiteral(value[key], indentLevel + 1)}`,
        );
        return `new Dictionary<string, object> {\n${items.join(',\n')}\n${pad(indentLevel)}}`;
    }
    return 'null';
};

const javaLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '    '.repeat(n);
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return String(value);
        return `${value}d`;
    }
    if (typeof value === 'bigint') return `${value}L`;
    if (Array.isArray(value)) {
        if (value.length === 0) return 'List.of()';
        const items = value.map(item => `${pad(indentLevel + 1)}${javaLiteral(item, indentLevel + 1)}`);
        return `List.of(\n${items.join(',\n')}\n${pad(indentLevel)})`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return 'Map.of()';
        // Map.of is limited; emit a readable put-chain builder style for larger objects.
        if (keys.length <= 5 && keys.every(key => typeof value[key] !== 'object' || value[key] === null)) {
            const pairs = keys.flatMap(key => [JSON.stringify(key), javaLiteral(value[key], indentLevel)]);
            return `Map.of(${pairs.join(', ')})`;
        }
        const lines = [`Map<String, Object> map = new LinkedHashMap<>();`];
        keys.forEach(key => {
            lines.push(`map.put(${JSON.stringify(key)}, ${javaLiteral(value[key], indentLevel + 1)});`);
        });
        return lines.join('\n');
    }
    return 'null';
};

const rubyLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '  '.repeat(n);
    if (value === null || value === undefined) return 'nil';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(item => `${pad(indentLevel + 1)}${rubyLiteral(item, indentLevel + 1)}`);
        return '[\n' + items.join(',\n') + `\n${pad(indentLevel)}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        const items = keys.map(
            key => `${pad(indentLevel + 1)}${JSON.stringify(key)} => ${rubyLiteral(value[key], indentLevel + 1)}`,
        );
        return '{\n' + items.join(',\n') + `\n${pad(indentLevel)}}`;
    }
    return 'nil';
};

const rustLiteral = (value: any, indentLevel = 0): string => {
    const pad = (n: number) => '    '.repeat(n);
    if (value === null || value === undefined) return 'Value::Null';
    if (typeof value === 'string') return `Value::String(${JSON.stringify(value)}.into())`;
    if (typeof value === 'boolean') return value ? 'Value::Bool(true)' : 'Value::Bool(false)';
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return `json!(${value})`;
        return `json!(${value})`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return 'json!([])';
        return `json!(${JSON.stringify(value, null, 2)})`;
    }
    if (typeof value === 'object')
        return `json!(${JSON.stringify(value, null, 2)
            .split('\n')
            .join('\n' + pad(indentLevel))})`;
    return 'Value::Null';
};

const formUrlEncoded = (value: any): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
    return Object.entries(value)
        .map(
            ([key, item]) =>
                `${key}=${encodeURIComponent(typeof item === 'object' ? JSON.stringify(item) : String(item ?? ''))}`,
        )
        .join('&\n');
};

const tomlString = (value: string): string => {
    if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
    return JSON.stringify(value);
};

const toToml = (value: any, prefix = ''): string => {
    if (value === null || value === undefined) return prefix ? `${prefix} = ""` : '';
    if (typeof value !== 'object' || Array.isArray(value)) {
        if (Array.isArray(value)) {
            const items = value.map(item =>
                typeof item === 'object'
                    ? JSON.stringify(item)
                    : typeof item === 'string'
                      ? JSON.stringify(item)
                      : String(item),
            );
            return prefix ? `${prefix} = [${items.join(', ')}]` : items.join('\n');
        }
        if (typeof value === 'string') return prefix ? `${prefix} = ${JSON.stringify(value)}` : JSON.stringify(value);
        if (typeof value === 'boolean' || typeof value === 'number')
            return prefix ? `${prefix} = ${value}` : String(value);
        return prefix ? `${prefix} = ${JSON.stringify(String(value))}` : String(value);
    }
    const lines: string[] = [];
    const scalars: string[] = [];
    const tables: Array<[string, any]> = [];
    Object.entries(value).forEach(([key, child]) => {
        if (child && typeof child === 'object' && !Array.isArray(child)) tables.push([key, child]);
        else scalars.push(toToml(child, tomlString(key)));
    });
    if (prefix) lines.push(`[${prefix}]`);
    lines.push(...scalars);
    tables.forEach(([key, child]) => {
        const next = prefix ? `${prefix}.${tomlString(key)}` : tomlString(key);
        lines.push('');
        lines.push(toToml(child, next));
    });
    return lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
};

export const EXAMPLE_ENCODINGS: ExampleEncoding[] = [
    {
        id: 'json',
        label: 'JSON',
        group: 'Wire',
        language: 'json',
        format: value => JSON.stringify(value ?? null, null, 2),
    },
    {
        id: 'yaml',
        label: 'YAML',
        group: 'Wire',
        language: 'yaml',
        format: value => jsYaml.dump(value ?? null, {noRefs: true, lineWidth: 100}),
    },
    {
        id: 'xml',
        label: 'XML',
        group: 'Wire',
        language: 'xml',
        format: (value, rootName) =>
            `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, safeIdent(rootName, 'root'))}`,
    },
    {
        id: 'form',
        label: 'Form URL-encoded',
        group: 'Wire',
        language: 'http',
        format: value => formUrlEncoded(value),
    },
    {
        id: 'toml',
        label: 'TOML',
        group: 'Data',
        language: 'plaintext',
        format: value => toToml(value),
    },
    {
        id: 'js-object',
        label: 'JavaScript object',
        group: 'Languages',
        language: 'javascript',
        format: (value, rootName) => `const ${safeIdent(rootName, 'payload')} = ${jsLiteral(value)};`,
    },
    {
        id: 'ts-as-const',
        label: 'TypeScript as const',
        group: 'Languages',
        language: 'javascript',
        format: (value, rootName) => `const ${safeIdent(rootName, 'payload')} = ${jsLiteral(value)} as const;`,
    },
    {
        id: 'python-dict',
        label: 'Python dict',
        group: 'Languages',
        language: 'python',
        format: (value, rootName) => `${safeIdent(rootName, 'payload')} = ${pythonLiteral(value)}`,
    },
    {
        id: 'php-array',
        label: 'PHP array',
        group: 'Languages',
        language: 'php',
        format: (value, rootName) => `$${safeIdent(rootName, 'payload')} = ${toPhpArray(value)};`,
    },
    {
        id: 'php-object',
        label: 'PHP object',
        group: 'Languages',
        language: 'php',
        format: (value, rootName) => `$${safeIdent(rootName, 'payload')} = ${toPhpStdClass(value)};`,
    },
    {
        id: 'php-json',
        label: 'PHP json_decode',
        group: 'Languages',
        language: 'php',
        format: (value, rootName) => {
            const json = JSON.stringify(value ?? null, null, 2)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'");
            return `$${safeIdent(rootName, 'payload')} = json_decode('${json}', true);`;
        },
    },
    {
        id: 'go-map',
        label: 'Go map',
        group: 'Languages',
        language: 'go',
        format: (value, rootName) => `${safeIdent(rootName, 'payload')} := ${goLiteral(value)}`,
    },
    {
        id: 'csharp-dict',
        label: 'C# dictionary',
        group: 'Languages',
        language: 'csharp',
        format: (value, rootName) => `var ${safeIdent(rootName, 'payload')} = ${csharpLiteral(value)};`,
    },
    {
        id: 'java-map',
        label: 'Java Map',
        group: 'Languages',
        language: 'clike',
        format: (value, rootName) => {
            const body = javaLiteral(value);
            if (body.startsWith('Map<String, Object>')) {
                return body.replace(
                    /^Map<String, Object> map/,
                    `Map<String, Object> ${safeIdent(rootName, 'payload')}`,
                );
            }
            return `var ${safeIdent(rootName, 'payload')} = ${body};`;
        },
    },
    {
        id: 'ruby-hash',
        label: 'Ruby hash',
        group: 'Languages',
        language: 'clike',
        format: (value, rootName) => `${safeIdent(rootName, 'payload')} = ${rubyLiteral(value)}`,
    },
    {
        id: 'rust-json',
        label: 'Rust serde_json',
        group: 'Languages',
        language: 'clike',
        format: (value, rootName) => {
            const json = JSON.stringify(value ?? null, null, 2);
            return `let ${safeIdent(rootName, 'payload')}: serde_json::Value = serde_json::json!(${json});`;
        },
    },
];

export const exampleEncodingOf = (id: string): ExampleEncoding =>
    EXAMPLE_ENCODINGS.find(item => item.id === id) || EXAMPLE_ENCODINGS[0];

/** Prefer a wire encoding that matches the active media type when possible. */
export const defaultExampleEncodingId = (mediaType = ''): string => {
    const normalized = (mediaType || '').toLowerCase();
    if (normalized.includes('yaml') || normalized.includes('yml')) return 'yaml';
    if (normalized.includes('xml')) return 'xml';
    if (normalized.includes('x-www-form-urlencoded')) return 'form';
    if (normalized.includes('toml')) return 'toml';
    return 'json';
};

/** Top-level property names touched by a JSON object mock (for allOf dimming). */
export const topLevelKeysOf = (value: unknown): string[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.keys(value as Record<string, unknown>);
};

export type DimmedObjectCodeOptions = {
    /**
     * Dot path to the object whose *direct* keys are judged against `activeKeys`.
     * Empty / omitted = document root (body-level allOf focus).
     * e.g. `combinedPayload` dims only nested keys under that field; siblings stay vivid.
     */
    containerPath?: string;
};

const pathSegmentsOf = (path: string): string[] =>
    String(path || '')
        .split('.')
        .map(segment => segment.replace(/\[[^\]]*\]/g, ''))
        .filter(segment => segment && segment !== '*');

const pathsEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((segment, index) => segment === b[index]);

/**
 * Marks generated JSON/YAML lines whose keys (at root, or under `containerPath`)
 * are outside `activeKeys`. Nested lines under a dimmed key inherit the dim so
 * the whole branch fades — same opacity treatment body-level allOf focus uses.
 */
export const dimmedLinesForObjectCode = (
    code: string,
    activeKeys: Set<string> | null,
    options?: DimmedObjectCodeOptions,
): number[] => {
    if (!activeKeys || activeKeys.size === 0) return [];
    const container = pathSegmentsOf(options?.containerPath || '');
    const lines = String(code || '').split('\n');
    // Prefer brace-depth scanning when the payload looks like JSON; otherwise YAML indents.
    const looksJson = lines.some(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('{') || trimmed.startsWith('[') || /^\s*"[^"]+"\s*:/.test(line);
    });
    return looksJson
        ? dimmedLinesForJsonObjectCode(lines, activeKeys, container)
        : dimmedLinesForYamlObjectCode(lines, activeKeys, container);
};

/** Body-level / nested JSON object dimming via brace depth + key path stack. */
const dimmedLinesForJsonObjectCode = (lines: string[], activeKeys: Set<string>, container: string[]): number[] => {
    const dimmed: number[] = [];
    let depth = 0;
    // path[i] is the object key entered when depth became pathDepths[i].
    const path: string[] = [];
    const pathDepths: number[] = [];
    let dimSubtreeFromDepth: number | null = null;

    const popPathToDepth = (nextDepth: number) => {
        while (pathDepths.length > 0 && pathDepths[pathDepths.length - 1] > nextDepth) {
            pathDepths.pop();
            path.pop();
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        const open = (trimmed.match(/[{[]/g) || []).length;
        const close = (trimmed.match(/[}\]]/g) || []).length;
        // Keys live on the object depth they belong to (root object → depth 1).
        const keyMatch =
            depth >= 1 || (depth === 0 && /^\s*["']?([A-Za-z0-9_-]+)/.test(line))
                ? line.match(/^\s*["']?([A-Za-z0-9_-]+)["']?\s*:/)
                : null;
        const key = keyMatch?.[1] || null;

        if (dimSubtreeFromDepth !== null) {
            dimmed.push(index + 1);
            depth = Math.max(0, depth + open - close);
            popPathToDepth(depth);
            if (depth < dimSubtreeFromDepth) dimSubtreeFromDepth = null;
            return;
        }

        if (key) {
            // Direct children of the focused container are judged; everything else stays vivid.
            const parentPath = path.slice();
            const isUnderContainer = pathsEqual(parentPath, container);
            if (isUnderContainer && !activeKeys.has(key)) {
                dimmed.push(index + 1);
                if (open > close) {
                    dimSubtreeFromDepth = depth + (open - close);
                    depth = Math.max(0, depth + open - close);
                    // Still record the path hop so deeper scans stay consistent if dim clears mid-tree.
                    path.push(key);
                    pathDepths.push(depth);
                    return;
                }
                depth = Math.max(0, depth + open - close);
                popPathToDepth(depth);
                return;
            }
            depth = Math.max(0, depth + open - close);
            if (open > close) {
                path.push(key);
                pathDepths.push(depth);
            } else {
                popPathToDepth(depth);
            }
            return;
        }

        depth = Math.max(0, depth + open - close);
        popPathToDepth(depth);
    });
    return dimmed;
};

/** YAML (js-yaml dump) dimming via indentation stack. */
const dimmedLinesForYamlObjectCode = (lines: string[], activeKeys: Set<string>, container: string[]): number[] => {
    const dimmed: number[] = [];
    // stack entries: indent of the key line that opened this object scope.
    const stack: {indent: number; key: string}[] = [];
    let dimUnderIndent: number | null = null;

    lines.forEach((line, index) => {
        if (!line.trim() || line.trim().startsWith('#')) {
            if (dimUnderIndent !== null) dimmed.push(index + 1);
            return;
        }
        const match = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:(?:\s*(.*))?$/);
        if (!match) {
            // list items / continued values inherit parent dim.
            if (dimUnderIndent !== null) {
                const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
                if (indent > dimUnderIndent) dimmed.push(index + 1);
                else dimUnderIndent = null;
            }
            return;
        }
        const indent = match[1].length;
        const key = match[2];
        const rest = (match[3] || '').trim();
        const opensNested = rest === '' || rest === '|' || rest === '>' || rest === '|-';
        rest === '>-';

        while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        if (dimUnderIndent !== null && indent <= dimUnderIndent) {
            dimUnderIndent = null;
        }
        if (dimUnderIndent !== null && indent > dimUnderIndent) {
            dimmed.push(index + 1);
            if (opensNested) stack.push({indent, key});
            return;
        }

        const parentPath = stack.map(entry => entry.key);
        if (pathsEqual(parentPath, container) && !activeKeys.has(key)) {
            dimmed.push(index + 1);
            if (opensNested) {
                dimUnderIndent = indent;
                stack.push({indent, key});
            }
            return;
        }
        if (opensNested) stack.push({indent, key});
    });
    return dimmed;
};

/**
 * Union dimmed lines for several field-level allOf focuses (path → owned keys).
 * Root/body focus should call `dimmedLinesForObjectCode` directly instead.
 */
export const dimmedLinesForFieldAllOfFocus = (
    code: string,
    fieldFocus: Map<string, Set<string>> | null | undefined,
): number[] => {
    if (!fieldFocus || fieldFocus.size === 0) return [];
    const union = new Set<number>();
    fieldFocus.forEach((activeKeys, fieldPath) => {
        if (!activeKeys || activeKeys.size === 0) return;
        dimmedLinesForObjectCode(code, activeKeys, {containerPath: fieldPath}).forEach(line => union.add(line));
    });
    return [...union].sort((a, b) => a - b);
};
