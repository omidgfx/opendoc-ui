import React, {useCallback, useEffect, useMemo, useState} from 'react';
import * as jsYaml from 'js-yaml';
import clsx from 'clsx';

// Types
import type {ActiveAuth, ExamineResponse, OpenApiSpec, ParsableConfig, ParsedRoute} from './types';

// Data & helpers
import {THEME_LIST} from './data/themes';
import {normalizeOpenApiSpec} from './utils/openapi';
import {getContrastColor} from './utils/color';
import {generateSmartRoute, getEndpointId, parseSmartRoute, resolveEndpointFromId, HTTP_METHODS} from './utils/routing';

// Layout
import Topbar from './components/layout/Topbar';
import Sidebar from './components/layout/Sidebar/Sidebar';

// Views
import HomeView from './components/views/HomeView/HomeView';
import SearchResultsView from './components/views/SearchResultsView/SearchResultsView';
import AboutView from './components/views/AboutView';

// Schema
import SchemaExplorer from './components/schema/SchemaExplorer';

// Endpoint tabs
import ViewTab from './components/endpoint/ViewTab/ViewTab';
import ExamineTab from './components/endpoint/ExamineTab/ExamineTab';

// Modals
import ModalsStack from './components/modals/ModalsStack/ModalsStack';
import CodeGeneratorModal from './components/modals/CodeGeneratorModal';

// Common
import MethodBadge from './components/common/MethodBadge';

declare global {
    interface Window {
        INITIAL_CONFIG?: any;
    }
}

const parseSpecDraft = (text: string): OpenApiSpec => {
    const trimmed = text.trim();
    const parsed = trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(text) : jsYaml.load(text);
    return normalizeOpenApiSpec(parsed);
};

type EndpointKey = string; // `${method}:${path}`
const endpointKey = (path: string, method: string): EndpointKey => `${method.toLowerCase()}:${path}`;

