import React, {useEffect, useState} from 'react';
import {specStorage} from '../../utils/storage';

const SEARCH_HISTORY_LIMIT = 10;
type SearchHistoryDropdownProps = {
    specKey: string;
    query: string;
    onPick: (q: string) => void;
    onClose: () => void;
};
export default function SearchHistoryDropdown({specKey, query, onPick, onClose}: SearchHistoryDropdownProps) {
    const [items, setItems] = useState<string[]>(() =>
        specStorage.getJSON<string[]>(
            specKey,
            'search_history',
            [],
            v => Array.isArray(v) && v.every(x => typeof x === 'string'),
        ),
    );
    const save = (next: string[]) => {
        setItems(next);
        specStorage.setJSON(specKey, 'search_history', next);
    };
    const remove = (q: string) => save(items.filter(x => x !== q));
    useEffect(() => {
        setItems(
            specStorage.getJSON<string[]>(
                specKey,
                'search_history',
                [],
                v => Array.isArray(v) && v.every(x => typeof x === 'string'),
            ),
        );
    }, [specKey, query]);
    if (items.length === 0) return null;
    return (
        <div
            className="absolute left-0 right-0 top-full mt-1 z-[1200] rounded-xl border shadow-2xl overflow-hidden bg-[var(--surface)] border-[var(--border)] animate-zoom-in origin-top"
            onMouseDown={e => e.preventDefault()}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                    Recent searches
                </span>
                <button
                    type="button"
                    onClick={() => save([])}
                    className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--method-delete)] cursor-pointer px-1.5 py-0.5 rounded hover:bg-[var(--method-delete)]/10 transition-colors"
                >
                    <i className="ph ph-trash text-[11px]"></i>
                    Clear
                </button>
            </div>
            <div className="py-1 max-h-64 overflow-y-auto scrollbar-thin">
                {items.map(item => (
                    <div
                        key={item}
                        className="flex items-center gap-2 px-3 py-1.5 group hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                        onClick={() => {
                            onPick(item);
                            onClose();
                        }}
                    >
                        <i className="ph ph-clock-counter-clockwise text-[13px] text-[var(--text-muted)] shrink-0"></i>
                        <span className="flex-1 min-w-0 truncate text-xs text-left text-[var(--text)]">{item}</span>
                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                remove(item);
                            }}
                            className="size-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            aria-label={`Remove "${item}" from history`}
                        >
                            <i className="ph ph-x text-[11px]"></i>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
export {SEARCH_HISTORY_LIMIT};
