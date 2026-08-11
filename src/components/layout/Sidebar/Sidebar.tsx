import React, {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ViewTabKind} from '../../endpoint/EndpointTabs';
import {useBreakpoint} from '../../../hooks/useBreakpoint';
import {useSwipeEdgeOpen} from '../../../hooks/useSwipeOpen';
import CustomDropdown from '../../common/CustomDropdown';
import {Tip} from '../../common/Tooltip';
import ApiSpecificationSelectorModal from '../../modals/ApiSpecificationSelectorModal';
import {specStorage, uiStorage} from '../../../utils/storage';
import pkg from '../../../../package.json';
import FolderTreeActionIcon from './FolderTreeActionIcon';
import CollapsedSidebarRail from './CollapsedSidebarRail';
import SidebarPageNavigation from './SidebarPageNavigation';
import SidebarContextMenu from './SidebarContextMenu';
import SidebarSettingsMenu from './SidebarSettingsMenu';
import SidebarTree from './SidebarTree';
import type {SidebarProps} from '@/src/types/sidebar';
import {
    buildTagTree,
    endpointMatchesSidebarFilter,
    filterTagTree,
    normalizeSidebarConfig,
    readSidebarConfig,
    type SidebarConfig,
    type SidebarFolderBehavior,
    type TreeNode,
} from '@/src/utils/sidebar/tree';

