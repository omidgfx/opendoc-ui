import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';

import type {
    ActiveAuth,
    AISettings,
    ExamineResponse,
    OpenApiSpec,
    Parsable,
    ParsableConfig,
    ParsedRoute,
    ThemeMode
} from './types';
import {THEME_LIST} from './data/themes';
import {generateSmartRoute, getEndpointId, parseSmartRoute, resolveEndpointFromId} from './utils/routing';
import {useBreakpoint} from './hooks/useBreakpoint';
import {clearAllCachedSpecs, clearCachedSpec, fetchSpecText} from './utils/specCache';
import {migrateLegacyStorage, specStorage, storage, uiStorage} from './utils/storage';
import {
    clearLocalHistory,
    findLocalHistoryEntry,
    type LocalHistoryEntry,
    readLocalHistory,
    removeLocalHistoryEntry,
    upsertLocalHistory,
} from './utils/localHistory';

import Topbar from './components/layout/Topbar';
import Sidebar from './components/layout/Sidebar/Sidebar';
import HomeView from './components/views/HomeView/HomeView';
import SearchResultsView from './components/views/SearchResultsView/SearchResultsView';
import AboutView from './components/views/AboutView/AboutView';
import NoSpecView from './components/views/NoSpecView';
import WelcomeView from './components/views/WelcomeView';
import SchemaExplorer from './components/schema/SchemaExplorer';
import ModalsStack from './components/modals/ModalsStack/ModalsStack';
import CodeGeneratorModal from './components/modals/CodeGeneratorModal';
import ThemeSelectorModal from './components/modals/ThemeSelectorModal';
import ShareModal from './components/modals/ShareModal';
import AuthModal from './components/modals/AuthModal';
import {TooltipProvider} from './components/common/Tooltip';
import {OperationLinkProvider} from './contexts/OperationLinkContext';
import {useResizableSplit} from './hooks/useResizableSplit';
import EndpointTabs, {type TabItem, VIEW_TAB_META, type ViewTabKind} from './components/endpoint/EndpointTabs';
import AIAssistantView from './components/ai/AIAssistantView';
import AISettingsModal from './components/ai/AISettingsModal';
import {
    clearAIConversations,
    clearAISessionSecrets,
    clearAllAIConversations,
    readAIProfiles,
    readAISettings,
    writeAISettings
} from './utils/aiStorage';
import {createOpenDocUIActionId, dispatchOpenDocUIAction, dispatchOpenDocUIRunnerResult, type OpenDocUIAction} from './utils/aiBridge';
import {executeRunnerRequest} from './utils/runnerExecution';

declare global {
    interface Window {
        INITIAL_CONFIG?: any;
    }
}

import {endpointKey, parseSpecDraft, type ConfigSource, type EndpointKey, type LocalSpec} from './app/spec';
import {hasExplicitSpecRoute, isValidTabPersistence, type StoredTabViewMode} from './app/tabPersistence';
import EmptySearchState from './app/components/EmptySearchState';
import EndpointWorkspace from './app/components/EndpointWorkspace';
import SpecLoadingState from './app/components/SpecLoadingState';
import TabSwitcherOverlay from './app/components/TabSwitcherOverlay';
import {applyThemeCssVariables, createThemeCssVariables} from './app/themeCss';

