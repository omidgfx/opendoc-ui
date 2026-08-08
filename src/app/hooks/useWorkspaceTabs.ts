import {
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import type {OpenApiSpec} from '../../types';
import {type TabItem, VIEW_TAB_META, type ViewTabKind} from '../../components/endpoint/EndpointTabs';
import {useTabPersistence} from './useTabPersistence';
import {useTabSwitcher} from './useTabSwitcher';

export type WorkspaceEndpoint = { path: string; method: string };
export type WorkspaceViewMode = 'docs' | 'examine' | 'both';

type NavigationSnapshot = {
    searchQuery: string;
    showSchemaExplorer: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    showHome: boolean;
    showWelcome: boolean;
    selectedMethodsLength: number;
    selectedTagsLength: number;
    onlyProtected: boolean | null;
};

interface UseWorkspaceTabsOptions {
    spec: OpenApiSpec | null;
    selectedSpecKey: string;
    loadedSpecKey: string;
    searchQuery: string;
    setSearchQuery: Dispatch<SetStateAction<string>>;
    setResultsQuery: Dispatch<SetStateAction<string>>;
    searchRenderTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    selectedMethods: string[];
    setSelectedMethods: Dispatch<SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: Dispatch<SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: Dispatch<SetStateAction<boolean | null>>;
    showWelcome: boolean;
    setShowWelcome: Dispatch<SetStateAction<boolean>>;
    showHome: boolean;
    setShowHome: Dispatch<SetStateAction<boolean>>;
    showSchemaExplorer: boolean;
    setShowSchemaExplorer: Dispatch<SetStateAction<boolean>>;
    showAbout: boolean;
    setShowAbout: Dispatch<SetStateAction<boolean>>;
    showAssistant: boolean;
    setShowAssistant: Dispatch<SetStateAction<boolean>>;
    setActiveResponseCode: Dispatch<SetStateAction<string | null>>;
    setModalStack: Dispatch<SetStateAction<string[]>>;
    modalCount: number;
}

export function useWorkspaceTabs({
                                     spec,
                                     selectedSpecKey,
                                     loadedSpecKey,
                                     searchQuery,
                                     setSearchQuery,
                                     setResultsQuery,
                                     searchRenderTimer,
                                     selectedMethods,
                                     setSelectedMethods,
                                     selectedTags,
                                     setSelectedTags,
                                     onlyProtected,
                                     setOnlyProtected,
                                     showWelcome,
                                     setShowWelcome,
                                     showHome,
                                     setShowHome,
                                     showSchemaExplorer,
                                     setShowSchemaExplorer,
                                     showAbout,
                                     setShowAbout,
                                     showAssistant,
                                     setShowAssistant,
                                     setActiveResponseCode,
                                     setModalStack,
                                     modalCount,
                                 }: UseWorkspaceTabsOptions) {
    const [selectedEndpoint, setSelectedEndpoint] = useState<WorkspaceEndpoint | null>(null);
    const [assistantUnread, setAssistantUnread] = useState(false);
    const [selectedTab, setSelectedTab] = useState<WorkspaceViewMode>('docs');
    // ---------- Endpoint tabs ----------
    const [endpointTabs, setEndpointTabs] = useState<TabItem[]>([]);
    const endpointTabsRef = useRef<TabItem[]>([]);
    endpointTabsRef.current = endpointTabs;
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const activeTabIdForAssistantRef = useRef<string | null>(null);
    activeTabIdForAssistantRef.current = activeTabId;
    const [tabViewModes, setTabViewModes] = useState<Record<string, 'docs' | 'examine' | 'both'>>({});

    const withPreviewLast = useCallback((list: TabItem[]): TabItem[] => {
        const previewIdx = list.findIndex(t => t.isPreview);
        if (previewIdx < 0 || previewIdx === list.length - 1) return list;
        const next = [...list];
        const [preview] = next.splice(previewIdx, 1);
        next.push(preview);
        return next;
    }, []);

    // Canonical tab ordering: permanent (and pinned) tabs first, then the single
    // preview slot. Every open/save/restore goes through this so the preview tab
    // always occupies the LAST slot — that is the invariant that keeps refresh
    // and deep-link restores from resurrecting replaced tabs in the wrong place.
    const orderTabs = useCallback((list: TabItem[]): TabItem[] => {
        const pinned = list.filter(t => t.isPreview && t.id.startsWith('view:'));
        const previews = list.filter(t => t.isPreview && !t.id.startsWith('view:'));
        const permanents = list.filter(t => !t.isPreview);
        const ordered = withPreviewLast([...permanents, ...pinned, ...previews]);
        // Enforce the single-preview invariant: at most one non-pinned preview.
        const nonPinned = ordered.filter(t => t.isPreview && !t.id.startsWith('view:'));
        if (nonPinned.length > 1) {
            const keep = nonPinned[0];
            const rest = new Set(nonPinned.slice(1).map(t => t.id));
            return ordered.filter(t => !rest.has(t.id) || t.id === keep.id);
        }
        return ordered;
    }, [withPreviewLast]);

    const getEndpointLabel = useCallback((path: string, method: string): string => {
        if (!spec?.paths) return path;
        const po = spec.paths[path];
        if (!po) return path;
        const op = (po as any)[method];
        return op?.summary || path;
    }, [spec]);

    const openEndpointPreview = useCallback((path: string, method: string) => {
        setShowWelcome(false);
        // Leaving the search session: drop the query so the hash sync can't
        // force the search tab back over the endpoint we just opened.
        if (searchRenderTimer.current) {
            clearTimeout(searchRenderTimer.current);
            searchRenderTimer.current = null;
        }
        setSearchQuery('');
        setResultsQuery('');
        const id = `${method.toLowerCase()}:${path}`;
        setEndpointTabs(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) {
                if (existing.isPreview) return withPreviewLast(prev);
                return prev;
            }
            const newTab: TabItem = {
                id,
                path,
                method: method.toLowerCase(),
                isPreview: true,
                label: getEndpointLabel(path, method)
            };
            // Replace the current preview slot (there is only ever one).
            const previewIdx = prev.findIndex(t => t.isPreview);
            if (previewIdx >= 0) {
                const oldId = prev[previewIdx].id;
                setTabViewModes(vm => {
                    const next2 = {...vm};
                    if (next2[oldId]) {
                        next2[id] = next2[oldId];
                        delete next2[oldId];
                    }
                    return next2;
                });
                return withPreviewLast(prev.map(t => t.id === oldId ? newTab : t));
            }
            return [...prev, newTab];
        });
        setActiveTabId(id);
        setSelectedEndpoint({path, method: method.toLowerCase()});
    }, [getEndpointLabel, withPreviewLast]);

    const openEndpointPermanent = useCallback((path: string, method: string) => {
        setShowWelcome(false);
        if (searchRenderTimer.current) {
            clearTimeout(searchRenderTimer.current);
            searchRenderTimer.current = null;
        }
        setSearchQuery('');
        setResultsQuery('');
        const id = `${method.toLowerCase()}:${path}`;
        setEndpointTabs(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) {
                if (existing.isPreview) {
                    return prev.map(t => t.id === id ? {...t, isPreview: false} : t);
                }
                return prev;
            }
            const newTab: TabItem = {
                id,
                path,
                method: method.toLowerCase(),
                isPreview: false,
                label: getEndpointLabel(path, method)
            };
            const previewIdx = prev.findIndex(t => t.isPreview);
            if (previewIdx >= 0) {
                const next = [...prev];
                next.splice(previewIdx, 0, newTab);
                return next;
            }
            return [...prev, newTab];
        });
        setActiveTabId(id);
        setSelectedEndpoint({path, method: method.toLowerCase()});
        // Sidebar middle-click is a navigation action too. If the Assistant was
        // visible, hide it immediately so the newly activated permanent tab is
        // actually the page the user sees.
        setShowWelcome(false);
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
        setSelectedTab('docs');
    }, [getEndpointLabel]);

    /** Stash the current search query + filters onto the search tab so they
     *  survive navigating away and back. */
    const stashSearchTab = useCallback(() => {
        setEndpointTabs(prev => prev.map(t => t.id === 'view:search'
            ? {...t, query: searchQuery, filters: {methods: selectedMethods, tags: selectedTags, onlyProtected}}
            : t));
    }, [searchQuery, selectedMethods, selectedTags, onlyProtected]);

    const [scrollIntent, setScrollIntent] = useState<{ type: 'endpoint' | 'view'; id: string } | null>(null);

    const handleSelectTab = useCallback((id: string) => {
        if (id === 'view:assistant') setAssistantUnread(false);
        if (activeTabId === 'view:search' && id !== 'view:search') stashSearchTab();
        setShowWelcome(false);
        setActiveTabId(id);
        const tab = endpointTabs.find(t => t.id === id);
        if (!tab) return;

        if (tab.kind && tab.kind !== 'endpoint') {
            // View tab (overview / search / schema explorer / about)
            setSelectedEndpoint(null);
            setShowHome(tab.kind === 'home');
            setShowSchemaExplorer(tab.kind === 'schemas');
            setShowAbout(tab.kind === 'about');
            setShowAssistant(tab.kind === 'assistant');
            if (tab.kind === 'search') {
                // Bring back the query AND the filters for this search session.
                setSearchQuery(tab.query || '');
                setResultsQuery(tab.query || '');
                setSelectedMethods(tab.filters?.methods || []);
                setSelectedTags(tab.filters?.tags || []);
                setOnlyProtected(tab.filters?.onlyProtected ?? null);
            } else {
                setSearchQuery('');
            }
            setActiveResponseCode(null);
            setScrollIntent({type: 'view', id: tab.id});
            return;
        }
        setSelectedEndpoint({path: tab.path, method: tab.method});
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
        setSearchQuery('');
    }, [endpointTabs, activeTabId, stashSearchTab]);

    const {
        switcherOpen,
        switcherIndex,
        setSwitcherOpen,
        cancelSwitcher,
        openSwitcher,
    } = useTabSwitcher({
        tabs: endpointTabs,
        activeTabId,
        modalCount,
        onSelectTab: handleSelectTab,
    });


    /** Open (or re-activate) one of the named view tabs: overview, search,
     *  schema explorer or about. View tabs are permanent tabs and never touch
     *  the endpoint preview slot — opening search while reading an endpoint
     *  keeps that endpoint tab around, so clearing the search can return to it. */
    /** Open (or re-activate) one of the four sidebar view tabs with PREVIEW
     *  semantics — exactly like an endpoint preview tab: reuses an existing tab
     *  of the same id, otherwise replaces the current preview slot and stays a
     *  preview (double-click / middle-click pins it via openViewTabPermanent). */
    const openViewTab = useCallback((view: ViewTabKind, query = '') => {
        setShowWelcome(false);
        const id = `view:${view}`;
        const label = view === 'search'
            ? (query ? `Search: ${query}` : 'Search')
            : VIEW_TAB_META[view].label;
        setEndpointTabs(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) {
                return prev.map(t => t.id === id ? {
                    ...t,
                    isPreview: view === 'assistant' ? false : t.isPreview,
                    query: view === 'search' ? query : undefined
                } : t);
            }
            const newTab: TabItem = {
                id,
                path: '',
                method: '',
                isPreview: view === 'assistant' ? false : true,
                label,
                kind: view,
                query: view === 'search' ? query : undefined
            };
            const previewIdx = prev.findIndex(t => t.isPreview);
            if (previewIdx >= 0) {
                const oldId = prev[previewIdx].id;
                return withPreviewLast(prev.map(t => t.id === oldId ? newTab : t));
            }
            return [...prev, newTab];
        });
        setActiveTabId(id);
        setSelectedEndpoint(null);
        setShowHome(view === 'home');
        setShowSchemaExplorer(view === 'schemas');
        setShowAbout(view === 'about');
        setShowAssistant(view === 'assistant');
        setSearchQuery(view === 'search' ? query : '');
        setActiveResponseCode(null);
        setModalStack([]);
    }, []);

    /** Open a view tab as a permanent tab (double/middle click on the sidebar
     *  nav buttons) — same semantics as openEndpointPermanent. */
    const openViewTabPermanent = useCallback((view: ViewTabKind, query = '') => {
        setShowWelcome(false);
        const id = `view:${view}`;
        const label = view === 'search'
            ? (query ? `Search: ${query}` : 'Search')
            : VIEW_TAB_META[view].label;
        setEndpointTabs(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) return prev.map(t => t.id === id ? {
                ...t,
                isPreview: false,
                query: view === 'search' ? query : undefined
            } : t);
            const newTab: TabItem = {
                id,
                path: '',
                method: '',
                isPreview: false,
                label,
                kind: view,
                query: view === 'search' ? query : undefined
            };
            return orderTabs([...prev, newTab]);
        });
        setActiveTabId(id);
        setSelectedEndpoint(null);
        setShowHome(view === 'home');
        setShowSchemaExplorer(view === 'schemas');
        setShowAbout(view === 'about');
        setShowAssistant(view === 'assistant');
        setSearchQuery(view === 'search' ? query : '');
        setActiveResponseCode(null);
        setModalStack([]);
    }, [orderTabs]);

    /** Apply the view state that matches a tab (used when closing tabs or
     *  restoring state from a deep link). */
    const applyTabViewState = useCallback((tab: TabItem | null) => {
        if (!tab) {
            // Every tab closed -> welcome page (not the overview).
            setSelectedEndpoint(null);
            setShowHome(false);
            setShowSchemaExplorer(false);
            setShowAbout(false);
            setShowAssistant(false);
            setSearchQuery('');
            setShowWelcome(true);
            return;
        }
        setShowWelcome(false);
        if (tab.kind && tab.kind !== 'endpoint') {
            setSelectedEndpoint(null);
            setShowHome(tab.kind === 'home');
            setShowSchemaExplorer(tab.kind === 'schemas');
            setShowAbout(tab.kind === 'about');
            setShowAssistant(tab.kind === 'assistant');
            if (tab.kind === 'search') {
                setSearchQuery(tab.query || '');
                setResultsQuery(tab.query || '');
                setSelectedMethods(tab.filters?.methods || []);
                setSelectedTags(tab.filters?.tags || []);
                setOnlyProtected(tab.filters?.onlyProtected ?? null);
            } else {
                setSearchQuery('');
                setResultsQuery('');
            }
            // Make the sidebar scroll to the activated page (like endpoints do).
            setScrollIntent({type: 'view', id: tab.id});
            return;
        }
        setSelectedEndpoint({path: tab.path, method: tab.method});
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
        setSearchQuery('');
    }, []);

    // Latest navigation flags kept in a ref so ensureViewTabFromState can stay
    // referentially stable. If its identity changed on every navigation, the
    // spec-load effect that calls it would re-run mid-navigation and revert the
    // freshly applied state using the still-stale URL hash.
    const navStateRef = useRef({
        searchQuery: '',
        showSchemaExplorer: false,
        showAbout: false,
        showAssistant: false,
        showHome: true,
        showWelcome: false,
        selectedMethodsLength: 0,
        selectedTagsLength: 0,
        onlyProtected: null as boolean | null
    });
    navStateRef.current = {
        searchQuery,
        showSchemaExplorer,
        showAbout,
        showAssistant,
        showHome,
        showWelcome,
        selectedMethodsLength: selectedMethods.length,
        selectedTagsLength: selectedTags.length,
        onlyProtected
    };

    /** After hash-driven state changes, make sure the matching view tab exists
     *  and is the active one (deep links like #/parsable/x/schema-explorer). */
    const ensureViewTabFromState = useCallback((override?: {
        searchQuery?: string;
        showSchemaExplorer?: boolean;
        showAbout?: boolean;
        showAssistant?: boolean;
        showHome?: boolean;
        searchMethods?: string[];
        searchTags?: string[];
        searchSecured?: boolean | null
    }) => {
        const s = {...navStateRef.current, ...override};
        const expected: ViewTabKind | null =
            (s.searchQuery || '').trim().length || (s.searchMethods?.length || 0) > 0 || (s.searchTags?.length || 0) > 0 || s.searchSecured !== null
                ? 'search'
                : s.showSchemaExplorer
                    ? 'schemas'
                    : s.showAssistant
                        ? 'assistant'
                        : s.showAbout
                            ? 'about'
                            : null;
        // While the welcome page shows there are no tabs, so nothing should be
        // force-created — unless the URL explicitly asks for a view (about,
        // schema explorer, search), which must leave welcome and open normally.
        if (s.showWelcome && !expected) return;
        if (!expected) return;
        if (expected === 'assistant') setAssistantUnread(false);
        setShowWelcome(false);
        // If the search tab is already active, don't force anything (this was
        // making clicking a result bounce straight back to the search tab).
        if (expected === 'search') {
            const already = endpointTabsRef.current.find(t => t.id === 'view:search');
            if (already) {
                setActiveTabId('view:search');
                return;
            }
        }
        const id = `view:${expected}`;
        setEndpointTabs(prev => {
            if (prev.some(t => t.id === id)) return prev;
            const label = expected === 'search'
                ? (s.searchQuery ? `Search: ${s.searchQuery}` : 'Search')
                : VIEW_TAB_META[expected].label;
            const newTab: TabItem = {
                id, path: '', method: '', isPreview: false, label, kind: expected,
                query: expected === 'search' ? s.searchQuery : undefined,
            };
            return orderTabs([...prev, newTab]);
        });
        setActiveTabId(id);
    }, [orderTabs]);

    const handleCloseTab = useCallback((id: string) => {
        // Closing the search tab ends the search session — drop phrase + filters
        // so the URL is scrubbed clean instead of keeping orphan filter params.
        if (id === 'view:search') {
            setSearchQuery('');
            setResultsQuery('');
            setSelectedMethods([]);
            setSelectedTags([]);
            setOnlyProtected(null);
        }
        setEndpointTabs(prev => {
            const idx = prev.findIndex(t => t.id === id);
            if (idx < 0) return prev;
            const next = prev.filter(t => t.id !== id);
            if (id === activeTabId) {
                const newActive = next[Math.min(idx, next.length - 1)] || null;
                setActiveTabId(newActive?.id || null);
                applyTabViewState(newActive);
            }
            return next;
        });
        setTabViewModes(vm => {
            const next = {...vm};
            delete next[id];
            return next;
        });
    }, [activeTabId, applyTabViewState]);

    const handleDoubleClickTab = useCallback((id: string) => {
        setEndpointTabs(prev => withPreviewLast(prev.map(t => t.id === id ? {...t, isPreview: false} : t)));
    }, [withPreviewLast]);

    const handleCloseAllLeft = useCallback((id: string) => {
        setEndpointTabs(prev => {
            const idx = prev.findIndex(t => t.id === id);
            if (idx <= 0) return prev;
            const toRemove = prev.slice(0, idx).map(t => t.id);
            const next = prev.slice(idx);
            if (toRemove.includes(activeTabId || '')) {
                setActiveTabId(id);
                const tab = next.find(t => t.id === id);
                if (tab) applyTabViewState(tab);
            }
            setTabViewModes(vm => {
                const n = {...vm};
                toRemove.forEach(r => delete n[r]);
                return n;
            });
            return next;
        });
    }, [activeTabId, applyTabViewState]);

    const handleCloseAllRight = useCallback((id: string) => {
        setEndpointTabs(prev => {
            const idx = prev.findIndex(t => t.id === id);
            if (idx < 0 || idx >= prev.length - 1) return prev;
            const toRemove = prev.slice(idx + 1).map(t => t.id);
            const next = prev.slice(0, idx + 1);
            if (toRemove.includes(activeTabId || '')) {
                setActiveTabId(id);
                const tab = next.find(t => t.id === id);
                if (tab) applyTabViewState(tab);
            }
            setTabViewModes(vm => {
                const n = {...vm};
                toRemove.forEach(r => delete n[r]);
                return n;
            });
            return next;
        });
    }, [activeTabId, applyTabViewState]);

    const handleCloseOthers = useCallback((id: string) => {
        setEndpointTabs(prev => {
            const keep = prev.find(t => t.id === id);
            if (!keep) return prev;
            const toRemove = prev.filter(t => t.id !== id).map(t => t.id);
            setActiveTabId(id);
            applyTabViewState(keep);
            setTabViewModes(vm => {
                const n: Record<string, 'docs' | 'examine' | 'both'> = {};
                if (vm[id]) n[id] = vm[id];
                return n;
            });
            return [keep];
        });
    }, [applyTabViewState]);

    const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
        setEndpointTabs(prev => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return withPreviewLast(next);
        });
    }, [withPreviewLast]);

    useEffect(() => {
        if (!spec) return;
        setEndpointTabs(prev => prev.map(t =>
            t.kind && t.kind !== 'endpoint'
                ? t
                : {...t, label: getEndpointLabel(t.path, t.method)},
        ));
    }, [spec, getEndpointLabel]);

    const {
        tabsRestoredForKey,
        tabsRestoreDoneRef,
        specRouteReadyRef,
    } = useTabPersistence({
        selectedSpecKey: selectedSpecKey,
        loadedSpecKey,
        spec,
        tabs: endpointTabs,
        activeTabId,
        viewModes: tabViewModes,
        selectedViewMode: selectedTab,
        orderTabs,
        getEndpointLabel,
        applyTabViewState,
        setTabs: setEndpointTabs,
        setActiveTabId,
        setViewModes: setTabViewModes,
        setSelectedViewMode: setSelectedTab,
        setShowWelcome,
    });

    // ---------- Alt+Left/Right tab switching ----------
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!e.altKey) return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (modalCount > 0) return;
            if (endpointTabs.length <= 1) return;
            e.preventDefault();
            const currentIdx = endpointTabs.findIndex(t => t.id === activeTabId);
            if (currentIdx < 0) return;
            let nextIdx: number;
            if (e.key === 'ArrowLeft') {
                nextIdx = currentIdx > 0 ? currentIdx - 1 : endpointTabs.length - 1;
            } else {
                nextIdx = currentIdx < endpointTabs.length - 1 ? currentIdx + 1 : 0;
            }
            const nextTab = endpointTabs[nextIdx];
            if (nextTab) {
                setActiveTabId(nextTab.id);
                setSelectedEndpoint({path: nextTab.path, method: nextTab.method});
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [endpointTabs, activeTabId, modalCount]);


    return {
        selectedEndpoint,
        setSelectedEndpoint,
        assistantUnread,
        setAssistantUnread,
        selectedTab,
        setSelectedTab,
        endpointTabs,
        setEndpointTabs,
        activeTabId,
        setActiveTabId,
        activeTabIdForAssistantRef,
        tabViewModes,
        setTabViewModes,
        scrollIntent,
        setScrollIntent,
        openEndpointPreview,
        openEndpointPermanent,
        stashSearchTab,
        handleSelectTab,
        openViewTab,
        openViewTabPermanent,
        applyTabViewState,
        ensureViewTabFromState,
        handleCloseTab,
        handleDoubleClickTab,
        handleCloseAllLeft,
        handleCloseAllRight,
        handleCloseOthers,
        handleReorderTabs,
        switcherOpen,
        switcherIndex,
        setSwitcherOpen,
        cancelSwitcher,
        openSwitcher,
        tabsRestoredForKey,
        tabsRestoreDoneRef,
        specRouteReadyRef,
        navStateRef,
    };
}
