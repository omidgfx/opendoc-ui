import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec, ParsableConfig} from './types';
import {absoluteRouteHref, generateSmartRoute, getCurrentSmartRoute, parseSmartRoute} from './utils/routing';

import {getDocumentOperations, getOperation} from './utils/openapi';
import {uiStorage} from './utils/storage/index';
import {useBreakpoint} from './hooks/useBreakpoint';
import Topbar from './components/layout/Topbar';
import Sidebar from './components/layout/Sidebar/Sidebar';
import {TooltipProvider} from './components/common/Tooltip';
import {OperationLinkProvider} from './contexts/OperationLinkContext';
import {useResizableSplit} from './hooks/useResizableSplit';
import EndpointTabs, {VIEW_TAB_META, type ViewTabKind} from './components/endpoint/EndpointTabs';
import AIAssistantView from './components/ai/AIAssistantView';
import {
    createOpenDocUIActionId,
    dispatchOpenDocUIAction,
    dispatchOpenDocUIRunnerResult,
    type OpenDocUIAction,
} from './utils/ai/bridge';
import {executeRunnerRequest} from './utils/runner/runnerExecution';
import {createEmptyAuth} from './utils/runner/auth';
import {getRawSpecDocument} from './utils/specification/specSource';
import {appendResponseHistory, readResponseHistory} from './utils/storage/responseHistory';
import type {FetchSpecResult} from './utils/storage/specCache';
import {type ConfigSource, endpointKey, type EndpointKey} from './utils/specification/appSpec';
import SpecLoadingState from './components/app/SpecLoadingState';
import AppModalLayer from './components/app/AppModalLayer';
import WorkspaceContent from './components/app/WorkspaceContent';
import {useThemeController} from './hooks/useThemeController';
import {useAISettingsController} from './hooks/useAISettingsController';
import {useSidebarController} from './hooks/useSidebarController';
import {useSpecLoader} from './hooks/useSpecLoader';
import {useLocalSpecifications} from './hooks/useLocalSpecifications';
import {useRemoteSpecifications} from './hooks/useRemoteSpecifications';
import {REMOTE_SPEC_BUILD_CONFIG} from './utils/specification/remoteBuildConfig';
import {type HistoryNavigationIntent, useWorkspaceRouting} from './hooks/useWorkspaceRouting';
import {useConfigBootstrap} from './hooks/useConfigBootstrap';
import {useWorkspaceTabs} from './hooks/useWorkspaceTabs';
import {useSpecificationActions} from './hooks/useSpecificationActions';
import {consumeOAuthResult} from './utils/runner/oauthFlow';
import {EndpointNotesProvider} from './contexts/EndpointNotesContext';
import {DEFAULT_SETTINGS_SECTION, type SettingsSectionId} from './pages/settings/settingsSections';
import EndpointNotesModalLayer from './components/notes/EndpointNotesModalLayer';

