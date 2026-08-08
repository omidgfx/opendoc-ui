import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from 'react';
import type { OpenApiSpec } from '../types';
import type { TabItem } from '../components/endpoint/EndpointTabs';
import { parseSmartRoute } from '../utils/routing';
import { specStorage } from '../utils/storage';
import { hasExplicitSpecRoute, isValidTabPersistence, type StoredTabViewMode } from '../utils/tabPersistence';
type ViewMode = 'docs' | 'examine' | 'both';
interface UseTabPersistenceOptions {
    selectedSpecKey: string;
    loadedSpecKey: string;
    spec: OpenApiSpec | null;
    tabs: TabItem[];
    activeTabId: string | null;
    viewModes: Record<string, ViewMode>;
    selectedViewMode: ViewMode;
    orderTabs: (tabs: TabItem[]) => TabItem[];
    getEndpointLabel: (path: string, method: string) => string;
    applyTabViewState: (tab: TabItem | null) => void;
    setTabs: Dispatch<SetStateAction<TabItem[]>>;
    setActiveTabId: Dispatch<SetStateAction<string | null>>;
    setViewModes: Dispatch<SetStateAction<Record<string, ViewMode>>>;
    setSelectedViewMode: Dispatch<SetStateAction<ViewMode>>;
    setShowWelcome: Dispatch<SetStateAction<boolean>>;
}
interface TabPersistenceResult {
    tabsRestoredForKey: string;
    tabsRestoreDoneRef: MutableRefObject<string>;
    specRouteReadyRef: MutableRefObject<string>;
}
export function useTabPersistence({ selectedSpecKey, loadedSpecKey, spec, tabs, activeTabId, viewModes, selectedViewMode, orderTabs, getEndpointLabel, applyTabViewState, setTabs, setActiveTabId, setViewModes, setSelectedViewMode, setShowWelcome, }: UseTabPersistenceOptions): TabPersistenceResult {
    const [tabsRestoredForKey, setTabsRestoredForKey] = useState('');
    const tabsRestoreDoneRef = useRef('');
    const specRouteReadyRef = useRef('');
    useEffect(() => {
        if (!selectedSpecKey || loadedSpecKey !== selectedSpecKey || tabsRestoredForKey !== selectedSpecKey)
            return;
        const persistable = tabs.filter(tab => !tab.isPreview);
        const activeId = activeTabId && tabs.some(tab => tab.id === activeTabId && !tab.isPreview)
            ? activeTabId
            : persistable[persistable.length - 1]?.id || '';
        if (persistable.length === 0) {
            void specStorage.remove(selectedSpecKey, 'tabs');
            return;
        }
        specStorage.setJSON(selectedSpecKey, 'tabs', {
            tabs: orderTabs(persistable),
            activeTabId: activeId,
            viewModes,
        });
    }, [tabs, activeTabId, viewModes, selectedSpecKey, loadedSpecKey, tabsRestoredForKey, orderTabs]);
    useEffect(() => {
        if (!spec || !selectedSpecKey || loadedSpecKey !== selectedSpecKey || tabsRestoredForKey === selectedSpecKey) {
            return;
        }
        const data = specStorage.getJSON<{
            tabs: TabItem[];
            activeTabId?: string;
            viewModes?: Record<string, StoredTabViewMode>;
        } | null>(selectedSpecKey, 'tabs', null, isValidTabPersistence);
        const filtered = data?.tabs?.length
            ? orderTabs(data.tabs.filter(tab => !tab.isPreview)).filter(tab => tab.kind && tab.kind !== 'endpoint' ? true : !!spec.paths?.[tab.path]?.[tab.method])
            : [];
        const restoredTabs = filtered.map(tab => tab.kind && tab.kind !== 'endpoint'
            ? tab
            : { ...tab, label: getEndpointLabel(tab.path, tab.method) });
        const restoredModes = data?.viewModes
            ? Object.fromEntries(Object.entries(data.viewModes)
                .filter(([id]) => restoredTabs.some(tab => tab.id === id))) as Record<string, ViewMode>
            : {};
        const restoredActiveTab = restoredTabs.find(tab => tab.id === data?.activeTabId)
            || restoredTabs[restoredTabs.length - 1]
            || null;
        setTabs(restoredTabs);
        setViewModes(restoredModes);
        setActiveTabId(restoredActiveTab?.id || null);
        applyTabViewState(restoredActiveTab);
        const restoredMode = restoredActiveTab ? restoredModes[restoredActiveTab.id] : undefined;
        if (restoredMode)
            setSelectedViewMode(restoredMode);
        const route = parseSmartRoute(window.location.hash);
        if (hasExplicitSpecRoute(route, window.location.hash))
            setShowWelcome(false);
        tabsRestoreDoneRef.current = selectedSpecKey;
        setTabsRestoredForKey(selectedSpecKey);
    }, [
        spec,
        selectedSpecKey,
        loadedSpecKey,
        tabsRestoredForKey,
        getEndpointLabel,
        orderTabs,
        applyTabViewState,
        setTabs,
        setViewModes,
        setActiveTabId,
        setSelectedViewMode,
        setShowWelcome,
    ]);
    const restoringModeRef = useRef<{
        tabId: string;
        mode: ViewMode;
    } | null>(null);
    useEffect(() => {
        if (!activeTabId) {
            restoringModeRef.current = null;
            return;
        }
        const mode = viewModes[activeTabId];
        if (mode && mode !== selectedViewMode) {
            restoringModeRef.current = { tabId: activeTabId, mode };
            setSelectedViewMode(mode);
        }
        else {
            restoringModeRef.current = null;
        }
    }, [activeTabId]);
    useEffect(() => {
        if (!activeTabId)
            return;
        const restoring = restoringModeRef.current;
        if (restoring?.tabId === activeTabId) {
            if (restoring.mode === selectedViewMode)
                restoringModeRef.current = null;
            return;
        }
        setViewModes(current => current[activeTabId] === selectedViewMode
            ? current
            : { ...current, [activeTabId]: selectedViewMode });
    }, [selectedViewMode, activeTabId, setViewModes]);
    return { tabsRestoredForKey, tabsRestoreDoneRef, specRouteReadyRef };
}