export default function App() {
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    const [parsables, setParsables] = useState<ParsableConfig>({});
    const [configSource, setConfigSource] = useState<ConfigSource>('none');
    const [selectedParsableKey, setSelectedParsableKey] = useState<string>('');
    const [spec, setSpec] = useState<OpenApiSpec | null>(null);
    // `spec` and the selected key are updated independently. Keep the key that
    // actually produced the current document so restore effects can never
    // validate one specification's tabs against the previous specification.
    const [loadedSpecKey, setLoadedSpecKey] = useState<string>('');
    const [isLoadingSpec, setIsLoadingSpec] = useState(false);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
    const [isRefreshingSpec, setIsRefreshingSpec] = useState(false);
    const loadSpecSeq = useRef(0);

    const [searchQuery, setSearchQuery] = useState('');
    const [showWelcome, setShowWelcome] = useState(false);
    const [selectedEndpoint, setSelectedEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [showHome, setShowHome] = useState(true);
    const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showAssistant, setShowAssistant] = useState(false);
    const [assistantUnread, setAssistantUnread] = useState(false);
    const [assistantContextEndpoints, setAssistantContextEndpoints] = useState<Array<{
        path: string;
        method: string
    }>>([]);
    const showAssistantRef = useRef(showAssistant);
    showAssistantRef.current = showAssistant;

    const [aiSettings, setAISettings] = useState<AISettings>(() => readAISettings());
    const [hasAIProfile, setHasAIProfile] = useState(() => readAIProfiles().length > 0);
    const [aiSettingsReady, setAISettingsReady] = useState(false);
    const [showAISettings, setShowAISettings] = useState(false);
    const assistantRunnerAbortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        if (aiSettingsReady) writeAISettings(aiSettings);
    }, [aiSettings, aiSettingsReady]);

    const handleAISettingsSave = useCallback((settings: AISettings) => {
        setAISettings(settings);
        setHasAIProfile(readAIProfiles().length > 0);
    }, []);

    const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [onlyProtected, setOnlyProtected] = useState<boolean | null>(null);
    const [sidebarDisplayRoutes, setSidebarDisplayRoutes] = useState(true);

    useEffect(() => {
        if (!selectedParsableKey) {
            setSidebarDisplayRoutes(true);
            return;
        }
        const saved = specStorage.getJSON<{ displayRoutes?: boolean }>(
            selectedParsableKey,
            'sidebar_config',
            {},
            (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        );
        setSidebarDisplayRoutes(saved.displayRoutes !== false);
    }, [selectedParsableKey]);

    const [selectedThemeName, setSelectedThemeName] = useState('Default Slate');
    const [currentThemeMode, setCurrentThemeMode] = useState<ThemeMode>('system');
    const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(
        () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches,
    );

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const onChange = (e: MediaQueryListEvent) => setSystemPrefersLight(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const resolvedThemeMode: 'light' | 'dark' =
        currentThemeMode === 'system' ? (systemPrefersLight ? 'light' : 'dark') : currentThemeMode;

    // Cycles system → the mode opposite to the OS → the other explicit mode →
    // system, so both explicit modes are reachable and there is always a way
    // back to "follow the OS" (every third click).
    const toggleThemeMode = useCallback(() => {
        // Fixed rotation driven only by the OS preference (not the current
        // resolved mode, which changes as the user toggles):
        //   OS dark:  system → light → dark → system
        //   OS light: system → dark → light → system
        // Every third click returns to "follow the OS".
        setCurrentThemeMode(m => {
            if (m === 'system') return systemPrefersLight ? 'dark' : 'light';
            if (m === 'light') return systemPrefersLight ? 'system' : 'dark';
            return systemPrefersLight ? 'light' : 'system';
        });
    }, [systemPrefersLight]);

    const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => uiStorage.get('sidebar_collapsed') === 'true');
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!isMobile) uiStorage.set('sidebar_collapsed', String(desktopCollapsed));
    }, [desktopCollapsed, isMobile]);

    const [modalsStack, setModalsStack] = useState<string[]>([]);
    const [codeGenEndpoint, setCodeGenEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [selectedTab, setSelectedTab] = useState<'docs' | 'examine' | 'both'>('docs');
    const [activeSplitPane, setActiveSplitPane] = useState<'docs' | 'examine'>('docs');
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const {
        leftWidth: docsPaneWidth,
        isDragging: isSplitDragging,
        onMouseDown: onSplitResizeMouseDown
    } = useResizableSplit(splitContainerRef, 'opendoc:ui:endpoint_split_width');
    useEffect(() => {
        if (selectedTab === 'both') setActiveSplitPane('docs');
    }, [selectedTab, selectedEndpoint]);

    const [activeResponseCode, setActiveResponseCode] = useState<string | null>(null);

    const [activeAuth, setActiveAuth] = useState<ActiveAuth>({
        activeScheme: 'none', selectedSchemes: [], schemeValues: {}, requirementIndex: 0,
        cookieValues: {}, bearerToken: '', apiKeyName: 'X-API-KEY', apiKeyValue: '', apiKeyIn: 'header',
        basicUsername: '', basicPassword: '',
    });
    const [selectedServer, setSelectedServer] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showThemeModal, setShowThemeModal] = useState(false);

    const [examineResponses, setExamineResponses] = useState<Record<EndpointKey, ExamineResponse>>({});

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

    // ---------- Ctrl+` tab switcher (Windows Alt+Tab style) ----------
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [switcherIndex, setSwitcherIndex] = useState(0);
    const switcherPrevTabRef = useRef<string | null>(null);
    // The switcher always delegates to the current tab-selection handler.
    const handleSelectTabRef = useRef<(id: string) => void>(() => {
    });

    const commitSwitcher = useCallback(() => {
        const list = endpointTabsRef.current;
        const tab = list[Math.min(switcherIndex, list.length - 1)];
        setSwitcherOpen(false);
        if (tab) handleSelectTabRef.current(tab.id);
    }, [switcherIndex]);

    const cancelSwitcher = useCallback(() => {
        setSwitcherOpen(false);
        // Esc returns to the tab that was active before the switcher opened.
        if (switcherPrevTabRef.current) {
            const tab = endpointTabsRef.current.find(t => t.id === switcherPrevTabRef.current);
            if (tab) handleSelectTabRef.current(tab.id);
        }
        switcherPrevTabRef.current = null;
    }, []);

    useEffect(() => {
        // Windows Alt+Tab semantics on Ctrl+` (and Ctrl+Tab as a best-effort
        // accelerator where the browser allows it):
        //   - Ctrl+`        opens the switcher with the NEXT tab selected
        //   - Ctrl+Shift+`  opens it with the PREVIOUS tab selected
        //   - holding and pressing again keeps cycling
        //   - releasing Ctrl commits the highlighted tab; Esc cancels
        const cycleSwitcher = (e: KeyboardEvent, dir: number) => {
            e.preventDefault();
            const list = endpointTabsRef.current;
            if (list.length < 2) return;
            if (!switcherOpen) {
                const cur = list.findIndex(t => t.id === activeTabId);
                switcherPrevTabRef.current = activeTabId;
                setSwitcherIndex(cur >= 0 ? (cur + dir + list.length) % list.length : 0);
                setSwitcherOpen(true);
            } else {
                setSwitcherIndex(i => (i + dir + list.length) % list.length);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === '~' || e.key === 'Tab')) {
                cycleSwitcher(e, e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape' && switcherOpen) {
                e.preventDefault();
                cancelSwitcher();
            } else if (e.key === 'Enter' && switcherOpen) {
                e.preventDefault();
                commitSwitcher();
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if ((e.key === 'Control' || e.key === 'Meta') && switcherOpen) commitSwitcher();
        };
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
        };
    }, [switcherOpen, activeTabId, commitSwitcher, cancelSwitcher]);

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

    handleSelectTabRef.current = handleSelectTab;

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
        setModalsStack([]);
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
        setModalsStack([]);
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

    // ---------- Per-spec tab persistence ----------
    // The key in this state is also the write barrier. On a spec transition the
    // selected key changes first while tab state still belongs to the outgoing
    // spec. Nothing may write (or delete) the incoming namespace until its
    // document has loaded and its saved session has been applied.
    const [tabsRestoredForKey, setTabsRestoredForKey] = useState('');
    const tabsRestoreDoneRef = useRef('');
    // Hash generation/processing has a separate per-spec barrier. This prevents
    // the outgoing UI from rewriting the newly selected spec's plain URL while
    // its document and tabs are still being restored.
    const specRouteReadyRef = useRef('');

    useEffect(() => {
        if (!selectedParsableKey || loadedSpecKey !== selectedParsableKey
            || tabsRestoredForKey !== selectedParsableKey) return;
        // Persist only "committed" tabs: permanent endpoint/view tabs. Preview
        // tabs are transient and intentionally do not survive a spec switch or
        // page reload.
        const persistable = endpointTabs.filter(t => !t.isPreview);
        const activeId = activeTabId && endpointTabs.some(t => t.id === activeTabId && !t.isPreview)
            ? activeTabId
            : (persistable[persistable.length - 1]?.id || '');
        if (persistable.length === 0) {
            void specStorage.remove(selectedParsableKey, 'tabs');
            return;
        }
        const data = {tabs: orderTabs(persistable), activeTabId: activeId, viewModes: tabViewModes};
        specStorage.setJSON(selectedParsableKey, 'tabs', data);
    }, [endpointTabs, activeTabId, tabViewModes, selectedParsableKey, loadedSpecKey, tabsRestoredForKey, orderTabs]);

    useEffect(() => {
        if (!spec || !selectedParsableKey || loadedSpecKey !== selectedParsableKey) return;
        if (tabsRestoredForKey === selectedParsableKey) return;

        const data = specStorage.getJSON<{
            tabs: TabItem[];
            activeTabId?: string;
            viewModes?: Record<string, StoredTabViewMode>
        } | null>(
            selectedParsableKey, 'tabs', null,
            isValidTabPersistence,
        );
        const filtered = data?.tabs?.length
            ? orderTabs(data.tabs.filter((tab: TabItem) => !tab.isPreview)).filter((tab: TabItem) =>
                tab.kind && tab.kind !== 'endpoint' ? true : !!spec.paths?.[tab.path]?.[tab.method],
            )
            : [];
        const restoredTabs = filtered.map((tab: TabItem) =>
            tab.kind && tab.kind !== 'endpoint'
                ? tab
                : {...tab, label: getEndpointLabel(tab.path, tab.method)},
        );
        const restoredModes = data?.viewModes
            ? Object.fromEntries(
                Object.entries(data.viewModes).filter(([id]) => restoredTabs.some(tab => tab.id === id)),
            ) as Record<string, StoredTabViewMode>
            : {};
        const restoredActiveTab = restoredTabs.find(tab => tab.id === data?.activeTabId)
            || restoredTabs[restoredTabs.length - 1]
            || null;

        setEndpointTabs(restoredTabs);
        setTabViewModes(restoredModes);
        setActiveTabId(restoredActiveTab?.id || null);
        applyTabViewState(restoredActiveTab);
        const restoredMode = restoredActiveTab ? restoredModes[restoredActiveTab.id] : undefined;
        if (restoredMode) setSelectedTab(restoredMode);

        // An explicit deep link is applied after this restore and becomes the
        // active tab. A plain spec route means "resume this spec"; with no saved
        // committed tabs it correctly lands on the welcome page.
        const route = parseSmartRoute(window.location.hash);
        if (hasExplicitSpecRoute(route, window.location.hash)) setShowWelcome(false);

        tabsRestoreDoneRef.current = selectedParsableKey;
        setTabsRestoredForKey(selectedParsableKey);
    }, [spec, selectedParsableKey, loadedSpecKey, tabsRestoredForKey, getEndpointLabel, orderTabs, applyTabViewState]);

    // Restore a saved mode only when tab identity changes. Mode changes made by
    // the user then flow in one direction (selectedTab -> tabViewModes), avoiding
    // the old pair of competing effects that could alternate docs/split forever.
    const restoringTabModeRef = useRef<{ tabId: string; mode: StoredTabViewMode } | null>(null);
    useEffect(() => {
        if (!activeTabId) {
            restoringTabModeRef.current = null;
            return;
        }
        const mode = tabViewModes[activeTabId];
        if (mode && mode !== selectedTab) {
            restoringTabModeRef.current = {tabId: activeTabId, mode};
            setSelectedTab(mode);
        } else {
            restoringTabModeRef.current = null;
        }
        // Deliberately keyed by tab identity. Watching tabViewModes here creates
        // a bidirectional feedback loop with the persistence effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabId]);

    useEffect(() => {
        if (!activeTabId) return;
        const restoring = restoringTabModeRef.current;
        if (restoring?.tabId === activeTabId) {
            if (restoring.mode === selectedTab) restoringTabModeRef.current = null;
            return;
        }
        setTabViewModes(current => current[activeTabId] === selectedTab
            ? current
            : {...current, [activeTabId]: selectedTab});
    }, [selectedTab, activeTabId]);

    // ---------- Alt+Left/Right tab switching ----------
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!e.altKey) return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (modalsStack.length > 0) return;
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
    }, [endpointTabs, activeTabId, modalsStack]);

    const [isUpdatingHash, setIsUpdatingHash] = useState(false);

    // ---------- Document title ----------
    useEffect(() => {
        if (spec?.info?.title) document.title = `${spec.info.title} — OpenDoc UI`;
        else if (selectedParsableKey) document.title = `${selectedParsableKey} — OpenDoc UI`;
        else document.title = 'OpenDoc UI';
    }, [spec, selectedParsableKey]);

    // ---------- Theme (per spec) ----------
    // As with tabs, restoration and persistence need a render boundary between
    // them. Otherwise the outgoing theme is written under the incoming key in
    // the same effect flush, before the restored state has rendered.
    const [themeRestoredForKey, setThemeRestoredForKey] = useState('');
    useEffect(() => {
        if (!selectedParsableKey) return;
        const t = specStorage.get(selectedParsableKey, 'theme');
        setSelectedThemeName(t && THEME_LIST.some(x => x.name === t) ? t : 'Default Slate');
        const m = specStorage.get(selectedParsableKey, 'theme_mode');
        setCurrentThemeMode(m === 'light' || m === 'dark' || m === 'system' ? m : 'system');
        setThemeRestoredForKey(selectedParsableKey);
    }, [selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey && themeRestoredForKey === selectedParsableKey) {
            specStorage.set(selectedParsableKey, 'theme', selectedThemeName);
        }
    }, [selectedThemeName, selectedParsableKey, themeRestoredForKey]);
    useEffect(() => {
        if (selectedParsableKey && themeRestoredForKey === selectedParsableKey) {
            specStorage.set(selectedParsableKey, 'theme_mode', currentThemeMode);
        }
    }, [currentThemeMode, selectedParsableKey, themeRestoredForKey]);
    useEffect(() => {
        if (selectedParsableKey && parsables[selectedParsableKey]) uiStorage.set('last_parsable', selectedParsableKey);
    }, [selectedParsableKey, parsables]);

    const activeTheme = useMemo(
        () => THEME_LIST.find(theme => theme.name === selectedThemeName) || THEME_LIST[0],
        [selectedThemeName],
    );
    const activePalette = resolvedThemeMode === 'light' ? activeTheme.light : activeTheme.dark;

    // Apply theme CSS variables on documentElement so portaled elements pick them up.
    useEffect(() => applyThemeCssVariables(activePalette), [activePalette]);
    const styleVars = useMemo(() => createThemeCssVariables(activePalette), [activePalette]);

    // ---------- Spec loading ----------
    const loadSpec = async (parsableKey: string, parsable: Parsable, forceRefresh = false) => {
        const seq = ++loadSpecSeq.current;
        setIsLoadingSpec(true);
        setLoadedSpecKey('');
        setSpec(null);

        try {
            let obj: OpenApiSpec | null = null;
            if (parsable.isCustom === true && parsable.rawSpec) {
                obj = parseSpecDraft(parsable.rawSpec);
            } else if (parsable.url) {
                const raw = await fetchSpecText(parsable.url, {force: forceRefresh});
                obj = parseSpecDraft(raw);
            }
            if (seq !== loadSpecSeq.current) return;
            setSpec(obj);
            setLoadedSpecKey(obj ? parsableKey : '');
            if (obj) setSelectedServer(obj.servers?.[0]?.url || 'https://api.example.com');
        } catch (e) {
            if (seq !== loadSpecSeq.current) return;
            console.error(`Failed to load spec '${parsableKey}'`, e);
            setLoadedSpecKey('');
            setSpec(null);
        } finally {
            if (seq === loadSpecSeq.current) setIsLoadingSpec(false);
        }
    };

    useEffect(() => {
        if (!selectedParsableKey) return;
        const p = parsables[selectedParsableKey];
        if (p) loadSpec(selectedParsableKey, p);
    }, [selectedParsableKey, parsables]);

    // ---------- Local specs (no config.json / INITIAL_CONFIG) ----------
    const [localSpec, setLocalSpec] = useState<LocalSpec | null>(null);
    const [localHistory, setLocalHistory] = useState<LocalHistoryEntry[]>(() => readLocalHistory());
    const [localOpenError, setLocalOpenError] = useState<string | null>(null);
    const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

    const applyLocalSpec = useCallback((raw: string, fileName: string, file: File | null) => {
        const obj = parseSpecDraft(raw);
        const title = obj?.info?.title || fileName.replace(/\.(json|ya?ml)$/i, '') || fileName;
        const key = `local:${fileName}`;
        const entry: LocalHistoryEntry = {key, title, fileName, raw, openedAt: Date.now()};
        setLocalSpec({key, title, fileName, raw, file});
        upsertLocalHistory(entry);
        setLocalHistory(readLocalHistory());
        const switchingSpec = key !== selectedParsableKey;
        setSelectedParsableKey(key);
        setSpec(obj);
        setLoadedSpecKey(key);
        setIsLoadingSpec(false);
        if (obj) setSelectedServer(obj.servers?.[0]?.url || 'https://api.example.com');
        if (switchingSpec) {
            setSelectedEndpoint(null);
            setShowWelcome(false);
            setShowHome(false);
            setShowSchemaExplorer(false);
            setShowAbout(false);
            setShowAssistant(false);
            setAssistantContextEndpoints([]);
            setSearchQuery('');
            setResultsQuery('');
            setActiveResponseCode(null);
            setModalsStack([]);
            setSelectedTab('docs');
            setSelectedMethods([]);
            setSelectedTags([]);
            setOnlyProtected(null);
            setEndpointTabs([]);
            setActiveTabId(null);
            setTabViewModes({});
            setExamineResponses({});
            setIsUpdatingHash(true);
            const h = `#/parsable/${encodeURIComponent(key)}`;
            if (window.location.hash !== h) window.location.hash = h;
            setIsUpdatingHash(false);
        }
        return obj;
    }, [selectedParsableKey]);

    const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setLocalOpenError(null);
        try {
            const raw = await file.text();
            applyLocalSpec(raw, file.name, file);
        } catch (err) {
            setLocalOpenError(`"${file.name}" could not be parsed as JSON or YAML.`);
            console.error('Failed to open local spec file', err);
        }
    };

    const handleSelectHistoryEntry = (entry: LocalHistoryEntry) => {
        setLocalOpenError(null);
        try {
            applyLocalSpec(entry.raw, entry.fileName, null);
        } catch (err) {
            setLocalOpenError(`"${entry.fileName}" could not be parsed anymore.`);
            console.error('Failed to reopen spec from history', err);
        }
    };

    const handleRemoveHistoryEntry = (key: string) => {
        removeLocalHistoryEntry(key);
        setLocalHistory(readLocalHistory());
    };

    const handleClearHistory = () => {
        clearLocalHistory();
        setLocalHistory([]);
    };

    // ---------- Refresh (drop cache, reload) ----------
    const handleRefreshSpec = useCallback(async () => {
        setIsRefreshingSpec(true);
        // Keep the spinner visible for at least ~700ms; a local fetch can be
        // nearly instant and the animation would otherwise be invisible.
        const minVisible = new Promise(r => setTimeout(r, 700));
        try {
            if (selectedParsableKey && parsables[selectedParsableKey]) {
                await clearAllCachedSpecs();
                await loadSpec(selectedParsableKey, parsables[selectedParsableKey], true);
            } else if (localSpec) {
                if (localSpec.file) {
                    const raw = await localSpec.file.text();
                    applyLocalSpec(raw, localSpec.fileName, localSpec.file);
                } else {
                    setSpec(parseSpecDraft(localSpec.raw));
                    setLoadedSpecKey(localSpec.key);
                }
            }
        } catch (e) {
            console.error('Refresh failed', e);
            setLocalOpenError('Could not re-read the specification.');
        } finally {
            await minVisible;
            setIsRefreshingSpec(false);
        }
    }, [selectedParsableKey, parsables, localSpec, applyLocalSpec]);

    const handleReloadSpecification = useCallback(async (specKey: string) => {
        if (specKey === selectedParsableKey) await handleRefreshSpec();
    }, [selectedParsableKey, handleRefreshSpec]);

    const handleResetSpecification = useCallback(async (specKey: string) => {
        await clearAIConversations(specKey);
        await specStorage.clear(specKey);
        const source = parsables[specKey];
        if (source?.url) await clearCachedSpec(source.url);
        // A full reload guarantees that every in-memory tab/theme/sidebar state
        // is rebuilt from the now-empty storage namespace as well.
        window.setTimeout(() => window.location.reload(), 0);
    }, [parsables]);

    const handleResetAllConfigurations = useCallback(async () => {
        await uiStorage.clear();
        clearAISessionSecrets();
        await clearAllAIConversations();
        await specStorage.clearAll();
        await clearAllCachedSpecs();
        window.setTimeout(() => window.location.reload(), 0);
    }, []);

    // ---------- Config bootstrap ----------
    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            migrateLegacyStorage();
            let data: any = null;
            let source: ConfigSource = 'none';
            if (window.INITIAL_CONFIG) {
                data = window.INITIAL_CONFIG;
                source = 'initial';
            } else {
                try {
                    const r = await fetch('/config.json', {cache: 'no-store'});
                    if (r.ok) {
                        data = await r.json();
                        source = 'file';
                    }
                } catch (err) {
                    console.warn('config.json unreachable, running in local mode.', err);
                }
            }

            if (cancelled) return;
            setConfigSource(source);

            // Runtime AI configuration is treated as a default. A user’s
            // locally saved global settings take precedence over it.
            if (data?.ai && typeof data.ai === 'object' && storage.get(uiStorage.key('ai_settings')) === '') {
                setAISettings(current => ({
                    ...current,
                    ...data.ai,
                    ...(Array.isArray(data.ai.skillPacks) ? {skillPacks: data.ai.skillPacks} : {}),
                }));
            }
            setAISettingsReady(true);

            const loaded: ParsableConfig = {};
            if (data?.parsables && typeof data.parsables === 'object') {
                Object.entries(data.parsables).forEach(([k, v]: [string, any]) => {
                    loaded[k] = {
                        theme: v.theme || 'Default Slate',
                        url: v.url || '',
                        title: v.title || k,
                        isCustom: v.isCustom === true || !!v.rawSpec,
                        rawSpec: v.rawSpec || '',
                    };
                });
            }
            setParsables(loaded);

            if (Object.keys(loaded).length > 0) {
                let initialKey = '';
                const p = parseSmartRoute(window.location.hash);
                if (p.parsableKey && loaded[p.parsableKey]) initialKey = p.parsableKey;
                else {
                    const sk = uiStorage.get('last_parsable');
                    if (sk && loaded[sk]) initialKey = sk;
                    else initialKey = Object.keys(loaded)[0] || '';
                }
                if (initialKey) setSelectedParsableKey(initialKey);
                // Self-repair: drop per-spec data for specs that no longer exist.
                specStorage.prune(Object.keys(loaded));
            } else if (window.location.hash) {
                // Local mode: a deep link may point at a previously opened spec.
                const p = parseSmartRoute(window.location.hash);
                if (p.parsableKey) {
                    const entry = findLocalHistoryEntry(p.parsableKey);
                    if (entry) {
                        try {
                            applyLocalSpec(entry.raw, entry.fileName, null);
                        } catch {
                            /* stale history entry, ignore */
                        }
                    }
                }
            }
            setIsInitialLoadComplete(true);
        };

        bootstrap();
        return () => {
            cancelled = true;
        };
    }, []);

    // ---------- Hash sync ----------
    const syncHashToState = useCallback(() => {
        const parsed: ParsedRoute = parseSmartRoute(window.location.hash);

        // A hash can select another specification. Stop immediately after the
        // key transition: applying its route against the currently loaded spec
        // was a major source of cross-spec tabs and invalid endpoints.
        if (parsed.parsableKey && parsed.parsableKey !== selectedParsableKey && parsables[parsed.parsableKey]) {
            setSpec(null);
            setLoadedSpecKey('');
            setSelectedEndpoint(null);
            setShowWelcome(false);
            setShowHome(false);
            setShowSchemaExplorer(false);
            setShowAbout(false);
            setShowAssistant(false);
            setAssistantContextEndpoints([]);
            setSearchQuery('');
            setResultsQuery('');
            setSelectedMethods([]);
            setSelectedTags([]);
            setOnlyProtected(null);
            setEndpointTabs([]);
            setActiveTabId(null);
            setTabViewModes({});
            setExamineResponses({});
            setSelectedParsableKey(parsed.parsableKey);
            return;
        }

        if (loadedSpecKey !== selectedParsableKey
            || tabsRestoreDoneRef.current !== selectedParsableKey
            || specRouteReadyRef.current !== selectedParsableKey) return;

        const explicitRoute = hasExplicitSpecRoute(parsed, window.location.hash);
        // A plain spec hash represents session resume. It must not turn a
        // restored endpoint back into the overview (or resurrect a closed tab).
        if (!explicitRoute) return;
        if (navStateRef.current.showWelcome) setShowWelcome(false);

        setSearchQuery(parsed.searchQuery || '');
        setResultsQuery(parsed.searchQuery || '');
        setSelectedMethods(parsed.searchMethods || []);
        setSelectedTags(parsed.searchTags || []);
        setOnlyProtected(parsed.searchSecured ?? null);
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);
        setShowAssistant(parsed.showAssistant);
        if (parsed.legacyOperationId && spec) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (resolved) {
                openEndpointPreview(resolved.path, resolved.method);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
                setShowAssistant(false);
            } else setSelectedEndpoint(null);
        } else if (parsed.endpoint) {
            openEndpointPreview(parsed.endpoint.path, parsed.endpoint.method);
        } else {
            setSelectedEndpoint(null);
        }
        if (hashHasExplicitTab()) setSelectedTab(mapRouteTabToState(getTabFromHash()));
        setActiveResponseCode(parsed.responseCode);

        if (spec?.components?.schemas) {
            const valid = parsed.schemas.filter(name => spec.components!.schemas![name]);
            setModalsStack(valid.length ? valid : []);
        }
        const hasEmptySearchRoute = /[?&]search(?:=|&|$)/.test(window.location.hash)
            && !parsed.searchQuery && parsed.searchMethods.length === 0
            && parsed.searchTags.length === 0 && parsed.searchSecured === null;
        if (hasEmptySearchRoute) openViewTab('search');
        else ensureViewTabFromState({
            searchQuery: parsed.searchQuery || '',
            showSchemaExplorer: parsed.showSchemaExplorer,
            showAbout: parsed.showAbout,
            showAssistant: parsed.showAssistant,
            showHome: parsed.showHome,
            searchMethods: parsed.searchMethods || [],
            searchTags: parsed.searchTags || [],
            searchSecured: parsed.searchSecured ?? null,
        });
    }, [parsables, selectedParsableKey, loadedSpecKey, spec, openEndpointPreview, openViewTab, ensureViewTabFromState]);

    const updateHashFromState = useCallback(() => {
        if (isLoadingSpec || isUpdatingHash || !isInitialLoadComplete || !spec
            || loadedSpecKey !== selectedParsableKey
            || tabsRestoredForKey !== selectedParsableKey
            || specRouteReadyRef.current !== selectedParsableKey) return;
        setIsUpdatingHash(true);

        // Search + filter params only belong in the URL while the search tab is
        // actually active — otherwise switching to an endpoint would carry
        // orphan ?tags=&secured= params into that endpoint's link.
        const searchInUrl = activeTabId === 'view:search';
        const h = generateSmartRoute({
            parsableKey: selectedParsableKey, showHome, showAbout, showAssistant, showSchemaExplorer,
            endpoint: selectedEndpoint, tab: selectedTab,
            schemaModals: modalsStack.map(n => ({schemaName: n, schema: spec?.components?.schemas?.[n] || {}})),
            responseCode: activeResponseCode,
            searchQuery: searchInUrl ? searchQuery : '',
            searchMethods: searchInUrl ? selectedMethods : [],
            searchTags: searchInUrl ? selectedTags : [],
            searchSecured: searchInUrl ? onlyProtected : null,
            activeSpec: spec,
        });
        if (window.location.hash !== h) window.location.hash = h;
        setIsUpdatingHash(false);
    }, [isLoadingSpec, isUpdatingHash, isInitialLoadComplete, spec, loadedSpecKey, tabsRestoredForKey, showWelcome, selectedParsableKey, showHome, showAbout, showAssistant, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery, selectedMethods, selectedTags, onlyProtected, activeTabId]);

    useEffect(() => {
        if (!spec?.paths || isLoadingSpec || loadedSpecKey !== selectedParsableKey
            || tabsRestoredForKey !== selectedParsableKey) return;
        const parsed = parseSmartRoute(window.location.hash);
        if (parsed.parsableKey && parsed.parsableKey !== selectedParsableKey) return;

        // Selecting a spec deliberately writes only #/parsable/:key. That route
        // means "resume" and therefore leaves the freshly restored tab, search,
        // and split-mode state untouched.
        if (!hasExplicitSpecRoute(parsed, window.location.hash)) {
            specRouteReadyRef.current = selectedParsableKey;
            return;
        }

        setSearchQuery(parsed.searchQuery || '');
        setResultsQuery(parsed.searchQuery || '');
        setSelectedMethods(parsed.searchMethods || []);
        setSelectedTags(parsed.searchTags || []);
        setOnlyProtected(parsed.searchSecured ?? null);
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);
        setShowAssistant(parsed.showAssistant);
        setShowWelcome(false);
        setActiveResponseCode(parsed.responseCode);

        // The route that initially loads a spec is committed as a permanent tab;
        // later same-spec hash changes use preview semantics in syncHashToState.
        if (parsed.legacyOperationId) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (resolved) {
                openEndpointPermanent(resolved.path, resolved.method);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
                setShowAssistant(false);
            } else setSelectedEndpoint(null);
        } else if (parsed.endpoint) {
            openEndpointPermanent(parsed.endpoint.path, parsed.endpoint.method);
        } else {
            setSelectedEndpoint(null);
        }
        setModalsStack(parsed.schemas.filter(name => spec.components?.schemas?.[name]));
        if (hashHasExplicitTab()) setSelectedTab(mapRouteTabToState(parsed.tab));
        const hasEmptySearchRoute = /[?&]search(?:=|&|$)/.test(window.location.hash)
            && !parsed.searchQuery && parsed.searchMethods.length === 0
            && parsed.searchTags.length === 0 && parsed.searchSecured === null;
        if (hasEmptySearchRoute) openViewTabPermanent('search');
        else ensureViewTabFromState({
            searchQuery: parsed.searchQuery || '',
            showSchemaExplorer: parsed.showSchemaExplorer,
            showAbout: parsed.showAbout,
            showAssistant: parsed.showAssistant,
            showHome: parsed.showHome,
            searchMethods: parsed.searchMethods || [],
            searchTags: parsed.searchTags || [],
            searchSecured: parsed.searchSecured ?? null,
        });
        specRouteReadyRef.current = selectedParsableKey;
    }, [spec, selectedParsableKey, loadedSpecKey, tabsRestoredForKey, isLoadingSpec, openEndpointPermanent, openViewTabPermanent, ensureViewTabFromState]);

    const getTabFromHash = () => parseSmartRoute(window.location.hash).tab;
    const hashHasExplicitTab = () => window.location.hash.includes('?tab=') || window.location.hash.includes('&tab=');
    const mapRouteTabToState = (t: 'view' | 'examine' | 'both'): 'docs' | 'examine' | 'both' => (t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'docs');
    const mapStateTabToStorage = (t: 'docs' | 'examine' | 'both'): string => (t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'view');
    const [tabModeRestoredForKey, setTabModeRestoredForKey] = useState('');
    useEffect(() => {
        if (!selectedParsableKey) return;
        if (hashHasExplicitTab()) {
            setSelectedTab(mapRouteTabToState(getTabFromHash()));
        } else {
            const stored = specStorage.get(selectedParsableKey, 'tab_mode');
            setSelectedTab(stored === 'examine' ? 'examine' : stored === 'both' ? 'both' : 'docs');
        }
        setTabModeRestoredForKey(selectedParsableKey);
    }, [selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey && tabModeRestoredForKey === selectedParsableKey) {
            specStorage.set(selectedParsableKey, 'tab_mode', mapStateTabToStorage(selectedTab));
        }
    }, [selectedTab, selectedParsableKey, tabModeRestoredForKey]);

    const [hashTimer, setHashTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (isLoadingSpec) return;
        if (hashTimer) {
            clearTimeout(hashTimer);
            setHashTimer(null);
        }
        const t = setTimeout(updateHashFromState, 300);
        setHashTimer(t);
        return () => {
            if (t) clearTimeout(t);
        };
    }, [selectedParsableKey, showHome, showAbout, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery, spec, isLoadingSpec, updateHashFromState]);

    useEffect(() => {
        const h = () => {
            if (!isUpdatingHash && !isLoadingSpec) syncHashToState();
        };
        window.addEventListener('hashchange', h);
        return () => window.removeEventListener('hashchange', h);
    }, [isLoadingSpec, isUpdatingHash, syncHashToState]);

    // ---------- Handlers ----------
    const closeMobileIfNeeded = () => {
        if (isMobile) setMobileOpen(false);
    };

    const [shareTarget, setShareTarget] = useState<{ url: string; title: string; description?: string } | null>(null);

    const endpointDeepLink = useCallback((path: string, method: string) => {
        const op = (spec?.paths?.[path] as any)?.[method] || {};
        const opId = getEndpointId(op, path, method);
        return `${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(selectedParsableKey)}/api/${encodeURIComponent(opId)}`;
    }, [spec, selectedParsableKey]);

    const viewDeepLink = useCallback((view: ViewTabKind) => {
        const base = `${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(selectedParsableKey)}`;
        if (view === 'about') return `${base}/about`;
        if (view === 'schemas') return `${base}/schema-explorer`;
        if (view === 'assistant') return `${base}/assistant`;
        if (view === 'search') return `${base}?search=`;
        return base;
    }, [selectedParsableKey]);

    const openEndpointInBrowserTab = useCallback((path: string, method: string) => {
        window.open(endpointDeepLink(path, method), '_blank', 'noopener');
    }, [endpointDeepLink]);

    const openViewInBrowserTab = useCallback((view: ViewTabKind) => {
        window.open(viewDeepLink(view), '_blank', 'noopener');
    }, [viewDeepLink]);

    const copyText = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            /* clipboard unavailable */
        }
    }, []);

    const askAIAboutEndpoint = useCallback((path: string, method: string) => {
        setAssistantContextEndpoints(current => {
            const next = {path, method: method.toLowerCase()};
            if (!showAssistant) return [next];
            if (current.some(endpoint => endpoint.path === next.path && endpoint.method === next.method)) return current;
            return [...current, next].slice(0, 5);
        });
        openViewTab('assistant');
        closeMobileIfNeeded();
    }, [openViewTab, isMobile, showAssistant]);

    /** Single entry point for the sidebar context menus. */
    const handleContextAction = useCallback((
        action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai',
        target: { type: 'endpoint'; path: string; method: string } | { type: 'view'; view: ViewTabKind },
    ) => {
        if (target.type === 'endpoint') {
            const {path, method} = target;
            if (action === 'ask-ai' && !hasAIProfile) return;
            if (action === 'ask-ai') {
                askAIAboutEndpoint(path, method);
                return;
            }
            if (action === 'open-new-tab') {
                openEndpointPermanent(path, method);
                return;
            }
            if (action === 'open-browser') {
                openEndpointInBrowserTab(path, method);
                return;
            }
            const op = (spec?.paths?.[path] as any)?.[method] || {};
            const label = op?.summary || `${method.toUpperCase()} ${path}`;
            const url = endpointDeepLink(path, method);
            if (action === 'copy-link') {
                copyText(url);
                return;
            }
            setShareTarget({url, title: `${method.toUpperCase()} ${path} — ${label}`, description: label});
            return;
        }
        const {view} = target;
        if (action === 'open-new-tab') {
            openViewTabPermanent(view);
            return;
        }
        if (action === 'open-browser') {
            openViewInBrowserTab(view);
            return;
        }
        const url = viewDeepLink(view);
        const title = VIEW_TAB_META[view].label;
        if (action === 'copy-link') {
            copyText(url);
            return;
        }
        setShareTarget({url, title: `${title} — ${spec?.info?.title || 'OpenDoc UI'}`});
    }, [spec, hasAIProfile, openEndpointPermanent, openViewTabPermanent, openEndpointInBrowserTab, openViewInBrowserTab, endpointDeepLink, viewDeepLink, copyText, askAIAboutEndpoint]);

    const handleSelectEndpoint = (path: string, method: string) => {
        if (activeTabId === 'view:search') stashSearchTab();
        if (searchRenderTimer.current) {
            clearTimeout(searchRenderTimer.current);
            searchRenderTimer.current = null;
        }
        setResultsQuery('');
        openEndpointPreview(path, method);
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
        setActiveResponseCode(null);
        setSearchQuery('');
        setSelectedMethods([]);
        setSelectedTags([]);
        setOnlyProtected(null);
        closeMobileIfNeeded();
    };
    const handleSearchResult = (path: string, method: string) => {
        if (!isMobile) setDesktopCollapsed(false);
        handleSelectEndpoint(path, method);
    };
    // Debounced copy of the query used only for the (heavy) results rendering;
    // the input and the tab switch stay instant so typing never lags.
    const [resultsQuery, setResultsQuery] = useState('');
    const searchRenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Tab that was active before the search started — restored when it clears.
    const preSearchTabRef = useRef<string | null>(null);

    /** Cheap match check — used only when saving search history (5s after the
     *  user stops typing) to avoid storing queries that found nothing. */
    const searchHasResults = useCallback((q: string): boolean => {
        if (!spec?.paths || !q.trim()) return false;
        const needle = q.trim().toLowerCase();
        for (const [pathStr, item] of Object.entries(spec.paths)) {
            for (const [m, op] of Object.entries(item as any)) {
                if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(m)) continue;
                const o = op as any;
                if (sidebarDisplayRoutes && pathStr.toLowerCase().includes(needle)) return true;
                if ((o.summary || '').toLowerCase().includes(needle)) return true;
                if ((o.description || '').toLowerCase().includes(needle)) return true;
                if ((o.tags || []).some((t: string) => t.toLowerCase().includes(needle))) return true;
            }
        }
        return false;
    }, [spec, sidebarDisplayRoutes]);

    const handleSearchChange = (query: string) => {
        // Search results are a neutral list; never keep an endpoint selected in the sidebar while searching.
        if (query.trim()) setSelectedEndpoint(null);
        setSearchQuery(query);
        if (searchRenderTimer.current) {
            clearTimeout(searchRenderTimer.current);
            searchRenderTimer.current = null;
        }
        searchRenderTimer.current = setTimeout(() => setResultsQuery(query), 250);

        if (query.trim().length) {
            setShowWelcome(false);
            if (activeTabId === 'view:search' && query.trim().length) {
                // Already on the search tab with a non-empty query: update only
                // the query + the tab's label — skip the full state churn.
                setEndpointTabs(prev => prev.map(t => t.id === 'view:search' ? {
                    ...t,
                    query,
                    label: `Search: ${query}`
                } : t));
                return;
            }
            if (!preSearchTabRef.current && activeTabId && !activeTabId.startsWith('view:search')) {
                preSearchTabRef.current = activeTabId;
            }
            // Show results immediately — no debounce delay on the first open,
            // so the overview never flashes before the results appear.
            if (searchRenderTimer.current) {
                clearTimeout(searchRenderTimer.current);
                searchRenderTimer.current = null;
            }
            setResultsQuery(query);
            openViewTab('search', query);
        } else {
            // Clearing the search input ends the search session entirely —
            // phrase AND filters. The URL must not keep stale ?tags=&secured=
            // params pointing at a search that no longer exists.
            setSelectedMethods([]);
            setSelectedTags([]);
            setOnlyProtected(null);
            const prevId = preSearchTabRef.current;
            preSearchTabRef.current = null;
            // The search tab has served its purpose; drop it and go back to
            // whatever the user was looking at before typing.
            const rest = endpointTabs.filter(t => t.id !== 'view:search');
            setEndpointTabs(rest);
            const prevTab = prevId ? rest.find(t => t.id === prevId) : null;
            const target = prevTab || rest[rest.length - 1] || null;
            if (target) {
                setActiveTabId(target.id);
                applyTabViewState(target);
            } else {
                // Nothing else open -> welcome page, not the overview.
                setSelectedEndpoint(null);
                setActiveTabId(null);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
                setSearchQuery('');
                setResultsQuery('');
                setShowWelcome(true);
                // Scrub the stale ?search= param so a late hash-sync can't
                // resurrect the search tab over the welcome page.
                const clean = window.location.hash.replace(/[?&]search=[^&]*/, '');
                if (clean !== window.location.hash) {
                    setIsUpdatingHash(true);
                    window.location.hash = clean;
                    setIsUpdatingHash(false);
                }
            }
        }
    };
    const handleOpenHome = () => {
        setScrollIntent({type: 'view', id: 'view:home'});
        openViewTab('home');
        if (!spec) window.location.hash = '#/';
        closeMobileIfNeeded();
    };
    const handleOpenAbout = () => {
        setScrollIntent({type: 'view', id: 'view:about'});
        openViewTab('about');
        if (!spec) window.location.hash = '#/about';
        closeMobileIfNeeded();
    };
    const handleOpenSchemaExplorer = () => {
        setScrollIntent({type: 'view', id: 'view:schemas'});
        openViewTab('schemas');
        closeMobileIfNeeded();
    };
    const handleOpenAssistant = () => {
        setAssistantUnread(false);
        if (!showAssistant) {
            setAssistantContextEndpoints(selectedEndpoint ? [selectedEndpoint] : []);
        }
        openViewTab('assistant');
        closeMobileIfNeeded();
    };
    const handleOpenRunner = (path: string, method: string) => {
        openEndpointPreview(path, method);
        setSelectedTab('examine');
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
    };

    const handleAssistantResponseFinished = useCallback(() => {
        // The assistant remains mounted while hidden, so read current navigation state.
        if (!(showAssistantRef.current && activeTabIdForAssistantRef.current === 'view:assistant')) {
            setAssistantUnread(true);
        }
    }, []);

    const handleDownload = () => {
        if (!spec) return;
        const d = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(spec, null, 2));
        const a = document.createElement('a');
        a.href = d;
        a.download = `${selectedParsableKey}-spec.json`;
        a.click();
    };
    const handlePushSchema = (n: string) => setModalsStack(p => [...p, n]);
    const handleAssistantBridgeAction = useCallback((action: OpenDocUIAction) => {
        if (action.action === 'open_endpoint') {
            handleSelectEndpoint(action.path, action.method);
            return;
        }
        if (action.action === 'open_schema') {
            if (spec?.components?.schemas?.[action.schema]) handlePushSchema(action.schema);
            return;
        }
        if (action.action === 'search_spec') {
            handleSearchChange(action.query);
            return;
        }
        if (action.action === 'select_server') {
            if (spec?.servers?.some(server => server.url === action.url)) setSelectedServer(action.url);
            return;
        }
        if (action.action === 'open_runner') {
            handleOpenRunner(action.path, action.method);
            return;
        }
        if (action.action === 'set_runner_fields') {
            handleOpenRunner(action.path, action.method);
            window.setTimeout(() => dispatchOpenDocUIAction(action), 50);
            return;
        }

        // A Run action is executed through the shared controller without
        // navigating away from the Assistant tab. Manual Runner execution keeps
        // its own endpoint-local UI path and is unaffected.
        const operation = (spec?.paths?.[action.path] as any)?.[action.method];
        const actionId = action.id || createOpenDocUIActionId();
        if (!spec || !operation) return;
        assistantRunnerAbortRef.current?.abort();
        const controller = new AbortController();
        assistantRunnerAbortRef.current = controller;
        void executeRunnerRequest({
            spec,
            path: action.path,
            method: action.method,
            operation,
            selectedServer,
            activeAuth,
            params: action.params,
            headers: action.headers,
            body: action.body,
            bodyType: action.bodyType,
            signal: controller.signal,
        }).then(result => {
            if (assistantRunnerAbortRef.current === controller) assistantRunnerAbortRef.current = null;
            dispatchOpenDocUIRunnerResult({actionId, specKey: selectedParsableKey, path: action.path, method: action.method, result});
        }).catch(error => {
            if (assistantRunnerAbortRef.current === controller) assistantRunnerAbortRef.current = null;
            dispatchOpenDocUIRunnerResult({
                actionId,
                specKey: selectedParsableKey,
                path: action.path,
                method: action.method,
                result: {status: 0, headers: {}, body: error instanceof Error ? error.message : 'AI Runner action failed.', isJson: false, errorKind: 'network', errorMessage: error instanceof Error ? error.message : 'AI Runner action failed.'},
            });
        });
    }, [activeAuth, handleOpenRunner, handleSelectEndpoint, handleSearchChange, selectedParsableKey, selectedServer, spec]);
    const handlePopSchema = () => setModalsStack(p => p.slice(0, -1));
    const handleSelectParsable = (k: string) => {
        if (k === selectedParsableKey) return;
        // Detach the outgoing document immediately. The loaded-spec key and tab
        // restore barriers ensure no outgoing state can be written under `k`.
        setSpec(null);
        setLoadedSpecKey('');
        setSelectedEndpoint(null);
        setShowWelcome(false);
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
        setAssistantContextEndpoints([]);
        setSearchQuery('');
        setResultsQuery('');
        setActiveResponseCode(null);
        setModalsStack([]);
        setSelectedTab('docs');
        setSelectedMethods([]);
        setSelectedTags([]);
        setOnlyProtected(null);
        setEndpointTabs([]);
        setActiveTabId(null);
        setTabViewModes({});
        setSelectedParsableKey(k);
        setExamineResponses({});
        setIsUpdatingHash(true);
        const h = `#/parsable/${encodeURIComponent(k)}`;
        if (window.location.hash !== h) window.location.hash = h;
        setIsUpdatingHash(false);
        closeMobileIfNeeded();
    };

    const isLocalMode = Object.keys(parsables).length === 0;
    const canOpenLocal = configSource === 'none';

    // ---------- Render ----------
    // Prefer the tab identity during boot/restoration. The navigation flags are
    // updated by effects, so relying on them alone briefly renders the overview
    // behind a restored Assistant tab.
    const assistantTabActive = showAssistant || activeTabId === 'view:assistant';
    const content = () => {
        if (!spec) {
            if (showAbout) return <AboutView specTitle={undefined} parsableKey={selectedParsableKey} spec={spec}/>;
            return (
                <NoSpecView
                    canOpenLocal={canOpenLocal}
                    onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                    onOpenAbout={handleOpenAbout}
                />
            );
        }
        if (showWelcome && !assistantTabActive) {
            return (
                <WelcomeView
                    specTitle={spec.info?.title || selectedParsableKey}
                    specKey={selectedParsableKey}
                    onSearchSubmit={(q) => handleSearchChange(q)}
                    onOpenAbout={handleOpenAbout}
                    onOpenHome={handleOpenHome}
                    onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                    canOpenLocal={canOpenLocal}
                />
            );
        }
        const hasFilters = selectedMethods.length || selectedTags.length || onlyProtected !== null;
        if (activeTabId === 'view:search') {
            // The search tab is its own page: results when there's a query or
            // filters, otherwise a neutral "start typing" empty state. It NEVER
            // falls through to the overview.
            if (resultsQuery.trim().length || hasFilters) {
                return <SearchResultsView spec={spec} searchQuery={resultsQuery} onSelectEndpoint={handleSearchResult}
                                          onMiddleClickEndpoint={openEndpointPermanent}
                                          selectedServer={selectedServer} selectedMethods={selectedMethods}
                                          setSelectedMethods={setSelectedMethods}
                                          selectedTags={selectedTags} setSelectedTags={setSelectedTags}
                                          onlyProtected={onlyProtected} setOnlyProtected={setOnlyProtected}
                                          displayRoutes={sidebarDisplayRoutes} parsableKey={selectedParsableKey}/>;
            }
            return <EmptySearchState/>;
        }
        if (selectedEndpoint) {
            const operation = (spec.paths[selectedEndpoint.path] as any)?.[selectedEndpoint.method];
            if (operation) {
                const key = endpointKey(selectedEndpoint.path, selectedEndpoint.method);
                return (
                    <EndpointWorkspace
                        spec={spec}
                        endpoint={selectedEndpoint}
                        parsableKey={selectedParsableKey}
                        selectedTab={selectedTab}
                        setSelectedTab={setSelectedTab}
                        activeSplitPane={activeSplitPane}
                        setActiveSplitPane={setActiveSplitPane}
                        splitContainerRef={splitContainerRef}
                        docsPaneWidth={docsPaneWidth}
                        isSplitDragging={isSplitDragging}
                        onSplitResizeMouseDown={onSplitResizeMouseDown}
                        isMobile={isMobile}
                        activeAuth={activeAuth}
                        selectedServer={selectedServer}
                        resolvedThemeMode={resolvedThemeMode}
                        activeResponseCode={activeResponseCode}
                        setActiveResponseCode={setActiveResponseCode}
                        currentResponse={examineResponses[key] || null}
                        onResponseChange={response => setExamineResponses(current => ({...current, [key]: response}))}
                        onClearResponse={() => setExamineResponses(current => {
                            const next = {...current};
                            delete next[key];
                            return next;
                        })}
                        onOpenSchema={handlePushSchema}
                        onGenerateCode={() => setCodeGenEndpoint(selectedEndpoint)}
                    />
                );
            }
        }
        if (showSchemaExplorer) return <SchemaExplorer schemas={spec.components?.schemas}
                                                       onSelectSchema={handlePushSchema}
                                                       parsableKey={selectedParsableKey}/>;
        if (showAbout) return <AboutView specTitle={spec?.info?.title} parsableKey={selectedParsableKey} spec={spec}/>;
        // The overview is a page like any other: it renders ONLY when the user
        // explicitly opened it (showHome). Nothing else ever falls through to it.
        if (showHome) {
            return <HomeView spec={spec} selectedEndpoint={selectedEndpoint} onSelectEndpoint={handleSelectEndpoint}
                             selectedServer={selectedServer} onSelectServer={setSelectedServer} activeAuth={activeAuth}
                             onDeepLinkResponse={(path, method, code) => {
                                 openEndpointPreview(path, method);
                                 setShowHome(false);
                                 setShowSchemaExplorer(false);
                                 setShowAbout(false);
                                 setShowAssistant(false);
                                 setSelectedTab('docs');
                                 setActiveResponseCode(code);
                             }}/>;
        }
        return <WelcomeView
            specTitle={spec.info?.title || selectedParsableKey}
            specKey={selectedParsableKey}
            onSearchSubmit={handleSearchChange}
            onOpenAbout={handleOpenAbout}
            onOpenHome={handleOpenHome}
            onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
            canOpenLocal={canOpenLocal}
        />;
    };

    const isSidebarCollapsed = isMobile ? false : desktopCollapsed;
    const onToggleCollapse = () => {
        if (isMobile) setMobileOpen(o => !o);
        else setDesktopCollapsed(c => !c);
    };

    return (
        <TooltipProvider>
            <OperationLinkProvider spec={spec} parsableKey={selectedParsableKey}>
                <div style={styleVars}
                     className="w-full h-screen overflow-hidden flex flex-col font-sans transition-colors duration-150 text-[var(--text)] bg-[var(--background)]">

                    <input
                        ref={hiddenFileInputRef}
                        type="file"
                        accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
                        className="hidden"
                        onChange={handleFileChosen}
                    />

                    <Topbar
                        parsables={parsables} selectedParsableKey={selectedParsableKey}
                        onSelectParsable={handleSelectParsable}
                        activeAuth={activeAuth} onUpdateAuth={setActiveAuth}
                        onOpenAuthModal={() => setShowAuthModal(true)}
                        searchQuery={searchQuery} onSearchChange={handleSearchChange}
                        onDownloadSpec={handleDownload}
                        title={spec?.info?.title || 'OpenDoc UI'} showSchemaExplorer={showSchemaExplorer} spec={spec}
                        showHome={showHome} isCollapsed={isSidebarCollapsed} onToggleCollapse={onToggleCollapse}
                        onOpenMobileSidebar={() => setMobileOpen(true)}
                        onOpenAssistant={handleOpenAssistant}
                        selectedThemeName={selectedThemeName} onSelectTheme={setSelectedThemeName}
                        onOpenThemeModal={() => setShowThemeModal(true)}
                        isLocalMode={isLocalMode} canOpenLocal={canOpenLocal}
                        onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                        onRefreshSpec={handleRefreshSpec}
                        onReloadSpecification={handleReloadSpecification}
                        onResetSpecification={handleResetSpecification}
                        onResetAllConfigurations={handleResetAllConfigurations}
                        isRefreshingSpec={isRefreshingSpec}
                        localHistory={localHistory} onSelectHistoryEntry={handleSelectHistoryEntry}
                        onRemoveHistoryEntry={handleRemoveHistoryEntry} onClearHistory={handleClearHistory}
                        localOpenError={localOpenError} onDismissLocalError={() => setLocalOpenError(null)}
                        onSearchHasResults={searchHasResults}
                        hideSearch={false}
                    />

                    <div className="flex-1 flex overflow-hidden w-full h-full min-w-0 relative">
                        {isLoadingSpec ? (
                            <SpecLoadingState/>
                        ) : !spec ? (
                            content()
                        ) : (
                            <>
                                <Sidebar
                                    spec={spec}
                                    parsables={isMobile ? parsables : undefined}
                                    selectedParsableKey={selectedParsableKey}
                                    onSelectParsable={isMobile ? handleSelectParsable : undefined}
                                    selectedServer={selectedServer} onSelectServer={setSelectedServer}
                                    isCollapsed={desktopCollapsed} onToggleCollapse={() => setDesktopCollapsed(c => !c)}
                                    onOpenSchemaExplorer={handleOpenSchemaExplorer}
                                    showSchemaExplorer={showSchemaExplorer}
                                    selectedMethods={selectedMethods} setSelectedMethods={setSelectedMethods}
                                    selectedTags={selectedTags} setSelectedTags={setSelectedTags}
                                    onlyProtected={onlyProtected} setOnlyProtected={setOnlyProtected}
                                    searchQuery={searchQuery} selectedEndpoint={selectedEndpoint}
                                    onSelectEndpoint={handleSelectEndpoint}
                                    onMiddleClickEndpoint={openEndpointPermanent}
                                    getEndpointHref={(path, method) => generateSmartRoute({
                                        parsableKey: selectedParsableKey,
                                        showHome: false,
                                        showAbout: false,
                                        showAssistant: false,
                                        showSchemaExplorer: false,
                                        endpoint: {path, method},
                                        tab: 'docs',
                                        schemaModals: [],
                                        responseCode: null,
                                        searchQuery: '',
                                        searchMethods: [],
                                        searchTags: [],
                                        searchSecured: null,
                                        activeSpec: spec
                                    })}
                                    onOpenHome={handleOpenHome} onOpenAbout={handleOpenAbout}
                                    onOpenViewPermanent={openViewTabPermanent} onContextAction={handleContextAction}
                                    scrollIntent={scrollIntent} setScrollIntent={setScrollIntent}
                                    showHome={showHome} showAbout={showAbout}
                                    showAssistant={showAssistant} assistantContextEndpoints={assistantContextEndpoints}
                                    hasAIProfile={hasAIProfile}
                                    themeMode={currentThemeMode} resolvedThemeMode={resolvedThemeMode}
                                    onToggleThemeMode={toggleThemeMode}
                                    selectedThemeName={selectedThemeName}
                                    onOpenThemeModal={() => setShowThemeModal(true)}
                                    onOpenAuthModal={() => setShowAuthModal(true)}
                                    activeAuth={activeAuth} onDownloadSpec={handleDownload}
                                    isLocalMode={isLocalMode} canOpenLocal={canOpenLocal}
                                    onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                                    onDisplayRoutesChange={setSidebarDisplayRoutes}
                                    onReloadSpecification={handleReloadSpecification}
                                    onResetSpecification={handleResetSpecification}
                                    onResetAllConfigurations={handleResetAllConfigurations}
                                    onRefreshSpec={handleRefreshSpec} isRefreshingSpec={isRefreshingSpec}
                                    localHistory={localHistory} onSelectHistoryEntry={handleSelectHistoryEntry}
                                    onRemoveHistoryEntry={handleRemoveHistoryEntry} onClearHistory={handleClearHistory}
                                    localOpenError={localOpenError} onDismissLocalError={() => setLocalOpenError(null)}
                                    mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)}
                                    onOpenMobile={() => setMobileOpen(true)}
                                />
                                <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0 w-full">
                                    {endpointTabs.length > 0 && spec && (
                                        <EndpointTabs
                                            tabs={endpointTabs}
                                            activeTabId={activeTabId}
                                            onSelectTab={handleSelectTab}
                                            onCloseTab={handleCloseTab}
                                            onDoubleClickTab={handleDoubleClickTab}
                                            onCloseAllLeft={handleCloseAllLeft}
                                            onCloseAllRight={handleCloseAllRight}
                                            onCloseOthers={handleCloseOthers}
                                            onReorderTabs={handleReorderTabs}
                                            assistantUnread={assistantUnread}
                                            onOpenSwitcher={() => {
                                                const list = endpointTabsRef.current;
                                                if (list.length < 2) return;
                                                const cur = list.findIndex(t => t.id === activeTabId);
                                                switcherPrevTabRef.current = activeTabId;
                                                setSwitcherIndex(cur >= 0 ? cur : 0);
                                                setSwitcherOpen(true);
                                            }}
                                        />
                                    )}
                                    <div
                                        className={clsx('flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden', assistantTabActive ? 'hidden' : 'flex')}>
                                        {content()}
                                    </div>
                                    <div
                                        className={clsx('flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden', assistantTabActive ? 'flex' : 'hidden')}>
                                        {spec && <AIAssistantView
                                            spec={spec}
                                            parsableKey={selectedParsableKey}
                                            selectedEndpoints={assistantContextEndpoints}
                                            selectedServer={selectedServer}
                                            activeAuth={activeAuth}
                                            activeTab={selectedTab}
                                            searchQuery={searchQuery}
                                            settings={aiSettings}
                                            hasAIProfile={hasAIProfile}
                                            isVisible={assistantTabActive}
                                            onOpenSettings={() => setShowAISettings(true)}
                                            onClearEndpointContext={() => setAssistantContextEndpoints([])}
                                            onRemoveEndpointContext={(path, method) => setAssistantContextEndpoints(current => current.filter(endpoint => !(endpoint.path === path && endpoint.method === method)))}
                                            onOpenEndpoint={handleSelectEndpoint}
                                            onOpenRunner={handleOpenRunner}
                                            onBridgeAction={handleAssistantBridgeAction}
                                            onResponseFinished={handleAssistantResponseFinished}
                                        />}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {spec?.components?.schemas && (
                        <ModalsStack
                            modals={modalsStack.map(n => ({
                                schemaName: n,
                                schema: spec.components!.schemas![n] || {}
                            })).filter(i => i.schema)}
                            onPopSchema={handlePopSchema} onPushSchema={handlePushSchema}
                            onCloseAll={() => setModalsStack([])}
                            componentsSchemas={spec.components.schemas} parsableKey={selectedParsableKey}/>
                    )}
                    {codeGenEndpoint && spec && (
                        <CodeGeneratorModal isOpen={!!codeGenEndpoint} onClose={() => setCodeGenEndpoint(null)}
                                            spec={spec} path={codeGenEndpoint.path} method={codeGenEndpoint.method}
                                            operation={(spec.paths[codeGenEndpoint.path] as any)?.[codeGenEndpoint.method] || {}}
                                            activeAuth={activeAuth}/>
                    )}
                    <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} spec={spec}
                               activeAuth={activeAuth} onSave={setActiveAuth}/>

                    <TabSwitcherOverlay
                        open={switcherOpen}
                        tabs={endpointTabs}
                        activeTabId={activeTabId}
                        selectedIndex={switcherIndex}
                        onCancel={cancelSwitcher}
                        onSelect={id => {
                            handleSelectTabRef.current(id);
                            setSwitcherOpen(false);
                        }}
                    />

                    {shareTarget && (
                        <ShareModal isOpen={!!shareTarget} onClose={() => setShareTarget(null)}
                                    url={shareTarget.url} title={shareTarget.title}
                                    description={shareTarget.description}/>
                    )}
                    <ThemeSelectorModal isOpen={showThemeModal} selectedThemeName={selectedThemeName}
                                        currentThemeMode={currentThemeMode}
                                        resolvedThemeMode={resolvedThemeMode}
                                        onSelectTheme={(t) => {
                                            setSelectedThemeName(t);
                                        }} onToggleThemeMode={toggleThemeMode}
                                        onSetThemeMode={(m) => setCurrentThemeMode(m)}
                                        onClose={() => setShowThemeModal(false)}/>
                    <AISettingsModal isOpen={showAISettings} settings={aiSettings}
                                     onSave={handleAISettingsSave} onClose={() => setShowAISettings(false)}/>
                </div>
            </OperationLinkProvider>
        </TooltipProvider>
    );
}
