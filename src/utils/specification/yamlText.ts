import * as jsYaml from 'js-yaml';

/**
 * Helpers for loading OpenAPI descriptors from YAML text.
 *
 * Generators occasionally emit flow-style combinators without the required
 * sequence brackets, e.g.:
 *   oneOf: { type: integer }, { type: string }
 * which is invalid YAML ("found unhashable key"). OAS expects:
 *   oneOf: [{ type: integer }, { type: string }]
 */

const COMBINATOR_FLOW = /\b(oneOf|anyOf|allOf)\s*:\s*(?!\[)/g;

/** Skip a single-quoted or double-quoted scalar starting at `start`. */
const skipQuoted = (text: string, start: number): number => {
    const quote = text[start];
    let index = start + 1;
    while (index < text.length) {
        const ch = text[index];
        if (ch === '\\' && quote === '"') {
            index += 2;
            continue;
        }
        if (ch === quote) return index + 1;
        index += 1;
    }
    return text.length;
};

/**
 * Read one flow mapping `{ ... }` starting at `start` (must be `{`).
 * Nested braces inside are balanced; quotes are respected.
 */
const readFlowMap = (text: string, start: number): {end: number; body: string} | null => {
    if (text[start] !== '{') return null;
    let depth = 0;
    let index = start;
    while (index < text.length) {
        const ch = text[index];
        if (ch === '"' || ch === "'") {
            index = skipQuoted(text, index);
            continue;
        }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return {end: index + 1, body: text.slice(start, index + 1)};
        } else if (ch === '\n' || ch === '\r') {
            // Flow maps in these fixtures are single-line; a newline means we lost it.
            if (depth > 0) return null;
        }
        index += 1;
    }
    return null;
};

/**
 * When a combinator is written as adjacent flow maps separated by commas
 * (missing `[`…`]`), wrap those maps in a YAML sequence.
 * Leaves already-correct `oneOf: [ … ]` alone.
 */
export const repairYamlFlowCombinators = (text: string): string => {
    let output = '';
    let cursor = 0;
    COMBINATOR_FLOW.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = COMBINATOR_FLOW.exec(text)) !== null) {
        const keywordStart = match.index;
        const afterColon = match.index + match[0].length;
        // Only rewrite when the next non-space char is `{` (flow map, not a block).
        let scan = afterColon;
        while (scan < text.length && (text[scan] === ' ' || text[scan] === '\t')) scan += 1;
        if (text[scan] !== '{') continue;

        const maps: string[] = [];
        let pos = scan;
        while (pos < text.length) {
            while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) pos += 1;
            const map = readFlowMap(text, pos);
            if (!map) break;
            maps.push(map.body);
            pos = map.end;
            let look = pos;
            while (look < text.length && (text[look] === ' ' || text[look] === '\t')) look += 1;
            if (text[look] === ',') {
                pos = look + 1;
                continue;
            }
            break;
        }

        if (maps.length < 2) continue;

        output += text.slice(cursor, keywordStart);
        output += `${match[1]}: [${maps.join(', ')}]`;
        cursor = pos;
        COMBINATOR_FLOW.lastIndex = pos;
    }
    output += text.slice(cursor);
    return output;
};

/** Format js-yaml (or similar) parse errors with a line/column hint when available. */
export const formatYamlParseError = (error: unknown, fileHint = 'document'): string => {
    if (!error || typeof error !== 'object') {
        return `The ${fileHint} is not valid YAML or JSON.`;
    }
    const err = error as {
        name?: string;
        message?: string;
        reason?: string;
        mark?: {line?: number; column?: number};
    };
    const reason = err.reason || err.message || 'parse error';
    if (err.mark && typeof err.mark.line === 'number') {
        const line = err.mark.line + 1;
        const column = typeof err.mark.column === 'number' ? err.mark.column + 1 : undefined;
        const where = column !== undefined ? `line ${line}, column ${column}` : `line ${line}`;
        return `Invalid YAML in ${fileHint} (${where}): ${reason}`;
    }
    return `Invalid YAML or JSON in ${fileHint}: ${reason}`;
};

/**
 * Parse a specification string as JSON or YAML. Applies a small, targeted
 * repair for flow-style oneOf/anyOf/allOf that omit sequence brackets, then
 * throws a clear line-oriented error if the document is still unreadable.
 */
export const parseSpecText = (text: string): unknown => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('The specification file is empty.');
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            return JSON.parse(text);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'JSON parse error';
            throw new Error(`Invalid JSON in document: ${message}`);
        }
    }

    const candidates = [text];
    const repaired = repairYamlFlowCombinators(text);
    if (repaired !== text) candidates.push(repaired);

    let lastError: unknown;
    for (const candidate of candidates) {
        try {
            return jsYaml.load(candidate);
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(formatYamlParseError(lastError));
};
