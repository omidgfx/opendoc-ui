import React, {useCallback, useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec, ParsableConfig,} from './types';
import {generateSmartRoute, getEndpointId} from './utils/routing';
import {uiStorage} from './utils/storage';
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
    type OpenDocUIAction
} from './utils/aiBridge';
import {executeRunnerRequest} from './utils/runnerExecution';
import {type ConfigSource, type EndpointKey} from './utils/appSpec';
import SpecLoadingState from './components/app/SpecLoadingState';
import AppModalLayer from './components/app/AppModalLayer';
import WorkspaceContent from './components/app/WorkspaceContent';
import {useThemeController} from './hooks/useThemeController';
import {useAISettingsController} from './hooks/useAISettingsController';
import {useSidebarController} from './hooks/useSidebarController';
import {useSpecLoader} from './hooks/useSpecLoader';
import {useLocalSpecifications} from './hooks/useLocalSpecifications';
import {useWorkspaceRouting} from './hooks/useWorkspaceRouting';
import {useConfigBootstrap} from './hooks/useConfigBootstrap';
import {useWorkspaceTabs} from './hooks/useWorkspaceTabs';
import {useSpecificationActions} from './hooks/useSpecificationActions';

declare global {
    interface Window {
        INITIAL_CONFIG?: any;
    }
}
export default function App() {
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';
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
        loadSpec,
    } = useSpecLoader(selectedParsableKey, parsables);
    const [searchQuery, setSearchQuery] = useState('');
    const [resultsQuery, setResultsQuery] = useState('');
    const searchRenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showWelcome, setShowWelcome] = useState(false);
    const [showHome, setShowHome] = useState(true);
    const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showAssistant, setShowAssistant] = useState(false);
    const [assistantContextEndpoints, setAssistantContextEndpoints] = useState<Array<{
        path: string;
        method: string;
    }>>([]);
    const showAssistantRef = useRef(showAssistant);
    showAssistantRef.current = showAssistant;
    const {
        aiSettings,
        setAISettings,
        setAISettingsReady,
        hasAIProfile,
        showAISettings,
        setShowAISettings,
        handleAISettingsSave,
    } = useAISettingsController();
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
    const [activeAuth, setActiveAuth] = useState<ActiveAuth>({
        activeScheme: 'none', selectedSchemes: [], schemeValues: {}, requirementIndex: 0,
        cookieValues: {}, bearerToken: '', apiKeyName: 'X-API-KEY', apiKeyValue: '', apiKeyIn: 'header',
        basicUsername: '', basicPassword: '',
    });
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showThemeModal, setShowThemeModal] = useState(false);
    const [examineResponses, setExamineResponses] = useState<Record<EndpointKey, ExamineResponse>>({});
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
        showAbout,
        setShowAbout,
        showAssistant,
        setShowAssistant,
        setActiveResponseCode,
        setModalStack: setModalsStack,
        modalCount: modalsStack.length,
    });
    const [activeSplitPane, setActiveSplitPane] = useState<'docs' | 'examine'>('docs');
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const {
        leftWidth: docsPaneWidth,
        isDragging: isSplitDragging,
        onMouseDown: onSplitResizeMouseDown,
    } = useResizableSplit(splitContainerRef, 'opendoc:ui:endpoint_split_width');
    useEffect(() => {
        if (selectedTab === 'both')
            setActiveSplitPane('docs');
    }, [selectedTab, selectedEndpoint]);
    const [isUpdatingHash, setIsUpdatingHash] = useState(false);
    useEffect(() => {
        if (spec?.info?.title)
            document.title = `${spec.info.title} — OpenDoc UI`;
        else if (selectedParsableKey)
            document.title = `${selectedParsableKey} — OpenDoc UI`;
        else
            document.title = 'OpenDoc UI';
    }, [spec, selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey && parsables[selectedParsableKey]) {
            uiStorage.set('last_parsable', selectedParsableKey);
        }
    }, [selectedParsableKey, parsables]);
    const handleApplyLocalSpec = useCallback(({key, document, switchingSpec}: {
        key: string;
        document: OpenApiSpec;
        switchingSpec: boolean;
    }) => {
        setSelectedParsableKey(key);
        setSpec(document);
        setLoadedSpecKey(key);
        setIsLoadingSpec(false);
        setSelectedServer(document.servers?.[0]?.url || 'https://api.example.com');
        if (!switchingSpec)
            return;
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
        const hash = `#/parsable/${encodeURIComponent(key)}`;
        if (window.location.hash !== hash)
            window.location.hash = hash;
        setIsUpdatingHash(false);
    }, []);
    const {
        localSpec,
        localHistory,
        localOpenError,
        setLocalOpenError,
        hiddenFileInputRef,
        applyLocalSpec,
        handleFileChosen,
        handleSelectHistoryEntry,
        handleRemoveHistoryEntry,
        handleClearHistory,
    } = useLocalSpecifications({
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
        loadSpec,
        applyLocalSpec,
        setSpec,
        setLoadedSpecKey,
        setLocalOpenError,
    });
    useConfigBootstrap({
        setConfigSource,
        setAISettings,
        setAISettingsReady,
        setParsables,
        setSelectedSpecKey: setSelectedParsableKey,
        setInitialLoadComplete: setIsInitialLoadComplete,
        applyLocalSpec,
    });
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
        showSchemaExplorer,
        setShowSchemaExplorer,
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
        openEndpointPreview,
        openEndpointPermanent,
        openViewTab,
        openViewTabPermanent,
        ensureViewTabFromState,
    });
    const closeMobileIfNeeded = () => {
        if (isMobile)
            setMobileOpen(false);
    };
    const [shareTarget, setShareTarget] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const endpointDeepLink = useCallback((path: string, method: string) => {
        const op = (spec?.paths?.[path] as any)?.[method] || {};
        const opId = getEndpointId(op, path, method);
        return `${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(selectedParsableKey)}/api/${encodeURIComponent(opId)}`;
    }, [spec, selectedParsableKey]);
    const viewDeepLink = useCallback((view: ViewTabKind) => {
        const base = `${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(selectedParsableKey)}`;
        if (view === 'about')
            return `${base}/about`;
        if (view === 'schemas')
            return `${base}/schema-explorer`;
        if (view === 'assistant')
            return `${base}/assistant`;
        if (view === 'search')
            return `${base}?search=`;
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
        }
    }, []);
    const askAIAboutEndpoint = useCallback((path: string, method: string) => {
        setAssistantContextEndpoints(current => {
            const next = {path, method: method.toLowerCase()};
            if (!showAssistant)
                return [next];
            if (current.some(endpoint => endpoint.path === next.path && endpoint.method === next.method))
                return current;
            return [...current, next].slice(0, 5);
        });
        openViewTab('assistant');
        closeMobileIfNeeded();
    }, [openViewTab, isMobile, showAssistant]);
    const handleContextAction = useCallback((action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai', target: {
        type: 'endpoint';
        path: string;
        method: string;
    } | {
        type: 'view';
        view: ViewTabKind;
    }) => {
        if (target.type === 'endpoint') {
            const {path, method} = target;
            if (action === 'ask-ai' && !hasAIProfile)
                return;
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
        if (activeTabId === 'view:search')
            stashSearchTab();
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
        if (!isMobile)
            setDesktopCollapsed(false);
        handleSelectEndpoint(path, method);
    };
    const preSearchTabRef = useRef<string | null>(null);
    const searchHasResults = useCallback((q: string): boolean => {
        if (!spec?.paths || !q.trim())
            return false;
        const needle = q.trim().toLowerCase();
        for (const [pathStr, item] of Object.entries(spec.paths)) {
            for (const [m, op] of Object.entries(item as any)) {
                if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(m))
                    continue;
                const o = op as any;
                if (sidebarDisplayRoutes && pathStr.toLowerCase().includes(needle))
                    return true;
                if ((o.summary || '').toLowerCase().includes(needle))
                    return true;
                if ((o.description || '').toLowerCase().includes(needle))
                    return true;
                if ((o.tags || []).some((t: string) => t.toLowerCase().includes(needle)))
                    return true;
            }
        }
        return false;
    }, [spec, sidebarDisplayRoutes]);
    const handleSearchChange = (query: string) => {
        if (query.trim())
            setSelectedEndpoint(null);
        setSearchQuery(query);
        if (searchRenderTimer.current) {
            clearTimeout(searchRenderTimer.current);
            searchRenderTimer.current = null;
        }
        searchRenderTimer.current = setTimeout(() => setResultsQuery(query), 250);
        if (query.trim().length) {
            setShowWelcome(false);
            if (activeTabId === 'view:search' && query.trim().length) {
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
                setShowAbout(false);
                setSearchQuery('');
                setResultsQuery('');
                setShowWelcome(true);
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
        if (!spec)
            window.location.hash = '#/';
        closeMobileIfNeeded();
    };
    const handleOpenAbout = () => {
        setScrollIntent({type: 'view', id: 'view:about'});
        openViewTab('about');
        if (!spec)
            window.location.hash = '#/about';
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
        if (!(showAssistantRef.current && activeTabIdForAssistantRef.current === 'view:assistant')) {
            setAssistantUnread(true);
        }
    }, []);
    const handleDownload = () => {
        if (!spec)
            return;
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
            if (spec?.components?.schemas?.[action.schema])
                handlePushSchema(action.schema);
            return;
        }
        if (action.action === 'search_spec') {
            handleSearchChange(action.query);
            return;
        }
        if (action.action === 'select_server') {
            if (spec?.servers?.some(server => server.url === action.url))
                setSelectedServer(action.url);
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
        const operation = (spec?.paths?.[action.path] as any)?.[action.method];
        const actionId = action.id || createOpenDocUIActionId();
        if (!spec || !operation)
            return;
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
            if (assistantRunnerAbortRef.current === controller)
                assistantRunnerAbortRef.current = null;
            dispatchOpenDocUIRunnerResult({
                actionId,
                specKey: selectedParsableKey,
                path: action.path,
                method: action.method,
                result
            });
        }).catch(error => {
            if (assistantRunnerAbortRef.current === controller)
                assistantRunnerAbortRef.current = null;
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
                    errorMessage: error instanceof Error ? error.message : 'AI Runner action failed.'
                },
            });
        });
    }, [activeAuth, handleOpenRunner, handleSelectEndpoint, handleSearchChange, selectedParsableKey, selectedServer, spec]);
    const handlePopSchema = () => setModalsStack(p => p.slice(0, -1));
    const handleSelectParsable = (k: string) => {
        if (k === selectedParsableKey)
            return;
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
        if (window.location.hash !== h)
            window.location.hash = h;
        setIsUpdatingHash(false);
        closeMobileIfNeeded();
    };
    const isLocalMode = Object.keys(parsables).length === 0;
    const canOpenLocal = configSource === 'none';
    const assistantTabActive = showAssistant || activeTabId === 'view:assistant';
    const content = () => (<WorkspaceContent spec={spec} specKey={selectedParsableKey} canOpenLocal={canOpenLocal}
                                             onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                                             showAbout={showAbout} showWelcome={showWelcome}
                                             assistantActive={assistantTabActive} activeTabId={activeTabId}
                                             resultsQuery={resultsQuery} selectedMethods={selectedMethods}
                                             setSelectedMethods={setSelectedMethods} selectedTags={selectedTags}
                                             setSelectedTags={setSelectedTags} onlyProtected={onlyProtected}
                                             setOnlyProtected={setOnlyProtected} selectedServer={selectedServer}
                                             setSelectedServer={setSelectedServer} displayRoutes={sidebarDisplayRoutes}
                                             selectedEndpoint={selectedEndpoint} selectedViewMode={selectedTab}
                                             setSelectedViewMode={setSelectedTab} activeSplitPane={activeSplitPane}
                                             setActiveSplitPane={setActiveSplitPane}
                                             splitContainerRef={splitContainerRef} docsPaneWidth={docsPaneWidth}
                                             isSplitDragging={isSplitDragging}
                                             onSplitResizeMouseDown={onSplitResizeMouseDown} isMobile={isMobile}
                                             activeAuth={activeAuth} resolvedThemeMode={resolvedThemeMode}
                                             activeResponseCode={activeResponseCode}
                                             setActiveResponseCode={setActiveResponseCode}
                                             examineResponses={examineResponses}
                                             setExamineResponses={setExamineResponses}
                                             showSchemaExplorer={showSchemaExplorer} showHome={showHome}
                                             onOpenAbout={handleOpenAbout} onOpenHome={handleOpenHome}
                                             onOpenSchema={handlePushSchema} onSearchChange={handleSearchChange}
                                             onSelectEndpoint={handleSelectEndpoint} onSearchResult={handleSearchResult}
                                             onOpenEndpointPermanent={openEndpointPermanent}
                                             onOpenEndpointPreview={openEndpointPreview}
                                             onGenerateCode={setCodeGenEndpoint} onHidePageViews={() => {
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setShowAssistant(false);
    }}/>);
    const isSidebarCollapsed = isMobile ? false : desktopCollapsed;
    const onToggleCollapse = () => {
        if (isMobile)
            setMobileOpen(o => !o);
        else
            setDesktopCollapsed(c => !c);
    };
    return (<TooltipProvider>
        <OperationLinkProvider spec={spec} parsableKey={selectedParsableKey}>
            <div style={styleVars}
                 className="app-viewport w-full min-h-0 overflow-hidden flex flex-col font-sans transition-colors duration-150 text-[var(--text)] bg-[var(--background)]">

                <input ref={hiddenFileInputRef} type="file"
                       accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml" className="hidden"
                       onChange={handleFileChosen}/>

                <Topbar parsables={parsables} selectedParsableKey={selectedParsableKey}
                        onSelectParsable={handleSelectParsable} activeAuth={activeAuth} onUpdateAuth={setActiveAuth}
                        onOpenAuthModal={() => setShowAuthModal(true)} searchQuery={searchQuery}
                        onSearchChange={handleSearchChange} onDownloadSpec={handleDownload}
                        title={spec?.info?.title || 'OpenDoc UI'} showSchemaExplorer={showSchemaExplorer} spec={spec}
                        showHome={showHome} isCollapsed={isSidebarCollapsed} onToggleCollapse={onToggleCollapse}
                        onOpenMobileSidebar={() => setMobileOpen(true)} onOpenAssistant={handleOpenAssistant}
                        selectedThemeName={selectedThemeName} onSelectTheme={setSelectedThemeName}
                        onOpenThemeModal={() => setShowThemeModal(true)} isLocalMode={isLocalMode}
                        canOpenLocal={canOpenLocal} onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                        onRefreshSpec={handleRefreshSpec} onReloadSpecification={handleReloadSpecification}
                        onResetSpecification={handleResetSpecification}
                        onResetAllConfigurations={handleResetAllConfigurations} isRefreshingSpec={isRefreshingSpec}
                        localHistory={localHistory} onSelectHistoryEntry={handleSelectHistoryEntry}
                        onRemoveHistoryEntry={handleRemoveHistoryEntry} onClearHistory={handleClearHistory}
                        localOpenError={localOpenError} onDismissLocalError={() => setLocalOpenError(null)}
                        onSearchHasResults={searchHasResults} hideSearch={false}/>

                <div className="flex-1 flex overflow-hidden w-full h-full min-w-0 relative">
                    {isLoadingSpec ? (<SpecLoadingState/>) : !spec ? (content()) : (<>
                        <Sidebar spec={spec} parsables={isMobile ? parsables : undefined}
                                 selectedParsableKey={selectedParsableKey}
                                 onSelectParsable={isMobile ? handleSelectParsable : undefined}
                                 selectedServer={selectedServer} onSelectServer={setSelectedServer}
                                 isCollapsed={desktopCollapsed} onToggleCollapse={() => setDesktopCollapsed(c => !c)}
                                 onOpenSchemaExplorer={handleOpenSchemaExplorer} showSchemaExplorer={showSchemaExplorer}
                                 selectedMethods={selectedMethods} setSelectedMethods={setSelectedMethods}
                                 selectedTags={selectedTags} setSelectedTags={setSelectedTags}
                                 onlyProtected={onlyProtected} setOnlyProtected={setOnlyProtected}
                                 searchQuery={searchQuery} selectedEndpoint={selectedEndpoint}
                                 onSelectEndpoint={handleSelectEndpoint} onMiddleClickEndpoint={openEndpointPermanent}
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
                                 })} onOpenHome={handleOpenHome} onOpenAbout={handleOpenAbout}
                                 onOpenViewPermanent={openViewTabPermanent} onContextAction={handleContextAction}
                                 scrollIntent={scrollIntent} setScrollIntent={setScrollIntent} showHome={showHome}
                                 showAbout={showAbout} showAssistant={showAssistant}
                                 assistantContextEndpoints={assistantContextEndpoints} hasAIProfile={hasAIProfile}
                                 themeMode={currentThemeMode} resolvedThemeMode={resolvedThemeMode}
                                 onToggleThemeMode={toggleThemeMode} selectedThemeName={selectedThemeName}
                                 onOpenThemeModal={() => setShowThemeModal(true)}
                                 onOpenAuthModal={() => setShowAuthModal(true)} activeAuth={activeAuth}
                                 onDownloadSpec={handleDownload} isLocalMode={isLocalMode} canOpenLocal={canOpenLocal}
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
                                 onOpenMobile={() => setMobileOpen(true)}/>
                        <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0 w-full">
                            {endpointTabs.length > 0 && spec && (
                                <EndpointTabs tabs={endpointTabs} activeTabId={activeTabId}
                                              onSelectTab={handleSelectTab} onCloseTab={handleCloseTab}
                                              onDoubleClickTab={handleDoubleClickTab}
                                              onCloseAllLeft={handleCloseAllLeft} onCloseAllRight={handleCloseAllRight}
                                              onCloseOthers={handleCloseOthers} onReorderTabs={handleReorderTabs}
                                              assistantUnread={assistantUnread} onOpenSwitcher={openSwitcher}/>)}
                            <div
                                className={clsx('flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden', assistantTabActive ? 'hidden' : 'flex')}>
                                {content()}
                            </div>
                            <div
                                className={clsx('flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden', assistantTabActive ? 'flex' : 'hidden')}>
                                {spec && <AIAssistantView spec={spec} parsableKey={selectedParsableKey}
                                                          selectedEndpoints={assistantContextEndpoints}
                                                          selectedServer={selectedServer} activeAuth={activeAuth}
                                                          activeTab={selectedTab} searchQuery={searchQuery}
                                                          settings={aiSettings} hasAIProfile={hasAIProfile}
                                                          isVisible={assistantTabActive}
                                                          onOpenSettings={() => setShowAISettings(true)}
                                                          onClearEndpointContext={() => setAssistantContextEndpoints([])}
                                                          onRemoveEndpointContext={(path, method) => setAssistantContextEndpoints(current => current.filter(endpoint => !(endpoint.path === path && endpoint.method === method)))}
                                                          onOpenEndpoint={handleSelectEndpoint}
                                                          onOpenRunner={handleOpenRunner}
                                                          onBridgeAction={handleAssistantBridgeAction}
                                                          onResponseFinished={handleAssistantResponseFinished}/>}
                            </div>
                        </div>
                    </>)}
                </div>

                <AppModalLayer spec={spec} specKey={selectedParsableKey} schemaStack={modalsStack}
                               setSchemaStack={setModalsStack} onPopSchema={handlePopSchema}
                               onPushSchema={handlePushSchema} codeEndpoint={codeGenEndpoint}
                               setCodeEndpoint={setCodeGenEndpoint} activeAuth={activeAuth}
                               setActiveAuth={setActiveAuth} authOpen={showAuthModal} setAuthOpen={setShowAuthModal}
                               switcherOpen={switcherOpen} tabs={endpointTabs} activeTabId={activeTabId}
                               switcherIndex={switcherIndex} onCancelSwitcher={cancelSwitcher}
                               onSelectSwitcherTab={id => {
                                   handleSelectTab(id);
                                   setSwitcherOpen(false);
                               }} shareTarget={shareTarget} setShareTarget={setShareTarget} themeOpen={showThemeModal}
                               setThemeOpen={setShowThemeModal} selectedThemeName={selectedThemeName}
                               setSelectedThemeName={setSelectedThemeName} currentThemeMode={currentThemeMode}
                               setCurrentThemeMode={setCurrentThemeMode} resolvedThemeMode={resolvedThemeMode}
                               toggleThemeMode={toggleThemeMode} aiSettingsOpen={showAISettings}
                               setAISettingsOpen={setShowAISettings} aiSettings={aiSettings}
                               onSaveAISettings={handleAISettingsSave}/>
            </div>
        </OperationLinkProvider>
    </TooltipProvider>);
}
