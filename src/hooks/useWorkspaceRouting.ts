import {
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import type {ExamineResponse, OpenApiSpec, ParsableConfig, ParsedRoute} from '../types';
import type {TabItem, ViewTabKind} from '../components/endpoint/EndpointTabs';
import {generateSmartRoute, getCurrentSmartRoute, parseSmartRoute, resolveEndpointFromId} from '../utils/routing';
import {specStorage} from '../utils/storage/index';
import {hasExplicitSpecRoute} from '../utils/storage/tabPersistence';

type Endpoint = {
    path: string;
    method: string;
};
type ViewMode = 'docs' | 'examine' | 'both';
type NavigationSnapshot = {
    showWelcome: boolean;
    [key: string]: unknown;
};
export type HistoryNavigationIntent = 'replace' | 'push' | 'restore';

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
    showSettings: boolean;
    setShowSettings: Dispatch<SetStateAction<boolean>>;
    settingsSection: string | null;
    setSettingsSection: Dispatch<SetStateAction<string | null>>;
    showSchemaExplorer: boolean;
    setShowSchemaExplorer: Dispatch<SetStateAction<boolean>>;
    showNotes: boolean;
    setShowNotes: Dispatch<SetStateAction<boolean>>;
    showCompatibility: boolean;
    setShowCompatibility: Dispatch<SetStateAction<boolean>>;
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
    setExamineResponses: Dispatch<SetStateAction<Record<string, ExamineResponse[]>>>;
    setAssistantContextEndpoints: Dispatch<SetStateAction<Endpoint[]>>;
    openEndpointPermanent: (path: string, method: string) => void;
    openViewTabPermanent: (view: ViewTabKind, query?: string) => void;
    ensureViewTabFromState: (override?: any) => void;
    historyIntentRef: MutableRefObject<HistoryNavigationIntent>;
    restoreSpecificationFromRoute?: (key: string) => Promise<boolean>;
}

const hasExplicitTab = () => {
    const route = getCurrentSmartRoute();
    return route.includes('?tab=') || route.includes('&tab=');
};
const routeMode = (mode: 'view' | 'examine' | 'both'): ViewMode =>
    mode === 'examine' ? 'examine' : mode === 'both' ? 'both' : 'docs';
const storedMode = (mode: ViewMode): string => (mode === 'examine' ? 'examine' : mode === 'both' ? 'both' : 'view');
const hasEmptySearchRoute = (route: ParsedRoute): boolean =>
    /[?&]search(?:=|&|$)/.test(getCurrentSmartRoute()) &&
    !route.searchQuery &&
    route.searchMethods.length === 0 &&
    route.searchTags.length === 0 &&
    route.searchSecured === null;

