import React, {useMemo, useState} from 'react';
import ShareModal from '@/src/components/modals/ShareModal';
import {useEscClose} from '@/src/hooks/useEscClose';
import {OpenApiSpec, Operation} from '@/src/types';
import Markdown from '@/src/components/common/Markdown';
import MethodBadge from '@/src/components/common/MethodBadge';
import clsx from "clsx";
import {Tip} from '@/src/components/common/Tooltip';
import {useBreakpoint} from '@/src/hooks/useBreakpoint';
import FiltersPanel from './FiltersPanel';
import {useModalTransition} from '@/src/hooks/useModalTransition';
import {isOperationProtected} from '@/src/utils/auth';
import {getDocumentOperations, getOperation} from '@/src/utils/openapi';

interface SearchResultsViewProps {
    spec: OpenApiSpec | null;
    searchQuery: string;
    onSelectEndpoint: (path: string, method: string) => void;
    onMiddleClickEndpoint?: (path: string, method: string) => void;
    selectedServer: string;
    selectedMethods: string[];
    setSelectedMethods: React.Dispatch<React.SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: React.Dispatch<React.SetStateAction<boolean | null>>;
    displayRoutes: boolean;
    parsableKey?: string;
}

export default function SearchResultsView({
                                              spec,
                                              searchQuery,
                                              onSelectEndpoint,
                                              onMiddleClickEndpoint,
                                              selectedServer,
                                              selectedMethods,
                                              setSelectedMethods,
                                              selectedTags,
                                              setSelectedTags,
                                              onlyProtected,
                                              setOnlyProtected,
                                              displayRoutes,
                                              parsableKey = 'API'
                                          }: SearchResultsViewProps) {
    const [shareModal, setShareModal] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const [filtersModalOpen, setFiltersModalOpen] = useState(false);
    const filterTransition = useModalTransition(filtersModalOpen, () => setFiltersModalOpen(false));
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
        if (e)
            e.stopPropagation();
        let endpointId = `${method}-${path.replace(/^\//, '').replace(/\//g, '-')}`;
        try {
            const op = getOperation(spec, path, method);
            if (op?.operationId)
                endpointId = op.operationId;
        } catch {
        }
        const url = `${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(parsableKey)}/api/${encodeURIComponent(endpointId)}`;
        setShareModal({
            url,
            title: `${method.toUpperCase()} ${path} - ${summary || 'API Endpoint'}`,
            description: `Check out this API endpoint: ${method.toUpperCase()} ${path}`
        });
    };
    const handleClearFilters = () => {
        setSelectedMethods([]);
        setSelectedTags([]);
        setOnlyProtected(null);
    };
    const {allTags, allMethods} = useMemo(() => {
        const tagsSet = new Set<string>();
        const methodsSet = new Set<string>();
        getDocumentOperations(spec).forEach(({method, operation}) => {
            methodsSet.add(method.toUpperCase());
            if (operation.tags && Array.isArray(operation.tags))
                operation.tags.forEach(tag => tagsSet.add(tag));
            else
                tagsSet.add('General');
        });
        return {allTags: Array.from(tagsSet).sort(), allMethods: Array.from(methodsSet).sort()};
    }, [spec]);
    const handleToggleMethod = (method: string) => setSelectedMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);
    const handleToggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    const hasActiveFilters = selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
    const searchResults = useMemo(() => {
        if (!spec || !spec.paths)
            return [];
        const list: Array<{
            path: string;
            method: string;
            operation: Operation;
            isProtected: boolean;
            score: number;
        }> = [];
        const query = searchQuery.trim().toLowerCase();
        const terms = query.split(/[\s._-]+/).filter(Boolean);
        getDocumentOperations(spec).forEach(({path: pathStr, method: methodStr, operation: op}) => {
                const methodUpper = methodStr.toUpperCase();
                const opTags = op.tags && op.tags.length > 0 ? op.tags : ['General'];
                const isProtected = isOperationProtected(spec, op);
                if (selectedMethods.length > 0 && !selectedMethods.includes(methodUpper))
                    return;
                if (selectedTags.length > 0 && !opTags.some(t => selectedTags.includes(t)))
                    return;
                if (onlyProtected === true && !isProtected)
                    return;
                if (onlyProtected === false && isProtected)
                    return;
                let score = 0;
                const summary = (op.summary || '').toLowerCase();
                const desc = (op.description || '').toLowerCase();
                const pathLower = pathStr.toLowerCase();
                if (query) {
                    const searchable = [
                        ...(displayRoutes ? [pathLower] : []),
                        summary,
                        desc,
                        methodStr.toLowerCase(),
                        ...opTags.map(t => t.toLowerCase()),
                    ];
                    if (!terms.every(term => searchable.some(value => value.includes(term))))
                        return;
                    if (displayRoutes && pathLower === query)
                        score += 100;
                    else if (displayRoutes && terms.every(term => pathLower.includes(term)))
                        score += 50;
                    if (terms.every(term => summary.includes(term)))
                        score += 30;
                    if (terms.every(term => desc.includes(term)))
                        score += 10;
                    if (methodStr.toLowerCase() === query)
                        score += 40;
                    opTags.forEach((t) => {
                        if (terms.every(term => t.toLowerCase().includes(term)))
                            score += 15;
                    });
                } else
                    score = 1;
                list.push({path: pathStr, method: methodStr, operation: op, isProtected, score});
        });
        return list.sort((a, b) => b.score - a.score);
    }, [spec, searchQuery, selectedMethods, selectedTags, onlyProtected, displayRoutes]);
    const getBreadcrumbs = (path: string) => {
        const cleanServer = selectedServer.replace(/^https?:\/\//, '');
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0)
            return `${cleanServer} › root`;
        return `${cleanServer} › ${parts.join(' › ')}`;
    };
    return (<div
        className="flex-1 w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 scrollbar-thin select-text font-sans bg-[var(--surface)] min-w-0">
        <div className="w-full flex flex-col md:flex-row gap-6 md:gap-8 items-start min-w-0">

            <div className="w-full flex md:hidden items-center justify-between gap-2 shrink-0">
                <p className="text-xs tracking-wide text-[var(--text-muted)] truncate">
                    Found <strong
                    className="font-semibold text-[var(--text-heading)]">{searchResults.length}</strong> results{searchQuery ? ` for "${searchQuery}"` : ''}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Tip content="Share this search">
                        <button onClick={handleShareSearch}
                                className="size-8 text-[10px] font-bold rounded-lg border flex items-center justify-center cursor-pointer border-[var(--border)] text-[var(--text-heading)] bg-[var(--surface)]">

                            <i className="ph ph-share-network text-[13px]"></i>
                        </button>
                    </Tip>
                    <button onClick={() => setFiltersModalOpen(true)}
                            className="px-3 h-8 text-[10px] font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer border-[var(--border)] text-[var(--text-heading)] bg-[var(--surface)]">
                        <i className="ph ph-funnel text-[14px]"></i> Filters
                        {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]"></span>}
                    </button>
                </div>
            </div>


            <div className="min-w-0 flex-1 w-full">
                <div
                    className="border-b pb-4 mb-6 border-[var(--border)] hidden md:flex items-center justify-between gap-3">
                    <p className="text-xs tracking-wide text-[var(--text-muted)]">
                        Found <strong
                        className="font-semibold text-[var(--text-heading)]">{searchResults.length}</strong> results{searchQuery ? ` for "${searchQuery}"` : ''}
                    </p>
                    <Tip content="Share this search">
                        <button onClick={handleShareSearch}
                                className="px-3 h-8 text-[10px] font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer border-[var(--border)] text-[var(--text-heading)] bg-[var(--surface)]">
                            <i className="ph ph-share-network text-[12px]"></i> Share Search
                        </button>
                    </Tip>
                </div>

                {searchResults.length > 0 ? (<div
                    className="space-y-8 sm:space-y-10 w-full max-w-full">                            {searchResults.map(({
                                                                                                                              path,
                                                                                                                              method,
                                                                                                                              operation,
                                                                                                                              isProtected
                                                                                                                          }) =>
                    <div key={`${method}-${path}`} className="animate-fade-in min-w-0 w-full max-w-lg">
                        <div className="flex items-center gap-2 mb-0.5 group min-w-0 w-fit">
                            <div className="inline-flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                                 onClick={() => onSelectEndpoint(path, method)} onDoubleClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (onMiddleClickEndpoint) {
                                    onMiddleClickEndpoint(path, method);
                                }
                            }} onMouseDown={(e) => {
                                if (e.button === 1 && onMiddleClickEndpoint) {
                                    e.preventDefault();
                                    onMiddleClickEndpoint(path, method);
                                }
                            }}>
                                <MethodBadge method={method} size="xs" className="tracking-wide shrink-0"/>
                                <h3 className={clsx(`text-[15px] font-medium leading-snug group-hover:underline inline-block truncate ${operation.deprecated ? 'line-through opacity-70' : ''}`, "text-[var(--primary)]")}>
                                    {operation.summary || path}
                                </h3>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {operation.deprecated && (<span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold text-[var(--method-put)] bg-[var(--method-put)]/10 border-[var(--method-put)]/20 select-none">
                                    <i className="ph ph-warning-circle text-[12px]"></i> Deprecated
                                </span>)}
                                {isProtected && (<Tip content="Requires authorization">
                                    <i className="ph-fill ph-lock-key text-[var(--method-delete)] text-[10px] cursor-help"></i>
                                </Tip>)}
                            </div>
                            <Tip content="Share endpoint">
                                <button onClick={(e) => handleShareEndpoint(path, method, operation.summary, e)}
                                        className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-all cursor-pointer shrink-0">
                                    <i className="ph ph-share-network text-[12px]"></i>
                                </button>
                            </Tip>
                        </div>

                        <div className="text-[11px] leading-tight mb-1.5 min-w-0 text-[var(--text-muted)]">
                            <span className="font-mono select-all block truncate">{getBreadcrumbs(path)}</span>
                        </div>

                        {operation.description ? (<div
                            className="text-[13px] leading-relaxed line-clamp-2 text-[var(--text)] max-w-full break-words">
                            <Markdown className="markdown-body-simple"
                                      text={operation.description.length > 240 ? `${operation.description.substring(0, 240)}...` : operation.description}/>
                        </div>) : (<p className="text-[12px] italic leading-relaxed text-[var(--text-muted)]">No
                            description available.</p>)}

                        <div className="flex flex-wrap items-center gap-2 mt-2 select-none max-w-full">
                            {operation.tags && operation.tags.map((tag) => <span key={tag}
                                                                                 className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase border bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">{tag}</span>)}
                            {operation.operationId && (<span
                                className="font-mono text-[10px] text-[var(--text-muted)] truncate">{operation.operationId}</span>)}
                        </div>
                    </div>)}
                </div>) : (<div className="flex flex-col items-center justify-center py-20 text-center">
                    <span
                        className="w-16 h-16 rounded-full flex items-center justify-center text-xl mb-4 bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border)]">
                        <i className="ph ph-magnifying-glass-minus"></i>
                    </span>
                    <h3 className="text-sm font-extrabold text-[var(--text-heading)]">No matches found</h3>
                    <p className="text-xs max-w-sm mt-1 text-[var(--text-muted)]">Ensure your query spelling is
                        accurate or adjust active filters to find more matching routes.</p>
                    <button onClick={handleClearFilters}
                            className="mt-4 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer select-none text-[var(--primary-contrast)] hover:opacity-90 shadow-sm bg-[var(--primary)]">
                        Reset All Filters
                    </button>
                </div>)}
            </div>


            {!isMobile && (<div className="w-72 shrink-0 sticky top-0 self-start space-y-5">
                <FiltersPanel allMethods={allMethods} allTags={allTags} selectedMethods={selectedMethods}
                              selectedTags={selectedTags} onlyProtected={onlyProtected}
                              handleToggleMethod={handleToggleMethod} handleToggleTag={handleToggleTag}
                              setOnlyProtected={setOnlyProtected} handleClearFilters={handleClearFilters}
                              hasActiveFilters={hasActiveFilters}/>
            </div>)}
        </div>

        {shareModal && <ShareModal isOpen={!!shareModal} onClose={() => setShareModal(null)} url={shareModal.url}
                                   title={shareModal.title} description={shareModal.description}/>}


        {filterTransition.shouldRender && isMobile && (<div
            className={`${filterTransition.backdropClassName} fixed inset-0 z-[2500] bg-black/50 backdrop-blur-[3px]`}
            onClick={(e) => {
                if (e.target === e.currentTarget)
                    filterTransition.requestClose();
            }}>
            <div
                className="modal-surface w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl border shadow-2xl overflow-hidden flex flex-col bg-[var(--surface)] border-[var(--border)]">
                <div
                    className="px-4 py-3 border-b flex items-center justify-between shrink-0 bg-[var(--background)] border-[var(--border)] modal-header-mobile-pad">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-[var(--text-heading)]">
                        <i className="ph ph-funnel text-[var(--primary)]"></i> Filters
                        {hasActiveFilters &&
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]"></span>}
                    </h3>
                    <button onClick={filterTransition.requestClose}
                            className="size-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] text-[var(--text-muted)]">
                        <i className="ph ph-x"></i>
                    </button>
                </div>
                <div className="modal-scroll-region overflow-y-auto scrollbar-thin p-4">
                    <FiltersPanel allMethods={allMethods} allTags={allTags} selectedMethods={selectedMethods}
                                  selectedTags={selectedTags} onlyProtected={onlyProtected}
                                  handleToggleMethod={handleToggleMethod} handleToggleTag={handleToggleTag}
                                  setOnlyProtected={setOnlyProtected} handleClearFilters={handleClearFilters}
                                  hasActiveFilters={hasActiveFilters}/>
                </div>
                <div className="px-4 py-3 border-t flex gap-2 shrink-0 bg-[var(--background)] border-[var(--border)]">
                    {hasActiveFilters && (<button onClick={handleClearFilters}
                                                  className="flex-1 py-2 rounded-lg text-xs font-bold border cursor-pointer border-[var(--border)] text-[var(--method-delete)] hover:bg-[var(--surface-hover)]">
                        Reset All
                    </button>)}
                    <button onClick={filterTransition.requestClose}
                            className="flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] hover:opacity-90">
                        Apply
                    </button>
                </div>
            </div>
        </div>)}
    </div>);
}
