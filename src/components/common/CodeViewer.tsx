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
import Markdown from './Markdown';
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
}: CodeViewerProps) {
    const {preferences} = usePreferences();
    const showLineNumbers = showLineNumbersProp && preferences.codeGutterEnabled;
    const visibleMarkers = useMemo(() => {
        if (!lineMarkers?.length) return lineMarkers;
        if (!preferences.indicatorIconsEnabled) return [];
        if (!preferences.disabledIndicatorIcons.length) return lineMarkers;
        return lineMarkers.filter(marker => !marker.kind || !preferences.disabledIndicatorIcons.includes(marker.kind));
    }, [lineMarkers, preferences.indicatorIconsEnabled, preferences.disabledIndicatorIcons]);
    const [copied, setCopied] = useState(false);
    const [openInlineMenuId, setOpenInlineMenuId] = useState<string | null>(null);
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
                                      <Tip
                                          content={
                                              <div className="markdown-body max-w-[280px] text-left text-[11px] leading-snug">
                                                  <Markdown text={option.description} />
                                              </div>
                                          }
                                          placement="left"
                                      >
                                          <span
                                              className="inline-flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                                              onClick={event => event.stopPropagation()}
                                              onMouseDown={event => event.stopPropagation()}
                                          >
                                              <i className="ph ph-info text-[12px]" aria-hidden="true" />
                                          </span>
                                      </Tip>
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

            <div className="min-w-0">
                <div
                    ref={scrollRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    className="relative overflow-auto scrollbar-thin outline-none"
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
                                                    className="inline-block text-right text-[10px] opacity-70 pl-1.5 ml-auto"
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
                                    {dimmedLineSet.size > 0
                                        ? highlightedLines.map((lineHtml, index) => (
                                              <span
                                                  key={index}
                                                  className={clsx(
                                                      'block',
                                                      dimmedLineSet.has(index + 1) && 'opacity-35',
                                                  )}
                                                  dangerouslySetInnerHTML={{
                                                      __html:
                                                          lineHtml + (index < highlightedLines.length - 1 ? '\n' : ''),
                                                  }}
                                              />
                                          ))
                                        : null}
                                    {dimmedLineSet.size === 0 && (
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
