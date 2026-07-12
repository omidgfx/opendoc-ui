import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { OpenApiSpec, ParsableConfig } from '../../../types';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { useSwipeEdgeOpen } from '../../../hooks/useSwipeOpen';
import CustomDropdown from '../../common/CustomDropdown';
import MethodBadge from '../../common/MethodBadge';
import { Tip } from '../../common/Tooltip';
import pkg from '../../../../package.json';

// ---- Tree types ----
interface TreeNode {
    name: string;
    children: Record<string, TreeNode>;
    endpoints: Array<{ path: string; method: string; operation: any; isProtected: boolean }>;
}

function buildTagTree(spec: OpenApiSpec | null): TreeNode {
    const root: TreeNode = { name: '', children: {}, endpoints: [] };
    if (!spec?.paths) return root;
    const byTag: Record<string, typeof root.endpoints> = {};
    Object.entries(spec.paths).forEach(([pathStr, pathItem]) => {
        if (!pathItem) return;
        Object.entries(pathItem).forEach(([methodStr, operation]) => {
            if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(methodStr)) return;
            const op = operation as any;
            if (!op) return;
            const tags = op.tags?.length ? op.tags : ['General'];
            const isProtected = !!(op.security?.length || spec.security?.length);
            tags.forEach((tag: string) => {
                if (!byTag[tag]) byTag[tag] = [];
                byTag[tag].push({ path: pathStr, method: methodStr, operation: op, isProtected });
            });
        });
    });
    Object.entries(byTag).forEach(([tag, endpoints]) => {
        const parts = tag.split('/').filter(Boolean);
        let node = root;
        for (const part of parts) {
            if (!node.children[part]) node.children[part] = { name: part, children: {}, endpoints: [] };
            node = node.children[part];
        }
        node.endpoints.push(...endpoints);
    });
    const sort = (n: TreeNode): TreeNode => {
        const keys = Object.keys(n.children).sort();
        const sorted: Record<string, TreeNode> = {};
        for (const k of keys) sorted[k] = sort(n.children[k]);
        n.children = sorted;
        n.endpoints.sort((a, b) => (a.operation?.summary || a.path).localeCompare(b.operation?.summary || b.path));
        return n;
    };
    return sort(root);
}

interface SidebarProps {
    spec: OpenApiSpec | null;
    parsables?: ParsableConfig;
    selectedParsableKey?: string;
    onSelectParsable?: (key: string) => void;
    selectedServer: string;
    onSelectServer: (server: string) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onOpenSchemaExplorer: () => void;
    showSchemaExplorer: boolean;
    selectedMethods: string[];
    setSelectedMethods: React.Dispatch<React.SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: React.Dispatch<React.SetStateAction<boolean | null>>;
    searchQuery: string;
    selectedEndpoint: { path: string; method: string } | null;
    onSelectEndpoint: (path: string, method: string) => void;
    onOpenHome: () => void;
    onOpenAbout: () => void;
    showHome: boolean;
    showAbout: boolean;
    currentThemeMode: 'light' | 'dark';
    onToggleThemeMode: () => void;
    selectedThemeName: string;
    onOpenThemeModal: () => void;
    onOpenAuthModal: () => void;
    activeAuth: any;
    onDownloadSpec: () => void;
    mobileOpen: boolean;
    onCloseMobile: () => void;
    onOpenMobile: () => void;
}

