import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useState } from 'react';
import type { ExamineResponse, OpenApiSpec, ParsableConfig, ParsedRoute } from '../types';
import type { TabItem, ViewTabKind } from '../components/endpoint/EndpointTabs';
import { generateSmartRoute, parseSmartRoute, resolveEndpointFromId } from '../utils/routing';
import { specStorage } from '../utils/storage';
import { hasExplicitSpecRoute } from '../utils/tabPersistence';
type Endpoint = {
    path: string;
    method: string;
};
type ViewMode = 'docs' | 'examine' | 'both';
type NavigationSnapshot = {
    showWelcome: boolean;
    [key: string]: unknown;
};
interface UseWorkspaceRoutingOptions {
    parsables: ParsableConfig;
    selectedSpecKey: string;
    setSelectedSpecKey: Dispatch<SetStateAction<string>>;
    loadedSpecKey: string;
    spec: OpenApiSpec | null;
    setSpec: Dispatch<SetStateAction<OpenApiSpec | null>>;
    setLoadedSpecKey: Dispatch<SetStateAction<string>>;
    isLoadingSpec: boolean;
    isInitialLoadComplete: boolean;
    isUpdatingHash: boolean;
    setIsUpdatingHash: Dispatch<SetStateAction<boolean>>;
    tabsRestoredForKey: string;
    tabsRestoreDoneRef: MutableRefObject<string>;
    specRouteReadyRef: MutableRefObject<string>;
    navStateRef: MutableRefObject<NavigationSnapshot>;
    showWelcome: boolean;
    setShowWelcome: Dispatch<SetStateAction<boolean>>;
    showHome: boolean;
    setShowHome: Dispatch<SetStateAction<boolean>>;
    showAbout: boolean;
    setShowAbout: Dispatch<SetStateAction<boolean>>;
    showAssistant: boolean;
    setShowAssistant: Dispatch<SetStateAction<boolean>>;
    showSchemaExplorer: boolean;
    setShowSchemaExplorer: Dispatch<SetStateAction<boolean>>;
    selectedEndpoint: Endpoint | null;
    setSelectedEndpoint: Dispatch<SetStateAction<Endpoint | null>>;
    selectedViewMode: ViewMode;
    setSelectedViewMode: Dispatch<SetStateAction<ViewMode>>;
    modalStack: string[];
    setModalStack: Dispatch<SetStateAction<string[]>>;
    activeResponseCode: string | null;
    setActiveResponseCode: Dispatch<SetStateAction<string | null>>;
    searchQuery: string;
    setSearchQuery: Dispatch<SetStateAction<string>>;
    setResultsQuery: Dispatch<SetStateAction<string>>;
    selectedMethods: string[];
    setSelectedMethods: Dispatch<SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: Dispatch<SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: Dispatch<SetStateAction<boolean | null>>;
    activeTabId: string | null;
    setTabs: Dispatch<SetStateAction<TabItem[]>>;
    setActiveTabId: Dispatch<SetStateAction<string | null>>;
    setViewModes: Dispatch<SetStateAction<Record<string, ViewMode>>>;
    setExamineResponses: Dispatch<SetStateAction<Record<string, ExamineResponse>>>;
    setAssistantContextEndpoints: Dispatch<SetStateAction<Endpoint[]>>;
    openEndpointPreview: (path: string, method: string) => void;
    openEndpointPermanent: (path: string, method: string) => void;
    openViewTab: (view: ViewTabKind, query?: string) => void;
    openViewTabPermanent: (view: ViewTabKind, query?: string) => void;
    ensureViewTabFromState: (override?: any) => void;
}
const hasExplicitTab = () => window.location.hash.includes('?tab=') || window.location.hash.includes('&tab=');
const routeMode = (mode: 'view' | 'examine' | 'both'): ViewMode => mode === 'examine' ? 'examine' : mode === 'both' ? 'both' : 'docs';
const storedMode = (mode: ViewMode): string => mode === 'examine' ? 'examine' : mode === 'both' ? 'both' : 'view';
const hasEmptySearchRoute = (route: ParsedRoute): boolean => /[?&]search(?:=|&|$)/.test(window.location.hash)
    && !route.searchQuery && route.searchMethods.length === 0
    && route.searchTags.length === 0 && route.searchSecured === null;
