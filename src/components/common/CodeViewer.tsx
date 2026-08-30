import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import Prism from 'prismjs';
import clsx from 'clsx';
import {
    COMBINATOR_META,
    combinatorActiveSurfaceStyle,
    combinatorSelectionIconClass,
} from '../../utils/schema/combinators';
import {Tip} from './Tooltip';
import DescriptionTip from '../endpoint/ExamineTab/recursive/DescriptionTip';
import ScrollableRow from './ScrollableRow';
import CustomDropdown from './CustomDropdown';
import {
    buildCodeLinePaths,
    defaultPathStyleId,
    pathForLine,
    pathStylesForEncoding,
    resolvePathStyleId,
    type CodePathStyleId,
} from '../../utils/schema/codeLinePath';
import type {CustomDropdownOption} from '../../types/ui';
import type {CodeLineMarker} from '../../utils/lineMarkers';
import {usePreferences} from '../../contexts/PreferencesContext';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-csharp';

export interface CodeInlineMenuOption {
    index: number;
    label: string;
    description?: string;
    /** Non-interactive notice (e.g. single-part allOf). */
    notice?: boolean;
}

export interface CodeInlineMenu {
    id: string;
    /** oneOf exclusive pick / anyOf multi / allOf focus — drives selection icon/color. */
    kind?: 'oneOf' | 'anyOf' | 'allOf' | 'not';
    /** Multi-select active indices (anyOf). When set, checkboxes stay open on click. */
    activeIndices?: number[];
    multiSelect?: boolean;
    line: number;
    /** 0-based start column of the field name in the source line. */
    column?: number;
    /** 0-based exclusive end column of the field name (exclusive of the caret). */
    endColumn?: number;
    /** Display name painted as the interactive handle (source style stays intact). */
    fieldName?: string;
    /** @deprecated Prefer fieldName + endColumn. Kept for older callers. */
    token?: string;
    tone?: 'property' | 'string' | 'xml' | 'default';
    activeIndex: number;
    options: CodeInlineMenuOption[];
    onSelect: (index: number) => void;
    ariaLabel?: string;
}

interface CodeViewerProps {
    code: string;
    language: string;
    maxHeight?: string;
    /**
     * When set, shows the Generated Example navbar with a copyable path for the
     * selected line (JSONPath / PHP / …). Schema generated-example only.
     */
    pathEncodingId?: string;
    /** Root identifier used in language accessors (`$payload`, `payload.a`, …). */
    pathRootName?: string;
    /**
     * Gutter annotations: icons rendered beside specific line numbers
     * (e.g. the recursion icon on a line whose value was pruned because the
     * schema references itself). Markers live outside the code text, so they
     * are never part of a selection or the copy button's payload.
     *
     * When markers are provided the code is rendered exactly as passed —
     * no JSON re-formatting — so the caller's line numbers stay correct.
     */
    lineMarkers?: CodeLineMarker[];
    inlineMenus?: CodeInlineMenu[];
    /** Line numbers render by default; pass false for chrome-less output.
     *  The reader can still switch the gutter off globally in the settings. */
    showLineNumbers?: boolean;
    /** Optional controls rendered beside the copy button (schema viewer format picker). */
    toolbarEnd?: React.ReactNode;
    /** 1-based line numbers rendered at reduced opacity (allOf focus dimming). */
    dimmedLines?: number[];
}

/**
 * Highlight a copyable path accessor using the same Prism token classes as
 * CodeViewer (property / string / number / punctuation / operator / variable /
 * function / keyword). Path styles are short expressions, not full programs, so
 * a dedicated lexer beats raw Prism grammars (JSONPath looked plain).
 */
const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const spanToken = (type: string, text: string): string => `<span class="token ${type}">${escapeHtml(text)}</span>`;

