import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as jsYaml from 'js-yaml';
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
import {assertValidOpenApiDocument, normalizeOpenApiSpec} from './utils/openapi';
import {getContrastColor} from './utils/color';
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
import AboutView from './components/views/AboutView';
import NoSpecView from './components/views/NoSpecView';
import WelcomeView from './components/views/WelcomeView';
import SchemaExplorer from './components/schema/SchemaExplorer';
import ViewTab from './components/endpoint/ViewTab/ViewTab';
import ExamineTab from './components/endpoint/ExamineTab/ExamineTab';
import ModalsStack from './components/modals/ModalsStack/ModalsStack';
import CodeGeneratorModal from './components/modals/CodeGeneratorModal';
import ThemeSelectorModal from './components/modals/ThemeSelectorModal';
import ShareModal from './components/modals/ShareModal';
import AuthModal from './components/modals/AuthModal';
import MethodBadge from './components/common/MethodBadge';
import {Tip, TooltipProvider} from './components/common/Tooltip';
import {OperationLinkProvider} from './contexts/OperationLinkContext';
import FocusPane from './components/common/FocusPane';
import {useResizableSplit} from './hooks/useResizableSplit';
import EndpointTabs, {type TabItem, VIEW_TAB_META, type ViewTabKind} from './components/endpoint/EndpointTabs';
import AIAssistantView from './components/ai/AIAssistantView';
import AISettingsModal from './components/ai/AISettingsModal';
import {
    clearAIConversations,
    clearAISessionSecrets,
    clearAllAIConversations,
    readAISettings,
    writeAISettings
} from './utils/aiStorage';
import {dispatchOpenDocUIAction, type OpenDocUIAction} from './utils/aiBridge';

declare global {
    interface Window {
        INITIAL_CONFIG?: any;
    }
}

const VALID_VIEW_TAB_KINDS: ViewTabKind[] = ['home', 'search', 'schemas', 'about', 'assistant'];
const VALID_TAB_VIEW_MODES = ['docs', 'examine', 'both'] as const;
type StoredTabViewMode = typeof VALID_TAB_VIEW_MODES[number];

const isValidTabViewMode = (value: unknown): value is StoredTabViewMode =>
    VALID_TAB_VIEW_MODES.includes(value as StoredTabViewMode);

const isValidTabFilters = (filters: any): boolean =>
    !!filters
    && typeof filters === 'object'
    && !Array.isArray(filters)
    && Array.isArray(filters.methods)
    && filters.methods.every((value: unknown) => typeof value === 'string')
    && Array.isArray(filters.tags)
    && filters.tags.every((value: unknown) => typeof value === 'string')
    && (filters.onlyProtected === null || typeof filters.onlyProtected === 'boolean');

const isValidTabItem = (t: any): t is TabItem => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
    const validKind = t.kind === undefined || t.kind === 'endpoint' || VALID_VIEW_TAB_KINDS.includes(t.kind);
    return (
        validKind
        && typeof t.id === 'string'
        && t.id.length > 0
        && typeof t.isPreview === 'boolean'
        && typeof t.label === 'string'
        && typeof t.path === 'string'
        && typeof t.method === 'string'
        && (t.query === undefined || typeof t.query === 'string')
        && (t.filters === undefined || isValidTabFilters(t.filters))
    );
};

const isValidTabPersistence = (value: any): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.tabs)) return false;
    const ids = value.tabs.map((tab: any) => tab?.id).filter((id: unknown): id is string => typeof id === 'string');
    if (ids.length !== value.tabs.length || new Set(ids).size !== ids.length || !value.tabs.every(isValidTabItem)) return false;
    if (value.activeTabId !== undefined && typeof value.activeTabId !== 'string') return false;
    if (value.viewModes !== undefined) {
        if (!value.viewModes || typeof value.viewModes !== 'object' || Array.isArray(value.viewModes)) return false;
        if (!Object.values(value.viewModes).every(isValidTabViewMode)) return false;
    }
    return true;
};

const parseSpecDraft = (text: string): OpenApiSpec => {
    const t = text.trim();
    const parsed = (t.startsWith('{') || t.startsWith('[')) ? JSON.parse(text) : jsYaml.load(text);
    assertValidOpenApiDocument(parsed);
    return normalizeOpenApiSpec(parsed);
};

