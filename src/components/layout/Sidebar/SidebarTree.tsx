import type {MouseEvent, MutableRefObject} from 'react';
import clsx from 'clsx';
import type {SidebarConfig, TreeNode} from '@/src/utils/sidebar/tree';
import {compactMethodLabel} from '@/src/utils/sidebar/tree';
import MethodBadge from '@/src/components/common/MethodBadge';
import {Tip} from '@/src/components/common/Tooltip';
import TreeExpander from './TreeExpander';
import SearchHighlightedText from './SearchHighlightedText';

const ROW_ELBOW_Y = 20;
const GUIDE_X = 13;
const ELBOW_W = 11;
type Endpoint = {
    path: string;
    method: string;
};
type ContextTarget = {
    type: 'endpoint';
    path: string;
    method: string;
};

interface SidebarTreeProps {
    node: TreeNode;
    nodePath: string;
    collapsedNodes: Record<string, boolean>;
    countEndpoints: (node: TreeNode) => number;
    ancestorNodePaths: Set<string>;
    selectedEndpoint: Endpoint | null;
    selectedLeafFolderPath: string | null;
    showHome: boolean;
    showSchemaExplorer: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    assistantContextEndpoints: Endpoint[];
    searchQuery: string;
    endpointFilterQuery: string;
    config: SidebarConfig;
    endpointRefs: MutableRefObject<Record<string, HTMLAnchorElement | null>>;
    onToggleNode: (path: string) => void;
    getEndpointHref?: (path: string, method: string) => string;
    onSelectEndpoint: (path: string, method: string) => void;
    onOpenPermanent?: (path: string, method: string) => void;
    onContextMenu: (event: MouseEvent, target: ContextTarget) => void;
}

