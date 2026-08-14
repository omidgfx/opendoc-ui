import {useMemo, useState} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '../../types';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {
    buildTagTree,
    compactMethodLabel,
    filterTagTree,
    readSidebarConfig,
    type TreeNode,
} from '../../utils/sidebar/tree';
import MethodBadge from '../common/MethodBadge';

interface NoteEndpointPickerProps {
    spec: OpenApiSpec;
    specKey: string;
    selected: {path: string; method: string} | null;
    onSelect: (path: string, method: string) => void;
}

const countEndpoints = (node: TreeNode): number =>
    node.endpoints.length + Object.values(node.children).reduce((total, child) => total + countEndpoints(child), 0);

export default function NoteEndpointPicker({spec, specKey, selected, onSelect}: NoteEndpointPickerProps) {
    const {hiddenEndpointKeys} = useEndpointNotes();
    const [query, setQuery] = useState('');
    const config = useMemo(() => readSidebarConfig(specKey), [specKey]);
    const tree = useMemo(
        () => buildTagTree(spec, config, undefined, new Set(hiddenEndpointKeys)),
        [spec, config, hiddenEndpointKeys],
    );
    const visibleTree = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return filterTagTree(tree, endpoint => {
            if (config.hideDeprecatedEndpoints && endpoint.operation?.deprecated && !endpoint.isHidden) return false;
            if (!needle) return true;
            const tags = endpoint.operation?.tags || [];
            return [
                endpoint.operation?.summary || '',
                endpoint.operation?.description || '',
                endpoint.path,
                endpoint.method,
                ...tags,
            ].some(value => String(value).toLowerCase().includes(needle));
        });
    }, [tree, query, config.hideDeprecatedEndpoints]);

    const renderNode = (node: TreeNode, path: string, depth: number): React.ReactNode => {
        const children = Object.entries(node.children);
        if (children.length === 0 && node.endpoints.length === 0) return null;
        return (
            <div key={path} className={clsx(depth > 0 && 'ms-3 border-s border-[var(--text-muted)]/20 ps-2')}>
                {node.name && (
                    <div
                        className={clsx(
                            'relative flex min-h-7 items-center gap-1.5 rounded-lg px-1.5 text-[10px] font-bold text-[var(--text-heading)] before:absolute before:-left-2 before:top-1/2 before:h-px before:w-2 before:bg-[var(--text-muted)]/20',
                            node.isHiddenGroup && 'text-[var(--text-muted)] opacity-70 grayscale',
                        )}
                    >
                        <i
                            className={clsx(
                                'ph-fill ph-folder-open text-[14px]',
                                node.isHiddenGroup ? 'text-[var(--text-muted)]' : 'text-[var(--method-put)]',
                            )}
                        />
                        <span className="min-w-0 flex-1 truncate">{node.name}</span>
                        {!config.hideEndpointCount && (
                            <span className="rounded-full bg-[var(--text-muted)]/10 px-1.5 py-0.5 font-mono text-[8px] text-[var(--text-muted)]">
                                {countEndpoints(node)}
                            </span>
                        )}
                    </div>
                )}
                <div className="space-y-0.5">
                    {children.map(([name, child]) => renderNode(child, path ? `${path}/${name}` : name, depth + 1))}
                    {node.endpoints.map(endpoint => {
                        const active =
                            selected?.path === endpoint.path &&
                            selected.method.toLowerCase() === endpoint.method.toLowerCase();
                        const summary = endpoint.operation?.summary || endpoint.path;
                        return (
                            <button
                                key={`${endpoint.method}:${endpoint.path}`}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onSelect(endpoint.path, endpoint.method)}
                                className={clsx(
                                    'relative flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors before:absolute before:-left-2 before:top-1/2 before:h-px before:w-2 before:bg-[var(--text-muted)]/20 cursor-pointer',
                                    active
                                        ? 'border-[var(--primary)]/35 bg-[var(--primary)]/10 font-semibold text-[var(--primary)]'
                                        : endpoint.isHidden
                                          ? 'border-transparent bg-[var(--text-muted)]/5 text-[var(--text-muted)] opacity-65 grayscale hover:bg-[var(--surface-hover)]'
                                          : 'border-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                )}
                            >
                                <MethodBadge
                                    method={endpoint.method}
                                    displayLabel={
                                        config.compactMethodNames ? compactMethodLabel(endpoint.method) : undefined
                                    }
                                    size="xs"
                                    className={clsx(
                                        config.compactMethodNames ? 'h-4 w-5 !px-0' : 'h-4 w-9',
                                        'shrink-0',
                                        active &&
                                            '!border-[var(--primary)]/25 !bg-[var(--primary)]/12 !text-[var(--primary)]',
                                    )}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[10px] font-semibold">{summary}</span>
                                    {config.displayRoutes && (
                                        <code
                                            className={clsx(
                                                'mt-0.5 block truncate text-[8px]',
                                                active ? 'text-[var(--primary)]/70' : 'text-[var(--text-muted)]',
                                            )}
                                        >
                                            {endpoint.path}
                                        </code>
                                    )}
                                </span>
                                {endpoint.operation?.deprecated && (
                                    <i
                                        className={clsx(
                                            'ph ph-warning-circle shrink-0 text-[11px]',
                                            active ? 'text-[var(--primary)]/80' : 'text-[var(--method-put)]',
                                        )}
                                    />
                                )}
                                {endpoint.isProtected && !config.hideProtectedIcon && (
                                    <i
                                        className={clsx(
                                            'ph-fill ph-lock-key shrink-0 text-[11px]',
                                            active ? 'text-[var(--primary)]/85' : 'text-[var(--method-delete)]/75',
                                        )}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <aside
            data-note-endpoint-picker
            aria-label="Endpoints"
            className="flex h-56 max-h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--background)] md:h-full md:w-64 md:border-b-0 md:border-r lg:w-72"
        >
            <div className="shrink-0 border-b border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        All endpoints
                    </span>
                    <span className="text-[9px] font-bold text-[var(--text-muted)]">{countEndpoints(tree)}</span>
                </div>
                <div className="relative mt-2">
                    <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-[11px] text-[var(--text-muted)]" />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search endpoints…"
                        autoFocus
                        className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[10px] text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                    />
                </div>
            </div>
            <div data-note-endpoint-list className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
                {Object.keys(visibleTree.children).length > 0 || visibleTree.endpoints.length > 0 ? (
                    renderNode(visibleTree, '', 0)
                ) : (
                    <div className="px-3 py-10 text-center text-[10px] text-[var(--text-muted)]">
                        No endpoints match this search.
                    </div>
                )}
            </div>
        </aside>
    );
}
