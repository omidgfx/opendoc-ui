import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';
import type {OpenApiSpec, ParsableConfig, ThemeMode} from '../../../types';
import type {ViewTabKind} from '../../endpoint/EndpointTabs';
import {useBreakpoint} from '../../../hooks/useBreakpoint';
import {useSwipeEdgeOpen} from '../../../hooks/useSwipeOpen';
import CustomDropdown from '../../common/CustomDropdown';
import MethodBadge from '../../common/MethodBadge';
import {Tip} from '../../common/Tooltip';
import ApiSpecificationSelectorModal from '../../modals/ApiSpecificationSelectorModal';
import type {LocalHistoryEntry} from '../../../utils/localHistory';
import {specStorage, uiStorage} from '../../../utils/storage';
import pkg from '../../../../package.json';

interface TreeNode {
    name: string;
    children: Record<string, TreeNode>;
    endpoints: Array<{ path: string; method: string; operation: any; isProtected: boolean }>;
}

type SidebarSortBy = 'name' | 'method' | 'route';
type SidebarSortDirection = 'asc' | 'desc';
type SidebarFolderBehavior = 'multiple' | 'single';

interface SidebarConfig {
    displayRoutes: boolean;
    flattenTags: boolean;
    sortBy: SidebarSortBy;
    sortDirection: SidebarSortDirection;
    folderBehavior: SidebarFolderBehavior;
    pagesFirst: boolean;
    compactMethodNames: boolean;
    hideEndpointCount: boolean;
    hideProtectedIcon: boolean;
    hideDeprecatedEndpoints: boolean;
}

const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
    displayRoutes: true,
    flattenTags: false,
    sortBy: 'name',
    sortDirection: 'asc',
    folderBehavior: 'multiple',
    pagesFirst: true,
    compactMethodNames: false,
    hideEndpointCount: false,
    hideProtectedIcon: false,
    hideDeprecatedEndpoints: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const compactMethodLabel = (method: string): string => {
    const labels: Record<string, string> = {
        delete: 'DEL',
        options: 'OPT',
        connect: 'CON',
        trace: 'TRA',
    };
    const normalized = method.toLowerCase();
    return (labels[normalized] || normalized.slice(0, 3)).toUpperCase();
};

function normalizeSidebarConfig(value: Partial<SidebarConfig> | null | undefined): SidebarConfig {
    const displayRoutes = typeof value?.displayRoutes === 'boolean'
        ? value.displayRoutes
        : DEFAULT_SIDEBAR_CONFIG.displayRoutes;
    const requestedSortBy = value?.sortBy === 'method' || value?.sortBy === 'route' || value?.sortBy === 'name'
        ? value.sortBy
        : DEFAULT_SIDEBAR_CONFIG.sortBy;
    return {
        displayRoutes,
        flattenTags: typeof value?.flattenTags === 'boolean' ? value.flattenTags : DEFAULT_SIDEBAR_CONFIG.flattenTags,
        // Only route sorting has no useful meaning while route labels are hidden;
        // method sorting remains available independently of the route display.
        sortBy: !displayRoutes && requestedSortBy === 'route' ? 'name' : requestedSortBy,
        sortDirection: value?.sortDirection === 'desc' || value?.sortDirection === 'asc'
            ? value.sortDirection
            : DEFAULT_SIDEBAR_CONFIG.sortDirection,
        folderBehavior: value?.folderBehavior === 'single' || value?.folderBehavior === 'multiple'
            ? value.folderBehavior
            : DEFAULT_SIDEBAR_CONFIG.folderBehavior,
        pagesFirst: typeof value?.pagesFirst === 'boolean'
            ? value.pagesFirst
            : DEFAULT_SIDEBAR_CONFIG.pagesFirst,
        compactMethodNames: typeof value?.compactMethodNames === 'boolean'
            ? value.compactMethodNames
            : DEFAULT_SIDEBAR_CONFIG.compactMethodNames,
        hideEndpointCount: typeof value?.hideEndpointCount === 'boolean'
            ? value.hideEndpointCount
            : DEFAULT_SIDEBAR_CONFIG.hideEndpointCount,
        hideProtectedIcon: typeof value?.hideProtectedIcon === 'boolean'
            ? value.hideProtectedIcon
            : DEFAULT_SIDEBAR_CONFIG.hideProtectedIcon,
        hideDeprecatedEndpoints: typeof value?.hideDeprecatedEndpoints === 'boolean'
            ? value.hideDeprecatedEndpoints
            : DEFAULT_SIDEBAR_CONFIG.hideDeprecatedEndpoints,
    };
}

function readSidebarConfig(specKey: string): SidebarConfig {
    if (!specKey) return DEFAULT_SIDEBAR_CONFIG;
    const stored = specStorage.getJSON<Partial<SidebarConfig>>(specKey, 'sidebar_config', {}, isRecord);
    return normalizeSidebarConfig(stored);
}

function buildTagTree(spec: OpenApiSpec | null, config: SidebarConfig): TreeNode {
    const root: TreeNode = {name: '', children: {}, endpoints: []};
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
                byTag[tag].push({path: pathStr, method: methodStr, operation: op, isProtected});
            });
        });
    });
    Object.entries(byTag).forEach(([tag, endpoints]) => {
        // In flattened mode the complete tag is one folder label. Otherwise
        // slash-separated tags keep their existing nested folder structure.
        const parts = config.flattenTags ? [tag] : tag.split('/').filter(Boolean);
        let node = root;
        for (const part of (parts.length ? parts : ['General'])) {
            if (!node.children[part]) node.children[part] = {name: part, children: {}, endpoints: []};
            node = node.children[part];
        }
        node.endpoints.push(...endpoints);
    });

    const compareText = (a: string, b: string) => a.localeCompare(b, undefined, {sensitivity: 'base'});
    const direction = config.sortDirection === 'desc' ? -1 : 1;
    const endpointName = (endpoint: TreeNode['endpoints'][number]) => endpoint.operation?.summary || endpoint.path;
    const compareEndpoints = (a: TreeNode['endpoints'][number], b: TreeNode['endpoints'][number]) => {
        const primary = config.sortBy === 'method'
            ? compareText(a.method, b.method)
            : config.sortBy === 'route'
                ? compareText(a.path, b.path)
                : compareText(endpointName(a), endpointName(b));
        if (primary !== 0) return primary * direction;

        // Stable, predictable tie-breakers keep the list deterministic when
        // several operations share a summary or HTTP method.
        const byRoute = compareText(a.path, b.path);
        if (byRoute !== 0) return byRoute * direction;
        return compareText(a.method, b.method) * direction;
    };

    const sort = (n: TreeNode): TreeNode => {
        const sorted: Record<string, TreeNode> = {};
        Object.entries(n.children)
            .sort(([a], [b]) => compareText(a, b) * direction)
            .forEach(([key, child]) => {
                sorted[key] = sort(child);
            });
        n.children = sorted;
        n.endpoints = [...n.endpoints].sort(compareEndpoints);
        return n;
    };
    return sort(root);
}

// Keep only tree branches that still contain endpoints matching the predicate.
function filterTagTree(node: TreeNode, predicate: (ep: TreeNode['endpoints'][number]) => boolean): TreeNode {
    const newChildren: Record<string, TreeNode> = {};
    Object.entries(node.children).forEach(([k, child]) => {
        const filteredChild = filterTagTree(child, predicate);
        if (filteredChild.endpoints.length > 0 || Object.keys(filteredChild.children).length > 0) {
            newChildren[k] = filteredChild;
        }
    });
    return {
        ...node,
        children: newChildren,
        endpoints: node.endpoints.filter(predicate),
    };
}


/** Minimal chevron used as the folder expand/collapse indicator. */
function TreeExpander({collapsed, active}: { collapsed: boolean; active: boolean }) {
    return (
        <i
            className={clsx(
                'ph ph-caret-right text-[12px] shrink-0 transition-transform duration-150',
                !collapsed && 'rotate-90',
                active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]',
            )}
            aria-hidden="true"
        />
    );
}

