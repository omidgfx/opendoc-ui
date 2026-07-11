import {useState} from 'react';
import Prism from 'prismjs';
import clsx from 'clsx';

// Core language imports
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-http';

// PHP requires these dependencies
import 'prismjs/components/prism-markup'; // base for HTML/XML
import 'prismjs/components/prism-markup-templating'; // needed by PHP
import 'prismjs/components/prism-clike'; // common C-like base
import 'prismjs/components/prism-php'; // PHP itself
// Other languages you use
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-csharp';

interface CodeViewerProps {
    code: string;
    language: string;
    maxHeight?: string;
}

// Global lightweight highlighter helper utilizing PrismJS
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
            // safe fallback
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

export default function CodeViewer({code, language, maxHeight}: CodeViewerProps) {
    const [copied, setCopied] = useState(false);

    let finalCode = code;
    if (language.toLowerCase() === 'json') {
        try {
            const obj = typeof code === 'string' ? JSON.parse(code) : code;
            finalCode = JSON.stringify(obj, null, 2);
        } catch {

            // Keep original
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(finalCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const highlightedHtml = highlightCodeString(finalCode, language);

    return (
        <div
            className="relative group rounded-xl border font-mono text-xs overflow-hidden leading-relaxed animate-in fade-in duration-100 bg-[var(--background)] border-[var(--border)]">

            {/* Utility Bar with Language and Copy button */}
            <div
                className="px-4 py-1.5 border-b flex items-center justify-between bg-[var(--surface-hover)] border-[var(--border)]">

                <span
                    className="text-[10px] uppercase font-bold tracking-wider font-sans select-none text-[var(--text-muted)]">

                    {language}
                </span>
                <button
                    onClick={handleCopy}
                    className={clsx(
                        'px-2 py-0.5 rounded-md text-[10px] font-sans flex items-center gap-1.5 transition-all cursor-pointer border hover:bg-[var(--background)] bg-[var(--surface)] border-[var(--border)]',
                        copied ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]'
                    )}>

                    {copied ?
                        <>
                            <i className="ph ph-check text-[10px] text-[var(--method-get)]"></i>
                            <span className="text-[var(--method-get)] font-bold">Copied!</span>
                        </> :

                        <>
                            <i className="ph ph-copy text-[14px]"></i>
                            <span className="font-semibold">Copy</span>
                        </>
                    }
                </button>
            </div>

            {/* Code Container */}
            <pre
                className="p-4 overflow-x-auto scrollbar-thin"
                style={{
                    maxHeight: maxHeight || '450px',
                    overflowY: maxHeight === 'none' ? 'visible' : 'auto'
                }}>
        
 <code
     dangerouslySetInnerHTML={{__html: highlightedHtml}}
     className="block"/>
        
 </pre>
        </div>);

}