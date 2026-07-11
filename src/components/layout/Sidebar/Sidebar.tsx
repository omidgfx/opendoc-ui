import React, {useRef, useState} from 'react';
import {OpenApiSpec} from '../../../types';
import CustomDropdown from '../../common/CustomDropdown';
import MethodBadge from '../../common/MethodBadge';
import clsx from "clsx";
import pkg from '../../../../package.json';

// ----- nested tag tree types -----
interface TreeNode {
    name: string;
    children: { [key: string]: TreeNode; };
    endpoints: Array<{
        path: string;
        method: string;
        operation: any;
        isProtected: boolean;
    }>;
}

// ----- build tree from spec -----
function buildTagTree(spec: OpenApiSpec | null): TreeNode {
    const root: TreeNode = {
        name: '',
        children: {},
        endpoints: []
    };

    if (!spec || !spec.paths) return root;

    const allTags = new Set<string>();

    // First collect all endpoints grouped by their tags
    const endpointsByTag: { [tag: string]: typeof root.endpoints; } = {};

    Object.entries(spec.paths).forEach(([pathStr, pathItem]) => {
        if (!pathItem) return;
        Object.entries(pathItem).forEach(([methodStr, operation]) => {
            if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(methodStr)) return;
            const op = operation as any;
            if (!op) return;
            const tags = op.tags && Array.isArray(op.tags) && op.tags.length > 0 ? op.tags : ['General'];
            const isProtected = !!(op.security && op.security.length > 0) || !!(spec.security && spec.security.length > 0);

            tags.forEach((tag: string) => {
                if (!endpointsByTag[tag]) endpointsByTag[tag] = [];
                endpointsByTag[tag].push({
                    path: pathStr,
                    method: methodStr,
                    operation: op,
                    isProtected
                });
                allTags.add(tag);
            });
        });
    });

    // Insert each tag's endpoints into the tree
    Object.entries(endpointsByTag).forEach(([tag, endpoints]) => {
        const parts = tag.split('/').filter(Boolean);
        let node = root;
        for (const part of parts) {
            if (!node.children[part]) {
                node.children[part] = {
                    name: part,
                    children: {},
                    endpoints: []
                };
            }
            node = node.children[part];
        }
        // Add endpoints to the leaf node
        node.endpoints.push(...endpoints);
    });

    // Sort children alphabetically
    const sortTree = (node: TreeNode) => {
        const keys = Object.keys(node.children).sort();
        const sortedChildren: { [key: string]: TreeNode; } = {};
        for (const k of keys) {
            sortedChildren[k] = sortTree(node.children[k]);
        }
        node.children = sortedChildren;
        // sort endpoints inside each node by summary or path
        node.endpoints.sort((a, b) => {
            const aName = a.operation?.summary || a.path;
            const bName = b.operation?.summary || b.path;
            return aName.localeCompare(bName);
        });
        return node;
    };
    sortTree(root);

    return root;
}

interface SidebarProps {
    spec: OpenApiSpec | null;
    selectedServer: string;
    onSelectServer: (server: string) => void;
    isCollapsed: boolean;
    onOpenSchemaExplorer: () => void;
    showSchemaExplorer: boolean;
    selectedMethods: string[];
    setSelectedMethods: React.Dispatch<React.SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: React.Dispatch<React.SetStateAction<boolean | null>>;
    searchQuery: string;
    selectedEndpoint: { path: string; method: string; } | null;
    onSelectEndpoint: (path: string, method: string) => void;
    onOpenHome: () => void;
    showHome: boolean;
    showAbout: boolean;
    onOpenAbout: () => void;
}