/** Folder expand/collapse action icon. */
function FolderTreeActionIcon({
                                  direction,
                              }: {
    direction: 'expand' | 'collapse';
}) {
    const swap = direction === 'collapse';

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 256 256"
            aria-hidden="true"
            focusable="false"
        >
            {/* Top chevron */}
            <path
                transform={swap ? 'translate(0 128)' : undefined}
                d="M85.66,85.66L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z"
            />
            {/* Bottom chevron */}
            <path
                transform={swap ? 'translate(0 -128)' : undefined}
                d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Z"
            />
        </svg>
    );
}

/** Height (px) of a single tree row, and the connector geometry that lines up with it. */
// Endpoint rows contain a second, muted line for the concrete route path.
const ROW_HEIGHT = 40;
const ROW_ELBOW_Y = ROW_HEIGHT / 2;
const GUIDE_X = 13;
const ELBOW_W = 11;

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
    getEndpointHref?: (path: string, method: string) => string;
    onMiddleClickEndpoint?: (path: string, method: string) => void;
    onOpenHome: () => void;
    onOpenAbout: () => void;
    scrollIntent: { type: 'endpoint' | 'view'; id: string } | null;
    setScrollIntent: (v: { type: 'endpoint' | 'view'; id: string } | null) => void;
    onOpenViewPermanent: (view: ViewTabKind) => void;
    onContextAction: (action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai',
                      target: { type: 'endpoint'; path: string; method: string } | {
                          type: 'view';
                          view: ViewTabKind
                      }) => void;
    showHome: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    assistantContextEndpoints: Array<{ path: string; method: string }>;
    hasAIProfile: boolean;
    themeMode: ThemeMode;
    resolvedThemeMode: 'light' | 'dark';
    onToggleThemeMode: () => void;
    selectedThemeName: string;
    onOpenThemeModal: () => void;
    onOpenAuthModal: () => void;
    activeAuth: any;
    onDownloadSpec: () => void;
    isLocalMode: boolean;
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    onDisplayRoutesChange?: (displayRoutes: boolean) => void;
    onReloadSpecification: (key: string) => void | Promise<void>;
    onResetSpecification: (key: string) => void;
    onResetAllConfigurations: () => void;
    onRefreshSpec: () => void;
    isRefreshingSpec: boolean;
    localHistory: LocalHistoryEntry[];
    onSelectHistoryEntry: (entry: LocalHistoryEntry) => void;
    onRemoveHistoryEntry: (key: string) => void;
    onClearHistory: () => void;
    localOpenError: string | null;
    onDismissLocalError: () => void;
    mobileOpen: boolean;
    onCloseMobile: () => void;
    onOpenMobile: () => void;
}

function SearchHighlightedText({text, query, deprecated = false}: {
    text: string;
    query: string;
    deprecated?: boolean
}) {
    const terms = query.trim().split(/[\s._-]+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) return <span
        className={clsx('truncate', deprecated && 'opacity-70 line-through')}>{text}</span>;
    const regex = new RegExp(`(${terms.join('|')})`, 'iu');
    const splitRegex = new RegExp(`(${terms.join('|')})`, 'giu');
    const parts = text.split(splitRegex);
    return (
        <span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>
            {parts.map((part, index) => regex.test(part) ?
                <mark key={`${part}-${index}`} className="rounded-sm bg-[var(--highlight)] text-inherit">{part}</mark> :
                <span key={`${part}-${index}`}>{part}</span>)}
        </span>
    );
}