export default function App() {
    // ---------- Config & Specs ----------
    const [, setConfig] = useState<any>(null);
    const [parsables, setParsables] = useState<ParsableConfig>({});
    const [selectedParsableKey, setSelectedParsableKey] = useState<string>('');
    const [spec, setSpec] = useState<OpenApiSpec | null>(null);
    const [isLoadingSpec, setIsLoadingSpec] = useState(false);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

    // ---------- Navigation state ----------
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedEndpoint, setSelectedEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [showHome, setShowHome] = useState<boolean>(true);
    const [showSchemaExplorer, setShowSchemaExplorer] = useState<boolean>(false);
    const [showAbout, setShowAbout] = useState<boolean>(false);

    // ---------- Advanced filters ----------
    const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [onlyProtected, setOnlyProtected] = useState<boolean | null>(null);

    // ---------- Theme ----------
    const [selectedThemeName, setSelectedThemeName] = useState<string>('Default Slate');
    const [currentThemeMode, setCurrentThemeMode] = useState<'light' | 'dark'>('dark');

    // ---------- Sidebar collapsed preferences ----------
    const [userSidebarCollapsed, setUserSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
    });
    const [searchResultSidebarCollapsed, setSearchResultSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('search_result_sidebar_collapsed') === 'true'; } catch { return false; }
    });
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(userSidebarCollapsed);

    useEffect(() => { localStorage.setItem('sidebar_collapsed', String(userSidebarCollapsed)); }, [userSidebarCollapsed]);
    useEffect(() => { localStorage.setItem('search_result_sidebar_collapsed', String(searchResultSidebarCollapsed)); }, [searchResultSidebarCollapsed]);

    useEffect(() => {
        const hasActiveSearch = searchQuery.trim().length > 0 || selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
        setIsSidebarCollapsed(hasActiveSearch ? searchResultSidebarCollapsed : userSidebarCollapsed);
    }, [searchQuery, selectedMethods, selectedTags, onlyProtected, userSidebarCollapsed, searchResultSidebarCollapsed]);

    // ---------- Schema modals ----------
    const [modalsStack, setModalsStack] = useState<string[]>([]);

    // ---------- Code generator ----------
    const [codeGenEndpoint, setCodeGenEndpoint] = useState<{ path: string; method: string } | null>(null);

    // ---------- Tab (docs / examine) ----------
    const [selectedTab, setSelectedTab] = useState<'docs' | 'examine'>('docs');

    // ---------- Response deep-link ----------
    const [activeResponseCode, setActiveResponseCode] = useState<string | null>(null);

    // ---------- Auth ----------
    const [activeAuth, setActiveAuth] = useState<ActiveAuth>({
        activeScheme: 'none',
        cookieValues: {},
        bearerToken: '',
        apiKeyName: 'X-API-KEY',
        apiKeyValue: '',
        apiKeyIn: 'header',
        basicUsername: '',
        basicPassword: '',
    });
    const [selectedServer, setSelectedServer] = useState<string>('');

    // ---------- Per-endpoint examine response (keyed by `${method}:${path}`) ----------
    // Storing responses per-endpoint lets users switch between endpoints without
    // losing the last "examine run" log for each one.
    const [examineResponses, setExamineResponses] = useState<Record<EndpointKey, ExamineResponse>>({});

    const persistExamineResponse = useCallback((path: string, method: string, response: ExamineResponse) => {
        setExamineResponses(prev => ({ ...prev, [endpointKey(path, method)]: response }));
    }, []);
    const clearExamineResponse = useCallback((path: string, method: string) => {
        setExamineResponses(prev => {
            const next = { ...prev };
            delete next[endpointKey(path, method)];
            return next;
        });
    }, []);

    // ---------- Hash loop guard ----------
    const [isUpdatingHash, setIsUpdatingHash] = useState(false);

    // ---------- Window title ----------
    useEffect(() => {
        if (spec?.info?.title) document.title = `${spec.info.title} — OpenDoc UI`;
        else if (selectedParsableKey) document.title = `${selectedParsableKey} — OpenDoc UI`;
        else document.title = 'OpenDoc UI';
    }, [spec, selectedParsableKey]);

    // ---------- Theme & mode (localStorage per parsable) ----------
    useEffect(() => {
        if (!selectedParsableKey) return;
        const savedTheme = localStorage.getItem(`selected_theme_name_${selectedParsableKey}`);
        setSelectedThemeName(savedTheme && THEME_LIST.some(t => t.name === savedTheme) ? savedTheme : 'Default Slate');
        const savedMode = localStorage.getItem(`theme_mode_${selectedParsableKey}`);
        setCurrentThemeMode(savedMode === 'light' || savedMode === 'dark' ? savedMode : 'dark');
    }, [selectedParsableKey]);

    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`selected_theme_name_${selectedParsableKey}`, selectedThemeName); }, [selectedThemeName, selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`theme_mode_${selectedParsableKey}`, currentThemeMode); }, [currentThemeMode, selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem('selected_parsable_key', selectedParsableKey); }, [selectedParsableKey]);

    const activeTheme = useMemo(() => THEME_LIST.find(t => t.name === selectedThemeName) || THEME_LIST[0], [selectedThemeName]);

    const styleVars = useMemo(() => {
        const vars = currentThemeMode === 'light' ? activeTheme.light : activeTheme.dark;
        const out: Record<string, string> = {
            '--background': vars.background,
            '--surface': vars.surface,
            '--surface-hover': vars.surfaceHover,
            '--border': vars.border,
            '--text': vars.text,
            '--text-heading': vars.textHeading,
            '--text-muted': vars.textMuted,
            '--primary': vars.primary,
            '--primary-hover': vars.primaryHover,
            '--primary-contrast': getContrastColor(vars.primary),
            '--accent': vars.accent,
            '--sidebar': vars.sidebar,
            '--sidebar-text': vars.sidebarText,
            '--navbar': vars.navbar,
        };
        const methodKeys = ['get', 'post', 'put', 'delete', 'patch', 'head', 'connect', 'options', 'trace'] as const;
        methodKeys.forEach(k => {
            const color = (vars as any)[`method${k.charAt(0).toUpperCase()}${k.slice(1)}`];
            out[`--method-${k}`] = color;
            out[`--method-${k}-contrast`] = getContrastColor(color);
        });
        return out as React.CSSProperties;
    }, [activeTheme, currentThemeMode]);

    // ---------- Load spec ----------
    const loadSpec = async (parsable: any) => {
        setIsLoadingSpec(true);
        try {
            let specObj: OpenApiSpec | null = null;
            if (parsable.isCustom && parsable.rawSpec) {
                specObj = parseSpecDraft(parsable.rawSpec);
            } else if (parsable.url) {
                const res = await fetch(parsable.url);
                if (!res.ok) throw new Error(`Failed to fetch ${parsable.url}`);
                specObj = parseSpecDraft(await res.text());
            }
            setSpec(specObj);
            if (specObj) {
                setSelectedServer(specObj.servers?.[0]?.url || 'https://api.example.com');
            }
        } catch (e) {
            console.error('Failed to load spec', e);
            setSpec(null);
        } finally {
            setIsLoadingSpec(false);
        }
    };

    useEffect(() => {
        if (!selectedParsableKey) return;
        const parsable = parsables[selectedParsableKey];
        if (parsable) loadSpec(parsable);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedParsableKey, parsables]);

    // ---------- Persist selectedTab per parsable ----------
    const getTabFromHash = () => parseSmartRoute(window.location.hash).tab;
    const hashHasExplicitTab = () => window.location.hash.includes('?tab=');

    useEffect(() => {
        if (!selectedParsableKey) return;
        if (hashHasExplicitTab()) {
            setSelectedTab(getTabFromHash() === 'examine' ? 'examine' : 'docs');
            return;
        }
        const savedTab = localStorage.getItem(`preferred_tab_${selectedParsableKey}`);
        setSelectedTab(savedTab === 'examine' ? 'examine' : 'docs');
    }, [selectedParsableKey]);

    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`preferred_tab_${selectedParsableKey}`, selectedTab === 'examine' ? 'examine' : 'view'); }, [selectedTab, selectedParsableKey]);

    // ---------- Hash sync ----------
    const syncHashToState = useCallback(() => {
        const parsed: ParsedRoute = parseSmartRoute(window.location.hash);

        if (parsed.parsableKey && parsed.parsableKey !== selectedParsableKey && parsables[parsed.parsableKey]) {
            setSelectedParsableKey(parsed.parsableKey);
        }
        if (parsed.searchQuery !== undefined) setSearchQuery(parsed.searchQuery);
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);

        if (parsed.legacyOperationId && spec) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            setSelectedEndpoint(resolved);
        } else {
            setSelectedEndpoint(parsed.endpoint);
        }

        if (hashHasExplicitTab()) setSelectedTab(getTabFromHash() === 'examine' ? 'examine' : 'docs');
        if (parsed.responseCode !== activeResponseCode) setActiveResponseCode(parsed.responseCode);

        if (spec?.components?.schemas) {
            const validSchemas = parsed.schemas.filter(n => spec.components!.schemas![n]);
            const nextNames = validSchemas.join(',');
            const currentNames = modalsStack.join(',');
            if (nextNames !== currentNames) setModalsStack(validSchemas);
        } else if (parsed.schemas.length > 0) {
            setModalsStack(parsed.schemas);
        }
    }, [parsables, selectedParsableKey, spec, modalsStack, activeResponseCode]);

    const updateHashFromState = () => {
        if (isLoadingSpec || isUpdatingHash || !isInitialLoadComplete || !spec) return;
        setIsUpdatingHash(true);
        const newHash = generateSmartRoute({
            parsableKey: selectedParsableKey,
            showHome,
            showAbout,
            showSchemaExplorer,
            endpoint: selectedEndpoint,
            tab: selectedTab,
            schemaModals: modalsStack.map(n => ({ schemaName: n, schema: spec?.components?.schemas?.[n] || {} })),
            responseCode: activeResponseCode,
            searchQuery,
            activeSpec: spec,
        });
        if (window.location.hash !== newHash) window.location.hash = newHash;
        setIsUpdatingHash(false);
    };

    // When spec loads, apply hash state
    useEffect(() => {
        if (!spec || !spec.paths || isLoadingSpec) return;
        const parsed = parseSmartRoute(window.location.hash);
        setSearchQuery(parsed.searchQuery || '');
        setShowHome(parsed.showHome);
        setShowSchemaExplorer(parsed.showSchemaExplorer);
        setShowAbout(parsed.showAbout);
        setActiveResponseCode(parsed.responseCode);

        if (parsed.legacyOperationId) {
            const resolved = resolveEndpointFromId(parsed.legacyOperationId, spec);
            if (resolved) {
                setSelectedEndpoint(resolved);
                setShowHome(false);
                setShowSchemaExplorer(false);
                setShowAbout(false);
            } else {
                setSelectedEndpoint(null);
            }
        } else {
            setSelectedEndpoint(null);
        }

        if (parsed.schemas.length > 0) {
            const valid = parsed.schemas.filter(n => spec.components?.schemas?.[n]);
            setModalsStack(valid.length ? valid : []);
        } else {
            setModalsStack([]);
        }
        if (window.location.hash.includes('?tab=')) setSelectedTab(parsed.tab === 'examine' ? 'examine' : 'docs');
    }, [spec, selectedParsableKey, isLoadingSpec]);

    // Initial config fetch
    const fetchConfigs = async () => {
        try {
            let data: any = null;
            if (window?.['INITIAL_CONFIG']) {
                data = window['INITIAL_CONFIG'];
            } else {
                setIsLoadingSpec(true);
                const res = await fetch('/config.json');
                if (!res.ok) throw new Error('Failed to fetch /config.json');
                data = await res.json();
                setIsLoadingSpec(false);
            }
            if (data) {
                setConfig(data);
                if (data.parsables) {
                    const loaded: ParsableConfig = {};
                    Object.entries(data.parsables).forEach(([key, value]: [string, any]) => {
                        loaded[key] = {
                            theme: value.theme || 'Default Slate',
                            url: value.url || '',
                            title: value.title || key,
                            isCustom: value.isCustom !== false,
                            rawSpec: value.rawSpec || '',
                        };
                    });
                    setParsables(loaded);
                    let initialKey = '';
                    const parsed = parseSmartRoute(window.location.hash);
                    if (parsed.parsableKey && loaded[parsed.parsableKey]) initialKey = parsed.parsableKey;
                    else {
                        const savedKey = localStorage.getItem('selected_parsable_key');
                        if (savedKey && loaded[savedKey]) initialKey = savedKey;
                        else {
                            const keys = Object.keys(loaded);
                            if (keys.length > 0) initialKey = keys[0];
                        }
                    }
                    if (initialKey) setSelectedParsableKey(initialKey);
                    setIsInitialLoadComplete(true);
                }
            }
        } catch (err) {
            console.warn('⚠️ Error loading configs', err);
            setIsInitialLoadComplete(true);
        }
    };

    useEffect(() => { fetchConfigs(); }, []);

    // Debounced hash update on state change
    const [hashUpdateTimer, setHashUpdateTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (isLoadingSpec) return;
        if (hashUpdateTimer) { clearTimeout(hashUpdateTimer); setHashUpdateTimer(null); }
        const t = setTimeout(updateHashFromState, 300);
        setHashUpdateTimer(t);
        return () => { if (t) clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedParsableKey, showHome, showAbout, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery, spec, isLoadingSpec]);

    useEffect(() => {
        const handler = () => { if (!isUpdatingHash && !isLoadingSpec && spec) syncHashToState(); };
        window.addEventListener('hashchange', handler);
        return () => window.removeEventListener('hashchange', handler);
    }, [spec, isLoadingSpec, isUpdatingHash, syncHashToState]);

    // ---------- Handlers ----------
    const handleSelectEndpoint = (path: string, method: string) => {
        setSelectedEndpoint({ path, method });
        setShowHome(false);
        setShowSchemaExplorer(false);
        setShowAbout(false);
        setActiveResponseCode(null);
        setSearchQuery('');
        setSelectedMethods([]);
        setSelectedTags([]);
        setOnlyProtected(null);
    };
    const handleSelectSearchResult = (path: string, method: string) => {
        setUserSidebarCollapsed(false);
        setIsSidebarCollapsed(false);
        handleSelectEndpoint(path, method);
    };
    const [searchDebounceTimer, setSearchDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); setSearchDebounceTimer(null); }
        const t = setTimeout(() => {
            const hasFilters = selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
            if (query.trim().length > 0 || hasFilters) {
                setSelectedEndpoint(null); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false);
            } else {
                setSelectedEndpoint(null); setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false);
            }
        }, 500);
        setSearchDebounceTimer(t);
    };
    const handleOpenHome = () => {
        setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false);
        setSelectedEndpoint(null); setSearchQuery(''); setActiveResponseCode(null);
    };
    const handleOpenAbout = () => {
        setShowHome(false); setShowSchemaExplorer(false); setShowAbout(true);
        setSelectedEndpoint(null); setSearchQuery(''); setActiveResponseCode(null);
    };
    const handleOpenSchemaExplorer = () => {
        setShowSchemaExplorer(true); setShowHome(false); setShowAbout(false);
        setSelectedEndpoint(null); setSearchQuery('');
    };
    const handleDownloadSpec = () => {
        if (!spec) return;
        const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(spec, null, 2));
        const a = document.createElement('a');
        a.href = data; a.download = `${selectedParsableKey}-spec.json`;
        a.click();
    };
    const handlePushSchema = (schemaName: string) => setModalsStack(prev => [...prev, schemaName]);
    const handlePopSchema = () => setModalsStack(prev => prev.slice(0, -1));
    const handleSelectParsable = (key: string) => {
        if (key === selectedParsableKey) return;
        setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false);
        setSelectedEndpoint(null); setSearchQuery(''); setActiveResponseCode(null); setModalsStack([]);
        setSelectedTab('docs');
        setSelectedMethods([]); setSelectedTags([]); setOnlyProtected(null);
        setSelectedParsableKey(key);
        setExamineResponses({});
        setIsUpdatingHash(true);
        const newHash = `#/parsable/${encodeURIComponent(key)}`;
        if (window.location.hash !== newHash) window.location.hash = newHash;
        setIsUpdatingHash(false);
    };

    const resolvedModalsList = useMemo(() => {
        if (!spec?.components?.schemas) return [];
        return modalsStack.map(n => ({ schemaName: n, schema: spec.components!.schemas![n] || {} })).filter(i => i.schema);
    }, [modalsStack, spec]);

    // ---------- Render content ----------
    const renderContent = () => {
        if (!spec) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 select-none text-center h-full">
                    <span className="w-16 h-16 rounded-full bg-[var(--surface-hover)] bg-[var(--background)] flex items-center justify-center text-xl mb-4">
                        <i className="ph ph-file-x text-[var(--method-delete)]"></i>
                    </span>
                    <h2 className="text-lg font-bold">No specification loaded</h2>
                    <p className="text-xs text-muted max-w-sm mt-1 text-[var(--text-muted)]">
                        Ensure you choose a valid Swagger/OpenAPI compliant resource descriptor config from the dropdown.
                    </p>
                </div>
            );
        }

        const hasActiveFilters = selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
        if (searchQuery.trim().length > 0 || hasActiveFilters) {
            return (
                <SearchResultsView
                    spec={spec}
                    searchQuery={searchQuery}
                    onSelectEndpoint={handleSelectSearchResult}
                    selectedServer={selectedServer}
                    selectedMethods={selectedMethods}
                    setSelectedMethods={setSelectedMethods}
                    selectedTags={selectedTags}
                    setSelectedTags={setSelectedTags}
                    onlyProtected={onlyProtected}
                    setOnlyProtected={setOnlyProtected}
                    parsableKey={selectedParsableKey}
                />
            );
        }

        if (selectedEndpoint) {
            const pathObj = spec.paths[selectedEndpoint.path];
            if (pathObj) {
                const opObj = (pathObj as any)[selectedEndpoint.method];
                if (opObj) {
                    const key = endpointKey(selectedEndpoint.path, selectedEndpoint.method);
                    const currentResponse = examineResponses[key] || null;
                    return (
                        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
                            <div className="h-auto min-h-[3.5rem] border-b px-3 sm:px-6 py-2 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 select-none bg-[var(--surface)] border-[var(--border)]">
                                <div className="flex items-center gap-1.5 text-[10.5px] min-w-0 overflow-hidden">
                                    <span className="uppercase opacity-40 font-black text-[9px] tracking-widest text-[var(--text-heading)] hidden sm:inline">Endpoint:</span>
                                    <MethodBadge method={selectedEndpoint.method} size="xs" className="rounded-full shrink-0" />
                                    <span className="font-mono font-bold select-all truncate">{selectedEndpoint.path}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex p-0.5 gap-1 rounded-lg border text-xs border-[var(--border)] bg-[var(--background)]">
                                        <button
                                            onClick={() => setSelectedTab('docs')}
                                            className={clsx(
                                                'px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                selectedTab === 'docs' ? 'bg-[var(--method-get)] shadow-sm text-[var(--method-get-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                                            )}>
                                            <i className="ph ph-book-open-text text-[16px]"></i>
                                            <span className="hidden sm:inline">View Documentation</span>
                                            <span className="sm:hidden">Docs</span>
                                        </button>
                                        <button
                                            onClick={() => setSelectedTab('examine')}
                                            className={clsx(
                                                'px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                selectedTab === 'examine' ? 'bg-[var(--method-delete)] shadow-sm text-[var(--method-delete-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                                            )}>
                                            <i className="ph ph-flask text-[16px]"></i>
                                            <span className="hidden sm:inline">API Runner</span>
                                            <span className="sm:hidden">Run</span>
                                        </button>
                                    </div>
                                    <div className="h-5 w-[1px] bg-[var(--border)] hidden sm:block"></div>
                                    <button
                                        onClick={() => setCodeGenEndpoint(selectedEndpoint)}
                                        className="size-8.5 border hover:bg-[var(--surface-hover)] rounded-lg text-xs font-bold flex justify-center items-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] shrink-0"
                                        title="Generate Fetch/Axios snippets">
                                        <i className="ph ph-code text-[16px]"></i>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden h-full min-h-0">
                                {selectedTab === 'docs' ? (
                                    <ViewTab
                                        key={`${selectedEndpoint.path}-${selectedEndpoint.method}`}
                                        spec={spec}
                                        path={selectedEndpoint.path}
                                        method={selectedEndpoint.method}
                                        operation={opObj}
                                        onOpenSchemaModal={handlePushSchema}
                                        activeAuth={activeAuth}
                                        activeResponseCode={activeResponseCode}
                                        onSelectResponseCode={setActiveResponseCode}
                                    />
                                ) : (
                                    <ExamineTab
                                        key={`examine-${selectedEndpoint.path}-${selectedEndpoint.method}`}
                                        spec={spec}
                                        path={selectedEndpoint.path}
                                        method={selectedEndpoint.method}
                                        operation={opObj}
                                        activeAuth={activeAuth}
                                        selectedServer={selectedServer}
                                        parsableKey={selectedParsableKey}
                                        themeMode={currentThemeMode}
                                        initialResponse={currentResponse}
                                        onResponseChange={(resp) => persistExamineResponse(selectedEndpoint.path, selectedEndpoint.method, resp)}
                                        onClearResponse={() => clearExamineResponse(selectedEndpoint.path, selectedEndpoint.method)}
                                    />
                                )}
                            </div>
                        </div>
                    );
                }
            }
        }

        if (showSchemaExplorer) {
            return (
                <SchemaExplorer
                    schemas={spec.components?.schemas}
                    onSelectSchema={handlePushSchema}
                    parsableKey={selectedParsableKey}
                />
            );
        }

        if (showAbout) {
            return <AboutView specTitle={spec?.info?.title} parsableKey={selectedParsableKey} />;
        }

        return (
            <HomeView
                spec={spec}
                selectedEndpoint={selectedEndpoint}
                onSelectEndpoint={handleSelectEndpoint}
                selectedServer={selectedServer}
                onSelectServer={setSelectedServer}
                activeAuth={activeAuth}
                onDeepLinkResponse={(path, method, code) => {
                    setSelectedEndpoint({ path, method });
                    setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false);
                    setSelectedTab('docs');
                    setActiveResponseCode(code);
                }}
            />
        );
    };

    // ---------- Render ----------
    return (
        <div
            style={styleVars}
            className="w-full h-screen overflow-hidden flex flex-col font-sans transition-colors duration-150 text-[var(--text)] bg-[var(--background)]">

            <Topbar
                parsables={parsables}
                selectedParsableKey={selectedParsableKey}
                onSelectParsable={handleSelectParsable}
                activeAuth={activeAuth}
                onUpdateAuth={setActiveAuth}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                currentThemeMode={currentThemeMode}
                onToggleThemeMode={() => setCurrentThemeMode(currentThemeMode === 'light' ? 'dark' : 'light')}
                onDownloadSpec={handleDownloadSpec}
                title={spec?.info?.title || 'OpenDoc UI'}
                showSchemaExplorer={showSchemaExplorer}
                spec={spec}
                showHome={showHome}
                showAbout={showAbout}
                onOpenHome={handleOpenHome}
                onOpenAbout={handleOpenAbout}
                selectedThemeName={selectedThemeName}
                onSelectTheme={setSelectedThemeName}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => {
                    const hasActiveSearch = searchQuery.trim().length > 0 || selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
                    const next = !isSidebarCollapsed;
                    setIsSidebarCollapsed(next);
                    if (hasActiveSearch) setSearchResultSidebarCollapsed(next);
                    else setUserSidebarCollapsed(next);
                }}
            />

            <div className="flex-1 flex overflow-hidden w-full h-full min-w-0">
                {isLoadingSpec ? (
                    <div className="m-auto flex flex-col items-center gap-1 text-[10px] font-bold">
                        <div className="size-8 relative">
                            <i className="block animate-spin size-full border-4 border-[var(--text-muted)]/30 rounded-full absolute"></i>
                            <i className="block animate-spin size-full border-4 border-r-[var(--primary)] border-transparent rounded-full absolute"></i>
                        </div>
                        Please wait&hellip;
                    </div>
                ) : (
                    <>
                        <Sidebar
                            spec={spec}
                            selectedServer={selectedServer}
                            onSelectServer={setSelectedServer}
                            isCollapsed={isSidebarCollapsed}
                            onOpenSchemaExplorer={handleOpenSchemaExplorer}
                            showSchemaExplorer={showSchemaExplorer}
                            selectedMethods={selectedMethods}
                            setSelectedMethods={setSelectedMethods}
                            selectedTags={selectedTags}
                            setSelectedTags={setSelectedTags}
                            onlyProtected={onlyProtected}
                            setOnlyProtected={setOnlyProtected}
                            searchQuery={searchQuery}
                            selectedEndpoint={selectedEndpoint}
                            onSelectEndpoint={handleSelectEndpoint}
                            onOpenHome={handleOpenHome}
                            showHome={showHome}
                            showAbout={showAbout}
                            onOpenAbout={handleOpenAbout}
                        />

                        <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
                            {renderContent()}
                        </div>
                    </>
                )}
            </div>

            {resolvedModalsList.length > 0 && spec?.components?.schemas && (
                <ModalsStack
                    modals={resolvedModalsList}
                    onPopSchema={handlePopSchema}
                    onPushSchema={handlePushSchema}
                    onCloseAll={() => setModalsStack([])}
                    componentsSchemas={spec.components.schemas}
                    parsableKey={selectedParsableKey}
                />
            )}

            {codeGenEndpoint && spec && (
                <CodeGeneratorModal
                    isOpen={!!codeGenEndpoint}
                    onClose={() => setCodeGenEndpoint(null)}
                    spec={spec}
                    path={codeGenEndpoint.path}
                    method={codeGenEndpoint.method}
                    operation={(spec.paths[codeGenEndpoint.path] as any)?.[codeGenEndpoint.method] || {}}
                    activeAuth={activeAuth}
                />
            )}
        </div>
    );
}

export { HTTP_METHODS, getEndpointId };
