import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as jsYaml from 'js-yaml';
import clsx from 'clsx';

import type { ActiveAuth, ExamineResponse, OpenApiSpec, Parsable, ParsableConfig, ParsedRoute, ThemeMode } from './types';
import { THEME_LIST } from './data/themes';
import { normalizeOpenApiSpec } from './utils/openapi';
import { getContrastColor } from './utils/color';
import { generateSmartRoute, getEndpointId, parseSmartRoute, resolveEndpointFromId } from './utils/routing';
import { useBreakpoint } from './hooks/useBreakpoint';
import { fetchSpecText, clearAllCachedSpecs } from './utils/specCache';
import {
    readLocalHistory, upsertLocalHistory, removeLocalHistoryEntry, clearLocalHistory,
    findLocalHistoryEntry, type LocalHistoryEntry,
} from './utils/localHistory';

import Topbar from './components/layout/Topbar';
import Sidebar from './components/layout/Sidebar/Sidebar';
import HomeView from './components/views/HomeView/HomeView';
import SearchResultsView from './components/views/SearchResultsView/SearchResultsView';
import AboutView from './components/views/AboutView';
import NoSpecView from './components/views/NoSpecView';
import SchemaExplorer from './components/schema/SchemaExplorer';
import ViewTab from './components/endpoint/ViewTab/ViewTab';
import ExamineTab from './components/endpoint/ExamineTab/ExamineTab';
import ModalsStack from './components/modals/ModalsStack/ModalsStack';
import CodeGeneratorModal from './components/modals/CodeGeneratorModal';
import ThemeSelectorModal from './components/modals/ThemeSelectorModal';
import AuthModal from './components/modals/AuthModal';
import MethodBadge from './components/common/MethodBadge';
import { TooltipProvider, Tip } from './components/common/Tooltip';
import { OperationLinkProvider } from './contexts/OperationLinkContext';
import FocusPane from './components/common/FocusPane';
import { useResizableSplit } from './hooks/useResizableSplit';
import EndpointTabs, { type TabItem } from './components/endpoint/EndpointTabs';

declare global {
    interface Window { INITIAL_CONFIG?: any; }
}

