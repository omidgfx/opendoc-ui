import React, { useMemo, useState } from 'react';
import ShareModal from '../../modals/ShareModal';
import { useEscClose } from '../../../hooks/useEscClose';
import { OpenApiSpec, Operation } from '../../../types';
import Markdown from '../../common/Markdown';
import MethodBadge from '../../common/MethodBadge';
import clsx from "clsx";
import { Tip } from '../../common/Tooltip';
import { useBreakpoint } from '../../../hooks/useBreakpoint';

interface SearchResultsViewProps {
    spec: OpenApiSpec | null;
    searchQuery: string;
    onSelectEndpoint: (path: string, method: string) => void;
    selectedServer: string;
    selectedMethods: string[];
    setSelectedMethods: React.Dispatch<React.SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: React.Dispatch<React.SetStateAction<boolean | null>>;
    parsableKey?: string;
}

function FiltersPanel({
    allMethods, allTags, selectedMethods, selectedTags, onlyProtected,
    handleToggleMethod, handleToggleTag, setOnlyProtected, handleClearFilters, hasActiveFilters
}: any) {
    return (
        <div className="p-4 rounded-xl border space-y-5 border-[var(--border)] bg-[var(--surface)]">
            <div className="flex h-4 items-center justify-between">
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-[var(--text-muted)]">
                    <i className="ph ph-funnel text-[16px]"></i>
                    Advanced Filters
                </h3>
                {hasActiveFilters && (
                    <button onClick={handleClearFilters}
                        className="text-[8px] font-bold text-[var(--method-delete)] cursor-pointer bg-transparent border-none py-0.5 px-1 rounded-md hover:bg-[var(--method-delete)]/10 transition-colors">
                        Clear
                    </button>
                )}
            </div>

            <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Method</h4>
                <div className="grid grid-cols-2 gap-1.5">
                    {allMethods.map((method: string) => {
                        const isChecked = selectedMethods.includes(method);
                        return (
                            <button key={method} onClick={() => handleToggleMethod(method)}
                                className={clsx('flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-xs transition-all cursor-pointer font-sans select-none hover:bg-[var(--surface-hover)]',
                                    isChecked ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] bg-transparent')}>
                                <span className={clsx('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all text-[8.5px] font-bold',
                                    isChecked ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] bg-[var(--text)]/5')}>
                                    {isChecked && <i className="ph ph-check"></i>}
                                </span>
                                <MethodBadge method={method} size="xs" variant="plain" />
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Access</h4>
                <div className="flex flex-col gap-1.5">
                    {[
                        { label: 'Any', value: null, icon: 'ph-globe' },
                        { label: 'Protected', value: true, icon: 'ph-lock-key text-[var(--method-delete)]' },
                        { label: 'Public', value: false, icon: 'ph-lock-key-open text-[var(--method-get)]' },
                    ].map((opt) => {
                        const isSelected = onlyProtected === opt.value;
                        return (
                            <button key={opt.label} onClick={() => setOnlyProtected(opt.value as any)}
                                className={clsx('flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all cursor-pointer font-sans select-none hover:bg-[var(--surface-hover)]',
                                    isSelected ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)] font-semibold' : 'border-[var(--border)] bg-transparent text-[var(--text)]')}>
                                <span className={clsx('size-3.5 rounded-full border flex items-center justify-center shrink-0 transition-all bg-[var(--text)]/5',
                                    isSelected ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)]')}>
                                    {isSelected && <i className="bg-current size-2 rounded-full block"></i>}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <i className={`ph-fill ${opt.icon} text-[14px]`}></i>
                                    <span>{opt.label}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tags</h4>
                <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto scrollbar-thin pr-1">
                    {allTags.map((tag: string) => {
                        const isChecked = selectedTags.includes(tag);
                        return (
                            <button key={tag} onClick={() => handleToggleTag(tag)}
                                className={clsx('flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all cursor-pointer font-sans select-none hover:bg-[var(--surface-hover)]',
                                    isChecked ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)] font-semibold' : 'border-[var(--border)] bg-transparent text-[var(--text)]')}>
                                <span className={clsx('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all text-[8px] font-bold',
                                    isChecked ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] bg-[var(--text)]/5')}>
                                    {isChecked && <i className="ph ph-check"></i>}
                                </span>
                                <span className="truncate">{tag}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function SearchResultsView({
    spec, searchQuery, onSelectEndpoint, selectedServer,
    selectedMethods, setSelectedMethods, selectedTags, setSelectedTags,
    onlyProtected, setOnlyProtected, parsableKey = 'API'
}: SearchResultsViewProps) {
    const [shareModal, setShareModal] = useState<{ url: string; title: string; description?: string } | null>(null);
    const [filtersModalOpen, setFiltersModalOpen] = useState(false);
    useEscClose(!!shareModal, () => setShareModal(null), !!shareModal);
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    const getCurrentSearchUrl = () => typeof window !== 'undefined' ? window.location.href : '';

    const handleShareSearch = () => {
        setShareModal({
            url: getCurrentSearchUrl(),
            title: `Search: "${searchQuery}" in ${parsableKey}`,
            description: `Search results for "${searchQuery}" in ${parsableKey} - Found matching endpoints`
        });
    };

    const handleShareEndpoint = (path: string, method: string, summary?: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        let endpointId = `${method}-${path.replace(/^\//, '').replace(/\//g, '-')}`;
        try {
            const pathItem = spec?.paths?.[path] as any;
            const op = pathItem?.[method];
            if (op?.operationId) endpointId = op.operationId;
        } catch {}
        const url = `${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(parsableKey)}/api/${encodeURIComponent(endpointId)}`;
        setShareModal({ url, title: `${method.toUpperCase()} ${path} - ${summary || 'API Endpoint'}`, description: `Check out this API endpoint: ${method.toUpperCase()} ${path}` });
    };

    const handleClearFilters = () => {
        setSelectedMethods([]); setSelectedTags([]); setOnlyProtected(null);
    };

    const { allTags, allMethods } = useMemo(() => {
        const tagsSet = new Set<string>(); const methodsSet = new Set<string>();
        if (spec && spec.paths) {
            Object.entries(spec.paths).forEach(([_, pathItem]) => {
                Object.entries(pathItem).forEach(([method, operation]) => {
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(method)) {
                        methodsSet.add(method.toUpperCase());
                        const op = operation as any;
                        if (op.tags && Array.isArray(op.tags)) op.tags.forEach((t: string) => tagsSet.add(t));
                        else tagsSet.add('General');
                    }
                });
            });
        }
        return { allTags: Array.from(tagsSet).sort(), allMethods: Array.from(methodsSet).sort() };
    }, [spec]);

    const handleToggleMethod = (method: string) => setSelectedMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);
    const handleToggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    const hasActiveFilters = selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;

    const searchResults = useMemo(() => {
        if (!spec || !spec.paths) return [];
        const list: Array<{ path: string; method: string; operation: Operation; isProtected: boolean; score: number }> = [];
        const query = searchQuery.trim().toLowerCase();
        Object.entries(spec.paths).forEach(([pathStr, pathItem]) => {
            Object.entries(pathItem).forEach(([methodStr, operation]) => {
                if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(methodStr)) return;
                const op = operation as Operation;
                const methodUpper = methodStr.toUpperCase();
                const opTags = op.tags && op.tags.length > 0 ? op.tags : ['General'];
                const isProtected = op.security ? op.security.length > 0 : !!(spec.security && spec.security.length > 0);
                if (selectedMethods.length > 0 && !selectedMethods.includes(methodUpper)) return;
                if (selectedTags.length > 0 && !opTags.some(t => selectedTags.includes(t))) return;
                if (onlyProtected === true && !isProtected) return;
                if (onlyProtected === false && isProtected) return;
                let score = 0;
                const summary = (op.summary || '').toLowerCase();
                const desc = (op.description || '').toLowerCase();
                const pathLower = pathStr.toLowerCase();
                if (query) {
                    if (pathLower === query) score += 100; else if (pathLower.includes(query)) score += 50;
                    if (summary.includes(query)) score += 30;
                    if (desc.includes(query)) score += 10;
                    if (methodStr.toLowerCase() === query) score += 40;
                    opTags.forEach((t) => { if (t.toLowerCase().includes(query)) score += 15; });
                    if (score === 0) return;
                } else score = 1;
                list.push({ path: pathStr, method: methodStr, operation: op, isProtected, score });
            });
        });
        return list.sort((a, b) => b.score - a.score);
    }, [spec, searchQuery, selectedMethods, selectedTags, onlyProtected]);

    const getBreadcrumbs = (path: string) => {
        const cleanServer = selectedServer.replace(/^https?:\/\//, '');
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) return `${cleanServer} › root`;
        return `${cleanServer} › ${parts.join(' › ')}`;
    };

    return (
        <div className="flex-1 w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 scrollbar-thin select-text font-sans bg-[var(--background)] min-w-0">
            <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-6 md:gap-8 items-start min-w-0">
                {/* Mobile header */}
                <div className="w-full flex md:hidden items-center justify-between gap-2 shrink-0">
                    <p className="text-xs tracking-wide text-[var(--text-muted)] truncate">
                        Found <strong className="font-semibold text-[var(--text-heading)]">{searchResults.length}</strong> results{searchQuery ? ` for "${searchQuery}"` : ''}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Tip content="Share this search">
                            <button onClick={handleShareSearch}
                                className="size-8 rounded-lg border flex items-center justify-center cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)] hover:opacity-90">
                                <i className="ph ph-share-network text-[13px]"></i>
                            </button>
                        </Tip>
                        <button onClick={() => setFiltersModalOpen(true)}
                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer border-[var(--border)] text-[var(--text-heading)] bg-[var(--surface)]">
                            <i className="ph ph-funnel text-[14px]"></i> Filters
                            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]"></span>}
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="min-w-0 flex-1 w-full">
                    <div className="border-b pb-4 mb-6 border-[var(--border)] hidden md:flex items-center justify-between gap-3">
                        <p className="text-xs tracking-wide text-[var(--text-muted)]">
                            Found <strong className="font-semibold text-[var(--text-heading)]">{searchResults.length}</strong> results{searchQuery ? ` for "${searchQuery}"` : ''}
                        </p>
                        <Tip content="Share this search">
                            <button onClick={handleShareSearch}
                                className="h-7 px-2.5 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)] hover:opacity-90">
                                <i className="ph ph-share-network text-[12px]"></i> Share Search
                            </button>
                        </Tip>
                    </div>

                    {searchResults.length > 0 ? (
                        <div className="space-y-8 sm:space-y-10 w-full max-w-full">
                            {searchResults.map(({ path, method, operation, isProtected }) =>
                                <div key={`${method}-${path}`} className="animate-fade-in min-w-0 w-full">
                                    <div className="flex items-center gap-2 mb-0.5 group min-w-0 w-full">
                                        <div className="inline-flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                                            onClick={() => onSelectEndpoint(path, method)}>
                                            <MethodBadge method={method} size="xs" className="tracking-wide shrink-0" />
                                            <h3 className={clsx(`text-[15px] font-medium leading-snug group-hover:underline inline-block truncate ${operation.deprecated ? 'line-through opacity-70' : ''}`, "text-[var(--primary)]")}>
                                                {operation.summary || path}
                                            </h3>
                                        </div>
                                        <Tip content="Share endpoint">
                                            <button onClick={(e) => handleShareEndpoint(path, method, operation.summary, e)}
                                                className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-all cursor-pointer shrink-0">
                                                <i className="ph ph-share-network text-[12px]"></i>
                                            </button>
                                        </Tip>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {operation.deprecated && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold text-[var(--method-put)] bg-[var(--method-put)]/10 border-[var(--method-put)]/20 select-none">
                                                    <i className="ph ph-warning-circle text-[12px]"></i> Deprecated
                                                </span>
                                            )}
                                            {isProtected && (
                                                <Tip content="Requires authorization">
                                                    <i className="ph-fill ph-lock-key text-[var(--method-delete)] text-[10px] cursor-help"></i>
                                                </Tip>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-[11px] leading-tight mb-1.5 min-w-0 text-[var(--text-muted)]">
                                        <span className="font-mono select-all block truncate">{getBreadcrumbs(path)}</span>
                                    </div>

                                    {operation.description ? (
                                        <div className="text-[13px] leading-relaxed line-clamp-2 text-[var(--text)] max-w-full break-words">
                                            <Markdown className="markdown-body-simple"
                                                text={operation.description.length > 240 ? `${operation.description.substring(0, 240)}...` : operation.description} />
                                        </div>
                                    ) : (
                                        <p className="text-[12px] italic leading-relaxed text-[var(--text-muted)]">No description available.</p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 mt-2 select-none max-w-full">
                                        {operation.tags && operation.tags.map((tag) =>
                                            <span key={tag} className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase border bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">{tag}</span>
                                        )}
                                        {operation.operationId && (
                                            <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{operation.operationId}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <span className="w-16 h-16 rounded-full flex items-center justify-center text-xl mb-4 bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border)]">
                                <i className="ph ph-magnifying-glass-minus"></i>
                            </span>
                            <h3 className="text-sm font-extrabold text-[var(--text-heading)]">No matches found</h3>
                            <p className="text-xs max-w-sm mt-1 text-[var(--text-muted)]">Ensure your query spelling is accurate or adjust active filters to find more matching routes.</p>
                            <button onClick={handleClearFilters}
                                className="mt-4 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer select-none text-[var(--primary-contrast)] hover:opacity-90 shadow-sm bg-[var(--primary)]">
                                Reset All Filters
                            </button>
                        </div>
                    )}
                </div>

                {/* Desktop filters */}
                {!isMobile && (
                    <div className="w-72 shrink-0 sticky top-0 self-start space-y-5">
                        <FiltersPanel
                            allMethods={allMethods} allTags={allTags}
                            selectedMethods={selectedMethods} selectedTags={selectedTags} onlyProtected={onlyProtected}
                            handleToggleMethod={handleToggleMethod} handleToggleTag={handleToggleTag}
                            setOnlyProtected={setOnlyProtected} handleClearFilters={handleClearFilters}
                            hasActiveFilters={hasActiveFilters} />
                    </div>
                )}
            </div>

            {shareModal && <ShareModal isOpen={!!shareModal} onClose={() => setShareModal(null)} url={shareModal.url} title={shareModal.title} description={shareModal.description} />}

            {/* Mobile filters modal */}
            {filtersModalOpen && isMobile && (
                <div className="fixed inset-0 z-[2500] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[3px] animate-fade-in"
                    onClick={(e) => { if (e.target === e.currentTarget) setFiltersModalOpen(false); }}>
                    <div className="w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl border shadow-2xl overflow-hidden flex flex-col bg-[var(--surface)] border-[var(--border)] animate-zoom-in">
                        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0 bg-[var(--background)] border-[var(--border)] modal-header-mobile-pad">
                            <h3 className="font-bold text-sm flex items-center gap-2 text-[var(--text-heading)]">
                                <i className="ph ph-funnel text-[var(--primary)]"></i> Filters
                                {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]"></span>}
                            </h3>
                            <button onClick={() => setFiltersModalOpen(false)}
                                className="size-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] text-[var(--text-muted)]">
                                <i className="ph ph-x"></i>
                            </button>
                        </div>
                        <div className="overflow-y-auto scrollbar-thin p-4">
                            <FiltersPanel
                                allMethods={allMethods} allTags={allTags}
                                selectedMethods={selectedMethods} selectedTags={selectedTags} onlyProtected={onlyProtected}
                                handleToggleMethod={handleToggleMethod} handleToggleTag={handleToggleTag}
                                setOnlyProtected={setOnlyProtected} handleClearFilters={handleClearFilters}
                                hasActiveFilters={hasActiveFilters} />
                        </div>
                        <div className="px-4 py-3 border-t flex gap-2 shrink-0 bg-[var(--background)] border-[var(--border)]">
                            {hasActiveFilters && (
                                <button onClick={handleClearFilters}
                                    className="flex-1 py-2 rounded-lg text-xs font-bold border cursor-pointer border-[var(--border)] text-[var(--method-delete)] hover:bg-[var(--surface-hover)]">
                                    Reset All
                                </button>
                            )}
                            <button onClick={() => setFiltersModalOpen(false)}
                                className="flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] hover:opacity-90">
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