declare global {
    interface Window {
        INITIAL_CONFIG?: any;
    }
}
export default function App() {
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';
    const historyIntentRef = useRef<HistoryNavigationIntent>('replace');
    const requestHistoryPush = useCallback(() => {
        historyIntentRef.current = 'push';
    }, []);
    const [parsables, setParsables] = useState<ParsableConfig>({});
    const [configSource, setConfigSource] = useState<ConfigSource>('none');
    const [selectedParsableKey, setSelectedParsableKey] = useState<string>('');
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
    const {
        spec,
        setSpec,
        loadedSpecKey,
        setLoadedSpecKey,
        isLoadingSpec,
        setIsLoadingSpec,
        selectedServer,
        setSelectedServer,
        serverVariables,
        setServerVariables,
        specFetchInfo,
        setSpecFetchInfo,
        loadSpec,
    } = useSpecLoader(selectedParsableKey, parsables);
    const [searchQuery, setSearchQuery] = useState('');
    const [resultsQuery, setResultsQuery] = useState('');
    const searchRenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showWelcome, setShowWelcome] = useState(false);
    const [showHome, setShowHome] = useState(true);
    const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [showCompatibility, setShowCompatibility] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showAssistant, setShowAssistant] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsSection, setSettingsSection] = useState<string | null>(null);
    const [assistantContextEndpoints, setAssistantContextEndpoints] = useState<
        Array<{
            path: string;
            method: string;
        }>
    >([]);
    const [assistantNewConversationRequest, setAssistantNewConversationRequest] = useState<{
        id: string;
        path: string;
        method: string;
    } | null>(null);
    const showAssistantRef = useRef(showAssistant);
    showAssistantRef.current = showAssistant;
    const {aiSettings, setAISettings, setAISettingsReady, hasAIProfile, handleAISettingsSave} =
        useAISettingsController();
    const assistantRunnerAbortRef = useRef<AbortController | null>(null);
    const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [onlyProtected, setOnlyProtected] = useState<boolean | null>(null);
    const {
        sidebarDisplayRoutes,
        setSidebarDisplayRoutes,
        desktopCollapsed,
        setDesktopCollapsed,
        mobileOpen,
        setMobileOpen,
    } = useSidebarController(selectedParsableKey, isMobile);
    const {
        selectedThemeName,
        setSelectedThemeName,
        currentThemeMode,
        setCurrentThemeMode,
        resolvedThemeMode,
        toggleThemeMode,
        styleVars,
    } = useThemeController(selectedParsableKey);
    const [modalsStack, setModalsStack] = useState<string[]>([]);
    const [codeGenEndpoint, setCodeGenEndpoint] = useState<{
        path: string;
        method: string;
    } | null>(null);
    const [activeResponseCode, setActiveResponseCode] = useState<string | null>(null);
    // Credentials are deliberately scoped to the active specification and kept
    // in memory only. Reusing a common scheme ID such as `auth` in another
    // specification can never inherit the first specification's secret.
    const [authBySpec, setAuthBySpec] = useState<Record<string, ActiveAuth>>({});
    const authScopeKey = selectedParsableKey || '__no_spec__';
    const activeAuth = useMemo(() => authBySpec[authScopeKey] || createEmptyAuth(), [authBySpec, authScopeKey]);
    const setActiveAuth = useCallback<React.Dispatch<React.SetStateAction<ActiveAuth>>>(
        next => {
            setAuthBySpec(current => {
                const previous = current[authScopeKey] || createEmptyAuth();
                const resolved =
                    typeof next === 'function' ? (next as (value: ActiveAuth) => ActiveAuth)(previous) : next;
                return {...current, [authScopeKey]: resolved};
            });
        },
        [authScopeKey],
    );
    useEffect(() => {
        const result = consumeOAuthResult();
        if (!result) return;
        setAuthBySpec(current => {
            const previous = current[result.specKey] || createEmptyAuth();
            const credential = {
                ...(previous.schemeValues[result.schemeId] || {
                    schemeId: result.schemeId,
                    type: 'oauth2' as const,
                }),
                value: result.accessToken,
                scopes: result.scopes,
            };
            return {
                ...current,
                [result.specKey]: {
                    ...previous,
                    activeScheme: result.schemeId,
                    selectedSchemes: [result.schemeId],
                    schemeValues: {...previous.schemeValues, [result.schemeId]: credential},
                    bearerToken: result.accessToken,
                },
            };
        });
    }, []);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showServerVariablesModal, setShowServerVariablesModal] = useState(false);
    const [examineResponses, setExamineResponses] = useState<Record<EndpointKey, ExamineResponse[]>>({});
    const {
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
    } = useWorkspaceTabs({
        spec,
        selectedSpecKey: selectedParsableKey,
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
        setModalStack: setModalsStack,
        modalCount: modalsStack.length,
        onUserNavigate: requestHistoryPush,
    });
    useEffect(() => {
        if (!selectedEndpoint || !selectedParsableKey) return;
        const key = endpointKey(selectedEndpoint.path, selectedEndpoint.method);
        setExamineResponses(current =>
            Object.prototype.hasOwnProperty.call(current, key)
                ? current
                : {
                      ...current,
                      [key]: readResponseHistory(selectedParsableKey, selectedEndpoint.path, selectedEndpoint.method),
                  },
        );
    }, [selectedEndpoint, selectedParsableKey]);
    const [activeSplitPane, setActiveSplitPane] = useState<'docs' | 'examine'>('docs');
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const {
        leftWidth: docsPaneWidth,
        isDragging: isSplitDragging,
        onMouseDown: onSplitResizeMouseDown,
        onKeyDown: onSplitResizeKeyDown,
        separatorMin: splitSeparatorMin,
        separatorMax: splitSeparatorMax,
        separatorNow: splitSeparatorNow,
    } = useResizableSplit(splitContainerRef, 'opendoc:ui:endpoint_split_width');
    useEffect(() => {
        if (selectedTab === 'both') setActiveSplitPane('docs');
    }, [selectedTab, selectedEndpoint]);
    const [isUpdatingHash, setIsUpdatingHash] = useState(false);
    useEffect(() => {
        if (spec?.info?.title) document.title = `${spec.info.title} — OpenDoc UI`;
        else if (selectedParsableKey) document.title = `${selectedParsableKey} — OpenDoc UI`;
        else document.title = 'OpenDoc UI';
    }, [spec, selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey && parsables[selectedParsableKey]) {
            uiStorage.set('last_parsable', selectedParsableKey);
        }
    }, [selectedParsableKey, parsables]);
    const handleApplyLocalSpec = useCallback(
        ({
            key,
            document,
            switchingSpec,
            fetchInfo,
        }: {
            key: string;
            document: OpenApiSpec;
            switchingSpec: boolean;
            fetchInfo?: FetchSpecResult<OpenApiSpec>;
        }) => {
            setSelectedParsableKey(key);
            setSpec(document);
            setLoadedSpecKey(key);
            setSpecFetchInfo(fetchInfo || null);
            setIsLoadingSpec(false);
            setSelectedServer(document.servers?.[0]?.url || 'https://api.example.com');
            if (!switchingSpec) return;
            setSelectedEndpoint(null);
            setShowWelcome(false);
            setShowHome(false);
            setShowSchemaExplorer(false);
            setShowNotes(false);
            setShowCompatibility(false);
            setShowAbout(false);
            setShowAssistant(false);
            setAssistantContextEndpoints([]);
            setAssistantNewConversationRequest(null);
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
            const parsedRoute = parseSmartRoute(getCurrentSmartRoute());
            if (parsedRoute.parsableKey !== key) {
                const route = generateSmartRoute({
                    parsableKey: key,
                    showHome: true,
                    showAbout: false,
                    showAssistant: false,
                    showSchemaExplorer: false,
                    endpoint: null,
                    tab: 'docs',
                    schemaModals: [],
                    activeSpec: document,
                });
                window.history.pushState(window.history.state, '', route);
            }
            setIsUpdatingHash(false);
        },
        [],
    );
    const {
        localSpec,
        localHistory,
        localOpenError,
        setLocalOpenError,
        hiddenFileInputRef,
        applyLocalSpec,
        applyLocalBundle,
        handleFileChosen,
        handleSelectHistoryEntry,
        handleRemoveHistoryEntry,
        handleClearHistory,
        openReferencedFilePicker,
    } = useLocalSpecifications({
        selectedSpecKey: selectedParsableKey,
        onApply: handleApplyLocalSpec,
    });
    const {
        activeRemoteSpec,
        remoteHistory,
        remoteOpenError,
        setRemoteOpenError,
        isLoadingRemoteSpec,
        remoteLoadStatus,
        loadRemoteSpec,
        restoreRemoteSpec,
        handleSelectRemoteHistoryEntry,
        handleRemoveRemoteHistoryEntry,
        handleClearRemoteHistory,
    } = useRemoteSpecifications({
        enabled: REMOTE_SPEC_BUILD_CONFIG.enabled,
        downloaderTemplate: REMOTE_SPEC_BUILD_CONFIG.downloaderTemplate,
        selectedSpecKey: selectedParsableKey,
        onApply: handleApplyLocalSpec,
    });
    const {
        isRefreshingSpec,
        handleRefreshSpec,
        handleReloadSpecification,
        handleResetSpecification,
        handleResetAllConfigurations,
    } = useSpecificationActions({
        selectedSpecKey: selectedParsableKey,
        parsables,
        localSpec,
        activeRemoteSpec,
        loadRemoteSpec,
        loadSpec,
        applyLocalSpec,
        applyLocalBundle,
        setSpec,
        setLoadedSpecKey,
        setLocalOpenError,
        setRemoteOpenError,
    });
    useConfigBootstrap({
        setConfigSource,
        setAISettings,
        setAISettingsReady,
        setParsables,
        setSelectedSpecKey: setSelectedParsableKey,
        setInitialLoadComplete: setIsInitialLoadComplete,
        applyLocalSpec,
        applyLocalBundle,
        remoteLoadingEnabled: REMOTE_SPEC_BUILD_CONFIG.enabled,
        restoreRemoteSpec,
    });
    const restoreSpecificationFromRoute = useCallback(
        async (key: string): Promise<boolean> => {
            const localEntry = localHistory.find(entry => entry.key === key);
            if (localEntry) {
                try {
                    if (localEntry.bundle && Object.keys(localEntry.bundle).length > 1)
                        await applyLocalBundle(localEntry.bundle, null);
                    else applyLocalSpec(localEntry.raw, localEntry.fileName, null);
                    return true;
                } catch {
                    return false;
                }
            }
            return REMOTE_SPEC_BUILD_CONFIG.enabled ? restoreRemoteSpec(key) : false;
        },
        [localHistory, applyLocalBundle, applyLocalSpec, restoreRemoteSpec],
    );
    useWorkspaceRouting({
        parsables,
        selectedSpecKey: selectedParsableKey,
        setSelectedSpecKey: setSelectedParsableKey,
        loadedSpecKey,
        spec,
        setSpec,
        setLoadedSpecKey,
        isLoadingSpec,
        isInitialLoadComplete,
        isUpdatingHash,
        setIsUpdatingHash,
        tabsRestoredForKey,
        tabsRestoreDoneRef,
        specRouteReadyRef,
        navStateRef,
        showWelcome,
        setShowWelcome,
        showHome,
        setShowHome,
        showAbout,
        setShowAbout,
        showAssistant,
        setShowAssistant,
        showSettings,
        setShowSettings,
        settingsSection,
        setSettingsSection,
        showSchemaExplorer,
        setShowSchemaExplorer,
        showNotes,
        setShowNotes,
        showCompatibility,
        setShowCompatibility,
        selectedEndpoint,
        setSelectedEndpoint,
        selectedViewMode: selectedTab,
        setSelectedViewMode: setSelectedTab,
        modalStack: modalsStack,
        setModalStack: setModalsStack,
        activeResponseCode,
        setActiveResponseCode,
        searchQuery,
        setSearchQuery,
        setResultsQuery,
        selectedMethods,
        setSelectedMethods,
        selectedTags,
        setSelectedTags,
        onlyProtected,
        setOnlyProtected,
        activeTabId,
        setTabs: setEndpointTabs,
        setActiveTabId,
        setViewModes: setTabViewModes,
        setExamineResponses,
        setAssistantContextEndpoints,
        openEndpointPermanent,
        openViewTabPermanent,
        ensureViewTabFromState,
        historyIntentRef,
        restoreSpecificationFromRoute,
    });
    const openEndpointPreviewWithHistory = useCallback(
        (path: string, method: string) => {
            requestHistoryPush();
            openEndpointPreview(path, method);
        },
        [openEndpointPreview, requestHistoryPush],
    );
    const openEndpointPermanentWithHistory = useCallback(
        (path: string, method: string) => {
            requestHistoryPush();
            openEndpointPermanent(path, method);
        },
        [openEndpointPermanent, requestHistoryPush],
    );
    const openViewTabPermanentWithHistory = useCallback(
        (view: ViewTabKind, query = '') => {
            requestHistoryPush();
            openViewTabPermanent(view, query);
        },
        [openViewTabPermanent, requestHistoryPush],
    );
    const setActiveResponseCodeWithHistory = useCallback(
        (code: string | null) => {
            requestHistoryPush();
            setActiveResponseCode(code);
        },
        [requestHistoryPush],
    );
    const setModalsStackWithHistory = useCallback<React.Dispatch<React.SetStateAction<string[]>>>(
        next => {
            requestHistoryPush();
            setModalsStack(next);
        },
        [requestHistoryPush],
    );
    const setSelectedTabWithHistory = useCallback<React.Dispatch<React.SetStateAction<'docs' | 'examine' | 'both'>>>(
        next => {
            requestHistoryPush();
            setSelectedTab(next);
        },
        [requestHistoryPush, setSelectedTab],
    );
    const closeMobileIfNeeded = () => {
        if (isMobile) setMobileOpen(false);
    };
    const [shareTarget, setShareTarget] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const endpointDeepLink = useCallback(
        (path: string, method: string) =>
            absoluteRouteHref(
                generateSmartRoute({
                    parsableKey: selectedParsableKey,
                    showHome: false,
                    showAbout: false,
                    showAssistant: false,
                    showSchemaExplorer: false,
                    endpoint: {path, method},
                    tab: 'docs',
                    schemaModals: [],
                    activeSpec: spec,
                }),
            ),
        [spec, selectedParsableKey],
    );
    const viewDeepLink = useCallback(
        (view: ViewTabKind) => {
            let route = generateSmartRoute({
                parsableKey: selectedParsableKey,
                showHome: view === 'home',
                showAbout: view === 'about',
                showAssistant: view === 'assistant',
                showSchemaExplorer: view === 'schemas',
                showNotes: view === 'notes',
                showCompatibility: view === 'compatibility',
                endpoint: null,
                tab: 'docs',
                schemaModals: [],
                activeSpec: spec,
            });
            if (view === 'search') route += `${route.includes('?') ? '&' : '?'}search=`;
            return absoluteRouteHref(route);
        },
        [selectedParsableKey, spec],
    );
    const openEndpointInBrowserTab = useCallback(
        (path: string, method: string) => {
            window.open(endpointDeepLink(path, method), '_blank', 'noopener');
        },
        [endpointDeepLink],
    );
    const openViewInBrowserTab = useCallback(
        (view: ViewTabKind) => {
            window.open(viewDeepLink(view), '_blank', 'noopener');
        },
        [viewDeepLink],
    );
    const copyText = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    }, []);
    const askAIAboutEndpoint = useCallback(
        (path: string, method: string) => {
            setAssistantContextEndpoints(current => {
                const next = {path, method: method.toLowerCase()};
                if (!showAssistant) return [next];
                if (current.some(endpoint => endpoint.path === next.path && endpoint.method === next.method))
                    return current;
                return [...current, next].slice(0, 5);
            });
            openViewTab('assistant');
            closeMobileIfNeeded();
        },
        [openViewTab, isMobile, showAssistant],
    );
    const askAIAboutEndpointInNewConversation = useCallback(
        (path: string, method: string) => {
            const endpoint = {path, method: method.toLowerCase()};
            setAssistantContextEndpoints([endpoint]);
            setAssistantNewConversationRequest({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                ...endpoint,
            });
            setAssistantUnread(false);
            openViewTab('assistant');
            closeMobileIfNeeded();
        },
        [openViewTab, isMobile],
    );
    const handleContextAction = useCallback(
        (
            action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai',
            target:
                | {
                      type: 'endpoint';
                      path: string;
                      method: string;
                  }
                | {
                      type: 'view';
                      view: ViewTabKind;
                  },
        ) => {
            if (target.type === 'endpoint') {
                const {path, method} = target;
                if (action === 'ask-ai' && !hasAIProfile) return;
                if (action === 'ask-ai') {
                    askAIAboutEndpoint(path, method);
                    return;
                }
                if (action === 'open-new-tab') {
                    openEndpointPermanentWithHistory(path, method);
                    return;
                }
                if (action === 'open-browser') {
                    openEndpointInBrowserTab(path, method);
                    return;
                }
                const op = getOperation(spec, path, method);
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
                openViewTabPermanentWithHistory(view);
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
        },
        [
            spec,
            hasAIProfile,
            openEndpointPermanentWithHistory,
            openViewTabPermanentWithHistory,
            openEndpointInBrowserTab,
            openViewInBrowserTab,
            endpointDeepLink,
            viewDeepLink,
            copyText,
            askAIAboutEndpoint,
        ],
    );
    const handleSelectEndpoint = (path: string, method: string) => {
        if (activeTabId === 'view:search') stashSearchTab();
        if (searchRenderTimer.current) {
            clearTimeout(searchRenderTimer.current);
            searchRenderTimer.current = null;
        }
        setResultsQuery('');
        openEndpointPreviewWithHistory(path, method);
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowNotes(false);
        setShowCompatibility(false);
        setShowAbout(false);
        setShowAssistant(false);
        setShowSettings(false);
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
    const preSearchTabRef = useRef<string | null>(null);
    const searchHasResults = useCallback(
        (q: string): boolean => {
            if (!spec?.paths || !q.trim()) return false;
            const needle = q.trim().toLowerCase();
            for (const {path: pathStr, operation} of getDocumentOperations(spec)) {
                if (sidebarDisplayRoutes && pathStr.toLowerCase().includes(needle)) return true;
                if ((operation.summary || '').toLowerCase().includes(needle)) return true;
                if ((operation.description || '').toLowerCase().includes(needle)) return true;
                if ((operation.tags || []).some((tag: string) => tag.toLowerCase().includes(needle))) return true;
            }
            return false;
        },
        [spec, sidebarDisplayRoutes],
    );
    const handleSearchChange = (query: string) => {
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
                setEndpointTabs(prev =>
                    prev.map(t =>
                        t.id === 'view:search'
                            ? {
                                  ...t,
                                  query,
                                  label: `Search: ${query}`,
                              }
                            : t,
                    ),
                );
                return;
            }
            if (!preSearchTabRef.current && activeTabId && !activeTabId.startsWith('view:search')) {
                preSearchTabRef.current = activeTabId;
            }
            if (searchRenderTimer.current) {
                clearTimeout(searchRenderTimer.current);
                searchRenderTimer.current = null;
            }
            setResultsQuery(query);
            openViewTab('search', query);
        } else {
            setSelectedMethods([]);
            setSelectedTags([]);
            setOnlyProtected(null);
            const prevId = preSearchTabRef.current;
            preSearchTabRef.current = null;
            const rest = endpointTabs.filter(t => t.id !== 'view:search');
            setEndpointTabs(rest);
            const prevTab = prevId ? rest.find(t => t.id === prevId) : null;
            const target = prevTab || rest[rest.length - 1] || null;
            if (target) {
                setActiveTabId(target.id);
                applyTabViewState(target);
            } else {
                setSelectedEndpoint(null);
                setActiveTabId(null);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowNotes(false);
                setShowCompatibility(false);
                setShowAbout(false);
                setSearchQuery('');
                setResultsQuery('');
                setShowWelcome(true);
                const clean = generateSmartRoute({
                    parsableKey: selectedParsableKey,
                    showHome: true,
                    showAbout: false,
                    showAssistant: false,
                    showSchemaExplorer: false,
                    endpoint: null,
                    tab: 'docs',
                    schemaModals: [],
                    activeSpec: spec,
                });
                setIsUpdatingHash(true);
                window.history.pushState(window.history.state, '', clean);
                setIsUpdatingHash(false);
            }
        }
    };
    const handleOpenHome = () => {
        setScrollIntent({type: 'view', id: 'view:home'});
        openViewTab('home');
        if (!spec)
            window.history.pushState(
                window.history.state,
                '',
                generateSmartRoute({
                    parsableKey: '',
                    showHome: true,
                    showAbout: false,
                    showAssistant: false,
                    showSchemaExplorer: false,
                    endpoint: null,
                    tab: 'docs',
                    schemaModals: [],
                }),
            );
        closeMobileIfNeeded();
    };
    const handleOpenAbout = () => {
        setScrollIntent({type: 'view', id: 'view:about'});
        openViewTab('about');
        if (!spec)
            window.history.pushState(
                window.history.state,
                '',
                generateSmartRoute({
                    parsableKey: '',
                    showHome: false,
                    showAbout: true,
                    showAssistant: false,
                    showSchemaExplorer: false,
                    endpoint: null,
                    tab: 'docs',
                    schemaModals: [],
                }),
            );
        closeMobileIfNeeded();
    };
    const handleOpenSchemaExplorer = () => {
        setScrollIntent({type: 'view', id: 'view:schemas'});
        openViewTab('schemas');
        closeMobileIfNeeded();
    };
    const handleOpenNotes = () => {
        setScrollIntent({type: 'view', id: 'view:notes'});
        openViewTab('notes');
        closeMobileIfNeeded();
    };
    const handleOpenCompatibility = () => {
        setScrollIntent({type: 'view', id: 'view:compatibility'});
        openViewTab('compatibility');
        closeMobileIfNeeded();
    };
    const handleOpenSettings = (section: SettingsSectionId = DEFAULT_SETTINGS_SECTION) => {
        setSettingsSection(section);
        setScrollIntent({type: 'view', id: 'view:settings'});
        openViewTab('settings');
        closeMobileIfNeeded();
    };
    const handleOpenAssistant = () => {
        setAssistantUnread(false);
        openViewTab('assistant');
        closeMobileIfNeeded();
    };
    const handleOpenRunner = (path: string, method: string) => {
        openEndpointPreviewWithHistory(path, method);
        setSelectedTab('examine');
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowNotes(false);
        setShowCompatibility(false);
        setShowAbout(false);
        setShowAssistant(false);
        setShowSettings(false);
    };
    const handleAssistantResponseFinished = useCallback(() => {
        if (!(showAssistantRef.current && activeTabIdForAssistantRef.current === 'view:assistant')) {
            setAssistantUnread(true);
        }
    }, []);
    const handleDownload = () => {
        if (!spec) return;
        const raw = getRawSpecDocument(spec);
        const text = raw?.text || JSON.stringify(spec, null, 2);
        const isYaml = raw?.text ? !raw.text.trimStart().startsWith('{') : false;
        const d = `data:${isYaml ? 'application/yaml' : 'application/json'};charset=utf-8,` + encodeURIComponent(text);
        const a = document.createElement('a');
        a.href = d;
        a.download = `${selectedParsableKey}-spec.${isYaml ? 'yaml' : 'json'}`;
        a.click();
    };
    const handlePushSchema = (name: string) => {
        /* Navigating to a schema that is already in the breadcrumb walks back
           to it (A → B → A cycles would otherwise grow the trail forever).
           No history push either — the URL is replaced, so the browser
           history is not polluted by the shortcut. */
        const existing = modalsStack.lastIndexOf(name);
        if (existing >= 0) {
            setModalsStack(stack => stack.slice(0, existing + 1));
            return;
        }
        requestHistoryPush();
        setModalsStack(stack => [...stack, name]);
    };
    const handleAssistantBridgeAction = useCallback(
        (action: OpenDocUIAction) => {
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
            const operation = getOperation(spec, action.path, action.method);
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
            })
                .then(result => {
                    if (assistantRunnerAbortRef.current === controller) assistantRunnerAbortRef.current = null;
                    const historyKey = endpointKey(action.path, action.method);
                    setExamineResponses(current => ({
                        ...current,
                        [historyKey]: appendResponseHistory(
                            selectedParsableKey,
                            action.path,
                            action.method,
                            result,
                            current[historyKey] || readResponseHistory(selectedParsableKey, action.path, action.method),
                        ),
                    }));
                    dispatchOpenDocUIRunnerResult({
                        actionId,
                        specKey: selectedParsableKey,
                        path: action.path,
                        method: action.method,
                        result,
                    });
                })
                .catch(error => {
                    if (assistantRunnerAbortRef.current === controller) assistantRunnerAbortRef.current = null;
                    dispatchOpenDocUIRunnerResult({
                        actionId,
                        specKey: selectedParsableKey,
                        path: action.path,
                        method: action.method,
                        result: {
                            status: 0,
                            headers: {},
                            body: error instanceof Error ? error.message : 'AI Runner action failed.',
                            isJson: false,
                            errorKind: 'network',
                            errorMessage: error instanceof Error ? error.message : 'AI Runner action failed.',
                        },
                    });
                });
        },
        [
            activeAuth,
            handleOpenRunner,
            handleSelectEndpoint,
            handleSearchChange,
            selectedParsableKey,
            selectedServer,
            spec,
        ],
    );
    const handlePopSchema = () => {
        requestHistoryPush();
        setModalsStack(stack => stack.slice(0, -1));
    };
    const handleSelectParsable = (k: string) => {
        if (k === selectedParsableKey) return;
        setSpec(null);
        setLoadedSpecKey('');
        setSelectedEndpoint(null);
        setShowWelcome(false);
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowNotes(false);
        setShowCompatibility(false);
        setShowAbout(false);
        setShowAssistant(false);
        setAssistantContextEndpoints([]);
        setAssistantNewConversationRequest(null);
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
        const route = generateSmartRoute({
            parsableKey: k,
            showHome: true,
            showAbout: false,
            showAssistant: false,
            showSchemaExplorer: false,
            endpoint: null,
            tab: 'docs',
            schemaModals: [],
            activeSpec: null,
        });
        window.history.pushState(window.history.state, '', route);
        setIsUpdatingHash(false);
        closeMobileIfNeeded();
    };
    const isLocalMode = Object.keys(parsables).length === 0;
    const canOpenLocal = configSource === 'none' || configSource === 'hybrid';
    const assistantTabActive = showAssistant || activeTabId === 'view:assistant';
    const content = () => (
        <WorkspaceContent
            spec={spec}
            specKey={selectedParsableKey}
            canOpenLocal={canOpenLocal}
            onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
            onAddReferencedFiles={localSpec?.key === selectedParsableKey ? openReferencedFilePicker : undefined}
            showAbout={showAbout}
            showWelcome={showWelcome}
            assistantActive={assistantTabActive}
            activeTabId={activeTabId}
            resultsQuery={resultsQuery}
            selectedMethods={selectedMethods}
            setSelectedMethods={setSelectedMethods}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            onlyProtected={onlyProtected}
            setOnlyProtected={setOnlyProtected}
            selectedServer={selectedServer}
            setSelectedServer={setSelectedServer}
            serverVariables={serverVariables}
            displayRoutes={sidebarDisplayRoutes}
            selectedEndpoint={selectedEndpoint}
            selectedViewMode={selectedTab}
            setSelectedViewMode={setSelectedTabWithHistory}
            activeSplitPane={activeSplitPane}
            setActiveSplitPane={setActiveSplitPane}
            splitContainerRef={splitContainerRef}
            docsPaneWidth={docsPaneWidth}
            isSplitDragging={isSplitDragging}
            onSplitResizeMouseDown={onSplitResizeMouseDown}
            onSplitResizeKeyDown={onSplitResizeKeyDown}
            splitSeparatorMin={splitSeparatorMin}
            splitSeparatorMax={splitSeparatorMax}
            splitSeparatorNow={splitSeparatorNow}
            isMobile={isMobile}
            activeAuth={activeAuth}
            resolvedThemeMode={resolvedThemeMode}
            activeResponseCode={activeResponseCode}
            setActiveResponseCode={setActiveResponseCodeWithHistory}
            examineResponses={examineResponses}
            setExamineResponses={setExamineResponses}
            showSchemaExplorer={showSchemaExplorer}
            showNotes={showNotes}
            showCompatibility={showCompatibility}
            showSettings={showSettings}
            settingsSection={settingsSection}
            onSelectSettingsSection={setSettingsSection}
            appearanceSettings={{
                selectedThemeName,
                themeMode: currentThemeMode,
                resolvedThemeMode,
                onSelectTheme: setSelectedThemeName,
                onSetThemeMode: setCurrentThemeMode,
            }}
            aiSettingsSection={{settings: aiSettings, onSave: handleAISettingsSave}}
            showHome={showHome}
            onOpenAbout={handleOpenAbout}
            onOpenHome={handleOpenHome}
            onOpenCompatibility={handleOpenCompatibility}
            onOpenSchema={handlePushSchema}
            onSearchChange={handleSearchChange}
            onSelectEndpoint={handleSelectEndpoint}
            onSearchResult={handleSearchResult}
            onOpenEndpointPermanent={openEndpointPermanentWithHistory}
            onOpenEndpointPreview={openEndpointPreviewWithHistory}
            onGenerateCode={setCodeGenEndpoint}
            onAskAINewConversation={askAIAboutEndpointInNewConversation}
            onHidePageViews={() => {
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowNotes(false);
                setShowCompatibility(false);
                setShowAbout(false);
                setShowAssistant(false);
                setShowSettings(false);
            }}
        />
    );
    const isSidebarCollapsed = isMobile ? false : desktopCollapsed;
    const onToggleCollapse = () => {
        if (isMobile) setMobileOpen(o => !o);
        else setDesktopCollapsed(c => !c);
    };
    return (
        <TooltipProvider>
            <EndpointNotesProvider specKey={selectedParsableKey} spec={spec}>
                <OperationLinkProvider spec={spec} parsableKey={selectedParsableKey}>
                    <div
                        style={styleVars}
                        className="app-viewport w-full min-h-0 overflow-hidden flex flex-col font-sans transition-colors duration-150 text-[var(--text)] bg-[var(--background)]"
                    >
                        <input
                            ref={hiddenFileInputRef}
                            type="file"
                            multiple
                            accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
                            className="hidden"
                            onChange={handleFileChosen}
                        />

                        <Topbar
                            parsables={parsables}
                            selectedParsableKey={selectedParsableKey}
                            onSelectParsable={handleSelectParsable}
                            activeAuth={activeAuth}
                            onUpdateAuth={setActiveAuth}
                            onOpenAuthModal={() => setShowAuthModal(true)}
                            searchQuery={searchQuery}
                            onSearchChange={handleSearchChange}
                            onDownloadSpec={handleDownload}
                            title={spec?.info?.title || 'OpenDoc UI'}
                            showSchemaExplorer={showSchemaExplorer}
                            spec={spec}
                            specFreshness={specFetchInfo}
                            showHome={showHome}
                            isCollapsed={isSidebarCollapsed}
                            onToggleCollapse={onToggleCollapse}
                            onOpenMobileSidebar={() => setMobileOpen(true)}
                            onOpenAssistant={handleOpenAssistant}
                            themeMode={currentThemeMode}
                            resolvedThemeMode={resolvedThemeMode}
                            onSetThemeMode={setCurrentThemeMode}
                            onOpenSettings={() => handleOpenSettings()}
                            isLocalMode={isLocalMode}
                            canOpenLocal={canOpenLocal}
                            onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                            onRefreshSpec={handleRefreshSpec}
                            onReloadSpecification={handleReloadSpecification}
                            onResetSpecification={handleResetSpecification}
                            onResetAllConfigurations={handleResetAllConfigurations}
                            isRefreshingSpec={isRefreshingSpec}
                            localHistory={localHistory}
                            onSelectHistoryEntry={handleSelectHistoryEntry}
                            onRemoveHistoryEntry={handleRemoveHistoryEntry}
                            onClearHistory={handleClearHistory}
                            localOpenError={localOpenError}
                            onDismissLocalError={() => setLocalOpenError(null)}
                            remoteLoadingEnabled={REMOTE_SPEC_BUILD_CONFIG.enabled}
                            downloaderConfigured={!!REMOTE_SPEC_BUILD_CONFIG.downloaderTemplate}
                            remoteHistory={remoteHistory}
                            remoteOpenError={remoteOpenError}
                            isLoadingRemoteSpec={isLoadingRemoteSpec}
                            remoteLoadStatus={remoteLoadStatus}
                            onLoadRemoteUrl={loadRemoteSpec}
                            onSelectRemoteHistoryEntry={handleSelectRemoteHistoryEntry}
                            onRemoveRemoteHistoryEntry={handleRemoveRemoteHistoryEntry}
                            onClearRemoteHistory={handleClearRemoteHistory}
                            onSearchHasResults={searchHasResults}
                            hideSearch={false}
                        />

                        <div className="flex-1 flex overflow-hidden w-full h-full min-w-0 relative">
                            {isLoadingSpec ? (
                                <SpecLoadingState />
                            ) : !spec ? (
                                content()
                            ) : (
                                <>
                                    <Sidebar
                                        spec={spec}
                                        parsables={isMobile ? parsables : undefined}
                                        selectedParsableKey={selectedParsableKey}
                                        onSelectParsable={isMobile ? handleSelectParsable : undefined}
                                        selectedServer={selectedServer}
                                        onSelectServer={setSelectedServer}
                                        serverVariables={serverVariables}
                                        onOpenServerVariables={() => setShowServerVariablesModal(true)}
                                        isCollapsed={desktopCollapsed}
                                        onToggleCollapse={() => setDesktopCollapsed(c => !c)}
                                        onOpenSchemaExplorer={handleOpenSchemaExplorer}
                                        showSchemaExplorer={showSchemaExplorer}
                                        onOpenNotes={handleOpenNotes}
                                        showNotes={showNotes}
                                        showCompatibility={showCompatibility}
                                        onOpenCompatibility={handleOpenCompatibility}
                                        selectedMethods={selectedMethods}
                                        setSelectedMethods={setSelectedMethods}
                                        selectedTags={selectedTags}
                                        setSelectedTags={setSelectedTags}
                                        onlyProtected={onlyProtected}
                                        setOnlyProtected={setOnlyProtected}
                                        searchQuery={searchQuery}
                                        selectedEndpoint={selectedEndpoint}
                                        onSelectEndpoint={handleSelectEndpoint}
                                        onMiddleClickEndpoint={openEndpointPermanentWithHistory}
                                        getEndpointHref={(path, method) =>
                                            generateSmartRoute({
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
                                                activeSpec: spec,
                                            })
                                        }
                                        onOpenHome={handleOpenHome}
                                        onOpenAbout={handleOpenAbout}
                                        onOpenViewPermanent={openViewTabPermanentWithHistory}
                                        onContextAction={handleContextAction}
                                        scrollIntent={scrollIntent}
                                        setScrollIntent={setScrollIntent}
                                        showHome={showHome}
                                        showAbout={showAbout}
                                        showAssistant={showAssistant}
                                        assistantContextEndpoints={assistantContextEndpoints}
                                        hasAIProfile={hasAIProfile}
                                        themeMode={currentThemeMode}
                                        resolvedThemeMode={resolvedThemeMode}
                                        onToggleThemeMode={toggleThemeMode}
                                        onOpenAppearanceSettings={() => handleOpenSettings('appearance')}
                                        onOpenAuthModal={() => setShowAuthModal(true)}
                                        activeAuth={activeAuth}
                                        onDownloadSpec={handleDownload}
                                        isLocalMode={isLocalMode}
                                        canOpenLocal={canOpenLocal}
                                        onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                                        onDisplayRoutesChange={setSidebarDisplayRoutes}
                                        onReloadSpecification={handleReloadSpecification}
                                        onResetSpecification={handleResetSpecification}
                                        onResetAllConfigurations={handleResetAllConfigurations}
                                        onRefreshSpec={handleRefreshSpec}
                                        isRefreshingSpec={isRefreshingSpec}
                                        localHistory={localHistory}
                                        onSelectHistoryEntry={handleSelectHistoryEntry}
                                        onRemoveHistoryEntry={handleRemoveHistoryEntry}
                                        onClearHistory={handleClearHistory}
                                        localOpenError={localOpenError}
                                        onDismissLocalError={() => setLocalOpenError(null)}
                                        remoteLoadingEnabled={REMOTE_SPEC_BUILD_CONFIG.enabled}
                                        downloaderConfigured={!!REMOTE_SPEC_BUILD_CONFIG.downloaderTemplate}
                                        remoteHistory={remoteHistory}
                                        remoteOpenError={remoteOpenError}
                                        isLoadingRemoteSpec={isLoadingRemoteSpec}
                                        remoteLoadStatus={remoteLoadStatus}
                                        onLoadRemoteUrl={loadRemoteSpec}
                                        onSelectRemoteHistoryEntry={handleSelectRemoteHistoryEntry}
                                        onRemoveRemoteHistoryEntry={handleRemoveRemoteHistoryEntry}
                                        onClearRemoteHistory={handleClearRemoteHistory}
                                        mobileOpen={mobileOpen}
                                        onCloseMobile={() => setMobileOpen(false)}
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
                                                onOpenSwitcher={openSwitcher}
                                            />
                                        )}
                                        <div
                                            className={clsx(
                                                'flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden',
                                                assistantTabActive ? 'hidden' : 'flex',
                                            )}
                                        >
                                            {content()}
                                        </div>
                                        <div
                                            className={clsx(
                                                'flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden',
                                                assistantTabActive ? 'flex' : 'hidden',
                                            )}
                                        >
                                            {spec && (
                                                <AIAssistantView
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
                                                    newConversationRequest={assistantNewConversationRequest}
                                                    onNewConversationRequestHandled={id =>
                                                        setAssistantNewConversationRequest(current =>
                                                            current?.id === id ? null : current,
                                                        )
                                                    }
                                                    onOpenSettings={() => handleOpenSettings('ai')}
                                                    onClearEndpointContext={() => setAssistantContextEndpoints([])}
                                                    onRemoveEndpointContext={(path, method) =>
                                                        setAssistantContextEndpoints(current =>
                                                            current.filter(
                                                                endpoint =>
                                                                    !(
                                                                        endpoint.path === path &&
                                                                        endpoint.method === method
                                                                    ),
                                                            ),
                                                        )
                                                    }
                                                    onOpenEndpoint={handleSelectEndpoint}
                                                    onOpenRunner={handleOpenRunner}
                                                    onBridgeAction={handleAssistantBridgeAction}
                                                    onResponseFinished={handleAssistantResponseFinished}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <AppModalLayer
                            spec={spec}
                            specKey={selectedParsableKey}
                            selectedServer={selectedServer}
                            serverVariables={serverVariables}
                            onChangeServerVariables={(url, values) =>
                                setServerVariables(current => ({...current, [url]: values}))
                            }
                            serverVariablesOpen={showServerVariablesModal}
                            setServerVariablesOpen={setShowServerVariablesModal}
                            schemaStack={modalsStack}
                            setSchemaStack={setModalsStackWithHistory}
                            onPopSchema={handlePopSchema}
                            onPushSchema={handlePushSchema}
                            codeEndpoint={codeGenEndpoint}
                            setCodeEndpoint={setCodeGenEndpoint}
                            activeAuth={activeAuth}
                            authOperation={
                                selectedEndpoint
                                    ? getOperation(spec, selectedEndpoint.path, selectedEndpoint.method)
                                    : null
                            }
                            setActiveAuth={setActiveAuth}
                            authOpen={showAuthModal}
                            setAuthOpen={setShowAuthModal}
                            switcherOpen={switcherOpen}
                            tabs={endpointTabs}
                            activeTabId={activeTabId}
                            switcherIndex={switcherIndex}
                            onCancelSwitcher={cancelSwitcher}
                            onSelectSwitcherTab={id => {
                                handleSelectTab(id);
                                setSwitcherOpen(false);
                            }}
                            shareTarget={shareTarget}
                            setShareTarget={setShareTarget}
                            aiSettings={aiSettings}
                            onSaveAISettings={handleAISettingsSave}
                        />
                        <EndpointNotesModalLayer spec={spec} />
                    </div>
                </OperationLinkProvider>
            </EndpointNotesProvider>
        </TooltipProvider>
    );
}
