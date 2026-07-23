import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as jsYaml from 'js-yaml';
import clsx from 'clsx';

import type { ActiveAuth, ExamineResponse, OpenApiSpec, ParsableConfig, ParsedRoute } from './types';
import { THEME_LIST } from './data/themes';
import { normalizeOpenApiSpec } from './utils/openapi';
import { getContrastColor } from './utils/color';
import { generateSmartRoute, getEndpointId, parseSmartRoute, resolveEndpointFromId, HTTP_METHODS } from './utils/routing';
import { useBreakpoint } from './hooks/useBreakpoint';

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
import ThemeSelectorModal from './components/modals/ThemeSelectorModal';
import AuthModal from './components/modals/AuthModal';

// Common
import MethodBadge from './components/common/MethodBadge';
import { TooltipProvider, Tip } from './components/common/Tooltip';

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

export default function App() {
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    // Config/spec
    const [, setConfig] = useState<any>(null);
    const [parsables, setParsables] = useState<ParsableConfig>({});
    const [selectedParsableKey, setSelectedParsableKey] = useState<string>('');
    const [spec, setSpec] = useState<OpenApiSpec | null>(null);
    const [isLoadingSpec, setIsLoadingSpec] = useState(false);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
    const loadSpecSeq = useRef(0);

    // Navigation
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEndpoint, setSelectedEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [showHome, setShowHome] = useState(true);
    const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);
    const [showAbout, setShowAbout] = useState(false);

    // Advanced filters
    const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [onlyProtected, setOnlyProtected] = useState<boolean | null>(null);

    // Theme
    const [selectedThemeName, setSelectedThemeName] = useState('Default Slate');
    const [currentThemeMode, setCurrentThemeMode] = useState<'light' | 'dark'>('dark');

    // Desktop sidebar collapse (persisted); mobile has its own open/closed
    const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
    });
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!isMobile) localStorage.setItem('sidebar_collapsed', String(desktopCollapsed));
    }, [desktopCollapsed, isMobile]);

    // Schema modals
    const [modalsStack, setModalsStack] = useState<string[]>([]);
    const [codeGenEndpoint, setCodeGenEndpoint] = useState<{ path: string; method: string } | null>(null);
    const [selectedTab, setSelectedTab] = useState<'docs' | 'examine'>('docs');
    const [activeResponseCode, setActiveResponseCode] = useState<string | null>(null);

    // Auth
    const [activeAuth, setActiveAuth] = useState<ActiveAuth>({
        activeScheme: 'none', cookieValues: {}, bearerToken: '',
        apiKeyName: 'X-API-KEY', apiKeyValue: '', apiKeyIn: 'header',
        basicUsername: '', basicPassword: '',
    });
    const [selectedServer, setSelectedServer] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showThemeModal, setShowThemeModal] = useState(false);

    // Per-endpoint examine responses
    const [examineResponses, setExamineResponses] = useState<Record<EndpointKey, ExamineResponse>>({});

    // Hash guard
    const [isUpdatingHash, setIsUpdatingHash] = useState(false);

    // ---------- Title ----------
    useEffect(() => {
        if (spec?.info?.title) document.title = `${spec.info.title} — OpenDoc UI`;
        else if (selectedParsableKey) document.title = `${selectedParsableKey} — OpenDoc UI`;
        else document.title = 'OpenDoc UI';
    }, [spec, selectedParsableKey]);

    // ---------- Theme per-parsable ----------
    useEffect(() => {
        if (!selectedParsableKey) return;
        const t = localStorage.getItem(`selected_theme_name_${selectedParsableKey}`);
        setSelectedThemeName(t && THEME_LIST.some(x => x.name === t) ? t : 'Default Slate');
        const m = localStorage.getItem(`theme_mode_${selectedParsableKey}`);
        setCurrentThemeMode(m === 'light' || m === 'dark' ? m : 'dark');
    }, [selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`selected_theme_name_${selectedParsableKey}`, selectedThemeName); }, [selectedThemeName, selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem(`theme_mode_${selectedParsableKey}`, currentThemeMode); }, [currentThemeMode, selectedParsableKey]);
    useEffect(() => { if (selectedParsableKey) localStorage.setItem('selected_parsable_key', selectedParsableKey); }, [selectedParsableKey]);

    const activeTheme = useMemo(() => THEME_LIST.find(t => t.name === selectedThemeName) || THEME_LIST[0], [selectedThemeName]);

    // Apply theme CSS variables to documentElement so portaled elements (tooltips, etc.) pick them up
    useEffect(() => {
        const v = currentThemeMode === 'light' ? activeTheme.light : activeTheme.dark;
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
        (['get','post','put','delete','patch','head','connect','options','trace'] as const).forEach(k => {
            const c = (v as any)[`method${k.charAt(0).toUpperCase()}${k.slice(1)}`];
            root.style.setProperty(`--method-${k}`, c);
            root.style.setProperty(`--method-${k}-contrast`, getContrastColor(c));
        });
    }, [activeTheme, currentThemeMode]);

    const styleVars = useMemo(() => {
        const v = currentThemeMode === 'light' ? activeTheme.light : activeTheme.dark;
        const out: Record<string, string> = {
            '--background': v.background, '--surface': v.surface, '--surface-hover': v.surfaceHover,
            '--border': v.border, '--text': v.text, '--text-heading': v.textHeading, '--text-muted': v.textMuted,
            '--primary': v.primary, '--primary-hover': v.primaryHover, '--primary-contrast': getContrastColor(v.primary),
            '--accent': v.accent, '--sidebar': v.sidebar, '--sidebar-text': v.sidebarText, '--navbar': v.navbar,
        };
        (['get','post','put','delete','patch','head','connect','options','trace'] as const).forEach(k => {
            const c = (v as any)[`method${k.charAt(0).toUpperCase()}${k.slice(1)}`];
            out[`--method-${k}`] = c;
            out[`--method-${k}-contrast`] = getContrastColor(c);
        });
        return out as React.CSSProperties;
    }, [activeTheme, currentThemeMode]);

    // ---------- Load spec ----------
    const loadSpec = async (parsableKey: string, parsable: any) => {
        const seq = ++loadSpecSeq.current;
        setIsLoadingSpec(true);
        setSpec(null);

        try {
            let obj: OpenApiSpec | null = null;

            if (parsable.isCustom === true && parsable.rawSpec) {
                obj = parseSpecDraft(parsable.rawSpec);
            } else if (parsable.url) {
                const r = await fetch(parsable.url, { cache: 'no-store' });
                if (!r.ok) throw new Error(`Failed to fetch ${parsable.url}`);
                obj = parseSpecDraft(await r.text());
            }

            // If the user switched parsables while this request was in-flight,
            // ignore this stale response. Without this guard an older request can
            // overwrite the currently selected spec, making the UI appear as if it
            // does not understand the selected parsable.
            if (seq !== loadSpecSeq.current) return;

            setSpec(obj);
            if (obj) setSelectedServer(obj.servers?.[0]?.url || 'https://api.example.com');
        } catch (e) {
            if (seq !== loadSpecSeq.current) return;
            console.error(`Failed to load spec for parsable '${parsableKey}'`, e);
            setSpec(null);
        } finally {
            if (seq === loadSpecSeq.current) setIsLoadingSpec(false);
        }
    };

    useEffect(() => {
        if (!selectedParsableKey) return;
        const p = parsables[selectedParsableKey];
        if (p) loadSpec(selectedParsableKey, p);
        // eslint-disable-next-line
    }, [selectedParsableKey, parsables]);

    // ---------- Tab persistence ----------
    const getTabFromHash = () => parseSmartRoute(window.location.hash).tab;
    const hashHasExplicitTab = () => window.location.hash.includes('?tab=');
    useEffect(() => {
        if (!selectedParsableKey) return;
        if (hashHasExplicitTab()) { setSelectedTab(getTabFromHash() === 'examine' ? 'examine' : 'docs'); return; }
        const t = localStorage.getItem(`preferred_tab_${selectedParsableKey}`);
        setSelectedTab(t === 'examine' ? 'examine' : 'docs');
    }, [selectedParsableKey]);
    useEffect(() => {
        if (selectedParsableKey) localStorage.setItem(`preferred_tab_${selectedParsableKey}`, selectedTab === 'examine' ? 'examine' : 'view');
    }, [selectedTab, selectedParsableKey]);

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
            if (r) { setSelectedEndpoint(r); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false); }
            else setSelectedEndpoint(null);
        } else setSelectedEndpoint(parsed.endpoint);
        if (hashHasExplicitTab()) setSelectedTab(getTabFromHash() === 'examine' ? 'examine' : 'docs');
        setActiveResponseCode(parsed.responseCode);
        if (spec?.components?.schemas) {
            const valid = parsed.schemas.filter(n => spec.components!.schemas![n]);
            setModalsStack(valid.length ? valid : []);
        }
    }, [parsables, selectedParsableKey, spec]);

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
            if (r) { setSelectedEndpoint(r); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false); }
            else setSelectedEndpoint(null);
        } else setSelectedEndpoint(null);
        setModalsStack(parsed.schemas.filter(n => spec.components?.schemas?.[n]));
        if (window.location.hash.includes('?tab=')) setSelectedTab(parsed.tab === 'examine' ? 'examine' : 'docs');
    }, [spec, selectedParsableKey, isLoadingSpec]);

    const fetchConfigs = async () => {
        try {
            let data: any = null;
            if (window?.INITIAL_CONFIG) data = window.INITIAL_CONFIG;
            else {
                setIsLoadingSpec(true);
                const r = await fetch('/config.json');
                if (!r.ok) throw new Error('Failed to fetch /config.json');
                data = await r.json();
                setIsLoadingSpec(false);
            }
            if (data) {
                setConfig(data);
                if (data.parsables) {
                    const loaded: ParsableConfig = {};
                    Object.entries(data.parsables).forEach(([k, v]: [string, any]) => {
                        loaded[k] = {
                            theme: v.theme || 'Default Slate',
                            url: v.url || '',
                            title: v.title || k,
                            // A parsable is remote by default. It is custom only when
                            // explicitly marked as custom or when rawSpec is provided.
                            isCustom: v.isCustom === true || !!v.rawSpec,
                            rawSpec: v.rawSpec || '',
                        };
                    });
                    setParsables(loaded);
                    let initialKey = '';
                    const p = parseSmartRoute(window.location.hash);
                    if (p.parsableKey && loaded[p.parsableKey]) initialKey = p.parsableKey;
                    else {
                        const sk = localStorage.getItem('selected_parsable_key');
                        if (sk && loaded[sk]) initialKey = sk;
                        else initialKey = Object.keys(loaded)[0] || '';
                    }
                    if (initialKey) setSelectedParsableKey(initialKey);
                    setIsInitialLoadComplete(true);
                }
            }
        } catch (err) { console.warn(err); setIsInitialLoadComplete(true); }
    };
    useEffect(() => { fetchConfigs(); }, []);

    const [hashTimer, setHashTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (isLoadingSpec) return;
        if (hashTimer) { clearTimeout(hashTimer); setHashTimer(null); }
        const t = setTimeout(updateHashFromState, 300);
        setHashTimer(t);
        return () => { if (t) clearTimeout(t); };
    }, [selectedParsableKey, showHome, showAbout, showSchemaExplorer, selectedEndpoint, selectedTab, modalsStack, activeResponseCode, searchQuery, spec, isLoadingSpec, updateHashFromState]);

    useEffect(() => {
        const h = () => { if (!isUpdatingHash && !isLoadingSpec && spec) syncHashToState(); };
        window.addEventListener('hashchange', h);
        return () => window.removeEventListener('hashchange', h);
    }, [spec, isLoadingSpec, isUpdatingHash, syncHashToState]);

    // ---------- Handlers ----------
    const closeMobileIfNeeded = () => { if (isMobile) setMobileOpen(false); };

    const handleSelectEndpoint = (path: string, method: string) => {
        setSelectedEndpoint({ path, method });
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
    const handleOpenHome = () => { setShowHome(true); setShowSchemaExplorer(false); setShowAbout(false); setSelectedEndpoint(null); setSearchQuery(''); setActiveResponseCode(null); closeMobileIfNeeded(); };
    const handleOpenAbout = () => { setShowAbout(true); setShowHome(false); setShowSchemaExplorer(false); setSelectedEndpoint(null); setSearchQuery(''); setActiveResponseCode(null); closeMobileIfNeeded(); };
    const handleOpenSchemaExplorer = () => { setShowSchemaExplorer(true); setShowHome(false); setShowAbout(false); setSelectedEndpoint(null); setSearchQuery(''); closeMobileIfNeeded(); };
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
        setSelectedParsableKey(k);
        setExamineResponses({});
        setIsUpdatingHash(true);
        const h = `#/parsable/${encodeURIComponent(k)}`;
        if (window.location.hash !== h) window.location.hash = h;
        setIsUpdatingHash(false);
        closeMobileIfNeeded();
    };

    // ---------- Render ----------
    const content = () => {
        if (!spec) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 select-none text-center h-full">
                    <span className="w-16 h-16 rounded-full bg-[var(--surface-hover)] flex items-center justify-center text-xl mb-4">
                        <i className="ph ph-file-x text-[var(--method-delete)]"></i>
                    </span>
                    <h2 className="text-lg font-bold text-[var(--text-heading)]">No specification loaded</h2>
                    <p className="text-xs max-w-sm mt-1 text-[var(--text-muted)]">Choose a valid Swagger/OpenAPI resource descriptor from the dropdown.</p>
                </div>
            );
        }
        const hasFilters = selectedMethods.length || selectedTags.length || onlyProtected !== null;
        if (searchQuery.trim().length || hasFilters) {
            return <SearchResultsView spec={spec} searchQuery={searchQuery} onSelectEndpoint={handleSearchResult}
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
                                        <button onClick={() => setSelectedTab('docs')}
                                                className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                    selectedTab === 'docs' ? 'bg-[var(--method-get)] shadow-sm text-[var(--method-get-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                            <i className="ph ph-book-open-text text-[16px]"></i>
                                            <span className="hidden sm:inline">View Documentation</span><span className="sm:hidden">Docs</span>
                                        </button>
                                        <button onClick={() => setSelectedTab('examine')}
                                                className={clsx('px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                                    selectedTab === 'examine' ? 'bg-[var(--method-delete)] shadow-sm text-[var(--method-delete-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                            <i className="ph ph-flask text-[16px]"></i>
                                            <span className="hidden sm:inline">API Runner</span><span className="sm:hidden">Run</span>
                                        </button>
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
                                {selectedTab === 'docs' ? (
                                    <ViewTab key={`${selectedEndpoint.path}-${selectedEndpoint.method}`} spec={spec}
                                             path={selectedEndpoint.path} method={selectedEndpoint.method} operation={op}
                                             onOpenSchemaModal={handlePushSchema} activeAuth={activeAuth}
                                             activeResponseCode={activeResponseCode} onSelectResponseCode={setActiveResponseCode} />
                                ) : (
                                    <ExamineTab spec={spec} path={selectedEndpoint.path} method={selectedEndpoint.method}
                                                operation={op} activeAuth={activeAuth} selectedServer={selectedServer}
                                                parsableKey={selectedParsableKey} themeMode={currentThemeMode}
                                                initialResponse={current}
                                                onResponseChange={(r) => setExamineResponses(prev => ({ ...prev, [key]: r }))}
                                                onClearResponse={() => setExamineResponses(prev => { const n = { ...prev }; delete n[key]; return n; })} />
                                )}
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
                             setSelectedEndpoint({ path, method }); setShowHome(false); setShowSchemaExplorer(false); setShowAbout(false);
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
            <div style={styleVars} className="w-full h-screen overflow-hidden flex flex-col font-sans transition-colors duration-150 text-[var(--text)] bg-[var(--background)]">
                <Topbar
                    parsables={parsables} selectedParsableKey={selectedParsableKey} onSelectParsable={handleSelectParsable}
                    activeAuth={activeAuth} onUpdateAuth={setActiveAuth} onOpenAuthModal={() => setShowAuthModal(true)}
                    searchQuery={searchQuery} onSearchChange={handleSearchChange}
                    currentThemeMode={currentThemeMode} onToggleThemeMode={() => setCurrentThemeMode(m => m === 'light' ? 'dark' : 'light')}
                    onDownloadSpec={handleDownload}
                    title={spec?.info?.title || 'OpenDoc UI'} showSchemaExplorer={showSchemaExplorer} spec={spec}
                    showHome={showHome} isCollapsed={isSidebarCollapsed} onToggleCollapse={onToggleCollapse}
                    onOpenMobileSidebar={() => setMobileOpen(true)}
                    selectedThemeName={selectedThemeName} onSelectTheme={setSelectedThemeName}
                    onOpenThemeModal={() => setShowThemeModal(true)}
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
                                onSelectEndpoint={handleSelectEndpoint} onOpenHome={handleOpenHome} onOpenAbout={handleOpenAbout}
                                showHome={showHome} showAbout={showAbout}
                                currentThemeMode={currentThemeMode} onToggleThemeMode={() => setCurrentThemeMode(m => m === 'light' ? 'dark' : 'light')}
                                selectedThemeName={selectedThemeName}
                                onOpenThemeModal={() => setShowThemeModal(true)}
                                onOpenAuthModal={() => setShowAuthModal(true)}
                                activeAuth={activeAuth} onDownloadSpec={handleDownload}
                                mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onOpenMobile={() => setMobileOpen(true)}
                            />
                            <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0 w-full">{content()}</div>
                        </>
                    )}
                </div>

                {resolved_moda_list(modalsStack, spec) && spec?.components?.schemas && (
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
                                    onSelectTheme={(t) => { setSelectedThemeName(t); }} onToggleThemeMode={() => setCurrentThemeMode(m => m === 'light' ? 'dark' : 'light')}
                                    onClose={() => setShowThemeModal(false)} />
            </div>
        </TooltipProvider>
    );
}

// Helper to avoid undefined fn call in JSX above (kept as helper for readability)
function resolved_moda_list(_stack: string[], _spec: OpenApiSpec | null) { return true; }

export { HTTP_METHODS, getEndpointId };