export const highlightPathAccessor = (path: string, styleId?: string | null): string => {
    const source = String(path ?? '');
    if (!source) return '';

    // Prefer a structured walk for common accessor shapes.
    const out: string[] = [];
    let i = 0;

    const peek = (n = 0) => source[i + n] || '';
    const startsWith = (s: string) => source.startsWith(s, i);

    // Leading root: $, $name, name, /
    if (source[0] === '$') {
        // PHP $var or JSONPath $
        let j = 1;
        while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
        if (j > 1) {
            out.push(spanToken('variable', source.slice(0, j)));
            i = j;
        } else {
            out.push(spanToken('keyword', '$'));
            i = 1;
        }
    }

    while (i < source.length) {
        // JS optional chain ?.
        if (startsWith('?.')) {
            out.push(spanToken('operator', '?.'));
            i += 2;
            continue;
        }
        // PHP 8 nullsafe ?->
        if (startsWith('?->')) {
            out.push(spanToken('operator', '?->'));
            i += 3;
            continue;
        }
        // PHP object ->
        if (startsWith('->')) {
            out.push(spanToken('operator', '->'));
            i += 2;
            continue;
        }
        // Ruby dig / Java get / at calls: .dig( .get( .at(
        if (source[i] === '.' && /[A-Za-z_]/.test(peek(1))) {
            // Could be .property or .method(
            let j = i + 1;
            while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
            const name = source.slice(i + 1, j);
            const isCall = source[j] === '(';
            out.push(spanToken('punctuation', '.'));
            out.push(spanToken(isCall ? 'function' : 'property', name));
            i = j;
            continue;
        }
        if (source[i] === '.') {
            out.push(spanToken('punctuation', '.'));
            i += 1;
            continue;
        }
        // XPath /
        if (source[i] === '/') {
            out.push(spanToken('punctuation', '/'));
            i += 1;
            continue;
        }
        // Bracket [ ... ]
        if (source[i] === '[') {
            out.push(spanToken('punctuation', '['));
            i += 1;
            // Ruby symbol :name
            if (source[i] === ':') {
                let j = i + 1;
                if (source[j] === "'" || source[j] === '"') {
                    const q = source[j];
                    j += 1;
                    while (j < source.length && source[j] !== q) {
                        if (source[j] === '\\') j += 2;
                        else j += 1;
                    }
                    if (source[j] === q) j += 1;
                    out.push(spanToken('symbol', source.slice(i, j)));
                    i = j;
                } else {
                    while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
                    out.push(spanToken('symbol', source.slice(i, j)));
                    i = j;
                }
                continue;
            }
            // String key
            if (source[i] === "'" || source[i] === '"') {
                const q = source[i];
                let j = i + 1;
                while (j < source.length && source[j] !== q) {
                    if (source[j] === '\\') j += 2;
                    else j += 1;
                }
                if (source[j] === q) j += 1;
                out.push(spanToken('string', source.slice(i, j)));
                i = j;
                continue;
            }
            // Number index
            if (/[0-9]/.test(source[i] || '')) {
                let j = i;
                while (j < source.length && /[0-9]/.test(source[j])) j += 1;
                out.push(spanToken('number', source.slice(i, j)));
                i = j;
                continue;
            }
            continue;
        }
        if (source[i] === ']') {
            out.push(spanToken('punctuation', ']'));
            i += 1;
            continue;
        }
        if (source[i] === '(' || source[i] === ')' || source[i] === ',') {
            out.push(spanToken('punctuation', source[i]));
            i += 1;
            // After comma, allow space
            while (source[i] === ' ') {
                out.push(' ');
                i += 1;
            }
            continue;
        }
        // Bare identifier (property after ?. or root name)
        if (/[A-Za-z_]/.test(source[i])) {
            let j = i;
            while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
            const name = source.slice(i, j);
            // form keys / bare roots
            const isCall = source[j] === '(';
            out.push(spanToken(isCall ? 'function' : 'property', name));
            i = j;
            continue;
        }
        // Ruby :symbol outside brackets
        if (source[i] === ':' && /[A-Za-z_]/.test(peek(1))) {
            let j = i + 1;
            while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
            out.push(spanToken('symbol', source.slice(i, j)));
            i = j;
            continue;
        }
        // Fallback single char
        out.push(escapeHtml(source[i]));
        i += 1;
    }

    return out.join('');
};

