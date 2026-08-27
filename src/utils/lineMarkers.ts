import {RECURSIVE_SCHEMA_ICON} from './schemaProperties';
import type {MockLineMarker} from './runner/mockGenerator';
import type {IndicatorIconKind} from './storage/preferences';
import {COMBINATOR_META, type CombinatorKind} from './schema/combinators';

/**
 * A gutter annotation for CodeViewer: an icon rendered beside a specific
 * line number. Markers live outside the copyable code text, so they never
 * appear in selections or clipboard copies. A line may carry several
 * markers — the gutter reserves a stable icon slot for all of them.
 */
export interface CodeLineMarkerDetailItem {
    label: string;
    /** Set when the item is a schema reference — rendered as a link. */
    schemaName?: string;
    /** True for the item the example actually expands. */
    active?: boolean;
}

/** Rich content for markers that deserve a description tooltip. */
export interface CodeLineMarkerDetails {
    title: string;
    items: CodeLineMarkerDetailItem[];
}

export interface CodeLineMarker {
    /** 1-based line number the icon belongs to. */
    line: number;
    /** Indicator family, so readers can switch it off in the settings. */
    kind?: IndicatorIconKind;
    /** Phosphor icon class, e.g. "ph ph-arrow-clockwise". Empty for dots. */
    icon?: string;
    /** Tooltip shown when hovering the icon. */
    tip: string;
    /** Optional extra class for the icon (color / emphasis). */
    className?: string;
    /** Optional theme color for the icon / active detail dots (combinator keywords). */
    accentColor?: string;
    /** When set, the icon becomes interactive (e.g. open the schema). */
    onClick?: () => void;
    /**
     * Render as the small circle after the line number instead of an icon
     * in the slot (used for required properties).
     */
    dot?: boolean;
    /** Rich content — rendered as a description tooltip (surface variant). */
    details?: CodeLineMarkerDetails;
    /** Opens a schema referenced from the details list. */
    onOpenSchema?: (schemaName: string) => void;
}

export const DEPTH_LIMIT_ICON = 'ph ph-arrow-line-down';
export const REFERENCED_SCHEMA_ICON = 'ph ph-diamonds-four';
export const BRANCH_ICON = 'ph ph-git-branch';
export const DEPRECATED_ICON = 'ph ph-warning-diamond';
export const READ_ONLY_ICON = 'ph ph-lock-simple';
export const WRITE_ONLY_ICON = 'ph ph-pencil-slash';
export const ENUM_ICON = 'ph ph-list-bullets';
export const PATTERN_ICON = 'ph ph-dna';
export const TRUNCATED_ICON = 'ph ph-scissors';
export const BINARY_ICON = 'ph ph-file-archive';
export const DIFF_ICON = 'ph ph-arrows-clockwise';

const FORMAT_ICONS: Record<string, string> = {
    date: 'ph ph-calendar-blank',
    'date-time': 'ph ph-calendar-blank',
    time: 'ph ph-clock',
    duration: 'ph ph-clock',
    uuid: 'ph ph-fingerprint',
    email: 'ph ph-envelope-simple',
    'idn-email': 'ph ph-envelope-simple',
    uri: 'ph ph-link-simple',
    url: 'ph ph-link-simple',
    'uri-reference': 'ph ph-link-simple',
    hostname: 'ph ph-globe-simple',
    ipv4: 'ph ph-globe-simple',
    ipv6: 'ph ph-globe-simple',
    int32: 'ph ph-hash',
    int64: 'ph ph-hash',
    float: 'ph ph-hash',
    double: 'ph ph-hash',
    byte: 'ph ph-file-archive',
    binary: 'ph ph-file-archive',
    password: 'ph ph-password',
};

const formatIcon = (format: string): string => FORMAT_ICONS[format] || 'ph ph-info';

const previewValues = (values: unknown[], max = 8): string => {
    const shown = values.slice(0, max).map(value => JSON.stringify(value));
    const rest = values.length - shown.length;
    return shown.join(', ') + (rest > 0 ? ` … +${rest} more` : '');
};

