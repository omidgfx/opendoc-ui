import {useEffect, useState} from 'react';
import {marked} from 'marked';
import {highlightCodeString} from './CodeViewer';
import DOMPurify from 'dompurify';
import {useOperationLinkIndex} from '../../contexts/OperationLinkContext';
import {rewriteInternalEndpointLinks} from '../../utils/docLinks';

interface MarkdownProps {
    text?: string;
    className?: string;
}

function addDirAttributesToDoc(doc: Document): void {
    const rtlRegex =
        /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
        const text = el.textContent || '';
        const wordLimit = el.tagName.toLowerCase() === 'ul' ? 20 : 10;
        const words = text.trim().split(/\s+/).slice(0, wordLimit);
        const sample = words.join(' ');
        const matches = sample.match(rtlRegex);
        const rtlCount = matches ? matches.length : 0;
        const totalChars = sample.replace(/\s/g, '').length;
        const percentage = totalChars > 0 ? (rtlCount / totalChars) * 100 : 0;
        const firstChar = sample.trim()[0] || '';
        const firstCharRTL = firstChar && rtlRegex.test(firstChar);
        if (rtlCount > 0 && (firstCharRTL || percentage >= 40)) {
            el.setAttribute('dir', 'rtl');
        } else {
            el.setAttribute('dir', 'auto');
        }
    });
}

export default function Markdown({text, className = ''}: MarkdownProps) {
    const [html, setHtml] = useState('');
    const {index: linkIndex, parsableKey} = useOperationLinkIndex();
    useEffect(() => {
        if (!text) {
            setHtml('');
            return;
        }
        try {
            const renderer = new marked.Renderer();
            renderer.code = function ({text: codeVal, lang}: {text: string; lang?: string}) {
                const highlighted = highlightCodeString(codeVal, lang || 'text');
                return `
 <div class="relative my-4 rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden font-mono text-xs">
 <div class="px-4 py-1 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-muted)] font-sans select-none">
 <span class="text-[10px] uppercase font-bold tracking-wider">${lang || 'text'}</span>
 </div>
 <pre class="p-4 overflow-x-auto select-all scrollbar-thin"><code class="block whitespace-pre text-[var(--text)]">${highlighted}</code></pre>
 </div>
 `;
            };
            const parsed = marked.parse(text, {renderer, async: false}) as string;
            const cleanHtml = DOMPurify.sanitize(parsed);
            const parser = new DOMParser();
            const doc = parser.parseFromString(cleanHtml, 'text/html');
            addDirAttributesToDoc(doc);
            rewriteInternalEndpointLinks(doc, linkIndex, parsableKey);
            const finalHtml = doc.body.innerHTML;
            setHtml(finalHtml);
        } catch (e) {
            console.error('Failed to parse markdown', e);
            setHtml(text || '');
        }
    }, [text, linkIndex, parsableKey]);
    if (!text) return null;
    return <div className={`markdown-body ${className}`} dangerouslySetInnerHTML={{__html: html}} />;
}