export default function Sidebar(props: SidebarProps) {
    const {
        spec, parsables, selectedParsableKey, onSelectParsable,
        selectedServer, onSelectServer,
        isCollapsed, onToggleCollapse,
        onOpenSchemaExplorer, showSchemaExplorer,
        selectedEndpoint, onSelectEndpoint,
        onOpenHome, onOpenAbout, showHome, showAbout,
        currentThemeMode, onToggleThemeMode,
        onOpenThemeModal, onOpenAuthModal, activeAuth,
        onDownloadSpec,
        mobileOpen, onCloseMobile, onOpenMobile,
    } = props;

    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    const [width, setWidth] = useState<number>(() => {
        const saved = localStorage.getItem('sidebar_width');
        return saved ? Math.max(220, Math.min(480, parseInt(saved, 10))) : 280;
    });
    useEffect(() => {
        if (!isMobile) localStorage.setItem('sidebar_width', String(width));
    }, [width, isMobile]);

    const sidebarRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);
    const [isDragging, setIsDragging] = useState(false);

    const onResizeMouseDown = (e: React.MouseEvent) => {
        if (isMobile) return;
        e.preventDefault();
        isResizing.current = true;
        setIsDragging(true);
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeUp);
    };
    const onResizeMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        setWidth(Math.max(220, Math.min(480, e.clientX)));
    };
    const onResizeUp = () => {
        isResizing.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeUp);
    };

    // Tree state
    const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem('collapsed_tags');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    const toggleNode = (path: string) => setCollapsedNodes(prev => {
        const next = { ...prev, [path]: !prev[path] };
        localStorage.setItem('collapsed_tags', JSON.stringify(next));
        return next;
    });

    const tagTree = useMemo(() => buildTagTree(spec), [spec]);
    const endpointRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    // Scroll-fader detection for the endpoint navigator
    const navScrollRef = useRef<HTMLDivElement | null>(null);
    const [navScrolled, setNavScrolled] = useState(false);
    useEffect(() => {
        const el = navScrollRef.current;
        if (!el) return;
        const onScroll = () => setNavScrolled(el.scrollTop > 6);
        onScroll();
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [spec, tagTree]);

    const countEndpoints = (n: TreeNode): number => {
        let c = n.endpoints.length;
        Object.values(n.children).forEach(ch => { c += countEndpoints(ch); });
        return c;
    };

    useEffect(() => {
        if (!selectedEndpoint || isCollapsed || isMobile) return;
        const toExpand = new Set<string>();
        const sm = selectedEndpoint.method.toLowerCase();
        const visit = (node: TreeNode, np: string): boolean => {
            const direct = node.endpoints.some(e => e.path === selectedEndpoint.path && e.method.toLowerCase() === sm);
            let contains = direct;
            Object.entries(node.children).forEach(([cn, ch]) => {
                const cp = np ? `${np}/${cn}` : cn;
                if (visit(ch, cp)) contains = true;
            });
            if (contains && np) toExpand.add(np);
            return contains;
        };
        Object.entries(tagTree.children).forEach(([rn, rnode]) => visit(rnode, rn));
        setCollapsedNodes(curr => {
            let changed = false;
            const next = { ...curr };
            toExpand.forEach(p => { if (next[p]) { next[p] = false; changed = true; } });
            if (changed) localStorage.setItem('collapsed_tags', JSON.stringify(next));
            return changed ? next : curr;
        });
        const key = `${sm}:${selectedEndpoint.path}`;
        const t = setTimeout(() => endpointRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        return () => clearTimeout(t);
    }, [selectedEndpoint, tagTree, isCollapsed, isMobile]);

    useSwipeEdgeOpen(isMobile && !mobileOpen, onOpenMobile);

    const isOverview = showHome && !showSchemaExplorer && !showAbout && !selectedEndpoint;

    const navTo = (fn: () => void) => () => {
        fn();
        if (isMobile) onCloseMobile();
    };

    const renderTree = (node: TreeNode, nodePath: string) => {
        const collapsed = !!collapsedNodes[nodePath];
        const childNames = Object.keys(node.children);
        const total = countEndpoints(node);
        if (!childNames.length && !node.endpoints.length) return null;
        return (
            <div key={nodePath} className="space-y-0.5 animate-in fade-in duration-150">
                <button onClick={() => toggleNode(nodePath)}
                    className="w-full text-[11px] font-medium px-1 py-1.5 flex items-center justify-between hover:bg-[var(--surface-hover)] rounded-md transition-colors cursor-pointer text-left focus:outline-none">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <i className={clsx('text-[14px] mr-0.5 text-[var(--method-put)]',
                            collapsed ? 'ph-fill ph-folder-simple' : 'ph-fill ph-folder-open')} />
                        <span className="truncate">{node.name}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--text)]/10 text-[var(--text)]/80">{total}</span>
                    </span>
                </button>
                {!collapsed && (
                    <div className="pl-1.5 border-l ml-1 border-l-[var(--border)]">
                        {childNames.map(cn => renderTree(node.children[cn], nodePath ? `${nodePath}/${cn}` : cn))}
                        {node.endpoints.map(ep => {
                            const isSelected = selectedEndpoint?.path === ep.path
                                && selectedEndpoint?.method.toLowerCase() === ep.method.toLowerCase()
                                && !showHome && !showSchemaExplorer && !showAbout;
                            const summary = ep.operation?.summary || ep.path;
                            return (
                                <Tip key={`${ep.method}-${ep.path}`} content={summary} placement="right">
                                    <button
                                        ref={el => { endpointRefs.current[`${ep.method.toLowerCase()}:${ep.path}`] = el; }}
                                        onClick={navTo(() => onSelectEndpoint(ep.path, ep.method))}
                                        className={clsx(
                                            'block w-full font-medium ps-2 pe-2 py-1.5 rounded-lg text-left transition-all cursor-pointer select-none min-w-0',
                                            isSelected ? 'bg-[var(--primary)]/90 text-[var(--primary-contrast)]' : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                        )}>
                                        <div className="flex items-center gap-1.5 min-w-0 w-full">
                                            <MethodBadge method={ep.method.toLowerCase()} size="xs" className={clsx('w-9 h-3.5 shrink-0', isSelected && '!bg-[var(--primary-contrast)]/20 !text-[var(--primary-contrast)] !border-[var(--primary-contrast)]/30')} />
                                            <span className={clsx('min-w-0 flex-1 text-[11px] truncate', ep.operation?.deprecated && 'line-through opacity-70')}>
                                                {summary}
                                            </span>
                                            {ep.operation?.deprecated && <Tip content="Deprecated endpoint"><i className={clsx('ph ph-warning-circle text-[12px] shrink-0', isSelected ? 'text-[var(--primary-contrast)]/80' : 'text-[var(--method-put)]/90')} /></Tip>}
                                            {ep.isProtected && <Tip content="Requires authentication"><i className={clsx('ph-fill ph-lock-key text-[12px] shrink-0', isSelected ? 'text-[var(--primary-contrast)]/80' : 'text-[var(--method-delete)]/80')} /></Tip>}
                                        </div>
                                    </button>
                                </Tip>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    // ----------- Collapsed icon rail (desktop only) -----------
    if (!isMobile && isCollapsed) {
        return (
            <div className="h-full flex flex-col items-center border-r select-none shrink-0 bg-[var(--sidebar)] border-[var(--border)]" style={{ width: 56 }}>
                <div className="flex-1 flex flex-col gap-1.5 my-2 items-center">
                    <Tip content="Overview"><button onClick={onOpenHome}
                        className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            isOverview ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                        <i className="ph-fill ph-house text-[16px]"></i>
                    </button></Tip>
                    <Tip content="Schema Explorer"><button onClick={onOpenSchemaExplorer}
                        className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showSchemaExplorer ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                        <i className="ph-fill ph-diamonds-four text-[16px]"></i>
                    </button></Tip>
                    <Tip content="About"><button onClick={onOpenAbout}
                        className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showAbout ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                        <i className="ph ph-info text-[18px]"></i>
                    </button></Tip>
                </div>
                <div className="my-2 flex flex-col items-center gap-0.5 text-[var(--text-muted)]">
                    <Tip content="By Pejman Chatrrouz on GitHub">
                        <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[var(--text-muted)]">
                            <i className="ph-fill ph-github-logo text-[18px]"></i>
                        </a>
                    </Tip>
                    <span className="text-[8px] font-mono">{pkg.version}</span>
                </div>
                {/* Vertical signature */}
                <div className="mb-3 flex items-center gap-1 select-none pointer-events-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors pointer-events-auto"
                        style={{ textDecoration: 'none' }}>
                        Pejman Chatrrouz
                    </a>
                    <span className="text-[7px] text-[var(--text-muted)]/70 font-mono">{pkg.version}</span>
                </div>
            </div>
        );
    }

    // ----------- Expanded Sidebar -----------
    const sidebarContent = (
        <div
            ref={sidebarRef}
            className={clsx(
                'h-full flex flex-col overflow-hidden font-sans bg-[var(--sidebar)]',
                isMobile ? 'w-[82vw] max-w-[340px]' : 'relative shrink-0 border-r border-[var(--border)]'
            )}
            style={!isMobile ? { width } : undefined}
        >
            {/* Server / Parsable picker header */}
            <div className="px-3 py-2 border-b shrink-0 border-[var(--border)] space-y-2">
                {isMobile && parsables && onSelectParsable && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">API Specification</label>
                        <CustomDropdown
                            value={selectedParsableKey || ''}
                            onChange={onSelectParsable}
                            options={Object.entries(parsables).map(([k, v]) => ({ value: k, label: v.title || k }))}
                            icon="ph-fill ph-files text-[14px]"
                            className="w-full"
                        />
                    </div>
                )}
                {spec?.servers && spec.servers.length > 0 && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">Active Server</label>
                        <CustomDropdown
                            value={selectedServer}
                            onChange={onSelectServer}
                            options={spec.servers.map(s => ({ value: s.url, label: s.description || s.url }))}
                            icon="ph ph-hard-drives text-[14px]"
                            className="w-full"
                        />
                        <Tip content={selectedServer}>
                            <div className="mt-1 text-[10px] leading-none truncate flex items-center gap-1 text-[var(--text-muted)]">
                                <i className="ph ph-globe text-[12px]"></i>
                                <span className="font-mono select-text truncate">{selectedServer}</span>
                            </div>
                        </Tip>
                    </div>
                )}
            </div>

            {/* API Navigation label */}
            <div className="px-3 pt-3 pb-1 flex items-center justify-between shrink-0">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">API Navigation</label>
            </div>

            {/* Nav scroll area (top fader) */}
            <div
                ref={navScrollRef}
                className={clsx(
                    'flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin relative',
                    navScrolled && 'nav-scroll-fader nav-scroll-fader--scrolled'
                )}
            >
                <Tip content="Overview and statistics">
                    <button onClick={navTo(onOpenHome)}
                        className={clsx('flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none font-medium',
                            isOverview ? 'text-[var(--primary-contrast)] bg-[var(--primary)]' : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}>
                        <i className="ph-fill ph-house text-[14px]"></i>
                        <span>Overview &amp; Statistics</span>
                    </button>
                </Tip>
                <Tip content="About OpenDoc UI">
                    <button onClick={navTo(onOpenAbout)}
                        className={clsx('flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none font-medium',
                            showAbout ? 'text-[var(--primary-contrast)] bg-[var(--primary)]' : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}>
                        <i className="ph-fill ph-info text-[14px]"></i>
                        <span>About OpenDoc UI</span>
                    </button>
                </Tip>
                <div className="pt-1 space-y-0.5">
                    {Object.keys(tagTree.children).length === 0 ? (
                        <p className="text-[11px] italic px-2 text-[var(--text-muted)]">No endpoints found</p>
                    ) : Object.keys(tagTree.children).sort().map(rt => renderTree(tagTree.children[rt], rt))}
                </div>
            </div>

            {/* Schema Explorer button */}
            <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)]">
                <Tip content="Browse all schemas and models">
                    <button onClick={navTo(onOpenSchemaExplorer)}
                        className={clsx('w-full text-left py-2 px-3 flex items-center gap-2.5 transition-all text-xs font-sans group cursor-pointer',
                            showSchemaExplorer ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--sidebar-text)] hover:bg-[var(--surface-hover)]')}>
                        <i className={clsx('ph-fill ph-diamonds-four text-[14px]', showSchemaExplorer ? 'text-[var(--primary-contrast)]' : 'text-[var(--primary)]')}></i>
                        <span>Schema Explorer</span>
                        <span className={clsx('ml-auto text-[10px] font-mono font-bold', showSchemaExplorer ? 'text-[var(--primary-contrast)]' : 'text-[var(--text-muted)]')}>
                            ({spec?.components?.schemas ? Object.keys(spec.components.schemas).length : 0})
                        </span>
                    </button>
                </Tip>
            </div>

            {/* Icons-only toolbar row between schema explorer and footer */}
            <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] px-2 py-2 flex items-center justify-center gap-1.5">
                <Tip content={activeAuth?.activeScheme && activeAuth.activeScheme !== 'none'
                    ? `${activeAuth.activeScheme.toUpperCase()} auth active — click to edit`
                    : 'Authorize'}>
                    <button onClick={navTo(onOpenAuthModal)}
                        className={clsx('size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border hover:bg-[var(--surface-hover)]',
                            activeAuth?.activeScheme && activeAuth.activeScheme !== 'none'
                                ? 'border-[var(--method-get)]/30 text-[var(--method-get)]'
                                : 'border-[var(--border)] text-[var(--text-muted)]')}>
                        <i className={clsx('ph-fill ph-lock-key text-[15px]',
                            activeAuth?.activeScheme && activeAuth.activeScheme !== 'none' ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]')} />
                    </button>
                </Tip>
                <Tip content="Toggle light/dark mode">
                    <button onClick={onToggleThemeMode}
                        className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                        {currentThemeMode === 'dark'
                            ? <i className="ph ph-sun text-[var(--method-put)] text-[15px]"></i>
                            : <i className="ph-fill ph-moon text-[var(--primary)] text-[15px]"></i>}
                    </button>
                </Tip>
                <Tip content="Theme gallery">
                    <button onClick={navTo(onOpenThemeModal)}
                        className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)]">
                        <i className="ph-fill ph-palette text-[15px]" />
                    </button>
                </Tip>
                <Tip content="Download raw specification">
                    <button onClick={onDownloadSpec}
                        className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                        <i className="ph-fill ph-download-simple text-[var(--primary)] text-[15px]"></i>
                    </button>
                </Tip>
                {isMobile && (
                    <Tip content="Close menu">
                        <button onClick={onCloseMobile}
                            className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                            <i className="ph ph-x text-[15px]"></i>
                        </button>
                    </Tip>
                )}
            </div>

            {/* Brand footer */}
            <div className="p-3 border-t shrink-0 flex flex-col gap-2 border-[var(--border)] bg-[var(--background)]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-left text-[11px] leading-normal select-none text-[var(--text-muted)]">
                        By <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                            className="font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors">Pejman Chatrrouz</a>
                    </span>
                    <Tip content="View source on GitHub">
                        <a href="https://github.com/omidgfx/opendoc-ui" target="_blank" rel="noreferrer"
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all text-[var(--primary-contrast)] shrink-0 select-none cursor-pointer bg-[var(--primary)]">
                            <i className="ph-fill ph-github-logo text-[13px]"></i>
                            <span>GitHub</span>
                        </a>
                    </Tip>
                </div>
                <div className="flex items-center justify-between text-[9px] select-none text-[var(--text-muted)]">
                    <span>OpenDoc UI</span>
                    <span className="font-mono">{pkg.version}</span>
                </div>
            </div>

            {!isMobile && (
                <div onMouseDown={onResizeMouseDown}
                    className={clsx("absolute top-0 right-0 w-[4px] h-full cursor-col-resize transition-colors z-10 select-none",
                        isDragging ? "bg-[var(--primary)]" : "bg-transparent hover:bg-[var(--primary)]")} />
            )}
        </div>
    );

    if (isMobile) {
        return (
            <>
                {/* Backdrop — note: no persistent edge shadow; drawer only casts a subtle shadow when open */}
                <div
                    onClick={onCloseMobile}
                    className={clsx(
                        'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
                        mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    )}
                />
                <div
                    className={clsx(
                        'fixed top-0 left-0 h-full z-50 shadow-[4px_0_20px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out',
                        mobileOpen ? 'translate-x-0' : '-translate-x-full'
                    )}
                    aria-hidden={!mobileOpen}
                >
                    {sidebarContent}
                </div>
            </>
        );
    }

    return sidebarContent;
}