export function useWorkspaceRouting(options: UseWorkspaceRoutingOptions): void {
    const {
        parsables,
        selectedSpecKey,
        setSelectedSpecKey,
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
        selectedViewMode,
        setSelectedViewMode,
        modalStack,
        setModalStack,
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
        setTabs,
        setActiveTabId,
        setViewModes,
        setExamineResponses,
        setAssistantContextEndpoints,
        openEndpointPermanent,
        openViewTabPermanent,
        ensureViewTabFromState,
        historyIntentRef,
        restoreSpecificationFromRoute,
    } = options;
    const routeRestoreRef = useRef<string | null>(null);
    const restoringSpecKeyRef = useRef('');
    const syncHashToState = useCallback(() => {
        const parsed = parseSmartRoute(getCurrentSmartRoute());
        if (parsed.parsableKey && parsed.parsableKey !== selectedSpecKey) {
            if (parsables[parsed.parsableKey]) {
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
                setShowSettings(false);
                setSettingsSection(null);
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
            } else if (restoreSpecificationFromRoute && restoringSpecKeyRef.current !== parsed.parsableKey) {
                restoringSpecKeyRef.current = parsed.parsableKey;
                void restoreSpecificationFromRoute(parsed.parsableKey).finally(() => {
                    if (restoringSpecKeyRef.current === parsed.parsableKey) restoringSpecKeyRef.current = '';
                });
            }
            return;
        }
        if (
            loadedSpecKey !== selectedSpecKey ||
            tabsRestoreDoneRef.current !== selectedSpecKey ||
            specRouteReadyRef.current !== selectedSpecKey
        )
            return;
        if (navStateRef.current.showWelcome) setShowWelcome(false);
        setSearchQuery(parsed.searchQuery || '');
        setResultsQuery(parsed.searchQuery || '');
        setSelectedMethods(parsed.searchMethods || []);
        setSelectedTags(parsed.searchTags || []);
        setOnlyProtected(parsed.searchSecured ?? null);
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowNotes(parsed.showNotes);
        setShowCompatibility(parsed.showCompatibility);
        setShowAbout(parsed.showAbout);
        setShowAssistant(parsed.showAssistant);
        setShowSettings(parsed.showSettings);
        if (parsed.showSettings) setSettingsSection(parsed.settingsSection);
        if (parsed.legacyOperationId && spec) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (resolved) {
                openEndpointPermanent(resolved.path, resolved.method);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowNotes(false);
                setShowCompatibility(false);
                setShowAbout(false);
                setShowAssistant(false);
                setShowSettings(false);
            } else setSelectedEndpoint(null);
        } else if (parsed.endpoint) {
            openEndpointPermanent(parsed.endpoint.path, parsed.endpoint.method);
        } else {
            setSelectedEndpoint(null);
        }
        if (hasExplicitTab()) setSelectedViewMode(routeMode(parsed.tab));
        setActiveResponseCode(parsed.responseCode);
        if (spec?.components?.schemas) {
            const valid = parsed.schemas.filter(name => spec.components!.schemas![name]);
            setModalStack(valid.length ? valid : []);
        }
        if (hasEmptySearchRoute(parsed)) openViewTabPermanent('search');
        else if (parsed.showHome) openViewTabPermanent('home');
        else
            ensureViewTabFromState({
                searchQuery: parsed.searchQuery || '',
                showSchemaExplorer: parsed.showSchemaExplorer,
                showNotes: parsed.showNotes,
                showCompatibility: parsed.showCompatibility,
                showAbout: parsed.showAbout,
                showAssistant: parsed.showAssistant,
                showSettings: parsed.showSettings,
                showHome: parsed.showHome,
                searchMethods: parsed.searchMethods || [],
                searchTags: parsed.searchTags || [],
                searchSecured: parsed.searchSecured ?? null,
            });
    }, [
        parsables,
        selectedSpecKey,
        loadedSpecKey,
        spec,
        tabsRestoreDoneRef,
        specRouteReadyRef,
        navStateRef,
        setSpec,
        setLoadedSpecKey,
        setSelectedEndpoint,
        setShowWelcome,
        setShowHome,
        setShowSchemaExplorer,
        setShowNotes,
        setShowCompatibility,
        setShowAbout,
        setShowAssistant,
        setShowSettings,
        setSettingsSection,
        setAssistantContextEndpoints,
        setSearchQuery,
        setResultsQuery,
        setSelectedMethods,
        setSelectedTags,
        setOnlyProtected,
        setTabs,
        setActiveTabId,
        setViewModes,
        setExamineResponses,
        setSelectedSpecKey,
        openEndpointPermanent,
        setSelectedViewMode,
        setActiveResponseCode,
        setModalStack,
        openViewTabPermanent,
        ensureViewTabFromState,
        restoreSpecificationFromRoute,
    ]);
    const updateHashFromState = useCallback(() => {
        if (
            isLoadingSpec ||
            isUpdatingHash ||
            !isInitialLoadComplete ||
            !spec ||
            loadedSpecKey !== selectedSpecKey ||
            tabsRestoredForKey !== selectedSpecKey ||
            specRouteReadyRef.current !== selectedSpecKey
        )
            return;
        setIsUpdatingHash(true);
        const searchInUrl = activeTabId === 'view:search';
        const hash = generateSmartRoute({
            parsableKey: selectedSpecKey,
            showHome,
            showAbout,
            showAssistant,
            showSchemaExplorer,
            showNotes,
            showCompatibility,
            showSettings,
            settingsSection,
            endpoint: selectedEndpoint,
            tab: selectedViewMode,
            schemaModals: modalStack.map(name => ({schemaName: name, schema: spec.components?.schemas?.[name] || {}})),
            responseCode: activeResponseCode,
            searchQuery: searchInUrl ? searchQuery : '',
            searchMethods: searchInUrl ? selectedMethods : [],
            searchTags: searchInUrl ? selectedTags : [],
            searchSecured: searchInUrl ? onlyProtected : null,
            activeSpec: spec,
        });
        const currentRoute = getCurrentSmartRoute();
        const intent = historyIntentRef.current;
        if (intent !== 'push' && routeRestoreRef.current) {
            if (currentRoute === hash) {
                routeRestoreRef.current = null;
                historyIntentRef.current = 'replace';
            }
            setIsUpdatingHash(false);
            return;
        }
        if (currentRoute !== hash) {
            if (intent === 'push') window.history.pushState(window.history.state, '', hash);
            else window.history.replaceState(window.history.state, '', hash);
        }
        routeRestoreRef.current = null;
        historyIntentRef.current = 'replace';
        setIsUpdatingHash(false);
    }, [
        isLoadingSpec,
        isUpdatingHash,
        isInitialLoadComplete,
        spec,
        loadedSpecKey,
        tabsRestoredForKey,
        selectedSpecKey,
        specRouteReadyRef,
        setIsUpdatingHash,
        activeTabId,
        showHome,
        showAbout,
        showAssistant,
        showSchemaExplorer,
        showNotes,
        showCompatibility,
        showSettings,
        settingsSection,
        selectedEndpoint,
        selectedViewMode,
        modalStack,
        activeResponseCode,
        searchQuery,
        selectedMethods,
        selectedTags,
        onlyProtected,
    ]);
    useEffect(() => {
        if (
            !spec?.paths ||
            isLoadingSpec ||
            loadedSpecKey !== selectedSpecKey ||
            tabsRestoredForKey !== selectedSpecKey
        )
            return;
        const parsed = parseSmartRoute(getCurrentSmartRoute());
        if (parsed.parsableKey && parsed.parsableKey !== selectedSpecKey) return;
        if (!hasExplicitSpecRoute(parsed, getCurrentSmartRoute()) && !parsed.parsableKey) {
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
        setShowNotes(parsed.showNotes);
        setShowCompatibility(parsed.showCompatibility);
        setShowAbout(parsed.showAbout);
        setShowAssistant(parsed.showAssistant);
        setShowSettings(parsed.showSettings);
        if (parsed.showSettings) setSettingsSection(parsed.settingsSection);
        setShowWelcome(false);
        setActiveResponseCode(parsed.responseCode);
        if (parsed.legacyOperationId) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (resolved) {
                openEndpointPermanent(resolved.path, resolved.method);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowNotes(false);
                setShowCompatibility(false);
                setShowAbout(false);
                setShowAssistant(false);
                setShowSettings(false);
            } else setSelectedEndpoint(null);
        } else if (parsed.endpoint) {
            openEndpointPermanent(parsed.endpoint.path, parsed.endpoint.method);
        } else {
            setSelectedEndpoint(null);
        }
        setModalStack(parsed.schemas.filter(name => spec.components?.schemas?.[name]));
        if (hasExplicitTab()) setSelectedViewMode(routeMode(parsed.tab));
        if (hasEmptySearchRoute(parsed)) openViewTabPermanent('search');
        else if (parsed.showHome) openViewTabPermanent('home');
        else
            ensureViewTabFromState({
                searchQuery: parsed.searchQuery || '',
                showSchemaExplorer: parsed.showSchemaExplorer,
                showNotes: parsed.showNotes,
                showCompatibility: parsed.showCompatibility,
                showAbout: parsed.showAbout,
                showAssistant: parsed.showAssistant,
                showSettings: parsed.showSettings,
                showHome: parsed.showHome,
                searchMethods: parsed.searchMethods || [],
                searchTags: parsed.searchTags || [],
                searchSecured: parsed.searchSecured ?? null,
            });
        specRouteReadyRef.current = selectedSpecKey;
    }, [
        spec,
        selectedSpecKey,
        loadedSpecKey,
        tabsRestoredForKey,
        isLoadingSpec,
        specRouteReadyRef,
        setSearchQuery,
        setResultsQuery,
        setSelectedMethods,
        setSelectedTags,
        setOnlyProtected,
        setShowHome,
        setShowSchemaExplorer,
        setShowNotes,
        setShowCompatibility,
        setShowAbout,
        setShowAssistant,
        setShowSettings,
        setSettingsSection,
        setShowWelcome,
        setActiveResponseCode,
        openEndpointPermanent,
        setSelectedEndpoint,
        setModalStack,
        setSelectedViewMode,
        openViewTabPermanent,
        ensureViewTabFromState,
    ]);
    const [modeRestoredForKey, setModeRestoredForKey] = useState('');
    useEffect(() => {
        if (!selectedSpecKey) return;
        if (hasExplicitTab()) setSelectedViewMode(routeMode(parseSmartRoute(getCurrentSmartRoute()).tab));
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
        if (isLoadingSpec) return;
        const timer = window.setTimeout(updateHashFromState, historyIntentRef.current === 'push' ? 0 : 300);
        return () => window.clearTimeout(timer);
    }, [
        selectedSpecKey,
        showHome,
        showAbout,
        showSchemaExplorer,
        showNotes,
        showCompatibility,
        showSettings,
        settingsSection,
        selectedEndpoint,
        selectedViewMode,
        modalStack,
        activeResponseCode,
        searchQuery,
        spec,
        isLoadingSpec,
        updateHashFromState,
    ]);
    useEffect(() => {
        const onRouteChange = () => {
            if (isUpdatingHash || isLoadingSpec) return;
            routeRestoreRef.current = getCurrentSmartRoute();
            historyIntentRef.current = 'restore';
            syncHashToState();
        };
        window.addEventListener('hashchange', onRouteChange);
        window.addEventListener('popstate', onRouteChange);
        return () => {
            window.removeEventListener('hashchange', onRouteChange);
            window.removeEventListener('popstate', onRouteChange);
        };
    }, [isLoadingSpec, isUpdatingHash, syncHashToState]);
}