export function useWorkspaceRouting(options: UseWorkspaceRoutingOptions): void {
    const { parsables, selectedSpecKey, setSelectedSpecKey, loadedSpecKey, spec, setSpec, setLoadedSpecKey, isLoadingSpec, isInitialLoadComplete, isUpdatingHash, setIsUpdatingHash, tabsRestoredForKey, tabsRestoreDoneRef, specRouteReadyRef, navStateRef, showWelcome, setShowWelcome, showHome, setShowHome, showAbout, setShowAbout, showAssistant, setShowAssistant, showSchemaExplorer, setShowSchemaExplorer, selectedEndpoint, setSelectedEndpoint, selectedViewMode, setSelectedViewMode, modalStack, setModalStack, activeResponseCode, setActiveResponseCode, searchQuery, setSearchQuery, setResultsQuery, selectedMethods, setSelectedMethods, selectedTags, setSelectedTags, onlyProtected, setOnlyProtected, activeTabId, setTabs, setActiveTabId, setViewModes, setExamineResponses, setAssistantContextEndpoints, openEndpointPreview, openEndpointPermanent, openViewTab, openViewTabPermanent, ensureViewTabFromState, } = options;
    const syncHashToState = useCallback(() => {
        const parsed = parseSmartRoute(window.location.hash);
        if (parsed.parsableKey && parsed.parsableKey !== selectedSpecKey && parsables[parsed.parsableKey]) {
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
            setTabs([]);
            setActiveTabId(null);
            setViewModes({});
            setExamineResponses({});
            setSelectedSpecKey(parsed.parsableKey);
            return;
        }
        if (loadedSpecKey !== selectedSpecKey
            || tabsRestoreDoneRef.current !== selectedSpecKey
            || specRouteReadyRef.current !== selectedSpecKey)
            return;
        if (!hasExplicitSpecRoute(parsed, window.location.hash))
            return;
        if (navStateRef.current.showWelcome)
            setShowWelcome(false);
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
            }
            else
                setSelectedEndpoint(null);
        }
        else if (parsed.endpoint) {
            openEndpointPreview(parsed.endpoint.path, parsed.endpoint.method);
        }
        else {
            setSelectedEndpoint(null);
        }
        if (hasExplicitTab())
            setSelectedViewMode(routeMode(parsed.tab));
        setActiveResponseCode(parsed.responseCode);
        if (spec?.components?.schemas) {
            const valid = parsed.schemas.filter(name => spec.components!.schemas![name]);
            setModalStack(valid.length ? valid : []);
        }
        if (hasEmptySearchRoute(parsed))
            openViewTab('search');
        else
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
    }, [
        parsables, selectedSpecKey, loadedSpecKey, spec, tabsRestoreDoneRef, specRouteReadyRef, navStateRef,
        setSpec, setLoadedSpecKey, setSelectedEndpoint, setShowWelcome, setShowHome, setShowSchemaExplorer,
        setShowAbout, setShowAssistant, setAssistantContextEndpoints, setSearchQuery, setResultsQuery,
        setSelectedMethods, setSelectedTags, setOnlyProtected, setTabs, setActiveTabId, setViewModes,
        setExamineResponses, setSelectedSpecKey, openEndpointPreview, setSelectedViewMode, setActiveResponseCode,
        setModalStack, openViewTab, ensureViewTabFromState,
    ]);
    const updateHashFromState = useCallback(() => {
        if (isLoadingSpec || isUpdatingHash || !isInitialLoadComplete || !spec
            || loadedSpecKey !== selectedSpecKey || tabsRestoredForKey !== selectedSpecKey
            || specRouteReadyRef.current !== selectedSpecKey)
            return;
        setIsUpdatingHash(true);
        const searchInUrl = activeTabId === 'view:search';
        const hash = generateSmartRoute({
            parsableKey: selectedSpecKey,
            showHome,
            showAbout,
            showAssistant,
            showSchemaExplorer,
            endpoint: selectedEndpoint,
            tab: selectedViewMode,
            schemaModals: modalStack.map(name => ({ schemaName: name, schema: spec.components?.schemas?.[name] || {} })),
            responseCode: activeResponseCode,
            searchQuery: searchInUrl ? searchQuery : '',
            searchMethods: searchInUrl ? selectedMethods : [],
            searchTags: searchInUrl ? selectedTags : [],
            searchSecured: searchInUrl ? onlyProtected : null,
            activeSpec: spec,
        });
        if (window.location.hash !== hash)
            window.location.hash = hash;
        setIsUpdatingHash(false);
    }, [
        isLoadingSpec, isUpdatingHash, isInitialLoadComplete, spec, loadedSpecKey, tabsRestoredForKey,
        selectedSpecKey, specRouteReadyRef, setIsUpdatingHash, activeTabId, showHome, showAbout, showAssistant,
        showSchemaExplorer, selectedEndpoint, selectedViewMode, modalStack, activeResponseCode, searchQuery,
        selectedMethods, selectedTags, onlyProtected,
    ]);
    useEffect(() => {
        if (!spec?.paths || isLoadingSpec || loadedSpecKey !== selectedSpecKey
            || tabsRestoredForKey !== selectedSpecKey)
            return;
        const parsed = parseSmartRoute(window.location.hash);
        if (parsed.parsableKey && parsed.parsableKey !== selectedSpecKey)
            return;
        if (!hasExplicitSpecRoute(parsed, window.location.hash)) {
            specRouteReadyRef.current = selectedSpecKey;
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
        if (parsed.legacyOperationId) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (resolved) {
                openEndpointPermanent(resolved.path, resolved.method);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
                setShowAssistant(false);
            }
            else
                setSelectedEndpoint(null);
        }
        else if (parsed.endpoint) {
            openEndpointPermanent(parsed.endpoint.path, parsed.endpoint.method);
        }
        else {
            setSelectedEndpoint(null);
        }
        setModalStack(parsed.schemas.filter(name => spec.components?.schemas?.[name]));
        if (hasExplicitTab())
            setSelectedViewMode(routeMode(parsed.tab));
        if (hasEmptySearchRoute(parsed))
            openViewTabPermanent('search');
        else
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
        specRouteReadyRef.current = selectedSpecKey;
    }, [
        spec, selectedSpecKey, loadedSpecKey, tabsRestoredForKey, isLoadingSpec, specRouteReadyRef,
        setSearchQuery, setResultsQuery, setSelectedMethods, setSelectedTags, setOnlyProtected, setShowHome,
        setShowSchemaExplorer, setShowAbout, setShowAssistant, setShowWelcome, setActiveResponseCode,
        openEndpointPermanent, setSelectedEndpoint, setModalStack, setSelectedViewMode, openViewTabPermanent,
        ensureViewTabFromState,
    ]);
    const [modeRestoredForKey, setModeRestoredForKey] = useState('');
    useEffect(() => {
        if (!selectedSpecKey)
            return;
        if (hasExplicitTab())
            setSelectedViewMode(routeMode(parseSmartRoute(window.location.hash).tab));
        else {
            const mode = specStorage.get(selectedSpecKey, 'tab_mode');
            setSelectedViewMode(mode === 'examine' ? 'examine' : mode === 'both' ? 'both' : 'docs');
        }
        setModeRestoredForKey(selectedSpecKey);
    }, [selectedSpecKey, setSelectedViewMode]);
    useEffect(() => {
        if (selectedSpecKey && modeRestoredForKey === selectedSpecKey) {
            specStorage.set(selectedSpecKey, 'tab_mode', storedMode(selectedViewMode));
        }
    }, [selectedViewMode, selectedSpecKey, modeRestoredForKey]);
    useEffect(() => {
        if (isLoadingSpec)
            return;
        const timer = window.setTimeout(updateHashFromState, 300);
        return () => window.clearTimeout(timer);
    }, [
        selectedSpecKey, showHome, showAbout, showSchemaExplorer, selectedEndpoint, selectedViewMode, modalStack,
        activeResponseCode, searchQuery, spec, isLoadingSpec, updateHashFromState,
    ]);
    useEffect(() => {
        const onHashChange = () => {
            if (!isUpdatingHash && !isLoadingSpec)
                syncHashToState();
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [isLoadingSpec, isUpdatingHash, syncHashToState]);
}