type EndpointKey = string;
const endpointKey = (p: string, m: string): EndpointKey => `${m.toLowerCase()}:${p}`;

type ConfigSource = 'initial' | 'file' | 'none';

type LocalSpec = {
    key: string;
    title: string;
    fileName: string;
    raw: string;
    file: File | null;
};

export default function App() {
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    const [parsables, setParsables] = useState<ParsableConfig>({});
    const [configSource, setConfigSource] = useState<ConfigSource>('none');
    const [selectedParsableKey, setSelectedParsableKey] = useState<string>('');
    const [spec, setSpec] = useState<OpenApiSpec | null>(null);
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
    const [aiSettingsReady, setAISettingsReady] = useState(false);
    const [showAISettings, setShowAISettings] = useState(false);
    useEffect(() => {
        if (aiSettingsReady) writeAISettings(aiSettings);
    }, [aiSettings, aiSettingsReady]);

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
    // Kept current with the latest handleSelectTab (assigned after its
    // definition below) so the switcher handlers never close over a stale one.
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
            setSearchQuery(tab.kind === 'search' ? (tab.query || '') : '');
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

    // ---------- Tab persistence (localStorage) ----------
    const tabsRestoredRef = useRef<Set<string>>(new Set());
    // True once the per-spec tab restore has run. Before that, the URL sync
    // must not create/activate tabs — otherwise a stored tab gets duplicated
    // (once by restore, once by the deep-link handler).
    const tabsRestoreDoneRef = useRef(false);
    // True once the spec-load effect has run once after mount. On that first
    // run the URL is a stale deep link from the previous session — it must not
    // recreate tabs (previews or home); only persisted tabs may be restored.
    const specLoadInitRef = useRef(false);

    useEffect(() => {
        if (!selectedParsableKey) return;
        // Persist only "committed" tabs: permanents (including pinned view tabs,
        // e.g. a pinned search tab keeps its query). Preview tabs are transient
        // by definition and must never survive a refresh — restoring them is
        // what made closed tabs come back. The persisted active id is the last
        // committed tab. When nothing is committed (all tabs closed) the stored
        // session must be REMOVED, or a reload would resurrect a closed tab.
        const persistable = endpointTabs.filter(t => !t.isPreview);
        const activeId = activeTabId && endpointTabs.some(t => t.id === activeTabId && !t.isPreview)
            ? activeTabId
            : (persistable[persistable.length - 1]?.id || '');
        if (persistable.length === 0) {
            // Only remove the stored session once the boot-time restore has
            // finished — before that, an empty tab bar is just the initial
            // state and wiping storage would destroy the session we're about
            // to restore.
            if (tabsRestoreDoneRef.current) {
                specStorage.remove(selectedParsableKey, 'tabs');
            }
            return;
        }
        const data = {tabs: orderTabs(persistable), activeTabId: activeId, viewModes: tabViewModes};
        specStorage.setJSON(selectedParsableKey, 'tabs', data);
    }, [endpointTabs, activeTabId, tabViewModes, selectedParsableKey]);

    useEffect(() => {
        if (!spec || !selectedParsableKey) return;
        if (tabsRestoredRef.current.has(selectedParsableKey)) return;
        tabsRestoredRef.current.add(selectedParsableKey);

        const data = specStorage.getJSON<{
            tabs: TabItem[];
            activeTabId?: string;
            viewModes?: Record<string, StoredTabViewMode>
        } | null>(
            selectedParsableKey, 'tabs', null,
            isValidTabPersistence,
        );
        if (data?.tabs && data.tabs.length > 0) {
            // Drop any stray preview tabs / search previews from older saves and
            // drop endpoint tabs that no longer exist in this spec.
            const filtered = orderTabs(data.tabs.filter((t: TabItem) =>
                // Keep committed tabs only: permanents (endpoints have no kind;
                // view tabs have kind set). Drop anything still marked preview.
                !t.isPreview,
            )).filter((t: TabItem) =>
                t.kind && t.kind !== 'endpoint' ? true : !!spec?.paths?.[t.path]?.[t.method],
            );
            if (filtered.length === 0) {
                // Nothing committed survived. If the URL is a plain home (no
                // deep link) show the welcome page; otherwise let the URL
                // handler open the deep link.
                const p2 = parseSmartRoute(window.location.hash);
                tabsRestoreDoneRef.current = true;
                if (!p2.endpoint && !p2.legacyOperationId && !p2.searchQuery && !p2.showSchemaExplorer && !p2.showAbout && !p2.showAssistant) {
                    setShowWelcome(true);
                }
                return;
            }
            const updatedTabs = filtered.map((t: TabItem) =>
                t.kind && t.kind !== 'endpoint'
                    ? t
                    : {...t, label: getEndpointLabel(t.path, t.method)},
            );
            setEndpointTabs(updatedTabs);
            if (data.activeTabId) {
                const activeTab = updatedTabs.find((t: TabItem) => t.id === data.activeTabId);
                if (activeTab) {
                    setActiveTabId(activeTab.id);
                    applyTabViewState(activeTab);
                } else {
                    setActiveTabId(updatedTabs[updatedTabs.length - 1]?.id || null);
                    applyTabViewState(updatedTabs[updatedTabs.length - 1] || null);
                }
            }
            if (data.viewModes) {
                const restoredModes = Object.fromEntries(
                    Object.entries(data.viewModes).filter(([id]) => updatedTabs.some(tab => tab.id === id)),
                ) as Record<string, StoredTabViewMode>;
                setTabViewModes(restoredModes);
            }
        }
        if (!data?.tabs || data.tabs.length === 0) {
            // No persisted tabs: with no deep link in the URL this is a plain
            // boot — show the welcome page (all tabs closed). Any URL route
            // (endpoint / about / schema-explorer / search / filters) is handled
            // by the URL processing in the spec-load effect, not welcome.
            const p = parseSmartRoute(window.location.hash);
            const urlHasRoute = !!(p.endpoint || p.legacyOperationId || p.searchQuery
                || p.showSchemaExplorer || p.showAbout || p.showAssistant
                || p.searchMethods.length || p.searchTags.length || p.searchSecured !== null);
            if (!urlHasRoute) {
                setShowWelcome(true);
            }
        }
        tabsRestoreDoneRef.current = true;
    }, [spec, selectedParsableKey, getEndpointLabel, withPreviewLast, orderTabs, applyTabViewState]);


    useEffect(() => {
        if (activeTabId && tabViewModes[activeTabId]) {
            setSelectedTab(tabViewModes[activeTabId]);
        }
    }, [activeTabId, tabViewModes]);

    useEffect(() => {
        if (activeTabId) {
            setTabViewModes(vm => ({...vm, [activeTabId]: selectedTab}));
        }
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
    useEffect(() => {
        if (!selectedParsableKey) return;
        const t = specStorage.get(selectedParsableKey, 'theme');
        setSelectedThemeName(t && THEME_LIST.some(x => x.name === t) ? t : 'Default Slate');
        const m = specStorage.get(selectedParsableKey, 'theme_mode');
        setCurrentThemeMode(m === 'light' || m === 'dark' || m === 'system' ? m : 'system');
    }, [selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey) specStorage.set(selectedParsableKey, 'theme', selectedThemeName);
    }, [selectedThemeName, selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey) specStorage.set(selectedParsableKey, 'theme_mode', currentThemeMode);
    }, [currentThemeMode, selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey && parsables[selectedParsableKey]) uiStorage.set('last_parsable', selectedParsableKey);
    }, [selectedParsableKey, parsables]);

    const activeTheme = useMemo(() => THEME_LIST.find(t => t.name === selectedThemeName) || THEME_LIST[0], [selectedThemeName]);

    // Apply theme CSS variables on documentElement so portaled elements pick them up.
    useEffect(() => {
        const v = resolvedThemeMode === 'light' ? activeTheme.light : activeTheme.dark;
        const root = document.documentElement;
        root.style.setProperty('--background', v.background);
        root.style.setProperty('--surface', v.surface);
        root.style.setProperty('--surface-hover', v.surfaceHover);
        root.style.setProperty('--border', v.border);
        root.style.setProperty('--text', v.text);
        root.style.setProperty('--text-contrast', getContrastColor(v.text));
        root.style.setProperty('--text-heading', v.textHeading);
        root.style.setProperty('--text-muted', v.textMuted);
        root.style.setProperty('--primary', v.primary);
        root.style.setProperty('--primary-hover', v.primaryHover);
        root.style.setProperty('--highlight', v.highlight);
        root.style.setProperty('--select', v.select);
        root.style.setProperty('--select-contrast', getContrastColor(v.select));
        root.style.setProperty('--primary-contrast', getContrastColor(v.primary));
        root.style.setProperty('--accent', v.accent);
        root.style.setProperty('--sidebar', v.sidebar);
        root.style.setProperty('--sidebar-text', v.sidebarText);
        root.style.setProperty('--navbar', v.navbar);
        (['get', 'post', 'put', 'delete', 'patch', 'head', 'connect', 'options', 'trace'] as const).forEach(k => {
            const c = (v as any)[`method${k.charAt(0).toUpperCase()}${k.slice(1)}`];
            root.style.setProperty(`--method-${k}`, c);
            root.style.setProperty(`--method-${k}-contrast`, getContrastColor(c));
        });
    }, [activeTheme, resolvedThemeMode]);

    const styleVars = useMemo(() => {
        const v = resolvedThemeMode === 'light' ? activeTheme.light : activeTheme.dark;
        const out: Record<string, string> = {
            '--background': v.background,
            '--surface': v.surface,
            '--surface-hover': v.surfaceHover,
            '--border': v.border,
            '--text': v.text,
            '--text-heading': v.textHeading,
            '--text-muted': v.textMuted,
            '--primary': v.primary,
            '--primary-hover': v.primaryHover,
            '--highlight': v.highlight,
            '--select': v.select,
            '--select-contrast': getContrastColor(v.select),
            '--primary-contrast': getContrastColor(v.primary),
            '--accent': v.accent,
            '--sidebar': v.sidebar,
            '--sidebar-text': v.sidebarText,
            '--navbar': v.navbar,
        };
        (['get', 'post', 'put', 'delete', 'patch', 'head', 'connect', 'options', 'trace'] as const).forEach(k => {
            const c = (v as any)[`method${k.charAt(0).toUpperCase()}${k.slice(1)}`];
            out[`--method-${k}`] = c;
            out[`--method-${k}-contrast`] = getContrastColor(c);
        });
        return out as React.CSSProperties;
    }, [activeTheme, resolvedThemeMode]);

    // ---------- Spec loading ----------
    const loadSpec = async (parsableKey: string, parsable: Parsable, forceRefresh = false) => {
        const seq = ++loadSpecSeq.current;
        setIsLoadingSpec(true);
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
            if (obj) setSelectedServer(obj.servers?.[0]?.url || 'https://api.example.com');
        } catch (e) {
            if (seq !== loadSpecSeq.current) return;
            console.error(`Failed to load spec '${parsableKey}'`, e);
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
        setSelectedParsableKey(key);
        setSpec(obj);
        setIsLoadingSpec(false);
        if (obj) setSelectedServer(obj.servers?.[0]?.url || 'https://api.example.com');
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
        openViewTab('home');
        return obj;
    }, [openViewTab]);

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
        // While the welcome page is showing, a plain home hash is stale (from
        // before the tabs were closed) and must be ignored — but a REAL deep
        // link (endpoint / search / schema / about) must still open normally.
        const parsed0 = parseSmartRoute(window.location.hash);
        if (navStateRef.current.showWelcome
            && !parsed0.endpoint && !parsed0.legacyOperationId && !parsed0.searchQuery
            && !parsed0.showSchemaExplorer && !parsed0.showAbout && !parsed0.showAssistant) return;
        // On the very first load the persisted tab restore owns the state; the
        // URL (which may be a stale deep link) must not recreate anything.
        if (!tabsRestoreDoneRef.current) return;
        if (!specLoadInitRef.current) return;
        const parsed: ParsedRoute = parseSmartRoute(window.location.hash);

        if (parsed.parsableKey && parsed.parsableKey !== selectedParsableKey && parsables[parsed.parsableKey]) {
            setSelectedParsableKey(parsed.parsableKey);
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
        if (parsed.legacyOperationId && spec) {
            const r = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (r) {
                openEndpointPreview(r.path, r.method);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
                setShowAssistant(false);
            } else setSelectedEndpoint(null);
        } else if (parsed.endpoint) {
            openEndpointPreview(parsed.endpoint.path, parsed.endpoint.method);
        } else {
            setSelectedEndpoint(parsed.endpoint);
        }
        if (hashHasExplicitTab()) setSelectedTab(mapRouteTabToState(getTabFromHash()));
        setActiveResponseCode(parsed.responseCode);

        if (spec?.components?.schemas) {
            const valid = parsed.schemas.filter(n => spec.components!.schemas![n]);
            setModalsStack(valid.length ? valid : []);
        }
        ensureViewTabFromState({
            searchQuery: parsed.searchQuery || '',
            showSchemaExplorer: parsed.showSchemaExplorer,
            showAbout: parsed.showAbout,
            showAssistant: parsed.showAssistant,
            showHome: parsed.showHome,
            searchMethods: parsed.searchMethods || [],
            searchTags: parsed.searchTags || [],
            searchSecured: parsed.searchSecured ?? null,
        });
    }, [parsables, selectedParsableKey, spec, openEndpointPreview, ensureViewTabFromState]);

    const updateHashFromState = useCallback(() => {
        if (isLoadingSpec || isUpdatingHash || !isInitialLoadComplete || !spec) return;
        // Never write the URL until the boot-time URL processing (spec-load
        // effect) has run — intermediate states would corrupt the deep link.
        if (!specLoadInitRef.current) return;
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
    }, [isLoadingSpec, isUpdatingHash, isInitialLoadComplete, spec, showWelcome, selectedParsableKey, showHome, showAbout, showAssistant, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery, selectedMethods, selectedTags, onlyProtected, activeTabId]);

    useEffect(() => {
        if (!spec?.paths || isLoadingSpec) return;
        const parsed = parseSmartRoute(window.location.hash);
        setSearchQuery(parsed.searchQuery || '');
        // Results must render immediately on a deep-linked search URL — without
        // this, the search tab opens but shows the overview until re-clicked.
        setResultsQuery(parsed.searchQuery || '');
        setSelectedMethods(parsed.searchMethods || []);
        setSelectedTags(parsed.searchTags || []);
        setOnlyProtected(parsed.searchSecured ?? null);
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);
        setShowAssistant(parsed.showAssistant);
        setActiveResponseCode(parsed.responseCode);
        // During the very first load, the URL-driven state must defer to the
        // persisted tab restore — otherwise the same tab is created twice, or a
        // closed tab is resurrected from the stale URL. On later hash changes
        // (real deep links) the URL is the source of truth.
        // The URL is the source of truth on every load (fresh, reload or
        // back/forward). Whatever route it describes is created as a PERMANENT
        // tab and shown — persisted tabs never override the URL. This is what
        // makes deep links to /about, /schema-explorer or ?search= work even
        // when no saved tab for them exists.
        if (!specLoadInitRef.current) {
            specLoadInitRef.current = true;
            // URL endpoints open as permanent tabs (they are "committed" by the
            // URL itself, not transient previews). If the URL has no endpoint,
            // clear any endpoint left by the tab restore — otherwise the URL
            // writer would merge the restored endpoint into the search URL and
            // corrupt it.
            if (parsed.legacyOperationId) {
                const r = resolveEndpointFromId(parsed.legacyOperationId, spec);
                if (r) {
                    openEndpointPermanent(r.path, r.method);
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
        } else if (parsed.legacyOperationId) {
            const r = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (r) {
                openEndpointPreview(r.path, r.method);
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
        setModalsStack(parsed.schemas.filter(n => spec.components?.schemas?.[n]));
        if (window.location.hash.includes('?tab=')) setSelectedTab(mapRouteTabToState(parsed.tab));
        ensureViewTabFromState({
            searchQuery: parsed.searchQuery || '',
            showSchemaExplorer: parsed.showSchemaExplorer,
            showAbout: parsed.showAbout,
            showAssistant: parsed.showAssistant,
            showHome: parsed.showHome,
            searchMethods: parsed.searchMethods || [],
            searchTags: parsed.searchTags || [],
            searchSecured: parsed.searchSecured ?? null,
        });
    }, [spec, selectedParsableKey, isLoadingSpec, ensureViewTabFromState]);

    const getTabFromHash = () => parseSmartRoute(window.location.hash).tab;
    const hashHasExplicitTab = () => window.location.hash.includes('?tab=') || window.location.hash.includes('&tab=');
    const mapRouteTabToState = (t: 'view' | 'examine' | 'both'): 'docs' | 'examine' | 'both' => (t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'docs');
    const mapStateTabToStorage = (t: 'docs' | 'examine' | 'both'): string => (t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'view');
    useEffect(() => {
        if (!selectedParsableKey) return;
        if (hashHasExplicitTab()) {
            setSelectedTab(mapRouteTabToState(getTabFromHash()));
            return;
        }
        const t = specStorage.get(selectedParsableKey, 'tab_mode');
        setSelectedTab(t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'docs');
    }, [selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey) specStorage.set(selectedParsableKey, 'tab_mode', mapStateTabToStorage(selectedTab));
    }, [selectedTab, selectedParsableKey]);

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
    }, [spec, openEndpointPermanent, openViewTabPermanent, openEndpointInBrowserTab, openViewInBrowserTab, endpointDeepLink, viewDeepLink, copyText, askAIAboutEndpoint]);

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
        // Read the live navigation refs. The assistant remains mounted while
        // hidden, so a callback captured before the user switched tabs must not
        // mistake the old assistant state for the current one.
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
        handleOpenRunner(action.path, action.method);
        // The Runner is endpoint-local state. Wait for the endpoint pane to mount,
        // then deliver the validated action to that exact path/method.
        window.setTimeout(() => dispatchOpenDocUIAction(action), 50);
    }, [handleOpenRunner, handleSelectEndpoint, handleSearchChange, spec]);
    const handlePopSchema = () => setModalsStack(p => p.slice(0, -1));
    const handleSelectParsable = (k: string) => {
        if (k === selectedParsableKey) return;
        setSelectedEndpoint(null);
        setSearchQuery('');
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
        openViewTab('home');
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
            return (
                <div className="flex-1 w-full h-full overflow-y-auto scrollbar-thin">
                    <div className="min-h-full flex flex-col items-center justify-center px-6 text-center select-none">
                        <span
                            className="size-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--primary)]">
                            <i className="ph-fill ph-magnifying-glass text-[20px]"></i>
                        </span>
                        <h2 className="mt-4 text-base font-extrabold text-[var(--text-heading)]">Search the
                            specification</h2>
                        <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
                            Type a path, summary, tag or schema name in the search field to find
                            endpoints across this API.
                        </p>
                    </div>
                </div>
            );
        }
        if (selectedEndpoint) {
            const po = spec.paths[selectedEndpoint.path];
            if (po) {
                const op = (po as any)[selectedEndpoint.method];
                if (op) {
                    const key = endpointKey(selectedEndpoint.path, selectedEndpoint.method);
                    const current = examineResponses[key] || null;

                    const setViewDocs = () => setSelectedTab('docs');
                    const setViewExamine = () => setSelectedTab('examine');
                    const setViewSplit = () => setSelectedTab('both');

                    const docActive = selectedTab !== 'both' || activeSplitPane === 'docs';
                    const examineActive = selectedTab !== 'both' || activeSplitPane === 'examine';

                    const viewTabEl = (
                        <ViewTab key={`${selectedEndpoint.path}-${selectedEndpoint.method}`} spec={spec}
                                 path={selectedEndpoint.path} method={selectedEndpoint.method} operation={op}
                                 onOpenSchemaModal={handlePushSchema} activeAuth={activeAuth}
                                 activeResponseCode={activeResponseCode} onSelectResponseCode={setActiveResponseCode}
                                 parsableKey={selectedParsableKey} isActive={docActive}/>
                    );
                    const examineTabEl = (
                        <ExamineTab spec={spec} path={selectedEndpoint.path} method={selectedEndpoint.method}
                                    operation={op} activeAuth={activeAuth} selectedServer={selectedServer}
                                    parsableKey={selectedParsableKey} themeMode={resolvedThemeMode}
                                    initialResponse={current} isActive={examineActive}
                                    onResponseChange={(r) => setExamineResponses(prev => ({...prev, [key]: r}))}
                                    onClearResponse={() => setExamineResponses(prev => {
                                        const n = {...prev};
                                        delete n[key];
                                        return n;
                                    })}/>
                    );

                    return (
                        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
                            <div
                                className="h-auto min-h-[3.5rem] border-b px-3 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 select-none bg-[var(--surface)] border-[var(--border)]">
                                <div className="flex items-center gap-1.5 text-[10.5px] min-w-0 overflow-hidden">
                                    <span
                                        className="uppercase opacity-40 font-black text-[9px] tracking-widest text-[var(--text-heading)] hidden sm:inline">Endpoint:</span>
                                    <MethodBadge method={selectedEndpoint.method} size="xs"
                                                 className="rounded-full shrink-0 w-9"/>
                                    <span
                                        className="font-mono font-bold select-all truncate">{selectedEndpoint.path}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div
                                        className="flex p-0.5 gap-1 rounded-lg border text-xs border-[var(--border)] bg-[var(--background)]">
                                        <Tip content="View Documentation">
                                            <button onClick={setViewDocs} aria-pressed={selectedTab === 'docs'}
                                                    className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                        selectedTab === 'docs' ? 'bg-[var(--method-get)] shadow-sm text-[var(--method-get-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                <i className="ph ph-book-open-text text-[16px]"></i>
                                                <span className="hidden sm:inline">View Documentation</span><span
                                                className="sm:hidden">Docs</span>
                                            </button>
                                        </Tip>
                                        <Tip content="API Runner">
                                            <button onClick={setViewExamine} aria-pressed={selectedTab === 'examine'}
                                                    className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                        selectedTab === 'examine' ? 'bg-[var(--method-delete)] shadow-sm text-[var(--method-delete-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                <i className="ph ph-flask text-[16px]"></i>
                                                <span className="hidden sm:inline">API Runner</span><span
                                                className="sm:hidden">Run</span>
                                            </button>
                                        </Tip>
                                        <Tip content="Split View (Side-by-Side)">
                                            <button onClick={setViewSplit} aria-pressed={selectedTab === 'both'}
                                                    className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                        selectedTab === 'both' ? 'bg-[var(--primary)] shadow-sm text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                <i className="ph ph-split-horizontal text-[16px]"></i>
                                                <span className="hidden sm:inline">Split View</span><span
                                                className="sm:hidden">Split</span>
                                            </button>
                                        </Tip>
                                    </div>
                                    <div className="h-5 w-[1px] bg-[var(--border)] hidden sm:block"></div>
                                    <Tip content="Generate Fetch/Axios snippets and TypeScript models">
                                        <button onClick={() => setCodeGenEndpoint(selectedEndpoint)}
                                                className="size-8.5 border hover:bg-[var(--surface-hover)] rounded-lg text-xs font-bold flex justify-center items-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] shrink-0">
                                            <i className="ph ph-code text-[16px]"></i>
                                        </button>
                                    </Tip>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden h-full min-h-0">
                                {selectedTab === 'both' ? (
                                        isMobile
                                            ? (
                                                <div ref={splitContainerRef}
                                                     className="flex flex-col h-full w-full min-h-0 min-w-0 gap-1.5 p-1.5 overflow-y-auto scrollbar-thin">
                                                    <div className="shrink-0" style={{height: '70vh'}}>
                                                        <FocusPane active={activeSplitPane === 'docs'}
                                                                   onActivate={() => setActiveSplitPane('docs')}
                                                                   fillHeight={false} className="h-full">
                                                            {viewTabEl}
                                                        </FocusPane>
                                                    </div>
                                                    <div className="shrink-0" style={{height: '70vh'}}>
                                                        <FocusPane active={activeSplitPane === 'examine'}
                                                                   onActivate={() => setActiveSplitPane('examine')}
                                                                   fillHeight={false} className="h-full">
                                                            {examineTabEl}
                                                        </FocusPane>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div ref={splitContainerRef}
                                                     className="flex h-full w-full min-h-0 min-w-0 gap-0.5 p-1.5">
                                                    <div className="h-full min-w-0 overflow-hidden" style={{
                                                        width: docsPaneWidth >= 0 ? docsPaneWidth : '50%',
                                                        flex: docsPaneWidth >= 0 ? '0 0 auto' : '1 1 0%'
                                                    }}>
                                                        <FocusPane active={activeSplitPane === 'docs'}
                                                                   onActivate={() => setActiveSplitPane('docs')}>
                                                            {viewTabEl}
                                                        </FocusPane>
                                                    </div>
                                                    <div onMouseDown={onSplitResizeMouseDown}
                                                         className={clsx('w-1.5 shrink-0 h-full rounded-full cursor-col-resize transition-colors select-none',
                                                             isSplitDragging ? 'bg-[var(--primary)]' : 'bg-transparent hover:bg-[var(--primary)]/60')}/>
                                                    <div className="h-full min-w-0 flex-1 overflow-hidden">
                                                        <FocusPane active={activeSplitPane === 'examine'}
                                                                   onActivate={() => setActiveSplitPane('examine')}>
                                                            {examineTabEl}
                                                        </FocusPane>
                                                    </div>
                                                </div>
                                            )
                                    )
                                    : selectedTab === 'docs' ? viewTabEl : examineTabEl
                                }
                            </div>
                        </div>
                    );
                }
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
                            <div className="m-auto flex flex-col items-center gap-1 text-[10px] font-bold">
                                <div className="size-8 relative">
                                    <i className="block animate-spin size-full border-4 border-[var(--text-muted)]/30 rounded-full absolute"></i>
                                    <i className="block animate-spin size-full border-4 border-r-[var(--primary)] border-transparent rounded-full absolute"></i>
                                </div>
                                Please wait&hellip;
                            </div>
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

                    {/* Ctrl+Tab tab switcher overlay */}
                    {switcherOpen && endpointTabs.length > 1 && (
                        <div
                            className="fixed inset-0 z-[6000] flex items-start justify-center pt-[16vh] bg-black/40 backdrop-blur-[2px] animate-fade-in"
                            onMouseDown={(e) => {
                                if (e.target === e.currentTarget) cancelSwitcher();
                            }}
                        >
                            <div
                                className="w-[440px] max-w-[92vw] rounded-2xl border shadow-2xl overflow-hidden animate-zoom-in bg-[var(--surface)] border-[var(--border)]">
                                <div
                                    className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--background)]">
                                    <span
                                        className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                                        <i className="ph ph-tabs text-[13px] text-[var(--primary)]"></i>
                                        Tab Switcher
                                    </span>
                                    <span
                                        className="text-[9.5px] text-[var(--text-muted)] flex items-center gap-1 select-none">
                                        <kbd
                                            className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)]">Ctrl</kbd>+
                                        <kbd
                                            className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)]">`</kbd>
                                        <span className="mx-1 opacity-50">·</span> release to switch
                                    </span>
                                </div>
                                <div className="py-1.5 max-h-[52vh] overflow-y-auto scrollbar-thin">
                                    {endpointTabs.map((t, i) => {
                                        const sel = i === Math.min(switcherIndex, endpointTabs.length - 1);
                                        const current = t.id === activeTabId;
                                        const viewTabMeta = t.kind && t.kind !== 'endpoint'
                                            ? VIEW_TAB_META[t.kind as ViewTabKind]
                                            : null;
                                        return (
                                            <button key={t.id} type="button"
                                                    onClick={() => {
                                                        handleSelectTabRef.current(t.id);
                                                        setSwitcherOpen(false);
                                                    }}
                                                    className={clsx('w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
                                                        sel ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--surface-hover)]')}>
                                                {viewTabMeta ? (
                                                    <span
                                                        className="shrink-0 w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--primary)] bg-[var(--background)]">
                                                        <i className={viewTabMeta.icon + ' text-[14px]'}></i>
                                                    </span>
                                                ) : (
                                                    <MethodBadge method={t.method} size="xs"
                                                                 className="shrink-0 w-10 h-4"/>
                                                )}
                                                <span className={clsx('flex-1 min-w-0 truncate text-xs font-semibold',
                                                    sel ? 'text-[var(--text-heading)]' : 'text-[var(--text)]')}>
                                                    {t.label}
                                                </span>
                                                {current && (
                                                    <span
                                                        className="shrink-0 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-[var(--primary)]">
                                                        <i className="ph-fill ph-dot-outline text-[10px]"></i>
                                                        Current
                                                    </span>
                                                )}
                                                {t.isPreview && <span
                                                    className="shrink-0 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">Preview</span>}
                                                {sel &&
                                                    <i className="ph ph-caret-right text-[14px] text-[var(--primary)] shrink-0"></i>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

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
                                     onSave={setAISettings} onClose={() => setShowAISettings(false)}/>
                </div>
            </OperationLinkProvider>
        </TooltipProvider>
    );
}