export interface MockMarkerOptions {
    /**
     * Invoked with the schema display name when a referenced-schema icon is
     * clicked. Wire it to whatever "open schema" means in the host surface:
     * the docs view opens the schema modal, the stacked schema modal pushes
     * the schema onto its breadcrumb stack.
     */
    onOpenSchema?: (schemaName: string) => void;
    /** Invoked with the regex when a pattern icon is clicked (Pattern Tester). */
    onTestPattern?: (pattern: string) => void;
}

/**
 * Converts the logic-level markers reported by the mock generator into
 * ready-to-render CodeViewer gutter markers. A recursive marker already
 * implies the reference, so a plain "ref" marker on the same line is
 * dropped to keep the gutter quiet.
 */
export const mockMarkersToLineMarkers = (markers: MockLineMarker[], options?: MockMarkerOptions): CodeLineMarker[] => {
    const recursiveLines = new Set(markers.filter(marker => marker.kind === 'recursive').map(marker => marker.line));
    return markers.flatMap((marker): CodeLineMarker[] => {
        const line = marker.line;
        switch (marker.kind) {
            case 'recursive':
                return [
                    {
                        line,
                        kind: 'recursive',
                        icon: RECURSIVE_SCHEMA_ICON,
                        className: 'text-[var(--primary)]',
                        tip: marker.ref
                            ? `Recursive reference to ${marker.ref} — expansion stops at the first cycle.`
                            : 'Recursive reference — expansion stops at the first cycle.',
                    },
                ];
            case 'max-depth':
                return [
                    {
                        line,
                        kind: 'depth',
                        icon: DEPTH_LIMIT_ICON,
                        className: 'text-[var(--text-muted)]',
                        tip: 'Nesting depth limit reached — deeper content is omitted from this example.',
                    },
                ];
            case 'ref': {
                if (recursiveLines.has(line)) return [];
                const ref = marker.ref;
                const openSchema = options?.onOpenSchema;
                const clickable = Boolean(ref && openSchema);
                const base = ref
                    ? marker.refOnItems
                        ? `Array items generated from referenced schema ${ref}.`
                        : `Generated from referenced schema ${ref}.`
                    : 'Generated from a referenced schema.';
                return [
                    {
                        line,
                        kind: 'reference',
                        icon: REFERENCED_SCHEMA_ICON,
                        className: 'text-[var(--accent)]',
                        tip: clickable ? `${base} Click to open ${ref}.` : base,
                        onClick: clickable && ref && openSchema ? () => openSchema(ref) : undefined,
                    },
                ];
            }
            case 'branch': {
                const branch = marker.branch;
                if (!branch) return [];
                const combinatorKind = (
                    branch.kind === 'oneOf' ||
                    branch.kind === 'anyOf' ||
                    branch.kind === 'allOf' ||
                    branch.kind === 'not'
                        ? branch.kind
                        : 'oneOf'
                ) as CombinatorKind;
                const meta = COMBINATOR_META[combinatorKind];
                return [
                    {
                        line,
                        kind: 'branch',
                        icon: meta.icon || BRANCH_ICON,
                        accentColor: meta.color,
                        tip: `${branch.kind}: example expands branch ${branch.index + 1} of ${branch.count}.`,
                        details: {
                            title: `${branch.kind} — ${branch.count} alternatives, branch ${branch.index + 1} shown`,
                            items: branch.options.map((option, optionIndex) => ({
                                label: option.label,
                                schemaName: option.schemaName,
                                active: optionIndex === branch.index,
                            })),
                        },
                        onOpenSchema: options?.onOpenSchema,
                    },
                ];
            }
            case 'deprecated':
                return [
                    {
                        line,
                        kind: 'deprecated',
                        icon: DEPRECATED_ICON,
                        className: 'text-[var(--method-put)]',
                        tip: 'Deprecated property — avoid using it in new integrations.',
                    },
                ];
            case 'read-only':
                return [
                    {
                        line,
                        kind: 'access',
                        icon: READ_ONLY_ICON,
                        className: 'text-[var(--text-muted)]',
                        tip: 'Read-only — appears in responses, ignored in requests.',
                    },
                ];
            case 'write-only':
                return [
                    {
                        line,
                        kind: 'access',
                        icon: WRITE_ONLY_ICON,
                        className: 'text-[var(--text-muted)]',
                        tip: 'Write-only — accepted in requests, never returned in responses.',
                    },
                ];
            case 'enum': {
                const values = marker.enumValues || [];
                return [
                    {
                        line,
                        kind: 'enum',
                        icon: ENUM_ICON,
                        className: 'text-[var(--accent)]',
                        tip: marker.isConst
                            ? `Constant value: ${previewValues(values, 1)}.`
                            : `Allowed values: ${previewValues(values)}.`,
                        details: {
                            title: marker.isConst ? 'Constant value' : `Allowed values (${values.length})`,
                            items: values.slice(0, 24).map(value => ({label: JSON.stringify(value)})),
                        },
                    },
                ];
            }
            case 'format':
                return [
                    {
                        line,
                        kind: 'format',
                        icon: formatIcon(marker.format || ''),
                        className: 'text-[var(--text-muted)]',
                        tip: `Format: ${marker.format}.`,
                    },
                ];
            case 'pattern': {
                const pattern = marker.pattern;
                const test = options?.onTestPattern;
                const clickable = Boolean(pattern && test);
                return [
                    {
                        line,
                        kind: 'pattern',
                        icon: PATTERN_ICON,
                        className: 'text-[var(--method-put)]',
                        tip: clickable
                            ? `Pattern-constrained: ${pattern} — click to test it.`
                            : `Pattern-constrained: ${pattern}.`,
                        onClick: clickable && pattern && test ? () => test(pattern) : undefined,
                    },
                ];
            }
            case 'required':
                return [
                    {
                        line,
                        kind: 'required',
                        dot: true,
                        tip: 'Required property.',
                    },
                ];
            default:
                return [];
        }
    });
};