const ROW_HEIGHT = 40;
const ROW_ELBOW_Y = ROW_HEIGHT / 2;
const GUIDE_X = 13;
const ELBOW_W = 11;
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
        remoteLoadingEnabled,
        downloaderConfigured,
        remoteHistory,
        remoteOpenError,
        isLoadingRemoteSpec,
        remoteLoadStatus,
        onLoadRemoteUrl,
        onSelectRemoteHistoryEntry,
        onRemoveRemoteHistoryEntry,
        onClearRemoteHistory,
        mobileOpen,
        onCloseMobile,
        onOpenMobile,
    } = props;
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';
    const selectedServerDefinition = useMemo(() => {
        const servers = spec.servers || [];
        return servers.find(server => server.url === selectedServer) || servers[0] || null;
    }, [spec, selectedServer]);
    const [serverVariableValues, setServerVariableValues] = useState<Record<string, string>>({});
    useEffect(() => {
        setServerVariableValues(
            Object.fromEntries(
                Object.entries(selectedServerDefinition?.variables || {}).map(([name, variable]) => [
                    name,
                    String(variable.default ?? ''),
                ]),
            ),
        );
    }, [selectedParsableKey, selectedServerDefinition?.url]);
    const updateServerVariable = (name: string, value: string) => {
        const next = {...serverVariableValues, [name]: value};
        setServerVariableValues(next);
        if (selectedServerDefinition) {
            const expanded = selectedServerDefinition.url.replace(
                /\{([^{}]+)}/g,
                (placeholder, variableName) => next[variableName] ?? placeholder,
            );
            onSelectServer(expanded);
        }
    };
    const [width, setWidth] = useState<number>(() => {
        const saved = uiStorage.getJSON<number>('sidebar_width', 280, v => Number.isFinite(v));
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
    const onResizeKeyDown = (event: React.KeyboardEvent) => {
        const step = event.shiftKey ? 48 : 16;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setWidth(current => Math.max(220, current - step));
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            setWidth(current => Math.min(480, current + step));
        } else if (event.key === 'Home') {
            event.preventDefault();
            setWidth(220);
        } else if (event.key === 'End') {
            event.preventDefault();
            setWidth(480);
        }
    };
    const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>(() =>
        uiStorage.getJSON<Record<string, boolean>>(
            'collapsed_tags',
            {},
            v =>
                !!v &&
                typeof v === 'object' &&
                !Array.isArray(v) &&
                Object.values(v).every(value => typeof value === 'boolean'),
        ),
    );
    const [sidebarFilterOpen, setSidebarFilterOpen] = useState(false);
    const [sidebarFilterQuery, setSidebarFilterQuery] = useState('');
    const sidebarFilterButtonRef = useRef<HTMLButtonElement | null>(null);
    const sidebarFilterInputRef = useRef<HTMLInputElement | null>(null);
    const openSidebarFilter = () => {
        setSettingsMenuOpen(false);
        setSortMenuOpen(false);
        setFolderBehaviorMenuOpen(false);
        setSidebarFilterOpen(true);
        requestAnimationFrame(() => sidebarFilterInputRef.current?.focus());
    };
    const closeSidebarFilter = (restoreFocus = true) => {
        setSidebarFilterQuery('');
        setSidebarFilterOpen(false);
        if (restoreFocus) requestAnimationFrame(() => sidebarFilterButtonRef.current?.focus());
    };
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
        setSidebarFilterOpen(false);
        setSidebarFilterQuery('');
    }, [selectedParsableKey]);
    useEffect(() => {
        if (!sidebarFilterOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setSidebarFilterQuery('');
            setSidebarFilterOpen(false);
            requestAnimationFrame(() => sidebarFilterButtonRef.current?.focus());
        };
        document.addEventListener('keydown', closeOnEscape, true);
        return () => document.removeEventListener('keydown', closeOnEscape, true);
    }, [sidebarFilterOpen]);
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
            const left =
                openRight + menuWidth <= window.innerWidth - 8 ? openRight : Math.max(8, rect.left - menuWidth - 4);
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
            const left =
                openRight + menuWidth <= window.innerWidth - 8 ? openRight : Math.max(8, rect.left - menuWidth - 4);
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
    const tagTree = useMemo(() => buildTagTree(spec, sidebarConfig, activeAuth), [spec, sidebarConfig, activeAuth]);
    const mainSearchQuery = searchQuery.trim().toLowerCase();
    const hasMainSidebarFilters =
        !!mainSearchQuery || selectedMethods.length > 0 || selectedTags.length > 0 || onlyProtected !== null;
    const mainSearchTagTree = useMemo(() => {
        if (!hasMainSidebarFilters && !sidebarConfig.hideDeprecatedEndpoints) return tagTree;
        const terms = mainSearchQuery.split(/[\s._-]+/).filter(Boolean);
        const predicate = (ep: TreeNode['endpoints'][number]) => {
            if (sidebarConfig.hideDeprecatedEndpoints && ep.operation?.deprecated) return false;
            const methodUpper = ep.method.toUpperCase();
            const opTags = ep.operation?.tags?.length ? ep.operation.tags : ['General'];
            if (selectedMethods.length > 0 && !selectedMethods.includes(methodUpper)) return false;
            if (selectedTags.length > 0 && !opTags.some((t: string) => selectedTags.includes(t))) return false;
            if (onlyProtected === true && !ep.isProtected) return false;
            if (onlyProtected === false && ep.isProtected) return false;
            if (!mainSearchQuery) return true;
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
            if (ep.method.toLowerCase() === mainSearchQuery) return true;
            if (opTags.some((t: string) => t.toLowerCase().includes(mainSearchQuery))) return true;
            return false;
        };
        return filterTagTree(tagTree, predicate);
    }, [
        tagTree,
        hasMainSidebarFilters,
        mainSearchQuery,
        selectedMethods,
        selectedTags,
        onlyProtected,
        sidebarConfig.displayRoutes,
        sidebarConfig.hideDeprecatedEndpoints,
    ]);
    const endpointFilterQuery = sidebarFilterQuery.trim();
    const visibleTagTree = useMemo(
        () =>
            endpointFilterQuery
                ? filterTagTree(mainSearchTagTree, endpoint =>
                      endpointMatchesSidebarFilter(endpoint, endpointFilterQuery, sidebarConfig.displayRoutes),
                  )
                : mainSearchTagTree,
        [endpointFilterQuery, mainSearchTagTree, sidebarConfig.displayRoutes],
    );
    const hasEndpointVisibilityFilter =
        hasMainSidebarFilters || !!endpointFilterQuery || sidebarConfig.hideDeprecatedEndpoints;
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
    const [showSpecModal, setShowSpecModal] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        target:
            | {
                  type: 'endpoint';
                  path: string;
                  method: string;
              }
            | {
                  type: 'view';
                  view: ViewTabKind;
              };
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
    const openContextMenu = (
        e: React.MouseEvent,
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
    const toggleNode = (path: string) =>
        setCollapsedNodes(prev => {
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
        const t = setTimeout(
            () =>
                endpointRefs.current[key]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                }),
            80,
        );
        return () => clearTimeout(t);
    }, [selectedEndpoint, tagTree, isCollapsed, isMobile]);
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
    const ancestorNodePaths = useMemo((): Set<string> => {
        const s = new Set<string>();
        if (!findEndpointAncestorPath) return s;
        for (let i = 0; i < findEndpointAncestorPath.length; i++) {
            s.add(findEndpointAncestorPath.slice(0, i + 1).join('/'));
        }
        return s;
    }, [findEndpointAncestorPath]);
    const selectedLeafFolderPath = useMemo(
        () => (findEndpointAncestorPath ? findEndpointAncestorPath.join('/') : null),
        [findEndpointAncestorPath],
    );
    const navTo = (fn: () => void) => () => {
        fn();
        if (isMobile) onCloseMobile();
    };
    const renderTree = (node: TreeNode, nodePath: string) => (
        <SidebarTree
            node={node}
            nodePath={nodePath}
            collapsedNodes={endpointFilterQuery ? {} : collapsedNodes}
            countEndpoints={countEndpoints}
            ancestorNodePaths={ancestorNodePaths}
            selectedEndpoint={selectedEndpoint}
            selectedLeafFolderPath={selectedLeafFolderPath}
            showHome={showHome}
            showSchemaExplorer={showSchemaExplorer}
            showAbout={showAbout}
            showAssistant={showAssistant}
            assistantContextEndpoints={assistantContextEndpoints}
            searchQuery={searchQuery}
            endpointFilterQuery={endpointFilterQuery}
            config={sidebarConfig}
            endpointRefs={endpointRefs}
            onToggleNode={toggleNode}
            getEndpointHref={getEndpointHref}
            onSelectEndpoint={(path, method) => navTo(() => onSelectEndpoint(path, method))()}
            onOpenPermanent={onMiddleClickEndpoint}
            onContextMenu={openContextMenu}
        />
    );
    if (!isMobile && isCollapsed) {
        return (
            <CollapsedSidebarRail
                isOverview={isOverview}
                showSchemaExplorer={showSchemaExplorer}
                showAbout={showAbout}
                onOpenHome={onOpenHome}
                onOpenSchemaExplorer={onOpenSchemaExplorer}
                onOpenAbout={onOpenAbout}
            />
        );
    }
    const pageNavigation = (
        <SidebarPageNavigation
            spec={spec}
            overviewActive={isOverview}
            aboutActive={showAbout}
            schemasActive={showSchemaExplorer}
            onOpenHome={navTo(onOpenHome)}
            onOpenAbout={navTo(onOpenAbout)}
            onOpenSchemas={navTo(onOpenSchemaExplorer)}
            onOpenPermanent={onOpenViewPermanent}
            onContextMenu={(event, view) =>
                openContextMenu(event, {
                    type: 'view',
                    view,
                })
            }
        />
    );
    const endpointNavigation = (
        <div className="pt-1">
            {Object.keys(visibleTagTree.children).length === 0 ? (
                <p className="text-[11px] italic px-2 text-[var(--text-muted)]">
                    {hasEndpointVisibilityFilter ? 'No endpoints match your search/filters' : 'No endpoints found'}
                </p>
            ) : (
                Object.keys(visibleTagTree.children).map(rt => renderTree(visibleTagTree.children[rt], rt))
            )}
        </div>
    );
    const sidebarContent = (
        <div
            ref={sidebarRef}
            data-opendoc-sidebar
            className={clsx(
                'h-full flex flex-col overflow-hidden font-sans bg-[var(--sidebar)]',
                isMobile ? 'w-[82vw] max-w-[340px]' : 'relative shrink-0 border-r border-[var(--border)]',
            )}
            style={!isMobile ? {width} : undefined}
        >
            {isMobile && (
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--sidebar)] px-2 py-2 flex items-center gap-1.5">
                    <Tip content="Switch API specification">
                        <button
                            onClick={() => setShowSpecModal(true)}
                            className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)]"
                        >
                            <i className="ph-fill ph-files text-[15px]" />
                        </button>
                    </Tip>
                    <Tip
                        content={
                            activeAuth?.activeScheme && activeAuth.activeScheme !== 'none'
                                ? `${activeAuth.activeScheme.toUpperCase()} auth active`
                                : 'Authorize'
                        }
                    >
                        <button
                            onClick={navTo(onOpenAuthModal)}
                            className={clsx(
                                'size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border hover:bg-[var(--surface-hover)]',
                                activeAuth?.activeScheme && activeAuth.activeScheme !== 'none'
                                    ? 'border-[var(--method-get)]/30 text-[var(--method-get)]'
                                    : 'border-[var(--border)] text-[var(--text-muted)]',
                            )}
                        >
                            <i className={clsx('ph-fill ph-lock-key text-[15px]')} />
                        </button>
                    </Tip>
                    <Tip content="Toggle light/dark mode">
                        <button
                            onClick={onToggleThemeMode}
                            className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                        >
                            {themeMode === 'system' ? (
                                <i className="ph ph-monitor text-[var(--accent)] text-[15px]"></i>
                            ) : themeMode === 'dark' ? (
                                <i className="ph ph-sun text-[var(--method-put)] text-[15px]"></i>
                            ) : (
                                <i className="ph-fill ph-moon text-[var(--primary)] text-[15px]"></i>
                            )}
                        </button>
                    </Tip>
                    <Tip content="Theme gallery">
                        <button
                            onClick={navTo(onOpenThemeModal)}
                            className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)]"
                        >
                            <i className="ph-fill ph-palette text-[15px]" />
                        </button>
                    </Tip>
                    <Tip content="Reload specification (drop cache)">
                        <button
                            onClick={onRefreshSpec}
                            className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                        >
                            <i
                                className={`ph-fill ph-arrows-clockwise text-[var(--primary)] text-[15px] ${isRefreshingSpec ? 'animate-spin' : ''}`}
                            />
                        </button>
                    </Tip>
                    <Tip content="Download raw specification">
                        <button
                            onClick={onDownloadSpec}
                            className="size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                        >
                            <i className="ph-fill ph-download-simple text-[var(--primary)] text-[15px]"></i>
                        </button>
                    </Tip>
                    <Tip content="Close menu">
                        <button
                            onClick={onCloseMobile}
                            className="size-9 ms-auto rounded-lg flex items-center justify-center transition-all cursor-pointer text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)]"
                        >
                            <i className="ph ph-x text-[15px]"></i>
                        </button>
                    </Tip>
                </div>
            )}

            <div className="px-3 py-1 border-b shrink-0 border-[var(--border)] space-y-2">
                {spec?.servers && spec.servers.length > 0 && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">
                            Active Server
                        </label>
                        <CustomDropdown
                            value={selectedServerDefinition?.url || selectedServer}
                            onChange={onSelectServer}
                            options={spec.servers.map(s => ({value: s.url, label: s.description || s.url}))}
                            icon="ph ph-hard-drives text-[14px]"
                            className="w-full"
                        />
                        <Tip content={selectedServer}>
                            <div className="mt-1 text-[10px] leading-none truncate flex items-center gap-1 text-[var(--text-muted)]">
                                <i className="ph ph-globe text-[12px]"></i>
                                <span className="font-mono select-text truncate">{selectedServer}</span>
                            </div>
                        </Tip>
                        {selectedServerDefinition?.variables &&
                            Object.keys(selectedServerDefinition.variables).length > 0 && (
                                <div className="mt-2 grid gap-2">
                                    {Object.entries(selectedServerDefinition.variables).map(([name, variable]) => (
                                        <label
                                            key={name}
                                            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-center gap-2 text-[9px] text-[var(--text-muted)]"
                                        >
                                            <span className="truncate font-mono" title={variable.description || name}>
                                                {name}
                                            </span>
                                            {variable.enum?.length ? (
                                                <CustomDropdown
                                                    value={serverVariableValues[name] ?? variable.default}
                                                    onChange={value => updateServerVariable(name, value)}
                                                    options={variable.enum.map(value => ({value, label: value}))}
                                                    className="min-w-0"
                                                />
                                            ) : (
                                                <input
                                                    value={serverVariableValues[name] ?? variable.default}
                                                    onChange={event => updateServerVariable(name, event.target.value)}
                                                    className="min-w-0 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-[9px] text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                                                />
                                            )}
                                        </label>
                                    ))}
                                </div>
                            )}
                    </div>
                )}
            </div>

            <div
                data-sidebar-navigation-header
                className="relative z-20 h-7 px-3 flex items-center justify-between gap-2 shrink-0"
            >
                {sidebarFilterOpen ? (
                    <div className="flex w-full min-w-0 items-center gap-1">
                        <div className="relative min-w-0 flex-1">
                            <i className="ph ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]" />
                            <input
                                ref={sidebarFilterInputRef}
                                autoFocus
                                type="text"
                                value={sidebarFilterQuery}
                                onChange={event => setSidebarFilterQuery(event.target.value)}
                                aria-label="Filter sidebar endpoints"
                                placeholder="Filter endpoints…"
                                className="h-6 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-7 pr-7 text-[10px] text-[var(--text-heading)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
                            />
                            {sidebarFilterQuery && (
                                <button
                                    type="button"
                                    aria-label="Clear endpoint filter"
                                    onClick={() => {
                                        setSidebarFilterQuery('');
                                        sidebarFilterInputRef.current?.focus();
                                    }}
                                    className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] cursor-pointer"
                                >
                                    <i className="ph ph-x text-[10px]" />
                                </button>
                            )}
                        </div>
                        <Tip content="Close endpoint filter">
                            <button
                                type="button"
                                aria-label="Close endpoint filter"
                                onClick={() => closeSidebarFilter()}
                                className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] cursor-pointer"
                            >
                                <i className="ph ph-x text-[13px]" />
                            </button>
                        </Tip>
                    </div>
                ) : (
                    <>
                        <label className="block min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            API Navigation
                        </label>
                        <div className="flex items-center gap-0.5 shrink-0">
                            <Tip content="Filter sidebar endpoints">
                                <button
                                    ref={sidebarFilterButtonRef}
                                    type="button"
                                    aria-label="Filter sidebar endpoints"
                                    onClick={openSidebarFilter}
                                    className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]"
                                >
                                    <i className="ph ph-magnifying-glass text-[12px]" />
                                </button>
                            </Tip>
                            {sidebarConfig.folderBehavior === 'multiple' && (
                                <>
                                    <Tip content="Collapse all folders">
                                        <button
                                            type="button"
                                            aria-label="Collapse all folders"
                                            disabled={folderPaths.length === 0}
                                            onClick={() => setAllFoldersCollapsed(true)}
                                            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] disabled:opacity-35 disabled:cursor-not-allowed"
                                        >
                                            <FolderTreeActionIcon direction="collapse" />
                                        </button>
                                    </Tip>
                                    <Tip content="Expand all folders">
                                        <button
                                            type="button"
                                            aria-label="Expand all folders"
                                            disabled={folderPaths.length === 0}
                                            onClick={() => setAllFoldersCollapsed(false)}
                                            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] disabled:opacity-35 disabled:cursor-not-allowed"
                                        >
                                            <FolderTreeActionIcon direction="expand" />
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
                                    className={clsx(
                                        'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer',
                                        settingsMenuOpen
                                            ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                                            : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]',
                                    )}
                                >
                                    <i className="ph ph-gear-six text-[13px]" />
                                </button>
                            </Tip>
                        </div>
                    </>
                )}
            </div>

            <SidebarSettingsMenu
                open={settingsMenuOpen}
                menuRef={settingsMenuRef}
                position={settingsMenuPosition}
                config={sidebarConfig}
                isMobile={isMobile}
                folderItemRef={folderBehaviorItemRef}
                folderOpen={folderBehaviorMenuOpen}
                folderPosition={folderBehaviorMenuPosition}
                sortItemRef={sortMenuItemRef}
                sortOpen={sortMenuOpen}
                sortPosition={sortMenuPosition}
                closeAll={closeAllSubmenus}
                closeFolder={closeFolderBehaviorMenu}
                openFolder={openFolderBehaviorMenu}
                setFolderOpen={setFolderBehaviorMenuOpen}
                updateFolder={updateFolderBehavior}
                closeSort={closeSortMenu}
                openSort={openSortMenu}
                scheduleSortClose={scheduleSortMenuClose}
                updateConfig={updateSidebarConfig}
            />

            <div className="flex-1 relative min-h-0 nav-scroll-wrapper">
                <div ref={navScrollRef} className="h-full overflow-y-auto p-2 space-y-1 scrollbar-thin">
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

                <div
                    className={clsx('nav-scroll-top-fader', {
                        'opacity-0': !navScrolled,
                        'opacity-100': navScrolled,
                    })}
                    aria-hidden="true"
                />
            </div>

            <div className="h-[76px] min-h-[76px] box-border p-3 border-t shrink-0 flex flex-col justify-center gap-2 border-[var(--border)] bg-[var(--background)]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-left text-[11px] leading-normal select-none text-[var(--text-muted)]">
                        By{' '}
                        <a
                            href="https://github.com/omidgfx"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[var(--text-heading)] hover:text-[var(--primary)] transition-colors"
                        >
                            Pejman Chatrrouz
                        </a>
                    </span>
                    <Tip content="View source on GitHub">
                        <a
                            href="https://github.com/omidgfx/opendoc-ui"
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all text-[var(--text-contrast)] shrink-0 select-none cursor-pointer bg-[var(--text)]"
                        >
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
                <div
                    role="separator"
                    aria-label="Resize API navigation sidebar"
                    aria-orientation="vertical"
                    aria-valuemin={220}
                    aria-valuemax={480}
                    aria-valuenow={Math.round(width)}
                    tabIndex={0}
                    onMouseDown={onResizeMouseDown}
                    onKeyDown={onResizeKeyDown}
                    className={clsx(
                        'absolute top-0 right-0 w-[4px] h-full cursor-col-resize transition-colors z-10 select-none outline-none focus:bg-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30',
                        isDragging ? 'bg-[var(--primary)]' : 'bg-transparent hover:bg-[var(--primary)]',
                    )}
                />
            )}
        </div>
    );
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
            remoteLoadingEnabled={remoteLoadingEnabled}
            downloaderConfigured={downloaderConfigured}
            remoteHistory={remoteHistory}
            remoteOpenError={remoteOpenError}
            isLoadingRemoteSpec={isLoadingRemoteSpec}
            remoteLoadStatus={remoteLoadStatus}
            onLoadRemoteUrl={onLoadRemoteUrl}
            onSelectRemoteHistoryEntry={onSelectRemoteHistoryEntry}
            onRemoveRemoteHistoryEntry={onRemoveRemoteHistoryEntry}
            onClearRemoteHistory={onClearRemoteHistory}
            onSelect={k => {
                onSelectParsable(k);
                setShowSpecModal(false);
            }}
            onClose={() => setShowSpecModal(false)}
        />
    );
    if (isMobile) {
        return (
            <>
                {contextMenu && (
                    <SidebarContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        target={contextMenu.target}
                        hasAIProfile={hasAIProfile}
                        onAction={onContextAction}
                        onClose={() => setContextMenu(null)}
                    />
                )}

                <div
                    onClick={onCloseMobile}
                    className={clsx(
                        'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
                        mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                    )}
                />
                <div
                    className={clsx(
                        'fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-out',
                        mobileOpen
                            ? 'translate-x-0 shadow-[4px_0_20px_rgba(0,0,0,0.12)]'
                            : '-translate-x-full shadow-none',
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
            {contextMenu && (
                <SidebarContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    target={contextMenu.target}
                    hasAIProfile={hasAIProfile}
                    onAction={onContextAction}
                    onClose={() => setContextMenu(null)}
                />
            )}

            {sidebarContent}
        </>
    );
}
