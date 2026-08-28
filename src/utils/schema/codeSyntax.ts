/**
 * Format-aware field location for interactive code overlays (oneOf pickers,
 * and later annotations). Each adapter knows how a field name is written in
 * its syntax and returns a character span the viewer can hit-test without
 * mutating the source text.
 */

export interface CodeFieldHit {
    /** 1-based line number inside the source. */
    line: number;
    /** 0-based column of the field name’s first character. */
    startColumn: number;
    /** 0-based exclusive column after the field name’s last character. */
    endColumn: number;
    fieldName: string;
}

export interface CodeSyntaxAdapter {
    id: string;
    /** True when this adapter understands the encoding id or Prism language. */
    match: (encodingOrLanguage: string) => boolean;
    /**
     * Locate the first written occurrence of `fieldName` that acts as a
     * property/key handle in this syntax. Returns null when the field is not
     * present (or not expressible) in the source.
     * `fromIndex` (string offset) skips earlier matches so nested paths can
     * walk parent → child without landing on a sibling with the same name.
     */
    findField: (code: string, fieldName: string, fromIndex?: number) => CodeFieldHit | null;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const indexToHit = (code: string, index: number, length: number, fieldName: string): CodeFieldHit => {
    const before = code.slice(0, index);
    const lines = before.split('\n');
    const startColumn = lines[lines.length - 1]?.length ?? 0;
    return {
        line: lines.length,
        startColumn,
        endColumn: startColumn + length,
        fieldName,
    };
};

/**
 * First match of `pattern`. Prefers a capture group whose text equals the
 * field name (so adapters can put whitespace/quotes in earlier groups);
 * falls back to group 1, then the full match.
 */
const firstNamedHit = (code: string, fieldName: string, pattern: RegExp, fromIndex = 0): CodeFieldHit | null => {
    const slice = fromIndex > 0 ? code.slice(fromIndex) : code;
    // Reset sticky state; patterns are created per call without /g usually.
    pattern.lastIndex = 0;
    const match = pattern.exec(slice);
    if (!match) return null;
    const base = fromIndex > 0 ? fromIndex : 0;
    // Adjust match.index relative to full code below via base offset.
    (match as RegExpExecArray & {index: number}).index = match.index + base;
    const groups = match.slice(1).filter((part): part is string => typeof part === 'string');
    const name =
        groups.find(part => part === fieldName) ||
        groups.find(part => part.length > 0 && !/^\s+$/.test(part) && part !== '"' && part !== "'") ||
        fieldName;
    const relative = match[0].indexOf(name);
    const nameIndex = match.index + (relative >= 0 ? relative : 0);
    const length = relative >= 0 ? name.length : fieldName.length;
    return indexToHit(code, nameIndex, length, fieldName);
};

const jsonLike = (id: string, languages: string[]): CodeSyntaxAdapter => ({
    id,
    match: value => {
        const normalized = value.toLowerCase();
        return languages.some(item => normalized === item || normalized.includes(item));
    },
    findField: (code, fieldName, fromIndex = 0) => {
        const escaped = escapeRegExp(fieldName);
        // "field":  or 'field':
        return firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*:`, 'm'), fromIndex);
    },
});

const bareKeyColon = (id: string, languages: string[]): CodeSyntaxAdapter => ({
    id,
    match: value => {
        const normalized = value.toLowerCase();
        return languages.some(item => normalized === item || normalized.includes(item));
    },
    findField: (code, fieldName, fromIndex = 0) => {
        const escaped = escapeRegExp(fieldName);
        // YAML / JS shorthand: field:
        return (
            firstNamedHit(code, fieldName, new RegExp(`^(\\s*)(${escaped})\\s*:`, 'm'), fromIndex) ||
            firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*:`, 'm'), fromIndex)
        );
    },
});