/* ------------------------------------------------------------------ */
/* Response payload markers (Runner)                                  */
/* ------------------------------------------------------------------ */

/** Long base64-looking runs (with optional padding) inside a line. */
const BASE64_LINE = /["'][A-Za-z0-9+/]{96,}={0,2}["']/;

/**
 * Line-based diff: marks lines of the current text that do not appear in the
 * previous text (added or changed since the previous run). Kept O(n) with a
 * multiset of previous lines; skipped entirely for very large payloads.
 */
const changedLines = (current: string[], previousText: string): Set<number> => {
    const changed = new Set<number>();
    const budget = 4000;
    if (current.length > budget) return changed;
    const previous = previousText.split('\n');
    if (previous.length > budget) return changed;
    const pool = new Map<string, number>();
    previous.forEach(lineText => pool.set(lineText, (pool.get(lineText) || 0) + 1));
    current.forEach((lineText, index) => {
        const available = pool.get(lineText) || 0;
        if (available > 0) pool.set(lineText, available - 1);
        else if (lineText.trim() !== '') changed.add(index + 1);
    });
    return changed;
};

/**
 * Gutter markers for a Runner response payload: truncation notice on the
 * last line, encoded-binary hints, and change markers against the previous
 * response for the same endpoint.
 */
export const buildResponseLineMarkers = (
    body: string,
    options: {truncated?: boolean; previousBody?: string},
): CodeLineMarker[] => {
    const markers: CodeLineMarker[] = [];
    if (!body) return markers;
    const lines = body.split('\n');
    lines.forEach((lineText, index) => {
        if (BASE64_LINE.test(lineText))
            markers.push({
                line: index + 1,
                kind: 'binary',
                icon: BINARY_ICON,
                className: 'text-[var(--text-muted)]',
                tip: 'Looks like an encoded binary payload.',
            });
    });
    if (options.previousBody !== undefined && options.previousBody !== body) {
        changedLines(lines, options.previousBody).forEach(line =>
            markers.push({
                line,
                kind: 'diff',
                icon: DIFF_ICON,
                className: 'text-[var(--method-post)]',
                tip: 'Changed since the previous response.',
            }),
        );
    }
    if (options.truncated)
        markers.push({
            line: lines.length,
            kind: 'truncation',
            icon: TRUNCATED_ICON,
            className: 'text-[var(--method-put)]',
            tip: 'Response truncated at the size bound — the remainder was not downloaded.',
        });
    return markers;
};
