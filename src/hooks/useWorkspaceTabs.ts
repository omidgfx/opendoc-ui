import {
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import type {OpenApiSpec} from '../types';
import {type TabItem, VIEW_TAB_META, type ViewTabKind} from '../components/endpoint/EndpointTabs';
import {useTabPersistence} from './useTabPersistence';
import {useTabSwitcher} from './useTabSwitcher';
import {getOperation} from '../utils/openapi';
import {usePreferences} from '../contexts/PreferencesContext';

export type WorkspaceEndpoint = {
    path: string;
    method: string;
};
export type WorkspaceViewMode = 'docs' | 'examine' | 'both';
type NavigationSnapshot = {
    searchQuery: string;
    showSchemaExplorer: boolean;
    showNotes: boolean;
    showCompatibility: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    showSettings: boolean;
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
    showNotes: boolean;
    setShowNotes: Dispatch<SetStateAction<boolean>>;
    showCompatibility: boolean;
    setShowCompatibility: Dispatch<SetStateAction<boolean>>;
    showAbout: boolean;
    setShowAbout: Dispatch<SetStateAction<boolean>>;
    showAssistant: boolean;
    setShowAssistant: Dispatch<SetStateAction<boolean>>;
    showSettings: boolean;
    setShowSettings: Dispatch<SetStateAction<boolean>>;
    setActiveResponseCode: Dispatch<SetStateAction<string | null>>;
    setModalStack: Dispatch<SetStateAction<string[]>>;
    modalCount: number;
    onUserNavigate: () => void;
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
    showNotes,
    setShowNotes,
    showCompatibility,
    setShowCompatibility,
    showAbout,
    setShowAbout,
    showAssistant,
    setShowAssistant,
    showSettings,
    setShowSettings,
    setActiveResponseCode,
    setModalStack,
    modalCount,
    onUserNavigate,
}: UseWorkspaceTabsOptions) {
    const {preferences} = usePreferences();
    const previewTabsEnabled = preferences.previewTabsEnabled;
    const [selectedEndpoint, setSelectedEndpoint] = useState<WorkspaceEndpoint | null>(null);
    const [assistantUnread, setAssistantUnread] = useState(false);
    const [selectedTab, setSelectedTab] = useState<WorkspaceViewMode>('docs');
    const [endpointTabs, setEndpointTabs] = useState<TabItem[]>([]);
    const endpointTabsRef = useRef<TabItem[]>([]);
    endpointTabsRef.current = endpointTabs;
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const activeTabIdForAssistantRef = useRef<string | null>(null);
    activeTabIdForAssistantRef.current = activeTabId;
    const [tabViewModes, setTabViewModes] = useState<Record<string, 'docs' | 'examine' | 'both'>>({});
    const setViewVisibility = useCallback(
        (view: ViewTabKind | null) => {
            setShowHome(view === 'home');
            setShowSchemaExplorer(view === 'schemas');
            setShowNotes(view === 'notes');
            setShowCompatibility(view === 'compatibility');
            setShowAbout(view === 'about');
            setShowAssistant(view === 'assistant');
            setShowSettings(view === 'settings');
        },
        [
            setShowHome,
            setShowSchemaExplorer,
            setShowNotes,
            setShowCompatibility,
            setShowAbout,
            setShowAssistant,
            setShowSettings,
        ],
    );
    const withPreviewLast = useCallback((list: TabItem[]): TabItem[] => {
        const previewIdx = list.findIndex(t => t.isPreview);
        if (previewIdx < 0 || previewIdx === list.length - 1) return list;
        const next = [...list];
        const [preview] = next.splice(previewIdx, 1);
        next.push(preview);
        return next;
    }, []);
    const orderTabs = useCallback(
        (list: TabItem[]): TabItem[] => {
            const pinned = list.filter(t => t.isPreview && t.id.startsWith('view:'));
            const previews = list.filter(t => t.isPreview && !t.id.startsWith('view:'));
            const permanents = list.filter(t => !t.isPreview);
            const ordered = withPreviewLast([...permanents, ...pinned, ...previews]);
            const nonPinned = ordered.filter(t => t.isPreview && !t.id.startsWith('view:'));
            if (nonPinned.length > 1) {
                const keep = nonPinned[0];
                const rest = new Set(nonPinned.slice(1).map(t => t.id));
                return ordered.filter(t => !rest.has(t.id) || t.id === keep.id);
            }
            return ordered;
        },
        [withPreviewLast],
    );
    const getEndpointLabel = useCallback(
        (path: string, method: string): string => {
            if (!spec?.paths) return path;
            return getOperation(spec, path, method)?.summary || path;
        },
        [spec],
    );
    const openEndpointPreview = useCallback(
        (path: string, method: string) => {
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
                    if (existing.isPreview) return withPreviewLast(prev);
                    return prev;
                }
                const newTab: TabItem = {
                    id,
                    path,
                    method: method.toLowerCase(),
                    isPreview: previewTabsEnabled,
                    label: getEndpointLabel(path, method),
                };
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
                    return withPreviewLast(prev.map(t => (t.id === oldId ? newTab : t)));
                }
                return [...prev, newTab];
            });
            setActiveTabId(id);
            setSelectedEndpoint({path, method: method.toLowerCase()});
            setViewVisibility(null);
        },
        [getEndpointLabel, withPreviewLast, previewTabsEnabled, setViewVisibility],
    );
    const openEndpointPermanent = useCallback(
        (path: string, method: string) => {
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
                        return prev.map(t => (t.id === id ? {...t, isPreview: false} : t));
                    }
                    return prev;
                }
                const newTab: TabItem = {
                    id,
                    path,
                    method: method.toLowerCase(),
                    isPreview: false,
                    label: getEndpointLabel(path, method),
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
            setShowWelcome(false);
            setViewVisibility(null);
            setSelectedTab('docs');
        },
        [getEndpointLabel, setViewVisibility],
    );
    const stashSearchTab = useCallback(() => {
        setEndpointTabs(prev =>
            prev.map(t =>
                t.id === 'view:search'
                    ? {...t, query: searchQuery, filters: {methods: selectedMethods, tags: selectedTags, onlyProtected}}
                    : t,
            ),
        );
    }, [searchQuery, selectedMethods, selectedTags, onlyProtected]);
    const [scrollIntent, setScrollIntent] = useState<{
        type: 'endpoint' | 'view';
        id: string;
    } | null>(null);
    const handleSelectTab = useCallback(
        (id: string) => {
            onUserNavigate();
            if (id === 'view:assistant') setAssistantUnread(false);
            if (activeTabId === 'view:search' && id !== 'view:search') stashSearchTab();
            setShowWelcome(false);
            setActiveTabId(id);
            const tab = endpointTabs.find(t => t.id === id);
            if (!tab) return;
            if (tab.kind && tab.kind !== 'endpoint') {
                setSelectedEndpoint(null);
                setViewVisibility(tab.kind);
                if (tab.kind === 'search') {
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
            setViewVisibility(null);
            setSearchQuery('');
        },
        [endpointTabs, activeTabId, stashSearchTab, setViewVisibility, onUserNavigate],
    );
    const {switcherOpen, switcherIndex, setSwitcherOpen, cancelSwitcher, openSwitcher} = useTabSwitcher({
        tabs: endpointTabs,
        activeTabId,
        modalCount,
        onSelectTab: handleSelectTab,
    });
    const openViewTab = useCallback(
        (view: ViewTabKind, query = '') => {
            onUserNavigate();
            setShowWelcome(false);
            const id = `view:${view}`;
            const label = view === 'search' ? (query ? `Search: ${query}` : 'Search') : VIEW_TAB_META[view].label;
            setEndpointTabs(prev => {
                const existing = prev.find(t => t.id === id);
                if (existing) {
                    return prev.map(t =>
                        t.id === id
                            ? {
                                  ...t,
                                  isPreview: view === 'assistant' ? false : t.isPreview,
                                  query: view === 'search' ? query : undefined,
                              }
                            : t,
                    );
                }
                const newTab: TabItem = {
                    id,
                    path: '',
                    method: '',
                    isPreview: view === 'assistant' ? false : previewTabsEnabled,
                    label,
                    kind: view,
                    query: view === 'search' ? query : undefined,
                };
                const previewIdx = prev.findIndex(t => t.isPreview);
                if (previewIdx >= 0) {
                    const oldId = prev[previewIdx].id;
                    return withPreviewLast(prev.map(t => (t.id === oldId ? newTab : t)));
                }
                return [...prev, newTab];
            });
            setActiveTabId(id);
            setSelectedEndpoint(null);
            setViewVisibility(view);
            setSearchQuery(view === 'search' ? query : '');
            setActiveResponseCode(null);
            setModalStack([]);
        },
        [setViewVisibility, onUserNavigate, previewTabsEnabled],
    );
    const openViewTabPermanent = useCallback(
        (view: ViewTabKind, query = '') => {
            setShowWelcome(false);
            const id = `view:${view}`;
            const label = view === 'search' ? (query ? `Search: ${query}` : 'Search') : VIEW_TAB_META[view].label;
            setEndpointTabs(prev => {
                const existing = prev.find(t => t.id === id);
                if (existing)
                    return prev.map(t =>
                        t.id === id
                            ? {
                                  ...t,
                                  isPreview: false,
                                  query: view === 'search' ? query : undefined,
                              }
                            : t,
                    );
                const newTab: TabItem = {
                    id,
                    path: '',
                    method: '',
                    isPreview: false,
                    label,
                    kind: view,
                    query: view === 'search' ? query : undefined,
                };
                return orderTabs([...prev, newTab]);
            });
            setActiveTabId(id);
            setSelectedEndpoint(null);
            setViewVisibility(view);
            setSearchQuery(view === 'search' ? query : '');
            setActiveResponseCode(null);
            setModalStack([]);
        },
        [orderTabs, setViewVisibility],
    );
    const applyTabViewState = useCallback(
        (tab: TabItem | null) => {
            if (!tab) {
                setSelectedEndpoint(null);
                setViewVisibility(null);
                setSearchQuery('');
                setShowWelcome(true);
                return;
            }
            setShowWelcome(false);
            if (tab.kind && tab.kind !== 'endpoint') {
                setSelectedEndpoint(null);
                setViewVisibility(tab.kind);
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
                setScrollIntent({type: 'view', id: tab.id});
                return;
            }
            setSelectedEndpoint({path: tab.path, method: tab.method});
            setViewVisibility(null);
            setSearchQuery('');
        },
        [setViewVisibility],
    );
    const navStateRef = useRef<NavigationSnapshot>({
        searchQuery: '',
        showSchemaExplorer: false,
        showNotes: false,
        showCompatibility: false,
        showAbout: false,
        showAssistant: false,
        showSettings: false,
        showHome: true,
        showWelcome: false,
        selectedMethodsLength: 0,
        selectedTagsLength: 0,
        onlyProtected: null,
    });
    navStateRef.current = {
        searchQuery,
        showSchemaExplorer,
        showNotes,
        showCompatibility,
        showAbout,
        showAssistant,
        showSettings,
        showHome,
        showWelcome,
        selectedMethodsLength: selectedMethods.length,
        selectedTagsLength: selectedTags.length,
        onlyProtected,
    };
    const ensureViewTabFromState = useCallback(
        (override?: {
            searchQuery?: string;
            showSchemaExplorer?: boolean;
            showNotes?: boolean;
            showCompatibility?: boolean;
            showAbout?: boolean;
            showAssistant?: boolean;
            showSettings?: boolean;
            showHome?: boolean;
            searchMethods?: string[];
            searchTags?: string[];
            searchSecured?: boolean | null;
        }) => {
            const s = {...navStateRef.current, ...override};
            const expected: ViewTabKind | null =
                (s.searchQuery || '').trim().length ||
                (s.searchMethods?.length || 0) > 0 ||
                (s.searchTags?.length || 0) > 0 ||
                s.searchSecured !== null
                    ? 'search'
                    : s.showSchemaExplorer
                      ? 'schemas'
                      : s.showNotes
                        ? 'notes'
                        : s.showCompatibility
                          ? 'compatibility'
                          : s.showAssistant
                            ? 'assistant'
                            : s.showSettings
                              ? 'settings'
                              : s.showAbout
                                ? 'about'
                                : null;
            if (s.showWelcome && !expected) return;
            if (!expected) return;
            if (expected === 'assistant') setAssistantUnread(false);
            setShowWelcome(false);
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
                const label =
                    expected === 'search'
                        ? s.searchQuery
                            ? `Search: ${s.searchQuery}`
                            : 'Search'
                        : VIEW_TAB_META[expected].label;
                const newTab: TabItem = {
                    id,
                    path: '',
                    method: '',
                    isPreview: false,
                    label,
                    kind: expected,
                    query: expected === 'search' ? s.searchQuery : undefined,
                };
                return orderTabs([...prev, newTab]);
            });
            setActiveTabId(id);
        },
        [orderTabs],
    );
    const handleCloseTab = useCallback(
        (id: string) => {
            onUserNavigate();
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
        },
        [activeTabId, applyTabViewState, onUserNavigate],
    );
    const handleDoubleClickTab = useCallback(
        (id: string) => {
            setEndpointTabs(prev => withPreviewLast(prev.map(t => (t.id === id ? {...t, isPreview: false} : t))));
        },
        [withPreviewLast],
    );
    const handleCloseAllLeft = useCallback(
        (id: string) => {
            onUserNavigate();
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
        },
        [activeTabId, applyTabViewState, onUserNavigate],
    );
    const handleCloseAllRight = useCallback(
        (id: string) => {
            onUserNavigate();
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
        },
        [activeTabId, applyTabViewState, onUserNavigate],
    );
    const handleCloseOthers = useCallback(
        (id: string) => {
            onUserNavigate();
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
        },
        [applyTabViewState, onUserNavigate],
    );
    const handleReorderTabs = useCallback(
        (fromIndex: number, toIndex: number) => {
            setEndpointTabs(prev => {
                const next = [...prev];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                return withPreviewLast(next);
            });
        },
        [withPreviewLast],
    );
    useEffect(() => {
        if (!spec) return;
        setEndpointTabs(prev =>
            prev.map(t => (t.kind && t.kind !== 'endpoint' ? t : {...t, label: getEndpointLabel(t.path, t.method)})),
        );
    }, [spec, getEndpointLabel]);
    const {tabsRestoredForKey, tabsRestoreDoneRef, specRouteReadyRef} = useTabPersistence({
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
                onUserNavigate();
                setActiveTabId(nextTab.id);
                setSelectedEndpoint({path: nextTab.path, method: nextTab.method});
                setViewVisibility(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [endpointTabs, activeTabId, modalCount, setViewVisibility, onUserNavigate]);
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