export const CODE_SYNTAX_ADAPTERS: CodeSyntaxAdapter[] = [
    jsonLike('json', ['json']),
    bareKeyColon('yaml', ['yaml', 'yml']),
    {
        id: 'xml',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'xml' || normalized.includes('xml') || normalized === 'markup';
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            // Prefer an opening tag <field ...> / <field/> / <field>
            return (
                firstNamedHit(code, fieldName, new RegExp(`<\\/?(${escaped})(?=[\\s/>])`), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`<(${escaped})>`), fromIndex)
            );
        },
    },
    {
        id: 'form',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'form' || normalized === 'http' || normalized.includes('form');
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            // Lookbehind keeps the delimiter out of the match so column math stays on the name.
            return firstNamedHit(code, fieldName, new RegExp(`(?<=^|&|\\n)(${escaped})=`, 'm'), fromIndex);
        },
    },
    {
        id: 'toml',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'toml' || normalized.includes('toml');
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return (
                firstNamedHit(code, fieldName, new RegExp(`^(${escaped})\\s*=`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`^\\[(?:[\\w.-]+\\.)?(${escaped})\\]\\s*$`, 'm'), fromIndex)
            );
        },
    },
    bareKeyColon('javascript', ['javascript', 'js', 'js-object', 'ts-as-const', 'typescript', 'ts']),
    {
        id: 'python',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'python' || normalized.includes('python') || normalized === 'python-dict';
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*:`, 'm'), fromIndex);
        },
    },
    {
        id: 'php',
        match: value => {
            const normalized = value.toLowerCase();
            return (
                normalized === 'php' ||
                normalized.includes('php') ||
                normalized === 'php-array' ||
                normalized === 'php-object' ||
                normalized === 'php-json'
            );
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return firstNamedHit(code, fieldName, new RegExp(`(['"])(${escaped})\\1\\s*=>`, 'm'), fromIndex);
        },
    },
    {
        id: 'go',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'go' || normalized.includes('go') || normalized === 'go-map';
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*:`, 'm'), fromIndex);
        },
    },
    {
        id: 'csharp',
        match: value => {
            const normalized = value.toLowerCase();
            return (
                normalized === 'csharp' ||
                normalized === 'cs' ||
                normalized.includes('csharp') ||
                normalized === 'csharp-dict'
            );
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            // ["field"] = ...
            return firstNamedHit(code, fieldName, new RegExp(`\\[(["'])(${escaped})\\1\\]\\s*=`, 'm'), fromIndex);
        },
    },
    {
        id: 'java',
        match: value => {
            const normalized = value.toLowerCase();
            return (
                normalized === 'java' ||
                normalized === 'java-map' ||
                normalized === 'clike' ||
                normalized.includes('java')
            );
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            // map.put("field", ...) or Map.of("field", ...)
            return (
                firstNamedHit(code, fieldName, new RegExp(`\\.put\\((["'])(${escaped})\\1\\s*,`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`Map\\.of\\((["'])(${escaped})\\1\\s*,`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*,`, 'm'), fromIndex)
            );
        },
    },
    {
        id: 'ruby',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'ruby' || normalized.includes('ruby') || normalized === 'ruby-hash';
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return (
                firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*=>`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`\\b(${escaped}):(?!:)`, 'm'), fromIndex)
            );
        },
    },
    {
        id: 'rust',
        match: value => {
            const normalized = value.toLowerCase();
            return normalized === 'rust' || normalized.includes('rust') || normalized === 'rust-json';
        },
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*:`, 'm'), fromIndex);
        },
    },
    // Generic fallback: quoted key + colon, then bare key + colon.
    {
        id: 'generic',
        match: () => true,
        findField: (code, fieldName, fromIndex = 0) => {
            const escaped = escapeRegExp(fieldName);
            return (
                firstNamedHit(code, fieldName, new RegExp(`(["'])(${escaped})\\1\\s*:`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`(['"])(${escaped})\\1\\s*=>`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`^(\\s*)(${escaped})\\s*:`, 'm'), fromIndex) ||
                firstNamedHit(code, fieldName, new RegExp(`\\b(${escaped})\\b`), fromIndex)
            );
        },
    },
];

export const codeSyntaxAdapterOf = (encodingOrLanguage: string): CodeSyntaxAdapter =>
    CODE_SYNTAX_ADAPTERS.find(adapter => adapter.id !== 'generic' && adapter.match(encodingOrLanguage)) ||
    CODE_SYNTAX_ADAPTERS[CODE_SYNTAX_ADAPTERS.length - 1];

/**
 * Resolve a schema path tail (`address.city` → `city`, `items[0]` → ``) into
 * the bare field name written in generated examples.
 */
export const fieldNameFromSchemaPath = (path: string): string => {
    const tail =
        path
            .split('.')
            .filter(Boolean)
            .at(-1)
            ?.replace(/\[[^\]]+\]/g, '')
            .replace(/\*/g, '')
            .replace(/^additionalProperties$/, '') || '';
    return tail || path;
};

/** Parent → child segments of a schema path (drops array `*` / additionalProperties). */
export const schemaPathSegments = (path: string): string[] =>
    path
        .split('.')
        .filter(Boolean)
        .map(segment => segment.replace(/\[[^\]]+\]/g, '').replace(/\*/g, ''))
        .filter(segment => segment && segment !== 'additionalProperties');

/**
 * Locate a field by its full schema path so sibling keys with the same leaf
 * name (e.g. `venue.cover_photo` vs `venue.vendor.cover_photo`) bind to the
 * correct occurrence in generated examples.
 */
export const findFieldBySchemaPath = (code: string, path: string, encodingOrLanguage = 'json'): CodeFieldHit | null => {
    const adapter = codeSyntaxAdapterOf(encodingOrLanguage);
    const segments = schemaPathSegments(path);
    if (segments.length === 0) {
        const bare = fieldNameFromSchemaPath(path);
        return bare ? adapter.findField(code, bare) : null;
    }
    let fromIndex = 0;
    let hit: CodeFieldHit | null = null;
    for (const segment of segments) {
        hit = adapter.findField(code, segment, fromIndex);
        if (!hit) return null;
        // Resume after this key so the next segment nests under it.
        const lines = code.split('\n');
        const lineText = lines[hit.line - 1] || '';
        let offset = 0;
        for (let i = 0; i < hit.line - 1; i += 1) offset += lines[i].length + 1;
        fromIndex = offset + hit.endColumn;
        // Prefer jumping past the key into its value region (colon / => / =).
        const afterKey = code.slice(fromIndex, fromIndex + 24);
        const sep = afterKey.search(/[:=>]/);
        if (sep >= 0) fromIndex += sep + 1;
    }
    return hit;
};