const parseSpecDraft = (text: string): OpenApiSpec => {
    const t = text.trim();
    const parsed = (t.startsWith('{') || t.startsWith('[')) ? JSON.parse(text) : jsYaml.load(text);
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
    const [selectedEndpoint, setSelectedEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [showHome, setShowHome] = useState(true);
    const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);
    const [showAbout, setShowAbout] = useState(false);

    const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [onlyProtected, setOnlyProtected] = useState<boolean | null>(null);

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

    const toggleThemeMode = useCallback(() => {
        setCurrentThemeMode(m => {
            if (m === 'system') return resolvedThemeMode === 'dark' ? 'light' : 'dark';
            return m === 'light' ? 'dark' : 'light';
        });
    }, [resolvedThemeMode]);

    const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
    });
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!isMobile) localStorage.setItem('sidebar_collapsed', String(desktopCollapsed));
    }, [desktopCollapsed, isMobile]);

    const [modalsStack, setModalsStack] = useState<string[]>([]);
    const [codeGenEndpoint, setCodeGenEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [selectedTab, setSelectedTab] = useState<'docs' | 'examine' | 'both'>('docs');
    const [activeSplitPane, setActiveSplitPane] = useState<'docs' | 'examine'>('docs');
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const { leftWidth: docsPaneWidth, isDragging: isSplitDragging, onMouseDown: onSplitResizeMouseDown } = useResizableSplit(splitContainerRef, 'endpoint_split_docs_width');
    useEffect(() => {
        if (selectedTab === 'both') setActiveSplitPane('docs');
    }, [selectedTab, selectedEndpoint]);

    const [activeResponseCode, setActiveResponseCode] = useState<string | null>(null);

    const [activeAuth, setActiveAuth] = useState<ActiveAuth>({
        activeScheme: 'none', cookieValues: {}, bearerToken: '',
        apiKeyName: 'X-API-KEY', apiKeyValue: '', apiKeyIn: 'header',
        basicUsername: '', basicPassword: '',
    });
    const [selectedServer, setSelectedServer] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showThemeModal, setShowThemeModal] = useState(false);

    const [examineResponses, setExamineResponses] = useState<Record<EndpointKey, ExamineResponse>>({});

    // ---------- Endpoint tabs ----------
    const [endpointTabs, setEndpointTabs] = useState<TabItem[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [tabViewModes, setTabViewModes] = useState<Record<string, 'docs' | 'examine' | 'both'>>({});

    const withPreviewLast = useCallback((list: TabItem[]): TabItem[] => {
        const previewIdx = list.findIndex(t => t.isPreview);
        if (previewIdx < 0 || previewIdx === list.length - 1) return list;
        const next = [...list];
        const [preview] = next.splice(previewIdx, 1);
        next.push(preview);
        return next;
    }, []);

    const getEndpointLabel = useCallback((path: string, method: string): string => {
        if (!spec?.paths) return path;
        const po = spec.paths[path];
        if (!po) return path;
        const op = (po as any)[method];
        return op?.summary || path;
    }, [spec]);

    const openEndpointPreview = useCallback((path: string, method: string) => {
        const id = `${method.toLowerCase()}:${path}`;
        setEndpointTabs(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) {
                if (existing.isPreview) return withPreviewLast(prev);
                return prev;
            }
            const previewIdx = prev.findIndex(t => t.isPreview);
            const newTab: TabItem = { id, path, method: method.toLowerCase(), isPreview: true, label: getEndpointLabel(path, method) };
            if (previewIdx >= 0) {
                const next = prev.filter(t => !t.isPreview);
                const oldId = prev[previewIdx].id;
                setTabViewModes(vm => {
                    const next2 = { ...vm };
                    if (next2[oldId]) {
                        next2[id] = next2[oldId];
                        delete next2[oldId];
                    }
                    return next2;
                });
                return [...next, newTab];
            }
            return [...prev, newTab];
        });
        setActiveTabId(id);
        setSelectedEndpoint({ path, method: method.toLowerCase() });
    }, [getEndpointLabel, withPreviewLast]);

    const openEndpointPermanent = useCallback((path: string, method: string) => {
        const id = `${method.toLowerCase()}:${path}`;
        setEndpointTabs(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) {
                if (existing.isPreview) {
                    return prev.map(t => t.id === id ? { ...t, isPreview: false } : t);
                }
                return prev;
            }
            const newTab: TabItem = { id, path, method: method.toLowerCase(), isPreview: false, label: getEndpointLabel(path, method) };
            const previewIdx = prev.findIndex(t => t.isPreview);
            if (previewIdx >= 0) {
                const next = [...prev];
                next.splice(previewIdx, 0, newTab);
                return next;
            }
            return [...prev, newTab];
        });
        setActiveTabId(id);
        setSelectedEndpoint({ path, method: method.toLowerCase() });
    }, [getEndpointLabel]);

    const handleSelectTab = useCallback((id: string) => {
        setActiveTabId(id);
        const tab = endpointTabs.find(t => t.id === id);
        if (tab) {
            setSelectedEndpoint({ path: tab.path, method: tab.method });
            setShowHome(false);
            setShowSchemaExplorer(false);
            setShowAbout(false);
            setSearchQuery('');
        }
    }, [endpointTabs]);

    const handleCloseTab = useCallback((id: string) => {
        setEndpointTabs(prev => {
            const idx = prev.findIndex(t => t.id === id);
            if (idx < 0) return prev;
            const next = prev.filter(t => t.id !== id);
            if (id === activeTabId) {
                const newActive = next[Math.min(idx, next.length - 1)] || null;
                setActiveTabId(newActive?.id || null);
                if (newActive) {
                    setSelectedEndpoint({ path: newActive.path, method: newActive.method });
                } else {
                    setSelectedEndpoint(null);
                    setShowHome(true);
                }
            }
            return next;
        });
        setTabViewModes(vm => {
            const next = { ...vm };
            delete next[id];
            return next;
        });
    }, [activeTabId]);

    const handleDoubleClickTab = useCallback((id: string) => {
        setEndpointTabs(prev => withPreviewLast(prev.map(t => t.id === id ? { ...t, isPreview: false } : t)));
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
                if (tab) setSelectedEndpoint({ path: tab.path, method: tab.method });
            }
            setTabViewModes(vm => {
                const n = { ...vm };
                toRemove.forEach(r => delete n[r]);
                return n;
            });
            return next;
        });
    }, [activeTabId]);

    const handleCloseAllRight = useCallback((id: string) => {
        setEndpointTabs(prev => {
            const idx = prev.findIndex(t => t.id === id);
            if (idx < 0 || idx >= prev.length - 1) return prev;
            const toRemove = prev.slice(idx + 1).map(t => t.id);
            const next = prev.slice(0, idx + 1);
            if (toRemove.includes(activeTabId || '')) {
                setActiveTabId(id);
                const tab = next.find(t => t.id === id);
                if (tab) setSelectedEndpoint({ path: tab.path, method: tab.method });
            }
            setTabViewModes(vm => {
                const n = { ...vm };
                toRemove.forEach(r => delete n[r]);
                return n;
            });
            return next;
        });
    }, [activeTabId]);

    const handleCloseOthers = useCallback((id: string) => {
        setEndpointTabs(prev => {
            const keep = prev.find(t => t.id === id);
            if (!keep) return prev;
            const toRemove = prev.filter(t => t.id !== id).map(t => t.id);
            setActiveTabId(id);
            setSelectedEndpoint({ path: keep.path, method: keep.method });
            setTabViewModes(vm => {
                const n: Record<string, 'docs' | 'examine' | 'both'> = {};
                if (vm[id]) n[id] = vm[id];
                return n;
            });
            return [keep];
        });
    }, []);

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
        setEndpointTabs(prev => prev.map(t => ({
            ...t,
            label: getEndpointLabel(t.path, t.method),
        })));
    }, [spec, getEndpointLabel]);

    // ---------- Tab persistence (localStorage) ----------
    const tabsRestoredRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!selectedParsableKey || endpointTabs.length === 0) return;
        const key = `endpoint_tabs_${selectedParsableKey}`;
        const data = { tabs: endpointTabs, activeTabId, viewModes: tabViewModes };
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save tabs to localStorage', e);
        }
    }, [endpointTabs, activeTabId, tabViewModes, selectedParsableKey]);

    useEffect(() => {
        if (!spec || !selectedParsableKey) return;
        if (tabsRestoredRef.current.has(selectedParsableKey)) return;
        tabsRestoredRef.current.add(selectedParsableKey);

        const key = `endpoint_tabs_${selectedParsableKey}`;
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.tabs && Array.isArray(data.tabs) && data.tabs.length > 0) {
                    const updatedTabs = withPreviewLast(data.tabs.map((t: TabItem) => ({
                        ...t,
                        label: getEndpointLabel(t.path, t.method),
                    })));
                    setEndpointTabs(updatedTabs);
                    if (data.activeTabId) {
                        setActiveTabId(data.activeTabId);
                        const activeTab = updatedTabs.find((t: TabItem) => t.id === data.activeTabId);
                        if (activeTab) {
                            setSelectedEndpoint({ path: activeTab.path, method: activeTab.method });
                            setShowHome(false);
                            setShowSchemaExplorer(false);
                            setShowAbout(false);
                        }
                    }
                    if (data.viewModes) {
                        setTabViewModes(data.viewModes);
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load tabs from localStorage', e);
        }
    }, [spec, selectedParsableKey, getEndpointLabel, withPreviewLast]);

    useEffect(() => {
        if (activeTabId && tabViewModes[activeTabId]) {
            setSelectedTab(tabViewModes[activeTabId]);
        }
    }, [activeTabId, tabViewModes]);

    useEffect(() => {
        if (activeTabId) {
            setTabViewModes(vm => ({ ...vm, [activeTabId]: selectedTab }));
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
                setSelectedEndpoint({ path: nextTab.path, method: nextTab.method });
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

    // ---------- Theme (per parsable) ----------
    useEffect(() => {
        if (!selectedParsableKey) return;
        const t = localStorage.getItem(`selected_theme_name_${selectedParsableKey}`);
        setSelectedThemeName(t && THEME_LIST.some(x => x.name === t) ? t : 'Default Slate');
        const m = localStorage.getItem(`theme_mode_${selectedParsableKey}`);
        setCurrentThemeMode(m === 'light' || m === 'dark' || m === 'system' ? m : 'system');
    }, [selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`selected_theme_name_${selectedParsableKey}`, selectedThemeName); }, [selectedThemeName, selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`theme_mode_${selectedParsableKey}`, currentThemeMode); }, [currentThemeMode, selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey && parsables[selectedParsableKey]) localStorage.setItem('selected_parsable_key', selectedParsableKey); }, [selectedParsableKey, parsables]);

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
            '--background': v.background, '--surface': v.surface, '--surface-hover': v.surfaceHover,
            '--border': v.border, '--text': v.text, '--text-heading': v.textHeading, '--text-muted': v.textMuted,
            '--primary': v.primary, '--primary-hover': v.primaryHover, '--primary-contrast': getContrastColor(v.primary),
            '--accent': v.accent, '--sidebar': v.sidebar, '--sidebar-text': v.sidebarText, '--navbar': v.navbar,
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
                const raw = await fetchSpecText(parsable.url, { force: forceRefresh });
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
        const entry: LocalHistoryEntry = { key, title, fileName, raw, openedAt: Date.now() };
        setLocalSpec({ key, title, fileName, raw, file });
        upsertLocalHistory(entry);
        setLocalHistory(readLocalHistory());
        setSelectedParsableKey(key);
        setSpec(obj);
        setIsLoadingSpec(false);
        if (obj) setSelectedServer(obj.servers?.[0]?.url || 'https://api.example.com');
        setShowHome(true);
        setShowSchemaExplorer(false);
        setShowAbout(false);
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
        setExamineResponses({});
        setIsUpdatingHash(true);
        const h = `#/parsable/${encodeURIComponent(key)}`;
        if (window.location.hash !== h) window.location.hash = h;
        setIsUpdatingHash(false);
        return obj;
    }, []);

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
        try {
            if (selectedParsableKey && parsables[selectedParsableKey]) {
                clearAllCachedSpecs();
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
            setIsRefreshingSpec(false);
        }
    }, [selectedParsableKey, parsables, localSpec, applyLocalSpec]);

    // ---------- Config bootstrap ----------
    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            let data: any = null;
            let source: ConfigSource = 'none';
            if (window.INITIAL_CONFIG) {
                data = window.INITIAL_CONFIG;
                source = 'initial';
            } else {
                try {
                    const r = await fetch('/config.json', { cache: 'no-store' });
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
                    const sk = localStorage.getItem('selected_parsable_key');
                    if (sk && loaded[sk]) initialKey = sk;
                    else initialKey = Object.keys(loaded)[0] || '';
                }
                if (initialKey) setSelectedParsableKey(initialKey);
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
        return () => { cancelled = true; };
    }, []);

    // ---------- Hash sync ----------
    const syncHashToState = useCallback(() => {
        const parsed: ParsedRoute = parseSmartRoute(window.location.hash);
        if (parsed.parsableKey && parsed.parsableKey !== selectedParsableKey && parsables[parsed.parsableKey]) {
            setSelectedParsableKey(parsed.parsableKey);
        }
        setSearchQuery(parsed.searchQuery || '');
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);
        if (parsed.legacyOperationId && spec) {
            const r = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (r) {
                openEndpointPreview(r.path, r.method);
                setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false);
            }
            else setSelectedEndpoint(null);
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
    }, [parsables, selectedParsableKey, spec, openEndpointPreview]);

    const updateHashFromState = useCallback(() => {
        if (isLoadingSpec || isUpdatingHash || !isInitialLoadComplete || !spec) return;
        setIsUpdatingHash(true);
        const h = generateSmartRoute({
            parsableKey: selectedParsableKey, showHome, showAbout, showSchemaExplorer,
            endpoint: selectedEndpoint, tab: selectedTab,
            schemaModals: modalsStack.map(n => ({ schemaName: n, schema: spec?.components?.schemas?.[n] || {} })),
            responseCode: activeResponseCode, searchQuery, activeSpec: spec,
        });
        if (window.location.hash !== h) window.location.hash = h;
        setIsUpdatingHash(false);
    }, [isLoadingSpec, isUpdatingHash, isInitialLoadComplete, spec, selectedParsableKey, showHome, showAbout, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery]);

    useEffect(() => {
        if (!spec?.paths || isLoadingSpec) return;
        const parsed = parseSmartRoute(window.location.hash);
        setSearchQuery(parsed.searchQuery || '');
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);
        setActiveResponseCode(parsed.responseCode);
        if (parsed.legacyOperationId) {
            const r = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (r) { openEndpointPreview(r.path, r.method); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false); }
            else setSelectedEndpoint(null);
        } else if (parsed.endpoint) {
            openEndpointPreview(parsed.endpoint.path, parsed.endpoint.method);
        } else {
            setSelectedEndpoint(null);
        }
        setModalsStack(parsed.schemas.filter(n => spec.components?.schemas?.[n]));
        if (window.location.hash.includes('?tab=')) setSelectedTab(mapRouteTabToState(parsed.tab));
    }, [spec, selectedParsableKey, isLoadingSpec]);

    const getTabFromHash = () => parseSmartRoute(window.location.hash).tab;
    const hashHasExplicitTab = () => window.location.hash.includes('?tab=') || window.location.hash.includes('&tab=');
    const mapRouteTabToState = (t: 'view' | 'examine' | 'both'): 'docs' | 'examine' | 'both' => (t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'docs');
    const mapStateTabToStorage = (t: 'docs' | 'examine' | 'both'): string => (t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'view');
    useEffect(() => {
        if (!selectedParsableKey) return;
        if (hashHasExplicitTab()) { setSelectedTab(mapRouteTabToState(getTabFromHash())); return; }
        const t = localStorage.getItem(`preferred_tab_${selectedParsableKey}`);
        setSelectedTab(t === 'examine' ? 'examine' : t === 'both' ? 'both' : 'docs');
    }, [selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey) localStorage.setItem(`preferred_tab_${selectedParsableKey}`, mapStateTabToStorage(selectedTab));
    }, [selectedTab, selectedParsableKey]);

    const [hashTimer, setHashTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (isLoadingSpec) return;
        if (hashTimer) { clearTimeout(hashTimer); setHashTimer(null); }
        const t = setTimeout(updateHashFromState, 300);
        setHashTimer(t);
        return () => { if (t) clearTimeout(t); };
    }, [selectedParsableKey, showHome, showAbout, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery, spec, isLoadingSpec, updateHashFromState]);

    useEffect(() => {
        const h = () => { if (!isUpdatingHash && !isLoadingSpec) syncHashToState(); };
        window.addEventListener('hashchange', h);
        return () => window.removeEventListener('hashchange', h);
    }, [isLoadingSpec, isUpdatingHash, syncHashToState]);

    // ---------- Handlers ----------
    const closeMobileIfNeeded = () => { if (isMobile) setMobileOpen(false); };

    const handleSelectEndpoint = (path: string, method: string) => {
        openEndpointPreview(path, method);
        setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false);
        setActiveResponseCode(null); setSearchQuery('');
        setSelectedMethods([]); setSelectedTags([]); setOnlyProtected(null);
        closeMobileIfNeeded();
    };
    const handleSearchResult = (path: string, method: string) => {
        if (!isMobile) setDesktopCollapsed(false);
        handleSelectEndpoint(path, method);
    };
    const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);
    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        if (searchDebounce) { clearTimeout(searchDebounce); setSearchDebounce(null); }
        const t = setTimeout(() => {
            const hasFilters = selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
            if (query.trim().length || hasFilters) { setSelectedEndpoint(null); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false); }
            else { setSelectedEndpoint(null); setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false); }
        }, 500);
        setSearchDebounce(t);
    };
    const handleOpenHome = () => { setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false); setSelectedEndpoint(null); setActiveTabId(null); setSearchQuery(''); setActiveResponseCode(null); if (!spec) window.location.hash = '#/'; closeMobileIfNeeded(); };
    const handleOpenAbout = () => { setShowAbout(true); setShowHome(false); setShowSchemaExplorer(false); setSelectedEndpoint(null); setActiveTabId(null); setSearchQuery(''); setActiveResponseCode(null); if (!spec) window.location.hash = '#/about'; closeMobileIfNeeded(); };
    const handleOpenSchemaExplorer = () => { setShowSchemaExplorer(true); setShowHome(false); setShowAbout(false); setSelectedEndpoint(null); setActiveTabId(null); setSearchQuery(''); closeMobileIfNeeded(); };
    const handleDownload = () => {
        if (!spec) return;
        const d = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(spec, null, 2));
        const a = document.createElement('a'); a.href = d; a.download = `${selectedParsableKey}-spec.json`; a.click();
    };
    const handlePushSchema = (n: string) => setModalsStack(p => [...p, n]);
    const handlePopSchema = () => setModalsStack(p => p.slice(0, -1));
    const handleSelectParsable = (k: string) => {
        if (k === selectedParsableKey) return;
        setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false);
        setSelectedEndpoint(null); setSearchQuery(''); setActiveResponseCode(null); setModalsStack([]);
        setSelectedTab('docs'); setSelectedMethods([]); setSelectedTags([]); setOnlyProtected(null);
        setEndpointTabs([]); setActiveTabId(null); setTabViewModes({});
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
    const content = () => {
        if (!spec) {
            if (showAbout) return <AboutView specTitle={undefined} parsableKey={selectedParsableKey} />;
            return (
                <NoSpecView
                    canOpenLocal={canOpenLocal}
                    onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                    onOpenAbout={handleOpenAbout}
                />
            );
        }
        const hasFilters = selectedMethods.length || selectedTags.length || onlyProtected !== null;
        if (searchQuery.trim().length || hasFilters) {
            return <SearchResultsView spec={spec} searchQuery={searchQuery} onSelectEndpoint={handleSearchResult}
                                      onMiddleClickEndpoint={openEndpointPermanent}
                                      selectedServer={selectedServer} selectedMethods={selectedMethods} setSelectedMethods={setSelectedMethods}
                                      selectedTags={selectedTags} setSelectedTags={setSelectedTags} onlyProtected={onlyProtected} setOnlyProtected={setOnlyProtected} parsableKey={selectedParsableKey} />;
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
                                 parsableKey={selectedParsableKey} isActive={docActive} />
                    );
                    const examineTabEl = (
                        <ExamineTab spec={spec} path={selectedEndpoint.path} method={selectedEndpoint.method}
                                    operation={op} activeAuth={activeAuth} selectedServer={selectedServer}
                                    parsableKey={selectedParsableKey} themeMode={resolvedThemeMode}
                                    initialResponse={current} isActive={examineActive}
                                    onResponseChange={(r) => setExamineResponses(prev => ({ ...prev, [key]: r }))}
                                    onClearResponse={() => setExamineResponses(prev => { const n = { ...prev }; delete n[key]; return n; })} />
                    );

                    return (
                        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
                            <div className="h-auto min-h-[3.5rem] border-b px-3 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 select-none bg-[var(--surface)] border-[var(--border)]">
                                <div className="flex items-center gap-1.5 text-[10.5px] min-w-0 overflow-hidden">
                                    <span className="uppercase opacity-40 font-black text-[9px] tracking-widest text-[var(--text-heading)] hidden sm:inline">Endpoint:</span>
                                    <MethodBadge method={selectedEndpoint.method} size="xs" className="rounded-full shrink-0" />
                                    <span className="font-mono font-bold select-all truncate">{selectedEndpoint.path}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex p-0.5 gap-1 rounded-lg border text-xs border-[var(--border)] bg-[var(--background)]">
                                        <Tip content="View Documentation">
                                            <button onClick={setViewDocs} aria-pressed={selectedTab === 'docs'}
                                                    className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                        selectedTab === 'docs' ? 'bg-[var(--method-get)] shadow-sm text-[var(--method-get-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                <i className="ph ph-book-open-text text-[16px]"></i>
                                                <span className="hidden sm:inline">View Documentation</span><span className="sm:hidden">Docs</span>
                                            </button>
                                        </Tip>
                                        <Tip content="API Runner">
                                            <button onClick={setViewExamine} aria-pressed={selectedTab === 'examine'}
                                                    className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                        selectedTab === 'examine' ? 'bg-[var(--method-delete)] shadow-sm text-[var(--method-delete-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                <i className="ph ph-flask text-[16px]"></i>
                                                <span className="hidden sm:inline">API Runner</span><span className="sm:hidden">Run</span>
                                            </button>
                                        </Tip>
                                        <Tip content="Split View (Side-by-Side)">
                                            <button onClick={setViewSplit} aria-pressed={selectedTab === 'both'}
                                                    className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                        selectedTab === 'both' ? 'bg-[var(--primary)] shadow-sm text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                <i className="ph ph-split-horizontal text-[16px]"></i>
                                                <span className="hidden sm:inline">Split View</span><span className="sm:hidden">Split</span>
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
                                        <div ref={splitContainerRef} className="flex flex-col h-full w-full min-h-0 min-w-0 gap-1.5 p-1.5 overflow-y-auto scrollbar-thin">
                                            <div className="shrink-0" style={{ height: '70vh' }}>
                                                <FocusPane active={activeSplitPane === 'docs'} onActivate={() => setActiveSplitPane('docs')} fillHeight={false} className="h-full">
                                                    {viewTabEl}
                                                </FocusPane>
                                            </div>
                                            <div className="shrink-0" style={{ height: '70vh' }}>
                                                <FocusPane active={activeSplitPane === 'examine'} onActivate={() => setActiveSplitPane('examine')} fillHeight={false} className="h-full">
                                                    {examineTabEl}
                                                </FocusPane>
                                            </div>
                                        </div>
                                    ) : (
                                        <div ref={splitContainerRef} className="flex h-full w-full min-h-0 min-w-0 gap-0.5 p-1.5">
                                            <div className="h-full min-w-0 overflow-hidden" style={{ width: docsPaneWidth >= 0 ? docsPaneWidth : '50%', flex: docsPaneWidth >= 0 ? '0 0 auto' : '1 1 0%' }}>
                                                <FocusPane active={activeSplitPane === 'docs'} onActivate={() => setActiveSplitPane('docs')}>
                                                    {viewTabEl}
                                                </FocusPane>
                                            </div>
                                            <div onMouseDown={onSplitResizeMouseDown}
                                                 className={clsx('w-1.5 shrink-0 h-full rounded-full cursor-col-resize transition-colors select-none',
                                                     isSplitDragging ? 'bg-[var(--primary)]' : 'bg-transparent hover:bg-[var(--primary)]/60')} />
                                            <div className="h-full min-w-0 flex-1 overflow-hidden">
                                                <FocusPane active={activeSplitPane === 'examine'} onActivate={() => setActiveSplitPane('examine')}>
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
        if (showSchemaExplorer) return <SchemaExplorer schemas={spec.components?.schemas} onSelectSchema={handlePushSchema} parsableKey={selectedParsableKey} />;
        if (showAbout) return <AboutView specTitle={spec?.info?.title} parsableKey={selectedParsableKey} />;
        return <HomeView spec={spec} selectedEndpoint={selectedEndpoint} onSelectEndpoint={handleSelectEndpoint}
                         selectedServer={selectedServer} onSelectServer={setSelectedServer} activeAuth={activeAuth}
                         onDeepLinkResponse={(path, method, code) => {
                             openEndpointPreview(path, method); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false);
                             setSelectedTab('docs'); setActiveResponseCode(code);
                         }} />;
    };

    const isSidebarCollapsed = isMobile ? false : desktopCollapsed;
    const onToggleCollapse = () => {
        if (isMobile) setMobileOpen(o => !o);
        else setDesktopCollapsed(c => !c);
    };

    return (
        <TooltipProvider>
        <OperationLinkProvider spec={spec} parsableKey={selectedParsableKey}>
            <div style={styleVars} className="w-full h-screen overflow-hidden flex flex-col font-sans transition-colors duration-150 text-[var(--text)] bg-[var(--background)]">

                <input
                    ref={hiddenFileInputRef}
                    type="file"
                    accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
                    className="hidden"
                    onChange={handleFileChosen}
                />

                <Topbar
                    parsables={parsables} selectedParsableKey={selectedParsableKey} onSelectParsable={handleSelectParsable}
                    activeAuth={activeAuth} onUpdateAuth={setActiveAuth} onOpenAuthModal={() => setShowAuthModal(true)}
                    searchQuery={searchQuery} onSearchChange={handleSearchChange}
                    themeMode={currentThemeMode} resolvedThemeMode={resolvedThemeMode} onToggleThemeMode={toggleThemeMode}
                    onDownloadSpec={handleDownload}
                    title={spec?.info?.title || 'OpenDoc UI'} showSchemaExplorer={showSchemaExplorer} spec={spec}
                    showHome={showHome} isCollapsed={isSidebarCollapsed} onToggleCollapse={onToggleCollapse}
                    onOpenMobileSidebar={() => setMobileOpen(true)}
                    selectedThemeName={selectedThemeName} onSelectTheme={setSelectedThemeName}
                    onOpenThemeModal={() => setShowThemeModal(true)}
                    isLocalMode={isLocalMode} canOpenLocal={canOpenLocal}
                    onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                    onRefreshSpec={handleRefreshSpec} isRefreshingSpec={isRefreshingSpec}
                    localHistory={localHistory} onSelectHistoryEntry={handleSelectHistoryEntry}
                    onRemoveHistoryEntry={handleRemoveHistoryEntry} onClearHistory={handleClearHistory}
                    localOpenError={localOpenError} onDismissLocalError={() => setLocalOpenError(null)}
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
                                selectedParsableKey={isMobile ? selectedParsableKey : undefined}
                                onSelectParsable={isMobile ? handleSelectParsable : undefined}
                                selectedServer={selectedServer} onSelectServer={setSelectedServer}
                                isCollapsed={desktopCollapsed} onToggleCollapse={() => setDesktopCollapsed(c => !c)}
                                onOpenSchemaExplorer={handleOpenSchemaExplorer} showSchemaExplorer={showSchemaExplorer}
                                selectedMethods={selectedMethods} setSelectedMethods={setSelectedMethods}
                                selectedTags={selectedTags} setSelectedTags={setSelectedTags}
                                onlyProtected={onlyProtected} setOnlyProtected={setOnlyProtected}
                                searchQuery={searchQuery} selectedEndpoint={selectedEndpoint}
                                onSelectEndpoint={handleSelectEndpoint} onMiddleClickEndpoint={openEndpointPermanent}
                                onOpenHome={handleOpenHome} onOpenAbout={handleOpenAbout}
                                showHome={showHome} showAbout={showAbout}
                                themeMode={currentThemeMode} resolvedThemeMode={resolvedThemeMode} onToggleThemeMode={toggleThemeMode}
                                selectedThemeName={selectedThemeName}
                                onOpenThemeModal={() => setShowThemeModal(true)}
                                onOpenAuthModal={() => setShowAuthModal(true)}
                                activeAuth={activeAuth} onDownloadSpec={handleDownload}
                                isLocalMode={isLocalMode} canOpenLocal={canOpenLocal}
                                onOpenLocalFile={() => hiddenFileInputRef.current?.click()}
                                onRefreshSpec={handleRefreshSpec} isRefreshingSpec={isRefreshingSpec}
                                localHistory={localHistory} onSelectHistoryEntry={handleSelectHistoryEntry}
                                onRemoveHistoryEntry={handleRemoveHistoryEntry} onClearHistory={handleClearHistory}
                                localOpenError={localOpenError} onDismissLocalError={() => setLocalOpenError(null)}
                                mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onOpenMobile={() => setMobileOpen(true)}
                            />
                            <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0 w-full">
                                {endpointTabs.length > 0 && spec && (
                                    <EndpointTabs
                                        tabs={endpointTabs}
                                        activeTabId={activeTabId}
                                        onSelectTab={(id) => {
                                            handleSelectTab(id);
                                            setShowHome(false);
                                            setShowSchemaExplorer(false);
                                            setShowAbout(false);
                                            setSearchQuery('');
                                        }}
                                        onCloseTab={handleCloseTab}
                                        onDoubleClickTab={handleDoubleClickTab}
                                        onCloseAllLeft={handleCloseAllLeft}
                                        onCloseAllRight={handleCloseAllRight}
                                        onCloseOthers={handleCloseOthers}
                                        onReorderTabs={handleReorderTabs}
                                    />
                                )}
                                <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0 w-full min-h-0">{content()}</div>
                            </div>
                        </>
                    )}
                </div>

                {spec?.components?.schemas && (
                    <ModalsStack
                        modals={modalsStack.map(n => ({ schemaName: n, schema: spec.components!.schemas![n] || {} })).filter(i => i.schema)}
                        onPopSchema={handlePopSchema} onPushSchema={handlePushSchema}
                        onCloseAll={() => setModalsStack([])}
                        componentsSchemas={spec.components.schemas} parsableKey={selectedParsableKey} />
                )}
                {codeGenEndpoint && spec && (
                    <CodeGeneratorModal isOpen={!!codeGenEndpoint} onClose={() => setCodeGenEndpoint(null)}
                                        spec={spec} path={codeGenEndpoint.path} method={codeGenEndpoint.method}
                                        operation={(spec.paths[codeGenEndpoint.path] as any)?.[codeGenEndpoint.method] || {}}
                                        activeAuth={activeAuth} />
                )}
                <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} spec={spec} activeAuth={activeAuth} onSave={setActiveAuth} />
                <ThemeSelectorModal isOpen={showThemeModal} selectedThemeName={selectedThemeName} currentThemeMode={currentThemeMode}
                                    resolvedThemeMode={resolvedThemeMode}
                                    onSelectTheme={(t) => { setSelectedThemeName(t); }} onToggleThemeMode={toggleThemeMode}
                                    onClose={() => setShowThemeModal(false)} />
            </div>
        </OperationLinkProvider>
        </TooltipProvider>
    );
}
