import {useMemo, useState} from 'react';
import Prism from 'prismjs';
import clsx from 'clsx';
import {Tip} from './Tooltip';
import type {CodeLineMarker} from '../../utils/lineMarkers';
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
    /** Line numbers render by default; pass false for chrome-less output. */
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

export default function CodeViewer({code, language, maxHeight, lineMarkers, showLineNumbers = true}: CodeViewerProps) {
    const [copied, setCopied] = useState(false);
    let finalCode = code;
    if (language.toLowerCase() === 'json' && lineMarkers === undefined) {
        try {
            const obj = typeof code === 'string' ? JSON.parse(code) : code;
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
        (lineMarkers || []).forEach(marker => {
            if (!Number.isInteger(marker.line) || marker.line < 1 || marker.line > lineCount) return;
            const bucket = map.get(marker.line);
            if (bucket) bucket.push(marker);
            else map.set(marker.line, [marker]);
        });
        return map;
    }, [lineMarkers, lineCount]);
    /* The icon holder is a fixed-width slot sized for the busiest line, so
       numbers stay aligned no matter how many indicators a line carries. */
    const maxIconsPerLine = useMemo(() => {
        let max = 0;
        markersByLine.forEach(bucket => {
            if (bucket.length > max) max = bucket.length;
        });
        return max;
    }, [markersByLine]);
    const iconSlotWidth = maxIconsPerLine > 0 ? maxIconsPerLine * 15 : 0;
    const gutterDigits = String(lineCount).length;
    return (
        <div className="relative group rounded-xl border font-mono text-xs overflow-hidden leading-normal animate-in fade-in duration-100 bg-[var(--background)] border-[var(--border)]">
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

            <div className="flex items-stretch overflow-auto scrollbar-thin" style={{maxHeight: maxHeight || '450px'}}>
                {showLineNumbers && (
                    <div
                        aria-hidden="true"
                        className="select-none sticky left-0 z-[1] shrink-0 py-4 pl-2 pr-2.5 border-r bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]"
                    >
                        {Array.from({length: lineCount}, (_, index) => {
                            const line = index + 1;
                            const markers = markersByLine.get(line);
                            return (
                                <div key={line} className="flex h-[1.5em] items-center justify-end">
                                    {iconSlotWidth > 0 && (
                                        <span
                                            className="flex items-center justify-end gap-[3px] shrink-0"
                                            style={{width: `${iconSlotWidth}px`}}
                                        >
                                            {markers?.map((marker, markerIndex) => (
                                                <Tip key={markerIndex} content={marker.tip}>
                                                    <i
                                                        className={clsx(
                                                            marker.icon,
                                                            'text-[11px] leading-none cursor-help',
                                                            marker.className || 'text-[var(--text-muted)]',
                                                        )}
                                                    />
                                                </Tip>
                                            ))}
                                        </span>
                                    )}
                                    <span
                                        className="inline-block text-right text-[10px] opacity-70 pl-1.5"
                                        style={{minWidth: `${gutterDigits}ch`}}
                                    >
                                        {line}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                <pre className="p-4 flex-1">
                    <code dangerouslySetInnerHTML={{__html: highlightedHtml}} className="block" />
                </pre>
            </div>
        </div>
    );
}
