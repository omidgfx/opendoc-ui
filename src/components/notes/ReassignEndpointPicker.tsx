import {useMemo, useRef, useState} from 'react';
import type {OpenApiSpec} from '../../types';
import {getDocumentOperations} from '../../utils/openapi';
import MethodBadge from '../common/MethodBadge';

interface ReassignEndpointPickerProps {
    spec: OpenApiSpec;
    onSelect: (path: string, method: string) => void;
    onCancel: () => void;
}

const matches = (needle: string, ...values: Array<string | undefined>): boolean => {
    const query = needle.trim().toLowerCase();
    if (!query) return true;
    return values.some(value =>
        String(value || '')
            .toLowerCase()
            .includes(query),
    );
};

/**
 * Compact search-as-you-type endpoint picker used to re-assign orphaned
 * notes. Flat list (no folder tree), keyboard navigable, small footprint.
 */
export default function ReassignEndpointPicker({spec, onSelect, onCancel}: ReassignEndpointPickerProps) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const endpoints = useMemo(() => getDocumentOperations(spec), [spec]);
    const matchesQuery = useMemo(
        () =>
            endpoints.filter(({path, method, operation}) =>
                matches(query, path, method, operation?.summary, operation?.description, ...(operation?.tags || [])),
            ),
        [endpoints, query],
    );
    const select = (index: number) => {
        const match = matchesQuery[index];
        if (match) onSelect(match.path, match.method);
    };
    return (
        <div
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            data-reassign-picker
        >
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-3 py-2">
                <i className="ph ph-magnifying-glass text-xs text-[var(--text-muted)]" />
                <input
                    ref={inputRef}
                    autoFocus
                    value={query}
                    onChange={event => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                    }}
                    onKeyDown={event => {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setActiveIndex(index => Math.min(matchesQuery.length - 1, index + 1));
                        } else if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActiveIndex(index => Math.max(0, index - 1));
                        } else if (event.key === 'Enter') {
                            event.preventDefault();
                            select(activeIndex);
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            onCancel();
                        }
                    }}
                    placeholder="Search endpoints…"
                    aria-label="Search endpoints to re-assign the note"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-heading)] outline-none placeholder:text-[var(--text-muted)]"
                />
                <button
                    type="button"
                    aria-label="Cancel re-assignment"
                    onClick={onCancel}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] cursor-pointer"
                >
                    <i className="ph ph-x text-[11px]" />
                </button>
            </div>
            <div className="max-h-52 overflow-y-auto scrollbar-thin p-1.5">
                {matchesQuery.length === 0 ? (
                    <p className="px-2 py-4 text-center text-[10px] italic text-[var(--text-muted)]">
                        No endpoints match “{query}”.
                    </p>
                ) : (
                    matchesQuery.map(({path, method, operation}, index) => {
                        const selected = index === activeIndex;
                        return (
                            <button
                                key={`${method}:${path}`}
                                type="button"
                                aria-selected={selected}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => select(index)}
                                className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer ${
                                    selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--surface-hover)]'
                                }`}
                            >
                                <MethodBadge method={method} size="xs" />
                                <code className="min-w-0 truncate font-mono text-[10px] text-[var(--text-heading)]">
                                    {path}
                                </code>
                                {operation?.summary && (
                                    <span className="min-w-0 flex-1 truncate text-[9.5px] text-[var(--text-muted)]">
                                        {operation.summary}
                                    </span>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