export default function Sidebar({
                                    spec,
                                    selectedServer,
                                    onSelectServer,
                                    isCollapsed,
                                    onOpenSchemaExplorer,
                                    showSchemaExplorer,
                                    selectedMethods,
                                    setSelectedMethods,
                                    selectedTags,
                                    setSelectedTags,
                                    onlyProtected,
                                    setOnlyProtected,
                                    searchQuery,
                                    selectedEndpoint,
                                    onSelectEndpoint,
                                    onOpenHome,
                                    showHome,
                                    showAbout,
                                    onOpenAbout,
                                }: SidebarProps) {
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem('sidebar_width');
        return saved ? parseInt(saved, 10) : 300;
    });

    const sidebarRef = useRef<HTMLDivElement>(null);
    const endpointRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const isResizing = useRef(false);
    const [isDragging, setIsDragging] = useState(false);

    // Collapsible tree nodes (keyed by full path, e.g. "Authenticate" or "Authenticate/Reset Password")
    const [collapsedNodes, setCollapsedNodes] = useState<{ [path: string]: boolean; }>(() => {
        try {
            const saved = localStorage.getItem('collapsed_tags');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    const toggleNodeCollapse = (path: string) => {
        setCollapsedNodes((prev) => {
            const next = {...prev, [path]: !prev[path]};
            localStorage.setItem('collapsed_tags', JSON.stringify(next));
            return next;
        });
    };

    React.useEffect(() => {
        localStorage.setItem('sidebar_width', width.toString());
    }, [width]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        setIsDragging(true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = Math.max(220, Math.min(600, e.clientX));
        setWidth(newWidth);
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Get all unique tags and methods for filter UI

    // Build the nested tag tree
    const tagTree = React.useMemo(() => buildTagTree(spec), [spec]);

    // Recursive endpoint count
    const countTotalEndpoints = (node: TreeNode): number => {
        let count = node.endpoints.length;
        Object.values(node.children).forEach((child) => {
            count += countTotalEndpoints(child);
        });
        return count;
    };

    // When an endpoint is opened from search/deep-link navigation, reveal every
    // ancestor folder that contains it and then center its row in the list.
    React.useEffect(() => {
        if (!selectedEndpoint || isCollapsed) return;

        const pathsToExpand = new Set<string>();
        const selectedMethod = selectedEndpoint.method.toLowerCase();

        const visit = (node: TreeNode, nodePath: string): boolean => {
            const containsDirectEndpoint = node.endpoints.some((endpoint) =>
                endpoint.path === selectedEndpoint.path && endpoint.method.toLowerCase() === selectedMethod
            );
            let containsSelectedEndpoint = containsDirectEndpoint;

            Object.entries(node.children).forEach(([childName, child]) => {
                const childPath = nodePath ? `${nodePath}/${childName}` : childName;
                if (visit(child, childPath)) containsSelectedEndpoint = true;
            });

            if (containsSelectedEndpoint && nodePath) pathsToExpand.add(nodePath);
            return containsSelectedEndpoint;
        };

        Object.entries(tagTree.children).forEach(([rootName, rootNode]) => visit(rootNode, rootName));

        setCollapsedNodes((current) => {
            let changed = false;
            const next = {...current};
            pathsToExpand.forEach((nodePath) => {
                if (next[nodePath]) {
                    next[nodePath] = false;
                    changed = true;
                }
            });
            if (changed) localStorage.setItem('collapsed_tags', JSON.stringify(next));
            return changed ? next : current;
        });

        const endpointKey = `${selectedMethod}:${selectedEndpoint.path}`;
        const timer = window.setTimeout(() => {
            endpointRefs.current[endpointKey]?.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 80);

        return () => window.clearTimeout(timer);
    }, [selectedEndpoint, tagTree, isCollapsed]);

    const isHome = showHome && !showSchemaExplorer && !showAbout && !selectedEndpoint;

    // Recursive render function for tree nodes
    const renderTreeNode = (node: TreeNode, path: string, level: number) => {
        const isCollapsed = !!collapsedNodes[path];
        const childPaths = Object.keys(node.children);
        const hasChildren = childPaths.length > 0;
        const hasEndpoints = node.endpoints.length > 0;
        const totalEndpoints = countTotalEndpoints(node);

        // Don't show empty nodes (shouldn't happen)
        if (!hasChildren && !hasEndpoints) return null;
        return (
            <div key={path} className="space-y-0.5 animate-in fade-in duration-150">
                {/* Node header (collapsible) */}
                <button
                    onClick={() => toggleNodeCollapse(path)}
                    className="w-full text-[11px] font-medium px-1 py-1.5 select-none flex items-center justify-between hover:bg-[var(--surface-hover)] rounded-md transition-colors cursor-pointer text-left focus:outline-none">

                    <span className="flex items-center gap-1.5">
                        <i
                            className={clsx(
                                'text-[14px] mr-0.5 text-[var(--method-put)]',
                                isCollapsed ? 'ph-fill ph-folder-simple' : 'ph-fill ph-folder-open'
                            )}/>

                        <span>{node.name}</span>

                        <span
                            className={clsx(
                                "text-[9px] font-mono px-1.5 py-0.5 rounded-full leading-none",
                                'bg-[var(--text)]/10 text-[var(--text)]/80'
                            )}>
                            {totalEndpoints}
                        </span>
                    </span>
                </button>

                {!isCollapsed &&
                    <div className={"pl-1.5 border-l ml-1 border-l-[var(--border)]"}>
                        {/* Render child nodes first (so they appear before endpoints? We'll put children first) */}
                        {childPaths.map((childName) => {
                            const childNode = node.children[childName];
                            const childPath = path ? `${path}/${childName}` : childName;
                            return renderTreeNode(childNode, childPath, level + 1);
                        })}

                        {/* Render endpoints of this node */}
                        {node.endpoints.map((ep) => {
                            const isSelected =
                                selectedEndpoint?.path === ep.path &&
                                selectedEndpoint?.method.toLowerCase() === ep.method.toLowerCase() &&
                                !showHome &&
                                !showSchemaExplorer;

                            return (
                                <button
                                    key={`${ep.method}-${ep.path}`}
                                    ref={(element) => {
                                        endpointRefs.current[`${ep.method.toLowerCase()}:${ep.path}`] = element;
                                    }}
                                    onClick={() => onSelectEndpoint(ep.path, ep.method)}
                                    className={clsx('block w-full font-medium ps-2 pe-2 py-1.5 rounded-lg text-left transition-all cursor-pointer select-none min-w-0',
                                        {
                                            'bg-[var(--primary)]/90 text-[var(--primary-contrast)]': isSelected,
                                            'bg-transparent text-[var(--text)]': !isSelected
                                        }
                                    )}>
                                    <div className="flex items-center gap-1.5 min-w-0 w-full"
                                         title={ep.operation?.summary || ep.path}>
                                        <MethodBadge method={ep.method.toLowerCase()} size="xs"
                                                     className={clsx(
                                                         'w-9 h-3.5 shrink-0',
                                                         {
                                                             '!bg-[var(--primary-contrast)]/20 !text-[var(--primary-contrast)] !border-[var(--primary-contrast)]/30': isSelected
                                                         }
                                                     )}/>
                                        <span className={clsx('min-w-0 flex-1 text-[11px] truncate', {
                                            'line-through opacity-70': ep.operation?.deprecated
                                        })}>
                                            {ep.operation?.summary || ep.path}
                                        </span>
                                        {ep.operation?.deprecated &&
                                            <i
                                                className={clsx('ph ph-warning-circle text-[12px] shrink-0', {
                                                    'text-[var(--method-put)]/90': !isSelected,
                                                    'text-[var(--primary-contrast)]/80': isSelected
                                                })}
                                                title="Deprecated Endpoint"/>

                                        }
                                        {ep.isProtected &&
                                            <i
                                                className={clsx('ph-fill ph-lock-key text-[12px] shrink-0', {
                                                    'text-[var(--method-delete)]/80': !isSelected,
                                                    'text-[var(--primary-contrast)]/80': isSelected
                                                })}
                                                title="Protected Endpoint"/>

                                        }
                                    </div>
                                </button>);

                        })}
                    </div>
                }
            </div>);

    };

    // Collapsed sidebar view (icon rail)
    if (isCollapsed) {
        return (
            <div
                className="h-full flex flex-col items-center border-r select-none shrink-0 bg-[var(--sidebar)] border-[var(--border)]"
                style={{width: '56px'}}>
                <div className="flex-1 flex flex-col gap-2 my-2 items-center">
                    <button
                        onClick={onOpenHome}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            isHome ? 'bg-[var(--method-post)] text-[var(--primary-contrast)]' : 'text-[var(--method-post)] hover:bg-[var(--surface-hover)]'
                        )}
                        title="Overview & Statistics">
                        <i className="ph-fill ph-house text-[16px]"></i>
                    </button>
                    <button
                        onClick={onOpenSchemaExplorer}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showSchemaExplorer ? 'bg-[var(--method-post)] text-[var(--primary-contrast)]' : 'text-[var(--method-post)] hover:bg-[var(--surface-hover)]'
                        )}
                        title="Schema Explorer">
                        <i className="ph-fill ph-diamonds-four text-[16px]"></i>
                    </button>
                    <button
                        onClick={onOpenAbout}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showAbout ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--primary)] hover:bg-[var(--surface-hover)]'
                        )}
                        title="About OpenDoc UI">
                        <i className="ph ph-info text-[18px]"></i>
                    </button>
                </div>
                <div className="my-2 flex flex-col items-center gap-0.5 text-[var(--text-muted)]">
                    <span className="text-[8px] font-mono">{pkg.version}</span>
                </div>
            </div>
        );
    }

    // On small screens the sidebar is narrower (min 64 when collapsed, 220 when expanded)
    const responsiveWidth = isCollapsed ? 56 : Math.max(200, Math.min(460, width));
    return (
        <div
            ref={sidebarRef}
            className="h-full flex relative select-none shrink-0 border-r border-[var(--border)]"
            style={{width: `${responsiveWidth}px`}}>

            <div
                className="flex-1 h-full flex flex-col overflow-hidden font-sans bg-[var(--sidebar)]">


                {/* Server Target Picker Header */}
                <div className="px-3 py-2 flex items-center justify-between border-b shrink-0 border-[var(--border)]">

                    {spec && spec.servers && spec.servers.length > 0 &&
                        <div className="w-full">
                            <label
                                className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">

                                Active Server Target
                            </label>
                            <div className="relative">
                                <CustomDropdown
                                    value={selectedServer}
                                    onChange={onSelectServer}
                                    options={spec.servers.map((server) => ({
                                        value: server.url,
                                        label: server.description || server.url
                                    }))}
                                    icon="ph ph-hard-drives text-[14px]"/>

                            </div>
                            <div
                                className="mt-1 text-[10px] leading-none truncate flex items-center gap-1 text-[var(--text-muted)]"
                                title={selectedServer}>
                                <i className="ph ph-globe text-[12px] mt-0.5"></i>
                                <span className={'font-mono select-text'}>{selectedServer}</span>
                            </div>
                        </div>
                    }
                </div>

                {/* Navigation Content (Endpoint List vs. Advanced Filters based on Search Query) */}

                {/* Endpoints Header */}

                <label
                    className="px-3 py-2 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">

                    API Navigation
                </label>

                {/* Endpoints Body Scroll area */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">

                    {/* Overview / About nav items */}
                    <div className="space-y-1">
                        <button
                            onClick={onOpenHome}
                            className={clsx(
                                'flex items-center font-medium gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none',
                                isHome ? 'text-[var(--primary-contrast)] bg-[var(--method-post)]' : 'bg-transparent text-[var(--text)]'
                            )}>
                            <i className="ph ph-house text-[14px]"></i>
                            <span>Overview & Statistics</span>
                        </button>
                        <button
                            onClick={onOpenAbout}
                            className={clsx(
                                'flex items-center font-medium gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none',
                                showAbout ? 'text-[var(--primary-contrast)] bg-[var(--primary)]' : 'bg-transparent text-[var(--text)]'
                            )}>
                            <i className="ph ph-info text-[14px]"></i>
                            <span>About OpenDoc UI</span>
                        </button>
                    </div>

                    {/* Nested tag tree */}
                    <div className="space-y-0.5 pt-1">
                        {Object.keys(tagTree.children).length === 0 ?
                            <p className="text-[11px] italic px-2 text-[var(--text-muted)]">
                                No endpoints found
                            </p> :

                            Object.keys(tagTree.children).sort().map((rootTag) => {
                                const node = tagTree.children[rootTag];
                                return renderTreeNode(node, rootTag, 0);
                            })
                        }
                    </div>
                </div>

                {/* Schema Explorer Nav footer bar */}
                <div
                    className="shrink-0 border-t animate-in fade-in border-[var(--border)] bg-[var(--background)]"
                    style={{
                        boxShadow: '0 -5px 10px 0 rgba(0,0,0,.05)'


                    }}>

                    <button
                        onClick={onOpenSchemaExplorer}
                        className={clsx(
                            'w-full text-left py-2 px-3 flex items-center gap-2.5 transition-all text-xs font-sans group cursor-pointer',
                            {
                                'bg-[var(--method-post)] text-[var(--primary-contrast)]': showSchemaExplorer,
                                'text-[var(--sidebar-text)] hover:bg-[var(--surface-hover)]': !showSchemaExplorer
                            }
                        )}>

                        <i className={
                            clsx("ph-fill ph-diamonds-four", {
                                'text-[var(--primary-contrast)]': showSchemaExplorer,
                                'text-[var(--method-post)]': !showSchemaExplorer
                            })
                        }></i>
                        <span>Schema Explorer</span>
                        <span
                            className={clsx('ml-auto text-[10px] font-mono font-bold', {
                                'text-[var(--primary-contrast)]': showSchemaExplorer,
                                'text-[var(--text-muted)]': !showSchemaExplorer
                            })}>

                            ({spec?.components?.schemas ? Object.keys(spec.components.schemas).length : 0})
                        </span>
                    </button>
                </div>

                {/* Developer Info Brand Footer */}
                <div
                    className="p-3.5 border-t text-center font-sans shrink-0 flex flex-col gap-2 border-[var(--border)] bg-[var(--background)]">


                    <div className="flex items-center justify-between gap-2">
                        <span
                            className="text-left text-[11.5px] leading-normal select-none text-[var(--text-muted)]">
                            Designed by <strong className="font-semibold text-[var(--text-heading)]">Pejman
                            Chatrrouz</strong>
                        </span>
                        <a
                            href="https://github.com/omidgfx/opendoc-ui"
                            target="_blank"
                            referrerPolicy="no-referrer"
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all text-[var(--primary-contrast)] shrink-0 select-none cursor-pointer bg-[var(--primary)] border-[var(--border)]">


                            <div
                                className="overflow-hidden bg-[var(--surface)] size-[14px] rounded-full flex items-center justify-center">
                                <i className="ph-fill ph-github-logo mt-0.5 text-[var(--primary)] text-[14px] "></i>
                            </div>
                            <span>GitHub</span>
                        </a>
                    </div>
                    <div className="flex items-center justify-between text-[9px] select-none text-[var(--text-muted)]">

                        <span>OpenDoc UI</span>
                        <span className="font-mono">{pkg.version}</span>
                    </div>
                </div>
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={handleMouseDown}
                className={clsx(
                    "absolute top-0 right-0 w-[4px] h-full cursor-col-resize transition-colors z-10 select-none",
                    isDragging ? "bg-[var(--primary)]" : "bg-transparent hover:bg-[var(--primary)]"
                )}/>

        </div>);

}