export default function Sidebar(props: SidebarProps) {
    const {
        spec,
        parsables,
        selectedParsableKey,
        onSelectParsable,
        selectedServer,
        onSelectServer,
        isCollapsed,
        onToggleCollapse,
        onOpenSchemaExplorer,
        showSchemaExplorer,
        selectedMethods,
        selectedTags,
        onlyProtected,
        searchQuery,
        selectedEndpoint,
        onSelectEndpoint,
        onMiddleClickEndpoint,
        getEndpointHref,
        onOpenHome,
        onOpenAbout,
        onOpenViewPermanent,
        onContextAction,
        scrollIntent,
        setScrollIntent,
        showHome,
        showAbout,
        themeMode,
        resolvedThemeMode,
        onToggleThemeMode,
        onOpenThemeModal,
        onOpenAuthModal,
        activeAuth,
        showAssistant,
        assistantContextEndpoints,
        hasAIProfile,
        onDownloadSpec,
        isLocalMode,
        canOpenLocal,
        onOpenLocalFile,
        onDisplayRoutesChange,
        onReloadSpecification,
        onResetSpecification,
        onResetAllConfigurations,
        onRefreshSpec,
        isRefreshingSpec,
        localHistory,
        onSelectHistoryEntry,
        onRemoveHistoryEntry,
        onClearHistory,
        localOpenError,
        onDismissLocalError,
        mobileOpen,
        onCloseMobile,
        onOpenMobile,
    } = props;

    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    const [width, setWidth] = useState<number>(() => {
        const saved = uiStorage.getJSON<number>('sidebar_width', 280, (v) => Number.isFinite(v));
        return Math.max(220, Math.min(480, saved));
    });
    useEffect(() => {
        if (!isMobile) uiStorage.setJSON('sidebar_width', Math.round(width));
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

    const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>(() =>
        uiStorage.getJSON<Record<string, boolean>>('collapsed_tags', {}, (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(value => typeof value === 'boolean')),
    );

    const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const [folderBehaviorMenuOpen, setFolderBehaviorMenuOpen] = useState(false);
    const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
    const settingsMenuRef = useRef<HTMLDivElement | null>(null);
    const sortMenuItemRef = useRef<HTMLDivElement | null>(null);
    const folderBehaviorItemRef = useRef<HTMLDivElement | null>(null);
    const sortCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [settingsMenuPosition, setSettingsMenuPosition] = useState({top: 0, left: 0});
    const [sortMenuPosition, setSortMenuPosition] = useState({top: 0, left: 0});
    const [folderBehaviorMenuPosition, setFolderBehaviorMenuPosition] = useState({top: 0, left: 0});

    // Navigation presentation is kept separately for every API specification.
    // The defaults intentionally preserve the original sidebar appearance.
    const [sidebarConfig, setSidebarConfig] = useState<SidebarConfig>(() =>
        readSidebarConfig(selectedParsableKey || ''),
    );
    useEffect(() => {
        if (sortCloseTimerRef.current) {
            clearTimeout(sortCloseTimerRef.current);
            sortCloseTimerRef.current = null;
        }
        setSidebarConfig(readSidebarConfig(selectedParsableKey || ''));
        setSettingsMenuOpen(false);
        setSortMenuOpen(false);
        setFolderBehaviorMenuOpen(false);
    }, [selectedParsableKey]);

    useEffect(() => {
        if (selectedParsableKey) onDisplayRoutesChange?.(sidebarConfig.displayRoutes);
    }, [sidebarConfig.displayRoutes, selectedParsableKey, onDisplayRoutesChange]);

    const updateSidebarConfig = (patch: Partial<SidebarConfig>) => {
        setSidebarConfig(current => {
            const next = normalizeSidebarConfig({...current, ...patch});
            if (selectedParsableKey) specStorage.setJSON(selectedParsableKey, 'sidebar_config', next);
            return next;
        });
    };

    const clearSortCloseTimer = () => {
        if (sortCloseTimerRef.current) {
            clearTimeout(sortCloseTimerRef.current);
            sortCloseTimerRef.current = null;
        }
    };

    const closeSortMenu = () => {
        clearSortCloseTimer();
        setSortMenuOpen(false);
    };

    const closeFolderBehaviorMenu = () => {
        setFolderBehaviorMenuOpen(false);
    };

    const closeAllSubmenus = () => {
        closeSortMenu();
        closeFolderBehaviorMenu();
    };

    const scheduleSortMenuClose = () => {
        clearSortCloseTimer();
        sortCloseTimerRef.current = setTimeout(() => {
            sortCloseTimerRef.current = null;
            setSortMenuOpen(false);
        }, 140);
    };

    const openSettingsMenu = () => {
        const rect = settingsButtonRef.current?.getBoundingClientRect();
        if (rect) {
            const menuWidth = 252;
            const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
            const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 370));
            setSettingsMenuPosition({top, left});
        }
        closeAllSubmenus();
        setSettingsMenuOpen(true);
    };

    const toggleSettingsMenu = () => {
        if (settingsMenuOpen) {
            setSettingsMenuOpen(false);
            closeAllSubmenus();
        } else {
            openSettingsMenu();
        }
    };

    const openSortMenu = () => {
        clearSortCloseTimer();
        const rect = sortMenuItemRef.current?.getBoundingClientRect();
        if (rect) {
            const menuWidth = 174;
            const openRight = rect.right + 4;
            const left = openRight + menuWidth <= window.innerWidth - 8
                ? openRight
                : Math.max(8, rect.left - menuWidth - 4);
            const top = Math.max(8, Math.min(rect.top, window.innerHeight - 220));
            setSortMenuPosition({top, left});
        }
        closeFolderBehaviorMenu();
        setSortMenuOpen(true);
    };

    const openFolderBehaviorMenu = () => {
        const rect = folderBehaviorItemRef.current?.getBoundingClientRect();
        if (rect) {
            const menuWidth = 218;
            const openRight = rect.right + 4;
            const left = openRight + menuWidth <= window.innerWidth - 8
                ? openRight
                : Math.max(8, rect.left - menuWidth - 4);
            const top = Math.max(8, Math.min(rect.top, window.innerHeight - 150));
            setFolderBehaviorMenuPosition({top, left});
        }
        closeSortMenu();
        setFolderBehaviorMenuOpen(true);
    };

    useEffect(() => {
        if (!settingsMenuOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (settingsMenuRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) return;
            setSettingsMenuOpen(false);
            closeAllSubmenus();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSettingsMenuOpen(false);
                closeAllSubmenus();
            }
        };
        const closeOnViewportChange = () => {
            setSettingsMenuOpen(false);
            closeAllSubmenus();
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', closeOnViewportChange);
        window.addEventListener('scroll', closeOnViewportChange, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', closeOnViewportChange);
            window.removeEventListener('scroll', closeOnViewportChange, true);
            clearSortCloseTimer();
        };
    }, [settingsMenuOpen]);

    const tagTree = useMemo(() => buildTagTree(spec, sidebarConfig), [spec, sidebarConfig]);

    // Search / advanced-filter aware tree, mirrors the Search Results page's matching logic.
    const hasActiveSidebarFilters = !!searchQuery.trim() || selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
    const hasEndpointVisibilityFilter = hasActiveSidebarFilters || sidebarConfig.hideDeprecatedEndpoints;
    const visibleTagTree = useMemo(() => {
        if (!hasEndpointVisibilityFilter) return tagTree;
        const query = searchQuery.trim().toLowerCase();
        const terms = query.split(/[\s._-]+/).filter(Boolean);
        const predicate = (ep: TreeNode['endpoints'][number]) => {
            if (sidebarConfig.hideDeprecatedEndpoints && ep.operation?.deprecated) return false;
            const methodUpper = ep.method.toUpperCase();
            const opTags = ep.operation?.tags?.length ? ep.operation.tags : ['General'];
            if (selectedMethods.length > 0 && !selectedMethods.includes(methodUpper)) return false;
            if (selectedTags.length > 0 && !opTags.some((t: string) => selectedTags.includes(t))) return false;
            if (onlyProtected === true && !ep.isProtected) return false;
            if (onlyProtected === false && ep.isProtected) return false;
            if (!query) return true;
            const summary = (ep.operation?.summary || '').toLowerCase();
            const desc = (ep.operation?.description || '').toLowerCase();
            const searchable = [
                ...(sidebarConfig.displayRoutes ? [ep.path.toLowerCase()] : []),
                summary,
                desc,
                ep.method.toLowerCase(),
                ...opTags.map((t: string) => t.toLowerCase()),
            ];
            if (terms.every(term => searchable.some(value => value.includes(term)))) return true;
            if (ep.method.toLowerCase() === query) return true;
            if (opTags.some((t: string) => t.toLowerCase().includes(query))) return true;
            return false;
        };
        return filterTagTree(tagTree, predicate);
    }, [tagTree, hasEndpointVisibilityFilter, searchQuery, selectedMethods, selectedTags, onlyProtected, sidebarConfig.hideDeprecatedEndpoints]);

    const endpointRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

    const navScrollRef = useRef<HTMLDivElement | null>(null);
    const [navScrolled, setNavScrolled] = useState(false);
    useEffect(() => {
        const el = navScrollRef.current;
        if (!el) return;
        const onScroll = () => setNavScrolled(el.scrollTop > 6);
        onScroll();
        el.addEventListener('scroll', onScroll, {passive: true});
        return () => el.removeEventListener('scroll', onScroll);
    }, [spec, tagTree, isCollapsed, isMobile]);

    // Mobile spec selector modal
    const [showSpecModal, setShowSpecModal] = useState(false);

    // Right-click context menu
    const [contextMenu, setContextMenu] = useState<{
        x: number; y: number;
        target: { type: 'endpoint'; path: string; method: string } | { type: 'view'; view: ViewTabKind };
    } | null>(null);

    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [contextMenu]);

    const openContextMenu = (e: React.MouseEvent, target: { type: 'endpoint'; path: string; method: string } | {
        type: 'view';
        view: ViewTabKind
    }) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({x: e.clientX, y: e.clientY, target});
    };

    const countEndpoints = (n: TreeNode): number => {
        let c = n.endpoints.length;
        Object.values(n.children).forEach(ch => {
            c += countEndpoints(ch);
        });
        return c;
    };

    const folderPaths = useMemo(() => {
        const paths: string[] = [];
        const collect = (node: TreeNode, parentPath: string) => {
            Object.entries(node.children).forEach(([name, child]) => {
                const path = parentPath ? `${parentPath}/${name}` : name;
                paths.push(path);
                collect(child, path);
            });
        };
        collect(tagTree, '');
        return paths;
    }, [tagTree]);

    const toggleNode = (path: string) => setCollapsedNodes(prev => {
        const next = {...prev};
        if (sidebarConfig.folderBehavior === 'single' && prev[path]) {
            const parts = path.split('/');
            const keepOpen = new Set<string>();
            for (let i = 1; i <= parts.length; i++) keepOpen.add(parts.slice(0, i).join('/'));
            folderPaths.forEach(folderPath => {
                next[folderPath] = !keepOpen.has(folderPath);
            });
        } else {
            next[path] = !prev[path];
        }
        uiStorage.setJSON('collapsed_tags', next);
        return next;
    });

    const setAllFoldersCollapsed = (collapsed: boolean) => {
        setCollapsedNodes(current => {
            const next = {...current};
            folderPaths.forEach(path => {
                next[path] = collapsed;
            });
            uiStorage.setJSON('collapsed_tags', next);
            return next;
        });
    };

    const updateFolderBehavior = (behavior: SidebarFolderBehavior) => {
        updateSidebarConfig({folderBehavior: behavior});
        if (behavior === 'single') setAllFoldersCollapsed(true);
        closeFolderBehaviorMenu();
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
            const next = {...curr};
            toExpand.forEach(p => {
                if (next[p]) {
                    next[p] = false;
                    changed = true;
                }
            });
            if (changed) uiStorage.setJSON('collapsed_tags', next);
            return changed ? next : curr;
        });
        const key = `${sm}:${selectedEndpoint.path}`;
        const t = setTimeout(() => endpointRefs.current[key]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        }), 80);
        return () => clearTimeout(t);
    }, [selectedEndpoint, tagTree, isCollapsed, isMobile]);

    // Scroll to the clicked nav item (Overview/Search/About/Schema Explorer) —
    // same behavior endpoints have via endpointRefs.
    useEffect(() => {
        if (!scrollIntent) return;
        const {type, id} = scrollIntent;
        const t = setTimeout(() => {
            if (type === 'endpoint') {
                endpointRefs.current[id]?.scrollIntoView({behavior: 'smooth', block: 'center'});
            } else {
                const el = navScrollRef.current?.querySelector(`[data-nav-view="${id}"]`);
                (el as HTMLElement | null)?.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
            setScrollIntent(null);
        }, 80);
        return () => clearTimeout(t);
    }, [scrollIntent, setScrollIntent]);

    useSwipeEdgeOpen(isMobile && !mobileOpen, onOpenMobile);

    const isOverview = showHome && !showSchemaExplorer && !showAbout && !selectedEndpoint;

    // Folder path from root to the folder holding the selected endpoint.
    const findEndpointAncestorPath = useMemo((): string[] | null => {
        if (!selectedEndpoint) return null;
        if (showHome || showSchemaExplorer || showAbout) return null;
        const sm = selectedEndpoint.method.toLowerCase();
        const search = (node: TreeNode, parts: string[]): string[] | null => {
            const directHit = node.endpoints.some(
                e => e.path === selectedEndpoint.path && e.method.toLowerCase() === sm,
            );
            if (directHit && parts.length > 0) return parts;
            for (const [childName, childNode] of Object.entries(node.children)) {
                const result = search(childNode, [...parts, childName]);
                if (result) return result;
            }
            return null;
        };
        return search(visibleTagTree, []);
    }, [selectedEndpoint, visibleTagTree, showHome, showSchemaExplorer, showAbout]);

    // Node paths that are ancestors of the selected endpoint (colored guide lines).
    const ancestorNodePaths = useMemo((): Set<string> => {
        const s = new Set<string>();
        if (!findEndpointAncestorPath) return s;
        for (let i = 0; i < findEndpointAncestorPath.length; i++) {
            s.add(findEndpointAncestorPath.slice(0, i + 1).join('/'));
        }
        return s;
    }, [findEndpointAncestorPath]);

    // Only the folder that actually holds the selection lights up its connector,
    // so an endpoint listed under several tags does not highlight every copy.
    const selectedLeafFolderPath = useMemo(
        () => (findEndpointAncestorPath ? findEndpointAncestorPath.join('/') : null),
        [findEndpointAncestorPath],
    );

    const navTo = (fn: () => void) => () => {
        fn();
        if (isMobile) onCloseMobile();
    };

    const renderTree = (node: TreeNode, nodePath: string) => {
        // Keep folder toggles interactive even while search/filters are active.
        const collapsed = !!collapsedNodes[nodePath];
        const childNames = Object.keys(node.children);
        const total = countEndpoints(node);
        const isAncestor = ancestorNodePaths.has(nodePath);
        if (!childNames.length && !node.endpoints.length) return null;

        // Flat row list (folders first, then endpoints) so guide lines know which
        // row is last and which one continues the path to the selection.
        type Row =
            | { kind: 'folder'; key: string; childName: string; childPath: string; onPath: boolean }
            | { kind: 'endpoint'; key: string; ep: TreeNode['endpoints'][number]; onPath: boolean };

        const endpointIsSelected = (ep: TreeNode['endpoints'][number]) =>
            selectedEndpoint?.path === ep.path
            && selectedEndpoint?.method.toLowerCase() === ep.method.toLowerCase()
            && !showHome && !showSchemaExplorer && !showAbout;

        // Skip folders that would render nothing (they'd leave an orphan elbow).
        const isRenderable = (n: TreeNode): boolean =>
            n.endpoints.length > 0 || Object.values(n.children).some(isRenderable);

        const rows: Row[] = [
            ...childNames.filter(cn => isRenderable(node.children[cn])).map((cn): Row => {
                const childPath = nodePath ? `${nodePath}/${cn}` : cn;
                return {
                    kind: 'folder',
                    key: `d:${childPath}`,
                    childName: cn,
                    childPath,
                    onPath: ancestorNodePaths.has(childPath),
                };
            }),
            ...node.endpoints.map((ep): Row => ({
                kind: 'endpoint',
                key: `e:${ep.method}-${ep.path}`,
                ep,
                // Only the folder that actually *holds* the selection lights up its
                // endpoint connector — an endpoint duplicated under another tag
                // must stay neutral.
                onPath: nodePath === selectedLeafFolderPath && endpointIsSelected(ep),
            })),
        ];

        // Index of the row that carries the path to the selected endpoint.
        const pathRowIndex = rows.findIndex(r => r.onPath);

        // Guide-line pieces for row i, as absolutely positioned spans.
        const renderGuides = (i: number, onPath: boolean) => {
            const isLastRow = i === rows.length - 1;
            // Accent runs from the top of the children area down to the row on the
            // selection path: full height above it, just an elbow on it, none below.
            const accent = pathRowIndex < 0 ? 'none' : i < pathRowIndex ? 'full' : i === pathRowIndex ? 'elbow' : 'none';
            return (
                <>

                    {/* horizontal elbow — accented only for the row on the path */}
                    <span
                        className={clsx('absolute h-px', onPath ? 'bg-[var(--primary)]' : 'bg-[var(--text)]/25')}
                        style={{left: -GUIDE_X + 1, top: ROW_ELBOW_Y, width: ELBOW_W}}
                        aria-hidden="true"
                    />
                    {/* neutral vertical guide, ends at the elbow on the last row */}
                    <span
                        className="absolute top-0 w-px bg-[var(--text)]/25"
                        style={{left: -GUIDE_X, ...(isLastRow ? {height: ROW_ELBOW_Y + 1} : {bottom: 0})}}
                        aria-hidden="true"
                    />
                    {/* accent guide painted over the neutral one */}
                    {accent !== 'none' && (
                        <span
                            className="absolute top-0 w-px bg-[var(--primary)]"
                            style={{left: -GUIDE_X, ...(accent === 'full' ? {bottom: 0} : {height: ROW_ELBOW_Y + 1})}}
                            aria-hidden="true"
                        />
                    )}
                </>
            );
        };

        return (
            <div key={nodePath} className="relative animate-in fade-in duration-150">
                {/* Folder button; only the +/- indicator reacts to the selection path. */}
                <button onClick={() => toggleNode(nodePath)}
                        className="w-full py-1 text-[11px] font-medium px-1 flex items-center gap-1.5 hover:bg-[var(--surface-hover)] rounded-md transition-colors cursor-pointer text-left focus:outline-none">
                    {/* +/- indicator (single SVG: box + glyph) */}
                    <TreeExpander collapsed={collapsed} active={isAncestor}/>
                    <i className={clsx('text-[16px] shrink-0 text-[var(--method-put)]',
                        collapsed ? 'ph-fill ph-folder-simple' : 'ph-fill ph-folder-open')}/>
                    <span className="truncate min-w-0">
                        <SearchHighlightedText text={node.name} query={searchQuery}/>
                    </span>
                    {!sidebarConfig.hideEndpointCount && (
                        <span
                            className="ms-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0 bg-[var(--text)]/10 text-[var(--text)]/80">{total}</span>
                    )}
                </button>

                {/* Guide lines are drawn per row so the last one ends at its elbow. */}
                {!collapsed && (
                    <div className="relative ml-[9px] pl-[13px]">
                        {rows.map((row, idx) => {
                            if (row.kind === 'folder') {
                                return (
                                    <div key={row.key} className="relative">
                                        {renderGuides(idx, row.onPath)}
                                        {renderTree(node.children[row.childName], row.childPath)}
                                    </div>
                                );
                            }

                            const ep = row.ep;
                            const isSelected = endpointIsSelected(ep);
                            const isAITargeted = showAssistant && assistantContextEndpoints.some(endpoint => endpoint.path === ep.path && endpoint.method.toLowerCase() === ep.method.toLowerCase());
                            const summary = ep.operation?.summary || ep.path;
                            return (
                                <div key={row.key} className="relative">
                                    {renderGuides(idx, row.onPath)}
                                    <Tip content={summary} placement="right" fullWidth>
                                        <a
                                            href={getEndpointHref?.(ep.path, ep.method) || `#${ep.method}:${ep.path}`}
                                            ref={el => {
                                                endpointRefs.current[`${ep.method.toLowerCase()}:${ep.path}`] = el;
                                            }}
                                            onClick={(e) => {
                                                if (e.ctrlKey || e.metaKey) {
                                                    e.preventDefault();
                                                    onMiddleClickEndpoint?.(ep.path, ep.method);
                                                } else if (e.altKey) {
                                                    e.preventDefault();
                                                    window.open(getEndpointHref?.(ep.path, ep.method) || e.currentTarget.href, '_blank', 'noopener,noreferrer');
                                                } else {
                                                    e.preventDefault();
                                                    navTo(() => onSelectEndpoint(ep.path, ep.method))();
                                                }
                                            }}
                                            onContextMenu={(e) => openContextMenu(e, {
                                                type: 'endpoint',
                                                path: ep.path,
                                                method: ep.method
                                            })}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (onMiddleClickEndpoint) {
                                                    onMiddleClickEndpoint(ep.path, ep.method);
                                                }
                                            }}
                                            onMouseDown={(e) => {
                                                // Suppress the browser's default auxiliary-link behavior;
                                                // the endpoint should open in an internal permanent tab.
                                                if (e.button === 1) e.preventDefault();
                                            }}
                                            onAuxClick={(e) => {
                                                if (e.button !== 1) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onMiddleClickEndpoint?.(ep.path, ep.method);
                                            }}
                                            className={clsx(
                                                'flex items-center w-full py-1.5 font-medium ps-2 pe-2 rounded-lg text-left transition-all cursor-pointer select-none min-w-0',
                                                isSelected ? 'bg-[var(--primary)]/90 text-[var(--primary-contrast)]' : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                            )}>
                                            <div className="flex items-center gap-1.5 min-w-0 w-full">
                                                <Tip content={ep.method.toUpperCase()} placement="top">
                                                    <MethodBadge
                                                        method={ep.method.toLowerCase()}
                                                        displayLabel={sidebarConfig.compactMethodNames ? compactMethodLabel(ep.method) : undefined}
                                                        size="xs"
                                                        className={clsx(
                                                            sidebarConfig.compactMethodNames ? 'w-5 h-4 !px-0' : 'w-9 h-4',
                                                            'shrink-0',
                                                            isSelected && '!bg-[var(--primary-contrast)]/20 !text-[var(--primary-contrast)] !border-[var(--primary-contrast)]/30',
                                                        )}/>
                                                </Tip>
                                                {isAITargeted && <Tip content="Targeted in AI assistant"><i
                                                    className="ph ph-crosshair shrink-0 text-[13px] text-[var(--primary)]"
                                                    aria-label="Targeted in AI assistant"/></Tip>}
                                                <div
                                                    className="min-w-0 grow flex flex-col justify-center leading-[1.3333]">
                                                    <span className={clsx('min-w-0 truncate text-[11px]')}>
                                                        <SearchHighlightedText text={summary} query={searchQuery}
                                                                               deprecated={!!ep.operation?.deprecated}/>
                                                    </span>
                                                    {sidebarConfig.displayRoutes && (
                                                        <span
                                                            className={clsx('min-w-0 truncate mt-1 text-[10px] font-mono tracking-[-0.01em] opacity-80', isSelected ? 'text-[var(--primary-contrast)]/70' : 'text-[var(--text-muted)]')}
                                                            title={ep.path}>
                                                            <SearchHighlightedText text={ep.path} query={searchQuery}/>
                                                        </span>
                                                    )}
                                                </div>
                                                {ep.operation?.deprecated && <Tip content="Deprecated endpoint"><i
                                                    className={clsx('ph ph-warning-circle text-[12px] shrink-0', isSelected ? 'text-[var(--primary-contrast)]/80' : 'text-[var(--method-put)]/90')}/></Tip>}
                                                {ep.isProtected && !sidebarConfig.hideProtectedIcon &&
                                                    <Tip content="Requires authentication"><i
                                                        className={clsx('ph-fill ph-lock-key text-[12px] shrink-0', isSelected ? 'text-[var(--primary-contrast)]/80' : 'text-[var(--method-delete)]/80')}/></Tip>}
                                            </div>
                                        </a>
                                    </Tip>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    // ---------- Collapsed icon rail (desktop only) ----------
    if (!isMobile && isCollapsed) {
        return (
            <div
                className="h-full flex flex-col items-center border-r select-none shrink-0 bg-[var(--sidebar)] border-[var(--border)]"
                style={{width: 56}}>
                <div className="flex-1 flex flex-col gap-1.5 my-2 items-center">
                    <Tip content="Overview">
                        <button onClick={onOpenHome}
                                className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                                    isOverview ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                            <i className="ph-fill ph-house text-[16px]"></i>
                        </button>
                    </Tip>
                    <Tip content="Schema Explorer">
                        <button onClick={onOpenSchemaExplorer}
                                className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                                    showSchemaExplorer ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                            <i className="ph-fill ph-diamonds-four text-[16px]"></i>
                        </button>
                    </Tip>
                    <Tip content="About">
                        <button onClick={onOpenAbout}
                                className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                                    showAbout ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                            <i className="ph-fill ph-info text-[18px]"></i>
                        </button>
                    </Tip>
                </div>
                <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                   className="text-[10px] text-[var(--text-muted)] flex flex-col items-center hover:text-[var(--primary)] transition-colors pointer-events-auto"
                   style={{textDecoration: 'none'}}>
                    <div className="flex flex-col items-start gap-0.125 select-none pointer-events-none"
                         style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)'}}>

                        <div>Pejman Chatrrouz</div>
                        <span className="text-[7px] text-[var(--text-muted)]/70 font-mono">{pkg.version}</span>
                    </div>
                    <div className="mb-2 mt-2 flex flex-col items-center gap-0.5">
                        <Tip content="By Pejman Chatrrouz on GitHub">
                            <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                               className="rounded-xl flex items-center justify-center transition-colors text-inherit">
                                <i className="ph-fill ph-github-logo text-[32px]"></i>
                            </a>
                        </Tip>
                    </div>
                </a>
            </div>
        );
    }

    // Keep the built-in pages as one group so the user can place them either
    // before or after the endpoint folders.
    const pageNavigation = (
        <>
            <Tip content="Overview and statistics">
                <button data-nav-view="view:home" onClick={navTo(onOpenHome)}
                        onContextMenu={(e) => openContextMenu(e, {type: 'view', view: 'home'})}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenViewPermanent('home');
                        }}
                        onMouseDown={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                onOpenViewPermanent('home');
                            }
                        }}
                        className={clsx('flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none font-medium',
                            isOverview ? 'text-[var(--primary-contrast)] bg-[var(--primary)]' : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}>
                    <i className="ph-fill ph-house text-[14px]"></i>
                    <span>Overview &amp; Statistics</span>
                </button>
            </Tip>
            <Tip content="About OpenDoc UI">
                <button data-nav-view="view:about" onClick={navTo(onOpenAbout)}
                        onContextMenu={(e) => openContextMenu(e, {type: 'view', view: 'about'})}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenViewPermanent('about');
                        }}
                        onMouseDown={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                onOpenViewPermanent('about');
                            }
                        }}
                        className={clsx('flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none font-medium',
                            showAbout ? 'text-[var(--primary-contrast)] bg-[var(--primary)]' : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}>
                    <i className="ph-fill ph-info text-[14px]"></i>
                    <span>About OpenDoc UI</span>
                </button>
            </Tip>
            <Tip content="Browse all schemas and models">
                <button data-nav-view="view:schemas" onClick={navTo(onOpenSchemaExplorer)}
                        onContextMenu={(e) => openContextMenu(e, {type: 'view', view: 'schemas'})}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenViewPermanent('schemas');
                        }}
                        onMouseDown={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                onOpenViewPermanent('schemas');
                            }
                        }}
                        className={clsx('flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none font-medium',
                            showSchemaExplorer ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--sidebar-text)] hover:bg-[var(--surface-hover)]')}>
                    <i className="ph-fill ph-diamonds-four text-[14px]"></i>
                    <span>Schema Explorer</span>
                    <span
                        className={clsx('ml-auto text-[10px] font-mono font-bold', showSchemaExplorer ? 'text-[var(--primary-contrast)]' : 'text-[var(--text-muted)]')}>
                        ({spec?.components?.schemas ? Object.keys(spec.components.schemas).length : 0})
                    </span>
                </button>
            </Tip>
        </>
    );

    const endpointNavigation = (
        <div className="pt-1">
            {Object.keys(visibleTagTree.children).length === 0 ? (
                <p className="text-[11px] italic px-2 text-[var(--text-muted)]">
                    {hasEndpointVisibilityFilter ? 'No endpoints match your search/filters' : 'No endpoints found'}
                </p>
            ) : Object.keys(visibleTagTree.children).map(rt => renderTree(visibleTagTree.children[rt], rt))}
        </div>
    );

    // ----------- Expanded Sidebar -----------
    const sidebarContent = (
        <div
            ref={sidebarRef}
            className={clsx(
                'h-full flex flex-col overflow-hidden font-sans bg-[var(--sidebar)]',
                isMobile ? 'w-[82vw] max-w-[340px]' : 'relative shrink-0 border-r border-[var(--border)]'
            )}
            style={!isMobile ? {width} : undefined}
        >
            {/* Icons-only toolbar row — mobile/tablet ONLY */}
            {isMobile && (
                <div
                    className="shrink-0 border-b border-[var(--border)] bg-[var(--sidebar)] px-2 py-2 flex items-center gap-1.5">
                    <Tip content="Switch API specification">
                        <button onClick={() => setShowSpecModal(true)}
                                className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)]">
                            <i className="ph-fill ph-files text-[15px]"/>
                        </button>
                    </Tip>
                    <Tip content={activeAuth?.activeScheme && activeAuth.activeScheme !== 'none'
                        ? `${activeAuth.activeScheme.toUpperCase()} auth active` : 'Authorize'}>
                        <button onClick={navTo(onOpenAuthModal)}
                                className={clsx('size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border hover:bg-[var(--surface-hover)]',
                                    activeAuth?.activeScheme && activeAuth.activeScheme !== 'none'
                                        ? 'border-[var(--method-get)]/30 text-[var(--method-get)]'
                                        : 'border-[var(--border)] text-[var(--text-muted)]')}>
                            <i className={clsx('ph-fill ph-lock-key text-[15px]')}/>
                        </button>
                    </Tip>
                    <Tip content="Toggle light/dark mode">
                        <button onClick={onToggleThemeMode}
                                className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                            {themeMode === 'system'
                                ? <i className="ph ph-monitor text-[var(--accent)] text-[15px]"></i>
                                : themeMode === 'dark'
                                    ? <i className="ph ph-sun text-[var(--method-put)] text-[15px]"></i>
                                    : <i className="ph-fill ph-moon text-[var(--primary)] text-[15px]"></i>}
                        </button>
                    </Tip>
                    <Tip content="Theme gallery">
                        <button onClick={navTo(onOpenThemeModal)}
                                className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)]">
                            <i className="ph-fill ph-palette text-[15px]"/>
                        </button>
                    </Tip>
                    <Tip content="Reload specification (drop cache)">
                        <button onClick={onRefreshSpec}
                                className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                            <i className={`ph-fill ph-arrows-clockwise text-[var(--primary)] text-[15px] ${isRefreshingSpec ? 'animate-spin' : ''}`}/>
                        </button>
                    </Tip>
                    <Tip content="Download raw specification">
                        <button onClick={onDownloadSpec}
                                className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                            <i className="ph-fill ph-download-simple text-[var(--primary)] text-[15px]"></i>
                        </button>
                    </Tip>
                    <Tip content="Close menu">
                        <button onClick={onCloseMobile}
                                className="size-9 ms-auto rounded-lg flex items-center justify-center transition-all cursor-pointer text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)]">
                            <i className="ph ph-x text-[15px]"></i>
                        </button>
                    </Tip>
                </div>
            )}

            {/* Server picker header */}
            <div className="px-3 py-1 border-b shrink-0 border-[var(--border)] space-y-2">
                {spec?.servers && spec.servers.length > 0 && (
                    <div>
                        <label
                            className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">Active
                            Server</label>
                        <CustomDropdown value={selectedServer} onChange={onSelectServer}
                                        options={spec.servers.map(s => ({value: s.url, label: s.description || s.url}))}
                                        icon="ph ph-hard-drives text-[14px]" className="w-full"/>
                        <Tip content={selectedServer}>
                            <div
                                className="mt-1 text-[10px] leading-none truncate flex items-center gap-1 text-[var(--text-muted)]">
                                <i className="ph ph-globe text-[12px]"></i>
                                <span className="font-mono select-text truncate">{selectedServer}</span>
                            </div>
                        </Tip>
                    </div>
                )}
            </div>

            <div className="relative z-20 px-3 pt-1 pb-0 flex items-center justify-between gap-2 shrink-0">
                <label
                    className="block min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">API
                    Navigation</label>
                <div className="flex items-center gap-0.5 shrink-0">
                    {sidebarConfig.folderBehavior === 'multiple' && (
                        <>
                            <Tip content="Collapse all folders">
                                <button
                                    type="button"
                                    aria-label="Collapse all folders"
                                    disabled={folderPaths.length === 0}
                                    onClick={() => setAllFoldersCollapsed(true)}
                                    className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] disabled:opacity-35 disabled:cursor-not-allowed">
                                    <FolderTreeActionIcon direction="collapse"/>
                                </button>
                            </Tip>
                            <Tip content="Expand all folders">
                                <button
                                    type="button"
                                    aria-label="Expand all folders"
                                    disabled={folderPaths.length === 0}
                                    onClick={() => setAllFoldersCollapsed(false)}
                                    className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] disabled:opacity-35 disabled:cursor-not-allowed">
                                    <FolderTreeActionIcon direction="expand"/>
                                </button>
                            </Tip>
                        </>
                    )}
                    <Tip content="Navigation settings">
                        <button
                            ref={settingsButtonRef}
                            type="button"
                            aria-label="Navigation settings"
                            aria-expanded={settingsMenuOpen}
                            aria-haspopup="menu"
                            onClick={toggleSettingsMenu}
                            className={clsx('w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer',
                                settingsMenuOpen
                                    ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]')}>
                            <i className="ph ph-gear-six text-[13px]"/>
                        </button>
                    </Tip>
                </div>
            </div>

            {settingsMenuOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={settingsMenuRef}
                    role="menu"
                    aria-label="API navigation settings"
                    className="fixed z-[10000] w-[252px] rounded-xl border shadow-2xl py-1.5 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] animate-fade-in"
                    style={{top: settingsMenuPosition.top, left: settingsMenuPosition.left}}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <div
                        className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                        Navigation settings
                    </div>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.displayRoutes}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({displayRoutes: !sidebarConfig.displayRoutes});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-path text-[14px] text-[var(--primary)] shrink-0"/>
                        <span className="flex-1 min-w-0">Show endpoint routes</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.displayRoutes ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.flattenTags}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({flattenTags: !sidebarConfig.flattenTags});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-arrows-out-line-horizontal text-[14px] text-[var(--primary)] shrink-0"/>
                        <span className="flex-1 min-w-0">Flatten tag folders</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.flattenTags ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.pagesFirst}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({pagesFirst: !sidebarConfig.pagesFirst});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-stack text-[14px] text-[var(--primary)] shrink-0"/>
                        <span className="flex-1 min-w-0">Pages first</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.pagesFirst ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.compactMethodNames}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({compactMethodNames: !sidebarConfig.compactMethodNames});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-text-aa text-[14px] text-[var(--primary)] shrink-0"/>
                        <span className="flex-1 min-w-0">Compact method names</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.compactMethodNames ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>

                    <div ref={folderBehaviorItemRef} className="relative" onMouseLeave={() => {
                        if (!isMobile) closeFolderBehaviorMenu();
                    }}>
                        <button
                            type="button"
                            role="menuitem"
                            aria-haspopup="menu"
                            aria-expanded={folderBehaviorMenuOpen}
                            onMouseEnter={() => {
                                if (!isMobile) openFolderBehaviorMenu();
                            }}
                            onClick={() => {
                                if (isMobile && folderBehaviorMenuOpen) closeFolderBehaviorMenu();
                                else openFolderBehaviorMenu();
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                            <i className="ph ph-tree-structure text-[14px] text-[var(--primary)] shrink-0"/>
                            <span className="flex-1 min-w-0">Tag folder behavior</span>
                            <span
                                className="text-[10px] text-[var(--text-muted)]">{sidebarConfig.folderBehavior === 'single' ? 'Single open' : 'Multiple open'}</span>
                            <i className="ph ph-caret-right text-[11px] text-[var(--text-muted)] shrink-0"/>
                        </button>

                        {folderBehaviorMenuOpen && (
                            <div
                                role="menu"
                                aria-label="Tag folder behavior"
                                className="fixed z-[10001] w-[218px] rounded-xl border shadow-2xl py-1 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] animate-fade-in"
                                style={{top: folderBehaviorMenuPosition.top, left: folderBehaviorMenuPosition.left}}
                                onMouseEnter={() => {
                                    if (!isMobile) setFolderBehaviorMenuOpen(true);
                                }}
                                onMouseLeave={() => {
                                    if (!isMobile) closeFolderBehaviorMenu();
                                }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div
                                    className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Tag
                                    folder behavior
                                </div>
                                {([
                                    {
                                        value: 'multiple' as SidebarFolderBehavior,
                                        label: 'Allow multiple tag folders open',
                                        description: 'Folders stay open independently'
                                    },
                                    {
                                        value: 'single' as SidebarFolderBehavior,
                                        label: 'One tag folder open at a time',
                                        description: 'Opening one closes the others'
                                    },
                                ]).map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={sidebarConfig.folderBehavior === option.value}
                                        onClick={() => updateFolderBehavior(option.value)}
                                        className={clsx('w-full text-left px-3 py-2 text-[11px] flex items-start gap-2 transition-colors cursor-pointer hover:bg-[var(--surface-hover)]',
                                            sidebarConfig.folderBehavior === option.value ? 'text-[var(--primary)]' : 'text-[var(--text)]')}>
                                        <i className={clsx('ph ph-check text-[11px] shrink-0 mt-0.5', sidebarConfig.folderBehavior === option.value ? 'opacity-100' : 'opacity-0')}/>
                                        <span className="min-w-0">
                                            <span className="block font-medium">{option.label}</span>
                                            <span
                                                className="block mt-0.5 text-[9px] leading-snug text-[var(--text-muted)]">{option.description}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div ref={sortMenuItemRef} className="relative" onMouseLeave={() => {
                        if (!isMobile) scheduleSortMenuClose();
                    }}>
                        <button
                            type="button"
                            role="menuitem"
                            aria-haspopup="menu"
                            aria-expanded={sortMenuOpen}
                            onMouseEnter={() => {
                                if (!isMobile) openSortMenu();
                            }}
                            onClick={() => {
                                if (isMobile && sortMenuOpen) closeSortMenu();
                                else openSortMenu();
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                            <i className="ph ph-sort-ascending text-[14px] text-[var(--primary)] shrink-0"/>
                            <span className="flex-1 min-w-0">Sort by</span>
                            <span
                                className="text-[10px] text-[var(--text-muted)]">{sidebarConfig.sortBy === 'name' ? 'Name' : sidebarConfig.sortBy === 'method' ? 'Method' : 'Route'}</span>
                            <i className="ph ph-caret-right text-[11px] text-[var(--text-muted)] shrink-0"/>
                        </button>

                        {sortMenuOpen && (
                            <div
                                role="menu"
                                aria-label="Sort API navigation"
                                className="fixed z-[10001] w-[174px] rounded-xl border shadow-2xl py-1 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] animate-fade-in"
                                style={{top: sortMenuPosition.top, left: sortMenuPosition.left}}
                                onMouseEnter={() => {
                                    if (!isMobile) openSortMenu();
                                }}
                                onMouseLeave={() => {
                                    if (!isMobile) scheduleSortMenuClose();
                                }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div
                                    className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Sort
                                    by
                                </div>
                                {([
                                    {value: 'name' as SidebarSortBy, label: 'Name'},
                                    {value: 'method' as SidebarSortBy, label: 'Method'},
                                    {value: 'route' as SidebarSortBy, label: 'Route'},
                                ]).map(option => {
                                    const disabled = option.value === 'route' && !sidebarConfig.displayRoutes;
                                    const selected = sidebarConfig.sortBy === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={selected}
                                            aria-disabled={disabled}
                                            disabled={disabled}
                                            onClick={() => {
                                                if (!disabled) {
                                                    updateSidebarConfig({sortBy: option.value});
                                                    closeSortMenu();
                                                }
                                            }}
                                            className={clsx('w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 transition-colors',
                                                disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer hover:bg-[var(--surface-hover)]',
                                                selected && !disabled ? 'text-[var(--primary)]' : 'text-[var(--text)]')}>
                                            <i className={clsx('ph ph-check text-[11px] shrink-0', selected ? 'opacity-100' : 'opacity-0')}/>
                                            <span className="flex-1">{option.label}</span>
                                            {disabled &&
                                                <i className="ph ph-lock-key text-[10px] text-[var(--text-muted)]"/>}
                                        </button>
                                    );
                                })}
                                <div className="my-1 border-t border-[var(--border)]"/>
                                {([
                                    {value: 'asc' as SidebarSortDirection, label: 'Ascending'},
                                    {value: 'desc' as SidebarSortDirection, label: 'Descending'},
                                ]).map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={sidebarConfig.sortDirection === option.value}
                                        onClick={() => {
                                            updateSidebarConfig({sortDirection: option.value});
                                            closeSortMenu();
                                        }}
                                        className={clsx('w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--surface-hover)]',
                                            sidebarConfig.sortDirection === option.value ? 'text-[var(--primary)]' : 'text-[var(--text)]')}>
                                        <i className={clsx('ph ph-check text-[11px] shrink-0', sidebarConfig.sortDirection === option.value ? 'opacity-100' : 'opacity-0')}/>
                                        <span>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="my-1 border-t border-[var(--border)]"/>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.hideEndpointCount}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({hideEndpointCount: !sidebarConfig.hideEndpointCount});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-hash text-[14px] text-[var(--primary)] shrink-0"/>
                        <span className="flex-1 min-w-0">Hide endpoint counts</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.hideEndpointCount ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.hideProtectedIcon}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({hideProtectedIcon: !sidebarConfig.hideProtectedIcon});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-lock-key text-[14px] text-[var(--method-delete)] shrink-0"/>
                        <span className="flex-1 min-w-0">Hide protected icon</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.hideProtectedIcon ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>

                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={sidebarConfig.hideDeprecatedEndpoints}
                        onClick={() => {
                            closeAllSubmenus();
                            updateSidebarConfig({hideDeprecatedEndpoints: !sidebarConfig.hideDeprecatedEndpoints});
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2">
                        <i className="ph ph-warning-circle text-[14px] text-[var(--method-put)] shrink-0"/>
                        <span className="flex-1 min-w-0">Hide deprecated endpoints</span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            sidebarConfig.hideDeprecatedEndpoints ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}>
                            <i className="ph ph-check text-[11px]"/>
                        </span>
                    </button>
                </div>,
                document.body,
            )}

            <div className="flex-1 relative min-h-0 nav-scroll-wrapper">
                <div
                    ref={navScrollRef}
                    className="h-full overflow-y-auto p-2 space-y-1 scrollbar-thin"
                >
                    {sidebarConfig.pagesFirst ? (
                        <>
                            {pageNavigation}
                            {endpointNavigation}
                        </>
                    ) : (
                        <>
                            {endpointNavigation}
                            {pageNavigation}
                        </>
                    )}
                </div>
                {/* Top fader — visible only when scrolled */}
                <div className={clsx("nav-scroll-top-fader", {
                    'opacity-0': !navScrolled,
                    'opacity-100': navScrolled,
                })} aria-hidden="true"/>
            </div>

            {/* Brand footer */}
            <div
                className="h-[76px] min-h-[76px] box-border p-3 border-t shrink-0 flex flex-col justify-center gap-2 border-[var(--border)] bg-[var(--background)]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-left text-[11px] leading-normal select-none text-[var(--text-muted)]">
                        By <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                              className="font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors">Pejman
                        Chatrrouz</a>
                    </span>
                    <Tip content="View source on GitHub">
                        <a href="https://github.com/omidgfx/opendoc-ui" target="_blank" rel="noreferrer"
                           className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all text-[var(--text-contrast)] shrink-0 select-none cursor-pointer bg-[var(--text)]">
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
                         isDragging ? "bg-[var(--primary)]" : "bg-transparent hover:bg-[var(--primary)]")}/>
            )}
        </div>
    );

    // Mobile API spec selector modal
    const mobileSpecModal = isMobile && parsables && onSelectParsable && (
        <ApiSpecificationSelectorModal
            isOpen={showSpecModal}
            specifications={parsables}
            selectedKey={selectedParsableKey || ''}
            activeSpecification={spec}
            isLocalMode={isLocalMode}
            canOpenLocal={canOpenLocal}
            onOpenLocalFile={() => {
                setShowSpecModal(false);
                onOpenLocalFile();
            }}
            onReloadSpecification={onReloadSpecification}
            onResetSpecification={onResetSpecification}
            onResetAllConfigurations={onResetAllConfigurations}
            localHistory={localHistory}
            onSelectHistoryEntry={onSelectHistoryEntry}
            onRemoveHistoryEntry={onRemoveHistoryEntry}
            onClearHistory={onClearHistory}
            localOpenError={localOpenError}
            onDismissLocalError={onDismissLocalError}
            onSelect={(k) => {
                onSelectParsable(k);
                setShowSpecModal(false);
            }}
            onClose={() => setShowSpecModal(false)}
        />
    );

    if (isMobile) {
        return (
            <>
                {/* Right-click context menu */}
                {contextMenu && (
                    <div
                        className="fixed z-[5000] min-w-[200px] rounded-xl border shadow-xl py-1 bg-[var(--surface)] border-[var(--border)] animate-fade-in"
                        style={{top: contextMenu.y, left: contextMenu.x}}
                        onClick={(e) => e.stopPropagation()}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                            onClick={() => {
                                onContextAction('open-new-tab', contextMenu.target);
                                setContextMenu(null);
                            }}>
                            <i className="ph ph-plus-square text-[12px] text-[var(--primary)]"/>
                            Open in new tab
                        </button>
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                            onClick={() => {
                                onContextAction('open-browser', contextMenu.target);
                                setContextMenu(null);
                            }}>
                            <i className="ph ph-arrow-square-out text-[12px] text-[var(--text-muted)]"/>
                            Open in new browser tab
                        </button>
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                            onClick={() => {
                                onContextAction('copy-link', contextMenu.target);
                                setContextMenu(null);
                            }}>
                            <i className="ph ph-link text-[12px] text-[var(--text-muted)]"/>
                            Copy link
                        </button>
                        {contextMenu.target.type === 'endpoint' && (
                            <button
                                type="button"
                                disabled={!hasAIProfile}
                                title={hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile first'}
                                className={clsx('w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2', hasAIProfile ? 'cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)]' : 'cursor-not-allowed text-[var(--text-muted)] opacity-50')}
                                onClick={() => {
                                    if (!hasAIProfile) return;
                                    onContextAction('ask-ai', contextMenu.target);
                                    setContextMenu(null);
                                }}>
                                <i className="ph-fill ph-sparkle text-[12px] text-[var(--primary)]"/>
                                {hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile to use AI'}
                            </button>
                        )}
                        <div className="my-1 border-t border-[var(--border)]"/>
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                            onClick={() => {
                                onContextAction('share', contextMenu.target);
                                setContextMenu(null);
                            }}>
                            <i className="ph ph-share-network text-[12px] text-[var(--method-get)]"/>
                            Share
                        </button>
                    </div>
                )}

                <div
                    onClick={onCloseMobile}
                    className={clsx(
                        'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
                        mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    )}
                />
                <div
                    className={clsx(
                        'fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-out',
                        mobileOpen ? 'translate-x-0 shadow-[4px_0_20px_rgba(0,0,0,0.12)]' : '-translate-x-full shadow-none'
                    )}
                    aria-hidden={!mobileOpen}
                >
                    {sidebarContent}
                </div>
                {mobileSpecModal}
            </>
        );
    }

    return (
        <>
            {/* Right-click context menu */}
            {contextMenu && (
                <div
                    className="fixed z-[5000] min-w-[200px] rounded-xl border shadow-xl py-1 bg-[var(--surface)] border-[var(--border)] animate-fade-in"
                    style={{top: contextMenu.y, left: contextMenu.x}}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        onClick={() => {
                            onContextAction('open-new-tab', contextMenu.target);
                            setContextMenu(null);
                        }}>
                        <i className="ph ph-plus-square text-[12px] text-[var(--primary)]"/>
                        Open in new tab
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        onClick={() => {
                            onContextAction('open-browser', contextMenu.target);
                            setContextMenu(null);
                        }}>
                        <i className="ph ph-arrow-square-out text-[12px] text-[var(--text-muted)]"/>
                        Open in new browser tab
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        onClick={() => {
                            onContextAction('copy-link', contextMenu.target);
                            setContextMenu(null);
                        }}>
                        <i className="ph ph-link text-[12px] text-[var(--text-muted)]"/>
                        Copy link
                    </button>
                    {contextMenu.target.type === 'endpoint' && (
                        <button
                            type="button"
                            disabled={!hasAIProfile}
                            title={hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile first'}
                            className={clsx('w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2', hasAIProfile ? 'cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)]' : 'cursor-not-allowed text-[var(--text-muted)] opacity-50')}
                            onClick={() => {
                                if (!hasAIProfile) return;
                                onContextAction('ask-ai', contextMenu.target);
                                setContextMenu(null);
                            }}>
                            <i className="ph-fill ph-sparkle text-[12px] text-[var(--primary)]"/>
                            {hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile to use AI'}
                        </button>
                    )}
                    <div className="my-1 border-t border-[var(--border)]"/>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        onClick={() => {
                            onContextAction('share', contextMenu.target);
                            setContextMenu(null);
                        }}>
                        <i className="ph ph-share-network text-[12px] text-[var(--method-get)]"/>
                        Share
                    </button>
                </div>
            )}

            {sidebarContent}
        </>
    );
}