export function highlightCodeString(code: string, language: string): string {
    if (!code) return '';
    const lang = language.toLowerCase();
    let grammar = Prism.languages[lang];
    if (!grammar) {
        if (lang === 'js' || lang === 'javascript') {
            grammar = Prism.languages.javascript;
        } else if (lang === 'curl' || lang === 'sh' || lang === 'bash' || lang === 'shell') {
            grammar = Prism.languages.bash;
        } else if (lang === 'xml' || lang === 'html' || lang === 'markup') {
            grammar = Prism.languages.markup;
        } else if (lang === 'yaml' || lang === 'yml') {
            grammar = Prism.languages.yaml;
        } else if (lang === 'http') {
            grammar = Prism.languages.http;
        } else {
            grammar = Prism.languages.clike || {};
        }
    }
    try {
        return Prism.highlight(code, grammar, lang);
    } catch (e) {
        console.error('Prism syntax coloring failed', e);
        return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

const LINE_HEIGHT_PX = 18; /* text-xs (12px) x leading-normal (1.5) */
const PAD_TOP_PX = 16; /* p-4 / py-4 */
const PAD_LEFT_PX = 16; /* p-4 / px-4 — absolute handles sit on the padding edge */
const HANDLE_PAD_X_PX = 3; /* soft hover padding before/after the field name */
/** Private-use marker expanded to a non-selectable layout slot after field names. */
const CARET_GAP_TOKEN = '\uE000';
/**
 * Whole slot after the field (and any closing quote): leading air + caret + trailing air.
 * Kept tight — about half a character of air on each side of the phosphor caret.
 */
const CARET_SLOT_CH = 3;
/** Reserved width for the caret glyph inside the slot (ph-caret-down @ 11px ≈ 1.5ch). */
const CARET_ICON_CH = 1.5;
/** Air before the caret inside the slot (= air after, by symmetry). */
const CARET_SIDE_CH = (CARET_SLOT_CH - CARET_ICON_CH) / 2;
/**
 * Must match the CSS `tab-size` on the code surface. Absolute handles measure in `ch`,
 * so a literal `\t` (common in Go map / language encodings) has to expand the same way
 * the browser paints it or the caret drifts left of the field name.
 */
const TAB_SIZE_CH = 4;

/**
 * Column to insert the caret layout slot. Field hits cover only the bare name;
 * JSON/YAML/etc. still have a closing quote (and no more) that must stay with
 * the name so the slot — and the caret air — sit between the key and `:`.
 */
const caretSlotColumn = (line: string, endColumn: number): number => {
    let at = Math.max(0, Math.min(endColumn, line.length));
    if (at < line.length && (line[at] === '"' || line[at] === "'")) at += 1;
    return at;
};

/** Source column → visual `ch` column, expanding tabs like CSS `tab-size`. */
const visualColumnCh = (line: string, column: number): number => {
    const limit = Math.max(0, Math.min(column, line.length));
    let visual = 0;
    for (let index = 0; index < limit; index += 1) {
        if (line[index] === '\t') visual += TAB_SIZE_CH - (visual % TAB_SIZE_CH);
        else visual += 1;
    }
    return visual;
};

/* subtle odd/even striping, aligned to the text rows */
const stripeBackground = (color: string) => ({
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${LINE_HEIGHT_PX}px, ${color} ${LINE_HEIGHT_PX}px ${LINE_HEIGHT_PX * 2}px)`,
    backgroundPosition: `0 ${PAD_TOP_PX}px`,
    backgroundAttachment: 'local' as const,
});

function MarkerIcon({marker}: {marker: CodeLineMarker}) {
    const iconClass = marker.icon || '';
    const accent = marker.accentColor;
    const tipContent = marker.details ? (
        <div className="w-[min(300px,calc(100vw-64px))] max-w-full select-text space-y-2 text-[var(--text)]">
            <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {marker.details.title}
            </div>
            <ul className="space-y-0.5 text-[11px] leading-relaxed">
                {marker.details.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-center gap-1.5">
                        <span
                            className={clsx(
                                'inline-block size-1 shrink-0 rounded-full',
                                !item.active && 'bg-[var(--border)]',
                                item.active && !accent && 'bg-[var(--primary)]',
                            )}
                            style={item.active && accent ? {backgroundColor: accent} : undefined}
                        />
                        {item.schemaName && marker.onOpenSchema ? (
                            <button
                                type="button"
                                onClick={() => marker.onOpenSchema?.(item.schemaName!)}
                                className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                            >
                                <i className="ph ph-diamonds-four text-[10px]" />
                                {item.label}
                            </button>
                        ) : (
                            <span className={clsx('font-mono', item.active && 'font-bold text-[var(--text-heading)]')}>
                                {item.label}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    ) : (
        marker.tip
    );
    const icon = (
        <i
            className={clsx(
                iconClass,
                'text-[11px] leading-none',
                !accent && (marker.className || 'text-[var(--text-muted)]'),
                accent && marker.className,
            )}
            style={accent ? {color: accent} : undefined}
        />
    );
    return (
        <Tip
            content={tipContent}
            {...(marker.details ? {interactive: true, variant: 'surface' as const, closable: true} : {})}
        >
            {marker.onClick ? (
                <button
                    type="button"
                    onClick={marker.onClick}
                    className="flex items-center justify-center cursor-pointer opacity-75 hover:opacity-100 transition-opacity"
                >
                    {icon}
                </button>
            ) : (
                <span className="inline-flex items-center cursor-help opacity-75 hover:opacity-100 transition-opacity">
                    {icon}
                </span>
            )}
        </Tip>
    );
}

export default function CodeViewer({
    code,
    language,
    maxHeight,
    lineMarkers,
    inlineMenus,
    showLineNumbers: showLineNumbersProp = true,
    toolbarEnd,
    dimmedLines,
    pathEncodingId,
    pathRootName,
}: CodeViewerProps) {
    const {preferences, setPreference} = usePreferences();
    const showLineNumbers = showLineNumbersProp && preferences.codeGutterEnabled;
    const visibleMarkers = useMemo(() => {
        if (!lineMarkers?.length) return lineMarkers;
        if (!preferences.indicatorIconsEnabled) return [];
        if (!preferences.disabledIndicatorIcons.length) return lineMarkers;
        return lineMarkers.filter(marker => !marker.kind || !preferences.disabledIndicatorIcons.includes(marker.kind));
    }, [lineMarkers, preferences.indicatorIconsEnabled, preferences.disabledIndicatorIcons]);
    const [copied, setCopied] = useState(false);
    const [openInlineMenuId, setOpenInlineMenuId] = useState<string | null>(null);
    const [selectedLine, setSelectedLine] = useState<number | null>(null);
    const [pathCopied, setPathCopied] = useState(false);
    const [pathStyleId, setPathStyleId] = useState<CodePathStyleId | null>(() => {
        const saved = preferences.lastPathStyleId;
        return saved ? (saved as CodePathStyleId) : null;
    });
    const [menuPosition, setMenuPosition] = useState<{top: number; left: number; openAbove: boolean} | null>(null);
    const viewerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const codeRef = useRef<HTMLElement>(null);
    const codeBarRef = useRef<HTMLDivElement>(null);
    const gutterBarRef = useRef<HTMLDivElement>(null);
    const handleRefs = useRef(new Map<string, HTMLButtonElement>());
    const menuRef = useRef<HTMLDivElement>(null);

    const preparedInlineMenus = useMemo(() => {
        const source = String(code ?? '');
        const menus = (inlineMenus || []).map(menu => ({...menu}));
        const sourceLines = source.split('\n');
        // Legacy token path: locate injected placeholders and strip them so
        // older callers keep working while the new adapters land.
        menus.forEach(menu => {
            if (typeof menu.column === 'number' && typeof menu.endColumn === 'number') return;
            if (!menu.token) return;
            for (let index = 0; index < sourceLines.length; index += 1) {
                const column = sourceLines[index].indexOf(menu.token);
                if (column >= 0) {
                    menu.line = index + 1;
                    menu.column = column;
                    menu.endColumn = column;
                    break;
                }
            }
        });
        let clean = source;
        menus.forEach(menu => {
            if (menu.token) clean = clean.split(menu.token).join('');
        });
        // Reserve a real layout slot after each interactive field so the caret
        // has air on both sides. The slot is a private-use token in the display
        // stream (one character → CARET_SLOT_CH via CSS), never selectable and
        // stripped from copy so the clipboard stays pure source.
        const lines = clean.split('\n');
        const byLine = new Map<number, typeof menus>();
        menus.forEach(menu => {
            if (!Number.isInteger(menu.line) || typeof menu.endColumn !== 'number') return;
            const bucket = byLine.get(menu.line) || [];
            bucket.push(menu);
            byLine.set(menu.line, bucket);
        });
        byLine.forEach((bucket, line) => {
            const lineIndex = line - 1;
            if (lineIndex < 0 || lineIndex >= lines.length) return;
            // Right-to-left so earlier columns stay valid as we insert.
            const ordered = [...bucket].sort((a, b) => (b.endColumn ?? 0) - (a.endColumn ?? 0));
            let text = lines[lineIndex];
            ordered.forEach(menu => {
                const at = caretSlotColumn(text, menu.endColumn ?? 0);
                if (at < 0 || at > text.length) return;
                text = `${text.slice(0, at)}${CARET_GAP_TOKEN}${text.slice(at)}`;
            });
            lines[lineIndex] = text;
        });
        return {displayCode: lines.join('\n'), copyCode: clean, menus};
    }, [code, inlineMenus]);

    let displayCode = preparedInlineMenus.displayCode;
    let copyCode = preparedInlineMenus.copyCode;
    // Inline menu columns are measured against the source as given. Re-indenting
    // JSON would shift every field and leave the handles stranded.
    if (language.toLowerCase() === 'json' && lineMarkers === undefined && preparedInlineMenus.menus.length === 0) {
        try {
            const obj = typeof copyCode === 'string' ? JSON.parse(copyCode) : copyCode;
            displayCode = JSON.stringify(obj, null, 4);
            copyCode = displayCode;
        } catch {}
    }
    const handleCopy = () => {
        navigator.clipboard.writeText(copyCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const highlightedHtml = useMemo(() => {
        const raw = highlightCodeString(displayCode, language);
        // Expand caret slots after Prism so the marker is never tokenised as code.
        const gapHtml = `<span class="odui-caret-gap" aria-hidden="true" style="display:inline-block;width:${CARET_SLOT_CH}ch;user-select:none;-webkit-user-select:none;vertical-align:baseline"></span>`;
        return raw.split(CARET_GAP_TOKEN).join(gapHtml);
    }, [displayCode, language]);

    const lineCount = useMemo(() => Math.max(1, displayCode.split('\n').length), [displayCode]);
    const pathStyleOptions = useMemo((): CustomDropdownOption[] => {
        if (!pathEncodingId) return [];
        return pathStylesForEncoding(pathEncodingId).map(style => ({
            value: style.id,
            label: style.label,
            description: style.example,
        }));
    }, [pathEncodingId]);

    const activePathStyleId = useMemo(() => {
        if (!pathEncodingId) return null;
        return resolvePathStyleId(pathEncodingId, pathStyleId);
    }, [pathEncodingId, pathStyleId]);

    const linePaths = useMemo(() => {
        if (!pathEncodingId || !activePathStyleId) return null;
        // Walk the clean copy source (no caret-gap tokens). Combinator field
        // lines inject a private-use slot into displayCode for the inline menu
        // handle; that breaks JSON/language key parsing and left oneOf/allOf/
        // anyOf/not field lines without a path. copyCode stays pure source and
        // keeps the same line count as displayCode.
        return buildCodeLinePaths(copyCode, pathEncodingId, pathRootName, activePathStyleId);
    }, [copyCode, pathEncodingId, pathRootName, activePathStyleId]);
    const selectedPath = linePaths && selectedLine ? pathForLine(linePaths, selectedLine) : '';
    const selectedPathHtml = useMemo(() => {
        if (!selectedPath) return '';
        return highlightPathAccessor(selectedPath, activePathStyleId);
    }, [selectedPath, activePathStyleId]);

    useEffect(() => {
        // Reset selection when the example/format changes; keep path style if still valid.
        setSelectedLine(null);
        setPathCopied(false);
        if (pathEncodingId) {
            setPathStyleId(current => resolvePathStyleId(pathEncodingId, current || preferences.lastPathStyleId));
        } else {
            setPathStyleId(null);
        }
    }, [displayCode, pathEncodingId, preferences.lastPathStyleId]);

    const handlePathStyleChange = useCallback(
        (value: string) => {
            const next = value as CodePathStyleId;
            setPathStyleId(next);
            setPreference('lastPathStyleId', next);
        },
        [setPreference],
    );

    // Track pointer down so a text-drag mouseup is not treated as a path-line click.
    // setSelectedLine re-renders the code spans and would wipe the native selection.
    const pathPointerRef = useRef<{x: number; y: number; dragged: boolean} | null>(null);

    const handlePathPointerDown = useCallback(
        (event: React.MouseEvent) => {
            if (!pathEncodingId) return;
            if (event.button !== 0) return;
            pathPointerRef.current = {x: event.clientX, y: event.clientY, dragged: false};
        },
        [pathEncodingId],
    );

    const handleSelectLine = useCallback(
        (event: React.MouseEvent) => {
            if (!pathEncodingId) return;
            // Ignore clicks that open combinator menus / path chrome.
            if ((event.target as HTMLElement | null)?.closest('button')) return;

            const pointer = pathPointerRef.current;
            pathPointerRef.current = null;
            if (pointer) {
                const dx = Math.abs(event.clientX - pointer.x);
                const dy = Math.abs(event.clientY - pointer.y);
                if (pointer.dragged || dx > 4 || dy > 4) return;
            }

            // A non-collapsed DOM selection means the user just finished selecting text —
            // do not steal it for path chrome (and do not re-render away the last line).
            const domSelection = window.getSelection();
            if (domSelection && !domSelection.isCollapsed && (domSelection.toString() || '').length > 0) {
                return;
            }

            const scroller = scrollRef.current;
            if (!scroller) return;
            const rect = scroller.getBoundingClientRect();
            const y = event.clientY - rect.top + scroller.scrollTop - PAD_TOP_PX;
            const index = Math.floor(y / LINE_HEIGHT_PX);
            if (index < 0 || index >= lineCount) return;
            const line = index + 1;
            setSelectedLine(current => (current === line ? null : line));
        },
        [pathEncodingId, lineCount],
    );

    const handleCopyPath = useCallback(() => {
        if (!selectedPath) return;
        void navigator.clipboard.writeText(selectedPath);
        setPathCopied(true);
        window.setTimeout(() => setPathCopied(false), 1600);
    }, [selectedPath]);

    const dimmedLineSet = useMemo(() => new Set(dimmedLines || []), [dimmedLines]);
    const highlightedLines = useMemo(() => {
        // Split after highlight so each row can carry its own opacity for allOf focus.
        const parts = highlightedHtml.split('\n');
        while (parts.length < lineCount) parts.push('');
        return parts.slice(0, lineCount);
    }, [highlightedHtml, lineCount]);
    const markersByLine = useMemo(() => {
        const map = new Map<number, CodeLineMarker[]>();
        (visibleMarkers || []).forEach(marker => {
            if (!Number.isInteger(marker.line) || marker.line < 1 || marker.line > lineCount) return;
            const bucket = map.get(marker.line);
            if (bucket) bucket.push(marker);
            else map.set(marker.line, [marker]);
        });
        return map;
    }, [visibleMarkers, lineCount]);
    /* The icon holder is a fixed-width slot sized for the busiest line, so
       numbers stay aligned no matter how many indicators a line carries.
       Dot markers render after the number and do not occupy the slot. */
    const maxIconsPerLine = useMemo(() => {
        let max = 0;
        markersByLine.forEach(bucket => {
            const icons = bucket.filter(marker => !marker.dot).length;
            if (icons > max) max = icons;
        });
        return max;
    }, [markersByLine]);
    const iconSlotWidth = maxIconsPerLine > 0 ? maxIconsPerLine * 15 : 0;
    const gutterDigits = String(lineCount).length;

    /* Ctrl/Cmd+A inside the viewer selects only this code block. */
    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            const codeEl = codeRef.current;
            if (!codeEl) return;
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(codeEl);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }, []);

    /* Subtle full-row hover highlight, driven without re-renders. */
    const handleMouseMove = useCallback(
        (event: React.MouseEvent) => {
            const pointer = pathPointerRef.current;
            if (pointer && !pointer.dragged) {
                if (Math.abs(event.clientX - pointer.x) > 4 || Math.abs(event.clientY - pointer.y) > 4) {
                    pointer.dragged = true;
                }
            }
            const scroller = scrollRef.current;
            const codeBar = codeBarRef.current;
            const gutterBar = gutterBarRef.current;
            if (!scroller || !codeBar) return;
            const rect = scroller.getBoundingClientRect();
            const y = event.clientY - rect.top + scroller.scrollTop - PAD_TOP_PX;
            const line = Math.floor(y / LINE_HEIGHT_PX);
            if (line < 0 || line >= lineCount) {
                codeBar.style.opacity = '0';
                if (gutterBar) gutterBar.style.opacity = '0';
                return;
            }
            const top = `${PAD_TOP_PX + line * LINE_HEIGHT_PX}px`;
            codeBar.style.opacity = '1';
            codeBar.style.top = top;
            codeBar.style.width = `${scroller.scrollWidth}px`;
            if (gutterBar) {
                gutterBar.style.opacity = '1';
                gutterBar.style.top = top;
            }
        },
        [lineCount],
    );
    const handleMouseLeave = useCallback(() => {
        if (codeBarRef.current) codeBarRef.current.style.opacity = '0';
        if (gutterBarRef.current) gutterBarRef.current.style.opacity = '0';
    }, []);
    const visibleInlineMenus = useMemo(
        () =>
            preparedInlineMenus.menus.filter(
                menu =>
                    Number.isInteger(menu.line) &&
                    menu.line >= 1 &&
                    menu.line <= lineCount &&
                    menu.options.length > 0 &&
                    typeof menu.column === 'number',
            ),
        [preparedInlineMenus, lineCount],
    );

    const updateMenuPosition = useCallback(() => {
        if (!openInlineMenuId) {
            setMenuPosition(null);
            return;
        }
        const handle = handleRefs.current.get(openInlineMenuId);
        if (!handle) {
            setMenuPosition(null);
            return;
        }
        const rect = handle.getBoundingClientRect();
        const menuHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openAbove = spaceBelow < menuHeight && rect.top > spaceBelow;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280));
        setMenuPosition({
            top: openAbove ? rect.top - 4 : rect.bottom + 4,
            left,
            openAbove,
        });
    }, [openInlineMenuId]);

    useLayoutEffect(() => {
        updateMenuPosition();
    }, [updateMenuPosition, visibleInlineMenus]);

    useEffect(() => {
        if (!openInlineMenuId) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            // Portaled menu is outside the viewer; keep it open when pressing inside.
            if (menuRef.current?.contains(target)) return;
            // Description tips portal above the menu — don't dismiss on tip interaction.
            if (target instanceof Element && target.closest('[role="tooltip"]')) return;
            // Let the field handle's own onClick toggle — don't pre-dismiss here or the
            // subsequent click would reopen the menu and make it feel stuck.
            for (const handle of handleRefs.current.values()) {
                if (handle.contains(target)) return;
            }
            // Any other press — including empty code surface inside the viewer — dismisses.
            setOpenInlineMenuId(null);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenInlineMenuId(null);
        };
        const handleReposition = () => updateMenuPosition();
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleReposition);
        // Capture scroll from the code scroller and any outer pane.
        window.addEventListener('scroll', handleReposition, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleReposition);
            window.removeEventListener('scroll', handleReposition, true);
        };
    }, [openInlineMenuId, updateMenuPosition]);

    const openMenu = visibleInlineMenus.find(menu => menu.id === openInlineMenuId) || null;

    const menuPortal =
        openMenu && menuPosition && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={menuRef}
                      role="menu"
                      className="fixed z-[999999] flex min-w-[220px] max-w-[280px] flex-col gap-1 overflow-hidden rounded-xl border bg-[var(--surface)] p-1.5 shadow-2xl border-[var(--border)]"
                      style={{
                          top: menuPosition.top,
                          left: menuPosition.left,
                          transform: menuPosition.openAbove ? 'translateY(-100%)' : undefined,
                      }}
                  >
                      {openMenu.options.map(option => {
                          const combinatorKind =
                              openMenu.kind === 'allOf'
                                  ? 'allOf'
                                  : openMenu.kind === 'anyOf'
                                    ? 'anyOf'
                                    : openMenu.kind === 'not'
                                      ? 'not'
                                      : 'oneOf';
                          const meta = COMBINATOR_META[combinatorKind];
                          const branchOptionCount = openMenu.options.filter(item => item.index >= 0).length;
                          const active = openMenu.multiSelect
                              ? option.index < 0
                                  ? (openMenu.activeIndices?.length || 0) >= branchOptionCount
                                  : (openMenu.activeIndices || []).includes(option.index)
                              : openMenu.activeIndex === option.index;
                          if (option.notice) {
                              return (
                                  <div
                                      key={`${openMenu.id}:notice:${option.index}`}
                                      className="flex w-full items-start gap-2 rounded-lg border border-[var(--border)]/70 bg-[var(--background)] px-2.5 py-2 text-left text-[var(--text-muted)]"
                                  >
                                      <span className="mt-0.5 flex h-[14px] w-[14px] shrink-0 items-center justify-center">
                                          <i className="ph ph-info text-[14px]" style={{color: meta.color}} />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                          <span className="block text-[11px] font-semibold text-[var(--text-heading)]">
                                              {option.label}
                                          </span>
                                          {option.description ? (
                                              <span className="mt-0.5 block text-[9px] leading-snug text-[var(--text-muted)]">
                                                  {option.description}
                                              </span>
                                          ) : null}
                                      </span>
                                  </div>
                              );
                          }
                          const labelRow = (
                              <span className="flex min-w-0 flex-1 items-center gap-1">
                                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
                                      {option.label}
                                  </span>
                                  {option.description ? (
                                      <span
                                          className="shrink-0"
                                          onClick={event => event.stopPropagation()}
                                          onMouseDown={event => event.stopPropagation()}
                                      >
                                          <DescriptionTip
                                              documents={[{text: option.description}]}
                                              fieldLabel={option.label}
                                          />
                                      </span>
                                  ) : null}
                              </span>
                          );
                          return (
                              <button
                                  key={`${openMenu.id}:${option.index}`}
                                  type="button"
                                  role="menuitem"
                                  onMouseDown={event => event.preventDefault()}
                                  onClick={() => {
                                      openMenu.onSelect(option.index);
                                      // anyOf multi-select stays open so several boxes can be toggled.
                                      if (!openMenu.multiSelect) setOpenInlineMenuId(null);
                                  }}
                                  className={clsx(
                                      'flex w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors',
                                      !active && 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                  )}
                                  style={combinatorActiveSurfaceStyle(combinatorKind, active)}
                              >
                                  <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center">
                                      <i
                                          className={clsx(
                                              combinatorSelectionIconClass(combinatorKind, active),
                                              'text-[14px]',
                                          )}
                                          style={active ? {color: meta.color} : undefined}
                                      />
                                  </span>
                                  {labelRow}
                              </button>
                          );
                      })}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div
            ref={viewerRef}
            className="relative group rounded-xl border font-mono text-xs overflow-hidden leading-normal animate-in fade-in duration-100 bg-[var(--background)] border-[var(--border)]"
        >
            <div className="px-4 py-1.5 border-b flex items-center justify-between gap-2 bg-[var(--surface-hover)] border-[var(--border)]">
                <span className="text-[10px] uppercase font-bold tracking-wider font-sans select-none text-[var(--text-muted)]">
                    {language}
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                    {toolbarEnd ? <div className="min-w-0">{toolbarEnd}</div> : null}

                    <button
                        onClick={handleCopy}
                        className={clsx(
                            'px-2 py-0.5 rounded-md text-[10px] font-sans flex items-center gap-1.5 transition-all cursor-pointer border hover:bg-[var(--background)] bg-[var(--surface)] border-[var(--border)]',
                            copied ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]',
                        )}
                    >
                        {copied ? (
                            <>
                                <i className="ph ph-check text-[10px] text-[var(--method-get)]"></i>
                                <span className="text-[var(--method-get)] font-bold">Copied!</span>
                            </>
                        ) : (
                            <>
                                <i className="ph ph-copy text-[14px]"></i>
                                <span className="font-semibold">Copy</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {pathEncodingId ? (
                <div
                    className="group/path-nav flex h-10 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3"
                    onClick={event => event.stopPropagation()}
                    onMouseDown={event => event.stopPropagation()}
                >
                    <CustomDropdown
                        value={activePathStyleId || defaultPathStyleId(pathEncodingId)}
                        onChange={handlePathStyleChange}
                        options={pathStyleOptions}
                        className="w-auto max-w-[9.5rem] shrink-0"
                        triggerClassName="flex h-7 w-auto min-w-0 items-center justify-between gap-1 px-1.5 rounded-md text-[10px] font-sans font-black uppercase tracking-wider cursor-pointer border transition-all select-none hover:bg-[var(--background)] bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] focus:outline-none"
                        ariaLabel="Path accessor style"
                    />
                    <div className="flex h-7 min-w-0 flex-1 items-center gap-1">
                        <div className="flex h-7 min-w-0 flex-1 items-center overflow-hidden">
                            {selectedPath ? (
                                <ScrollableRow className="font-mono text-[11px] leading-[18px]">
                                    <code
                                        className="select-all whitespace-nowrap text-[var(--text-heading)]"
                                        dangerouslySetInnerHTML={{__html: selectedPathHtml}}
                                    />
                                </ScrollableRow>
                            ) : (
                                <span className="font-sans text-[10px] font-medium italic leading-[18px] text-[var(--text-muted)]">
                                    Click a line to inspect its path
                                </span>
                            )}
                        </div>
                        {/* Always reserve the copy slot so selection does not resize the navbar. */}
                        <div className="flex size-7 shrink-0 items-center justify-center">
                            {selectedPath ? (
                                <Tip content={pathCopied ? 'Copied' : 'Copy path'}>
                                    <button
                                        type="button"
                                        aria-label="Copy path"
                                        onClick={handleCopyPath}
                                        className={clsx(
                                            'flex size-7 items-center justify-center rounded text-xs transition-all cursor-pointer select-none',
                                            'opacity-0 pointer-events-none group-hover/path-nav:opacity-100 group-hover/path-nav:pointer-events-auto',
                                            'focus-visible:opacity-100 focus-visible:pointer-events-auto focus:outline-none',
                                            pathCopied
                                                ? 'text-[var(--method-get)]'
                                                : 'text-[var(--text-muted)] hover:text-[var(--primary)]',
                                        )}
                                    >
                                        {pathCopied ? (
                                            <i className="ph ph-check text-[var(--method-get)] text-[11px]" />
                                        ) : (
                                            <i className="ph ph-copy text-[11px]" />
                                        )}
                                    </button>
                                </Tip>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
            <div className="min-w-0">
                <div
                    ref={scrollRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onMouseDown={handlePathPointerDown}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleSelectLine}
                    className={clsx(
                        'relative overflow-auto scrollbar-thin outline-none',
                        pathEncodingId && 'cursor-text',
                    )}
                    style={{
                        maxHeight: maxHeight || '450px',
                        ...stripeBackground('color-mix(in srgb, var(--text) 3%, transparent)'),
                    }}
                >
                    <div className="flex min-h-full min-w-full w-max items-stretch">
                        <div
                            ref={codeBarRef}
                            aria-hidden="true"
                            className="pointer-events-none absolute left-0 z-0 opacity-0 transition-opacity duration-75"
                            style={{
                                height: `${LINE_HEIGHT_PX}px`,
                                top: `${PAD_TOP_PX}px`,
                                backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                            }}
                        />
                        {showLineNumbers && (
                            <div className="sticky left-0 z-20 shrink-0">
                                <div
                                    aria-hidden="true"
                                    className="select-none sticky left-0 z-20 shrink-0 py-4 pl-2 pr-2.5 border-r bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)] relative"
                                    style={stripeBackground('color-mix(in srgb, var(--text) 3%, transparent)')}
                                >
                                    <div
                                        ref={gutterBarRef}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-x-0 z-0 opacity-0 transition-opacity duration-75"
                                        style={{
                                            height: `${LINE_HEIGHT_PX}px`,
                                            top: `${PAD_TOP_PX}px`,
                                            backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                                        }}
                                    />
                                    {Array.from({length: lineCount}, (_, index) => {
                                        const line = index + 1;
                                        const bucket = markersByLine.get(line);
                                        const icons = bucket?.filter(marker => !marker.dot);
                                        const dot = bucket?.find(marker => marker.dot);
                                        return (
                                            <div key={line} className="relative z-[1] flex h-[1.5em] items-center">
                                                {iconSlotWidth > 0 && (
                                                    <span
                                                        className="flex items-center justify-start gap-[3px] shrink-0"
                                                        style={{width: `${iconSlotWidth}px`}}
                                                    >
                                                        {icons?.map((marker, markerIndex) => (
                                                            <MarkerIcon key={markerIndex} marker={marker} />
                                                        ))}
                                                    </span>
                                                )}
                                                <span
                                                    className={clsx(
                                                        'inline-block text-right text-[10px] pl-1.5 ml-auto',
                                                        pathEncodingId && selectedLine === line
                                                            ? 'font-bold text-[var(--primary)] opacity-100'
                                                            : 'opacity-70',
                                                    )}
                                                    style={{minWidth: `${gutterDigits}ch`}}
                                                >
                                                    {line}
                                                </span>
                                                {dot ? (
                                                    <Tip content={dot.tip}>
                                                        <span className="ml-1 inline-flex h-[10px] w-[10px] shrink-0 items-center justify-center cursor-help text-[var(--method-delete)]">
                                                            <i className="ph-bold ph-asterisk text-[8px] leading-none" />
                                                        </span>
                                                    </Tip>
                                                ) : (
                                                    <span className="ml-1 inline-flex h-[10px] w-[10px] shrink-0 items-center justify-center text-transparent">
                                                        <i className="ph-bold ph-asterisk text-[8px] leading-none" />
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="relative z-0 min-w-0 flex-1">
                            <pre className="relative z-0 p-4 flex-1" style={{tabSize: TAB_SIZE_CH}}>
                                {pathEncodingId
                                    ? Array.from({length: lineCount}, (_, index) => {
                                          const line = index + 1;
                                          const selected = selectedLine === line;
                                          return (
                                              <div
                                                  key={`line-select-${line}`}
                                                  aria-hidden="true"
                                                  className="pointer-events-none absolute left-0 z-0 box-border"
                                                  style={{
                                                      height: `${LINE_HEIGHT_PX}px`,
                                                      top: `${PAD_TOP_PX + index * LINE_HEIGHT_PX}px`,
                                                      width: '100%',
                                                      borderLeft: selected
                                                          ? '2px solid var(--primary)'
                                                          : '2px solid transparent',
                                                      backgroundColor: selected
                                                          ? 'color-mix(in srgb, var(--text) 5%, transparent)'
                                                          : undefined,
                                                  }}
                                              />
                                          );
                                      })
                                    : null}
                                {visibleInlineMenus.map(menu => {
                                    const open = openInlineMenuId === menu.id;
                                    const start = Math.max(0, menu.column ?? 0);
                                    const end = Math.max(start, menu.endColumn ?? start);
                                    const nameWidthCh = Math.max(1, end - start);
                                    // Include a closing quote when the source has one so the handle's
                                    // caret slot lines up with the non-selectable layout gap (which is
                                    // inserted after that quote, not between name and quote).
                                    const sourceLine =
                                        preparedInlineMenus.copyCode.split('\n')[(menu.line || 1) - 1] || '';
                                    const closingQuoteCh =
                                        end < sourceLine.length && (sourceLine[end] === '"' || sourceLine[end] === "'")
                                            ? 1
                                            : 0;
                                    // Tabs (Go map, etc.) are one source column but many painted `ch` —
                                    // place the handle with the expanded visual column.
                                    const visualStartCh = visualColumnCh(sourceLine, start);
                                    // Hover covers the field name + closing quote (with soft side pads).
                                    // The caret sits inside the non-selectable layout slot after that,
                                    // with equal air before and after the glyph.
                                    return (
                                        <div
                                            key={menu.id}
                                            className="absolute z-20 select-none"
                                            style={{
                                                top: `${PAD_TOP_PX + (menu.line - 1) * LINE_HEIGHT_PX}px`,
                                                left: `calc(${PAD_LEFT_PX}px + ${visualStartCh}ch - ${HANDLE_PAD_X_PX}px)`,
                                                height: `${LINE_HEIGHT_PX}px`,
                                            }}
                                        >
                                            <div className="h-full">
                                                <button
                                                    ref={node => {
                                                        if (node) handleRefs.current.set(menu.id, node);
                                                        else handleRefs.current.delete(menu.id);
                                                    }}
                                                    type="button"
                                                    onMouseDown={event => {
                                                        // Keep the click from starting a text selection on the overlay.
                                                        event.preventDefault();
                                                    }}
                                                    onClick={() =>
                                                        setOpenInlineMenuId(current =>
                                                            current === menu.id ? null : menu.id,
                                                        )
                                                    }
                                                    className={clsx(
                                                        'group/handle relative inline-flex h-full items-center rounded-sm border-0 bg-transparent py-0 text-left cursor-pointer select-none',
                                                        'focus-visible:outline-none',
                                                    )}
                                                    style={
                                                        {
                                                            paddingLeft: HANDLE_PAD_X_PX,
                                                            paddingRight: 0,
                                                            // Soft wash uses the branch keyword color (oneOf orange / allOf blue).
                                                            backgroundColor: open
                                                                ? `color-mix(in srgb, ${COMBINATOR_META[menu.kind === 'allOf' ? 'allOf' : menu.kind === 'anyOf' ? 'anyOf' : menu.kind === 'not' ? 'not' : 'oneOf'].color} 12%, transparent)`
                                                                : undefined,
                                                        } as React.CSSProperties
                                                    }
                                                    onMouseEnter={event => {
                                                        if (open) return;
                                                        const color =
                                                            COMBINATOR_META[
                                                                menu.kind === 'allOf'
                                                                    ? 'allOf'
                                                                    : menu.kind === 'anyOf'
                                                                      ? 'anyOf'
                                                                      : menu.kind === 'not'
                                                                        ? 'not'
                                                                        : 'oneOf'
                                                            ].color;
                                                        (
                                                            event.currentTarget as HTMLButtonElement
                                                        ).style.backgroundColor =
                                                            `color-mix(in srgb, ${color} 10%, transparent)`;
                                                    }}
                                                    onMouseLeave={event => {
                                                        if (open) return;
                                                        (
                                                            event.currentTarget as HTMLButtonElement
                                                        ).style.backgroundColor = open
                                                            ? `color-mix(in srgb, ${COMBINATOR_META[menu.kind === 'allOf' ? 'allOf' : menu.kind === 'anyOf' ? 'anyOf' : menu.kind === 'not' ? 'not' : 'oneOf'].color} 12%, transparent)`
                                                            : '';
                                                    }}
                                                    aria-label={menu.ariaLabel || 'Select schema branch'}
                                                    aria-haspopup="menu"
                                                    aria-expanded={open}
                                                >
                                                    {/* Field name (+ closing quote). Soft hover pad is paddingLeft only —
                                            the caret slot supplies the air after the name, so this span
                                            must end exactly on the quote. */}
                                                    <span
                                                        aria-hidden="true"
                                                        className="block h-full shrink-0"
                                                        style={{
                                                            width: `calc(${nameWidthCh + closingQuoteCh}ch)`,
                                                        }}
                                                        data-dev="CodeViewer.handleNameSpan"
                                                    />
                                                    {/* Leading air inside the reserved slot (matches trailing air after caret). */}
                                                    <span
                                                        aria-hidden="true"
                                                        className="block h-full shrink-0"
                                                        style={{width: `calc(${CARET_SIDE_CH}ch)`}}
                                                        data-dev="CodeViewer.handleLeadingAir"
                                                    />
                                                    <span
                                                        aria-hidden="true"
                                                        className="pointer-events-none relative inline-flex h-full shrink-0 items-center justify-center select-none opacity-80 group-hover/handle:opacity-100"
                                                        style={{
                                                            width: `calc(${CARET_ICON_CH}ch)`,
                                                            color: COMBINATOR_META[
                                                                menu.kind === 'allOf'
                                                                    ? 'allOf'
                                                                    : menu.kind === 'anyOf'
                                                                      ? 'anyOf'
                                                                      : menu.kind === 'not'
                                                                        ? 'not'
                                                                        : 'oneOf'
                                                            ].color,
                                                        }}
                                                        data-dev="CodeViewer.handleCaretIcon"
                                                    >
                                                        <i className="ph-fill ph-caret-down text-[11px] leading-none" />
                                                    </span>
                                                    {/* Trailing slot air + soft hover pad past the layout gap. */}
                                                    <span
                                                        aria-hidden="true"
                                                        className="block h-full shrink-0"
                                                        style={{
                                                            width: `calc(${CARET_SIDE_CH}ch + ${HANDLE_PAD_X_PX}px)`,
                                                        }}
                                                        data-dev="CodeViewer.handleTrailingAir"
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                <code ref={codeRef} className="block">
                                    {pathEncodingId || dimmedLineSet.size > 0 ? (
                                        highlightedLines.map((lineHtml, index) => (
                                            <span key={index}>
                                                <span
                                                    className={clsx(dimmedLineSet.has(index + 1) && 'opacity-35')}
                                                    dangerouslySetInnerHTML={{__html: lineHtml}}
                                                />
                                                {index < highlightedLines.length - 1 ? '\n' : null}
                                            </span>
                                        ))
                                    ) : (
                                        <span dangerouslySetInnerHTML={{__html: highlightedHtml}} />
                                    )}
                                </code>
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
            {menuPortal}
        </div>
    );
}
