import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Prism from 'prismjs';
import clsx from 'clsx';
import {Tip} from './Tooltip';
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
}

export interface CodeInlineMenu {
    id: string;
    line: number;
    column?: number;
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

/* subtle odd/even striping, aligned to the text rows */
const stripeBackground = (color: string) => ({
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${LINE_HEIGHT_PX}px, ${color} ${LINE_HEIGHT_PX}px ${LINE_HEIGHT_PX * 2}px)`,
    backgroundPosition: `0 ${PAD_TOP_PX}px`,
    backgroundAttachment: 'local' as const,
});

function MarkerIcon({marker}: {marker: CodeLineMarker}) {
    const iconClass = marker.icon || '';
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
                                item.active ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
                            )}
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
        <i className={clsx(iconClass, 'text-[11px] leading-none', marker.className || 'text-[var(--text-muted)]')} />
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
    const viewerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const codeRef = useRef<HTMLElement>(null);
    const codeBarRef = useRef<HTMLDivElement>(null);
    const gutterBarRef = useRef<HTMLDivElement>(null);
    const preparedInlineMenus = useMemo(() => {
        const source = String(code ?? '');
        const menus = (inlineMenus || []).map(menu => ({...menu}));
        const sourceLines = source.split('\n');
        menus.forEach(menu => {
            if (!menu.token) return;
            for (let index = 0; index < sourceLines.length; index += 1) {
                const column = sourceLines[index].indexOf(menu.token);
                if (column >= 0) {
                    menu.line = index + 1;
                    menu.column = column;
                    break;
                }
            }
        });
        let stripped = source;
        menus.forEach(menu => {
            if (menu.token) stripped = stripped.split(menu.token).join('');
        });
        return {code: stripped, menus};
    }, [code, inlineMenus]);

    let finalCode = preparedInlineMenus.code;
    if (language.toLowerCase() === 'json' && lineMarkers === undefined) {
        try {
            const obj =
                typeof preparedInlineMenus.code === 'string'
                    ? JSON.parse(preparedInlineMenus.code)
                    : preparedInlineMenus.code;
            finalCode = JSON.stringify(obj, null, 4);
        } catch {}
    }
    const handleCopy = () => {
        navigator.clipboard.writeText(finalCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const highlightedHtml = highlightCodeString(finalCode, language);
    const lineCount = useMemo(() => Math.max(1, finalCode.split('\n').length), [finalCode]);
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
                    Number.isInteger(menu.line) && menu.line >= 1 && menu.line <= lineCount && menu.options.length > 0,
            ),
        [preparedInlineMenus, lineCount],
    );

    useEffect(() => {
        if (!openInlineMenuId) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (viewerRef.current?.contains(event.target as Node)) return;
            setOpenInlineMenuId(null);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenInlineMenuId(null);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [openInlineMenuId]);

    return (
        <div
            ref={viewerRef}
            className="relative group rounded-xl border font-mono text-xs overflow-hidden leading-normal animate-in fade-in duration-100 bg-[var(--background)] border-[var(--border)]"
        >
            <div className="px-4 py-1.5 border-b flex items-center justify-between bg-[var(--surface-hover)] border-[var(--border)]">
                <span className="text-[10px] uppercase font-bold tracking-wider font-sans select-none text-[var(--text-muted)]">
                    {language}
                </span>
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
                    )}
                    <pre className="relative z-0 p-4 flex-1">
                        {visibleInlineMenus.map(menu => {
                            const open = openInlineMenuId === menu.id;
                            return (
                                <div
                                    key={menu.id}
                                    className="absolute z-20 select-none"
                                    style={{
                                        top: `${PAD_TOP_PX + (menu.line - 1) * LINE_HEIGHT_PX}px`,
                                        left:
                                            typeof menu.column === 'number'
                                                ? `calc(${Math.max(0, menu.column)}ch + 1px)`
                                                : '4px',
                                    }}
                                >
                                    <div className="relative flex h-[18px] items-center">
                                        <button
                                            type="button"
                                            onMouseDown={event => event.preventDefault()}
                                            onClick={() =>
                                                setOpenInlineMenuId(current => (current === menu.id ? null : menu.id))
                                            }
                                            className="inline-flex items-center justify-center px-[2px] py-0 bg-transparent border-0 text-[var(--primary)] opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
                                            aria-label={menu.ariaLabel || 'Select schema branch'}
                                            aria-haspopup="menu"
                                            aria-expanded={open}
                                        >
                                            <i className="ph-fill ph-caret-down text-[11px]" />
                                        </button>
                                        {open && (
                                            <div className="absolute left-4 top-1/2 z-30 min-w-[220px] max-w-[280px] -translate-y-1/2 overflow-hidden rounded-xl border bg-[var(--surface)] p-1 shadow-2xl border-[var(--border)]">
                                                {menu.options.map(option => {
                                                    const active = menu.activeIndex === option.index;
                                                    return (
                                                        <button
                                                            key={`${menu.id}:${option.index}`}
                                                            type="button"
                                                            role="menuitem"
                                                            onMouseDown={event => event.preventDefault()}
                                                            onClick={() => {
                                                                menu.onSelect(option.index);
                                                                setOpenInlineMenuId(null);
                                                            }}
                                                            className={clsx(
                                                                'flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                                                                active
                                                                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                                                    : 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                                            )}
                                                        >
                                                            <span
                                                                className={clsx(
                                                                    'mt-1 size-2 shrink-0 rounded-full',
                                                                    active
                                                                        ? 'bg-[var(--primary)]'
                                                                        : 'bg-[var(--border)]',
                                                                )}
                                                            />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-[11px] font-semibold">
                                                                    {option.label}
                                                                </span>
                                                                {option.description && (
                                                                    <span className="mt-0.5 block text-[9px] leading-snug text-[var(--text-muted)]">
                                                                        {option.description}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <code ref={codeRef} dangerouslySetInnerHTML={{__html: highlightedHtml}} className="block" />
                    </pre>
                </div>
            </div>
        </div>
    );
}