export default function SidebarTree(props: SidebarTreeProps) {
    const {
        node,
        nodePath,
        collapsedNodes,
        countEndpoints,
        ancestorNodePaths,
        selectedEndpoint,
        selectedLeafFolderPath,
        showHome,
        showSchemaExplorer,
        showAbout,
        showAssistant,
        assistantContextEndpoints,
        searchQuery,
        endpointFilterQuery,
        config: sidebarConfig,
        endpointRefs,
        onToggleNode: toggleNode,
        getEndpointHref,
        onSelectEndpoint,
        onOpenPermanent: onMiddleClickEndpoint,
        onContextMenu: openContextMenu,
    } = props;
    const endpointHighlightQuery = [searchQuery.trim(), endpointFilterQuery.trim()].filter(Boolean).join(' ');
    const render = (node: TreeNode, nodePath: string) => {
        const collapsed = !!collapsedNodes[nodePath];
        const childNames = Object.keys(node.children);
        const total = countEndpoints(node);
        const isAncestor = ancestorNodePaths.has(nodePath);
        if (!childNames.length && !node.endpoints.length) return null;
        type Row =
            | {
                  kind: 'folder';
                  key: string;
                  childName: string;
                  childPath: string;
                  onPath: boolean;
              }
            | {
                  kind: 'endpoint';
                  key: string;
                  ep: TreeNode['endpoints'][number];
                  onPath: boolean;
              };
        const endpointIsSelected = (ep: TreeNode['endpoints'][number]) =>
            selectedEndpoint?.path === ep.path &&
            selectedEndpoint?.method.toLowerCase() === ep.method.toLowerCase() &&
            !showHome &&
            !showSchemaExplorer &&
            !showAbout;
        const isRenderable = (n: TreeNode): boolean =>
            n.endpoints.length > 0 || Object.values(n.children).some(isRenderable);
        const rows: Row[] = [
            ...childNames
                .filter(cn => isRenderable(node.children[cn]))
                .map((cn): Row => {
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
                onPath: nodePath === selectedLeafFolderPath && endpointIsSelected(ep),
            })),
        ];
        const pathRowIndex = rows.findIndex(r => r.onPath);
        const renderGuides = (i: number, onPath: boolean) => {
            const isLastRow = i === rows.length - 1;
            const accent =
                pathRowIndex < 0 ? 'none' : i < pathRowIndex ? 'full' : i === pathRowIndex ? 'elbow' : 'none';
            return (
                <>
                    <span
                        className={clsx('absolute h-px', onPath ? 'bg-[var(--primary)]' : 'bg-[var(--text)]/25')}
                        style={{left: -GUIDE_X + 1, top: ROW_ELBOW_Y, width: ELBOW_W}}
                        aria-hidden="true"
                    />

                    <span
                        className="absolute top-0 w-px bg-[var(--text)]/25"
                        style={{left: -GUIDE_X, ...(isLastRow ? {height: ROW_ELBOW_Y + 1} : {bottom: 0})}}
                        aria-hidden="true"
                    />

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
                <button
                    onClick={() => toggleNode(nodePath)}
                    className="w-full py-1 text-[11px] font-medium px-1 flex items-center gap-1.5 hover:bg-[var(--surface-hover)] rounded-md transition-colors cursor-pointer text-left focus:outline-none"
                >
                    <TreeExpander collapsed={collapsed} active={isAncestor} />
                    <i
                        className={clsx(
                            'text-[16px] shrink-0 text-[var(--method-put)]',
                            collapsed ? 'ph-fill ph-folder-simple' : 'ph-fill ph-folder-open',
                        )}
                    />
                    <span className="truncate min-w-0">
                        <SearchHighlightedText text={node.name} query={searchQuery} />
                    </span>
                    {!sidebarConfig.hideEndpointCount && (
                        <span className="ms-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0 bg-[var(--text)]/10 text-[var(--text)]/80">
                            {total}
                        </span>
                    )}
                </button>

                {!collapsed && (
                    <div className="relative ml-[9px] pl-[13px]">
                        {rows.map((row, idx) => {
                            if (row.kind === 'folder') {
                                return (
                                    <div key={row.key} className="relative">
                                        {renderGuides(idx, row.onPath)}
                                        {render(node.children[row.childName], row.childPath)}
                                    </div>
                                );
                            }
                            const ep = row.ep;
                            const isSelected = endpointIsSelected(ep);
                            const isAITargeted =
                                showAssistant &&
                                assistantContextEndpoints.some(
                                    endpoint =>
                                        endpoint.path === ep.path &&
                                        endpoint.method.toLowerCase() === ep.method.toLowerCase(),
                                );
                            const summary = ep.operation?.summary || ep.path;
                            return (
                                <div key={row.key} className="relative">
                                    {renderGuides(idx, row.onPath)}
                                    <Tip
                                        placement="right"
                                        fullWidth
                                        content={
                                            <span className="flex flex-col gap-0.5">
                                                <span className="leading-snug">{summary}</span>
                                                <span className="font-mono text-[10px] leading-snug opacity-80">
                                                    {ep.path}
                                                </span>
                                            </span>
                                        }
                                    >
                                        <a
                                            href={getEndpointHref?.(ep.path, ep.method) || `#${ep.method}:${ep.path}`}
                                            ref={el => {
                                                endpointRefs.current[`${ep.method.toLowerCase()}:${ep.path}`] = el;
                                            }}
                                            onClick={e => {
                                                if (e.ctrlKey || e.metaKey) {
                                                    e.preventDefault();
                                                    onMiddleClickEndpoint?.(ep.path, ep.method);
                                                } else if (e.altKey) {
                                                    e.preventDefault();
                                                    window.open(
                                                        getEndpointHref?.(ep.path, ep.method) || e.currentTarget.href,
                                                        '_blank',
                                                        'noopener,noreferrer',
                                                    );
                                                } else {
                                                    e.preventDefault();
                                                    onSelectEndpoint(ep.path, ep.method);
                                                }
                                            }}
                                            onContextMenu={e =>
                                                openContextMenu(e, {
                                                    type: 'endpoint',
                                                    path: ep.path,
                                                    method: ep.method,
                                                })
                                            }
                                            onDoubleClick={e => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (onMiddleClickEndpoint) {
                                                    onMiddleClickEndpoint(ep.path, ep.method);
                                                }
                                            }}
                                            onMouseDown={e => {
                                                if (e.button === 1) e.preventDefault();
                                            }}
                                            onAuxClick={e => {
                                                if (e.button !== 1) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onMiddleClickEndpoint?.(ep.path, ep.method);
                                            }}
                                            className={clsx(
                                                'flex items-center w-full py-1.5 font-medium ps-2 pe-2 rounded-lg text-left transition-all cursor-pointer select-none min-w-0',
                                                isSelected
                                                    ? 'bg-[var(--primary)]/90 text-[var(--primary-contrast)]'
                                                    : 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                            )}
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0 w-full">
                                                <Tip content={ep.method.toUpperCase()} placement="top">
                                                    <MethodBadge
                                                        method={ep.method.toLowerCase()}
                                                        displayLabel={
                                                            sidebarConfig.compactMethodNames
                                                                ? compactMethodLabel(ep.method)
                                                                : undefined
                                                        }
                                                        size="xs"
                                                        className={clsx(
                                                            sidebarConfig.compactMethodNames
                                                                ? 'w-5 h-4 !px-0'
                                                                : 'w-9 h-4',
                                                            'shrink-0',
                                                            isSelected &&
                                                                '!bg-[var(--primary-contrast)]/20 !text-[var(--primary-contrast)] !border-[var(--primary-contrast)]/30',
                                                        )}
                                                    />
                                                </Tip>
                                                {isAITargeted && (
                                                    <Tip content="Targeted in AI assistant">
                                                        <i
                                                            className="ph ph-crosshair shrink-0 text-[13px] text-[var(--primary)]"
                                                            aria-label="Targeted in AI assistant"
                                                        />
                                                    </Tip>
                                                )}
                                                <div className="min-w-0 grow flex flex-col justify-center leading-[1.3333]">
                                                    <span className={clsx('min-w-0 truncate text-[11px]')}>
                                                        <SearchHighlightedText
                                                            text={summary}
                                                            query={endpointHighlightQuery}
                                                            deprecated={!!ep.operation?.deprecated}
                                                        />
                                                    </span>
                                                    {sidebarConfig.displayRoutes && (
                                                        <span
                                                            className={clsx(
                                                                'min-w-0 truncate mt-1 text-[10px] font-mono tracking-[-0.01em] opacity-80',
                                                                isSelected
                                                                    ? 'text-[var(--primary-contrast)]/70'
                                                                    : 'text-[var(--text-muted)]',
                                                            )}
                                                            title={ep.path}
                                                        >
                                                            <SearchHighlightedText
                                                                text={ep.path}
                                                                query={endpointHighlightQuery}
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                                {ep.operation?.deprecated && (
                                                    <Tip content="Deprecated endpoint">
                                                        <i
                                                            className={clsx(
                                                                'ph ph-warning-circle text-[12px] shrink-0',
                                                                isSelected
                                                                    ? 'text-[var(--primary-contrast)]/80'
                                                                    : 'text-[var(--method-put)]/90',
                                                            )}
                                                        />
                                                    </Tip>
                                                )}
                                                {ep.isProtected && !sidebarConfig.hideProtectedIcon && (
                                                    <Tip
                                                        content={
                                                            ep.isAuthorized
                                                                ? 'Authentication configured'
                                                                : 'Requires authentication'
                                                        }
                                                    >
                                                        <i
                                                            className={clsx(
                                                                'ph-fill text-[12px] shrink-0',
                                                                ep.isAuthorized ? 'ph-lock-key-open' : 'ph-lock-key',
                                                                isSelected
                                                                    ? 'text-[var(--primary-contrast)]/90'
                                                                    : ep.isAuthorized
                                                                      ? 'text-[var(--method-get)]'
                                                                      : 'text-[var(--method-delete)]/80',
                                                            )}
                                                        />
                                                    </Tip>
                                                )}
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
    return render(node, nodePath);
}
