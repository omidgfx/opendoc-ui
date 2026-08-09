import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {ExamineResponse} from '../../../types';
import ConfirmModal from '../../common/ConfirmModal';

interface ResponseHistoryDropdownProps {
    history: ExamineResponse[];
    selectedIndex: number;
    onSelect: (response: ExamineResponse) => void;
    onDelete: (index: number) => void;
    onClearAll: () => void;
}

const outcomeLabel = (response: ExamineResponse) => response.status === 0
    ? response.errorKind === 'validation' ? 'Input required'
        : response.errorKind === 'timeout' ? 'Timeout'
            : response.errorKind === 'cancelled' ? 'Cancelled'
                : 'Network error'
    : `HTTP ${response.status}`;

const outcomeColor = (response: ExamineResponse) => {
    if (response.status === 0)
        return response.errorKind === 'validation' ? 'bg-[var(--method-put)]' : 'bg-[var(--method-delete)]';
    if (response.status >= 200 && response.status < 400)
        return 'bg-[var(--method-get)]';
    if (response.status >= 400)
        return 'bg-[var(--method-delete)]';
    return 'bg-[var(--text-muted)]';
};

export default function ResponseHistoryDropdown({
    history,
    selectedIndex,
    onSelect,
    onDelete,
    onClearAll,
}: ResponseHistoryDropdownProps) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(selectedIndex);
    const [confirmClear, setConfirmClear] = useState(false);
    const [position, setPosition] = useState({top: 0, left: 0, width: 320});
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const listId = useId();

    const show = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            const width = Math.min(380, Math.max(300, rect.width));
            const estimatedHeight = Math.min(360, 48 + history.length * 54);
            const top = rect.bottom + 4 + estimatedHeight <= window.innerHeight - 8
                ? rect.bottom + 4
                : Math.max(8, rect.top - estimatedHeight - 4);
            setPosition({
                top,
                left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
                width,
            });
        }
        setActiveIndex(Math.max(0, selectedIndex));
        setOpen(true);
    };
    const close = (focus = false) => {
        setOpen(false);
        if (focus)
            requestAnimationFrame(() => triggerRef.current?.focus());
    };

    useEffect(() => {
        if (!open)
            return;
        const outside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target))
                close();
        };
        const keys = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(index => Math.min(history.length - 1, index + 1));
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(index => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && history[activeIndex]) {
                event.preventDefault();
                onSelect(history[activeIndex]);
                close(true);
            }
        };
        const viewport = () => close();
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', keys, true);
        window.addEventListener('resize', viewport);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', keys, true);
            window.removeEventListener('resize', viewport);
        };
    }, [open, activeIndex, history]);

    const selected = history[selectedIndex] || history[0];
    const menu = open && <div ref={menuRef} id={listId} role="listbox"
        className="fixed z-[4000] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        style={{top: position.top, left: position.left, width: position.width}}>
        <div className="flex items-center justify-between bg-[var(--background)] px-3 py-2">
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--text-muted)]">Response history · {history.length}/10</span>
            <button type="button" onClick={() => {
                close();
                setConfirmClear(true);
            }} className="rounded-md px-2 py-1 text-[9px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer">
                Clear all
            </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5 scrollbar-thin">
            {history.map((response, index) => <div key={`${response.timestamp}:${index}`} role="option"
                aria-selected={index === selectedIndex} onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                    onSelect(response);
                    close(true);
                }}
                className={`group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${index === activeIndex ? 'bg-[var(--surface-hover)]' : 'bg-transparent'}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${index === activeIndex ? 'bg-[var(--primary)]' : outcomeColor(response)}`}/>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold text-[var(--text-heading)]">{index === 0 ? 'Latest · ' : ''}{outcomeLabel(response)}</span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">{new Date(response.timestamp).toLocaleTimeString()}</span>
                        {response.durationMs !== undefined && <span className="ml-auto text-[9px] font-mono text-[var(--text-muted)]">{response.durationMs} ms</span>}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-[var(--text-muted)]" title={response.requestUrl}>{response.requestUrl || 'No request URL'}</p>
                </div>
                <button type="button" aria-label={`Delete ${outcomeLabel(response)} from history`}
                    onClick={event => {
                        event.stopPropagation();
                        onDelete(index);
                        if (history.length <= 1)
                            close(true);
                        else
                            setActiveIndex(current => Math.min(current, history.length - 2));
                    }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] opacity-60 hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] group-hover:opacity-100 cursor-pointer">
                    <i className="ph ph-trash text-[11px]"/>
                </button>
            </div>)}
        </div>
    </div>;

    return <>
        <button ref={triggerRef} type="button" aria-label="Response history" aria-haspopup="listbox" aria-expanded={open}
            aria-controls={open ? listId : undefined} onClick={() => open ? close() : show()}
            className="flex max-w-[210px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-left hover:border-[var(--primary)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/30 cursor-pointer">
            {selected && <span className={`size-2 shrink-0 rounded-full ${outcomeColor(selected)}`}/>} 
            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[var(--text-heading)]">{selected ? outcomeLabel(selected) : 'Response history'}</span>
            <i className={`ph ph-caret-down text-[9px] text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}/>
        </button>
        {typeof document !== 'undefined' && createPortal(menu, document.body)}
        <ConfirmModal isOpen={confirmClear} title="Clear response history?"
            message={`Delete all ${history.length} saved response outcome${history.length === 1 ? '' : 's'} for this endpoint?`}
            confirmLabel="Clear history" destructive onConfirm={onClearAll} onClose={() => setConfirmClear(false)}/>
    </>;
}
