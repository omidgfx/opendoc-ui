import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import MethodBadge from '../common/MethodBadge';
import { Tip } from '../common/Tooltip';

export interface TabItem {
    id: string;
    path: string;
    method: string;
    isPreview: boolean;
    label: string;
}

interface EndpointTabsProps {
    tabs: TabItem[];
    activeTabId: string | null;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onDoubleClickTab: (id: string) => void;
    onCloseAllLeft: (id: string) => void;
    onCloseAllRight: (id: string) => void;
    onCloseOthers: (id: string) => void;
    onReorderTabs: (fromIndex: number, toIndex: number) => void;
}

type ContextMenuState = {
    x: number;
    y: number;
    tabId: string;
} | null;

export default function EndpointTabs({
    tabs,
    activeTabId,
    onSelectTab,
    onCloseTab,
    onDoubleClickTab,
    onCloseAllLeft,
    onCloseAllRight,
    onCloseOthers,
    onReorderTabs,
}: EndpointTabsProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

    // Drag and drop state.
    // `dropTarget` stores which gap the tab will land in: a tab index plus the
    // side of that tab the indicator belongs on. The side matters because the
    // reorder is direction-dependent — see `sideForTarget` below.
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dropTarget, setDropTarget] = useState<{ index: number; side: 'left' | 'right' } | null>(null);

    // Close context menu on click outside
    useEffect(() => {
        if (!contextMenu) return;
        const handler = () => setContextMenu(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [contextMenu]);

    // Close context menu on scroll
    useEffect(() => {
        if (!contextMenu) return;
        const handler = () => setContextMenu(null);
        window.addEventListener('scroll', handler, true);
        return () => window.removeEventListener('scroll', handler, true);
    }, [contextMenu]);

    // Wheel event handler: convert vertical scroll to horizontal
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            // Only intercept vertical scroll or when shift is held
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, tabId });
    }, []);

    const handleMiddleClick = useCallback((e: React.MouseEvent, tabId: string) => {
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            onCloseTab(tabId);
        }
    }, [onCloseTab]);

    const scrollToActive = useCallback(() => {
        if (!scrollRef.current || !activeTabId) return;
        const activeEl = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement;
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }, [activeTabId]);

    useEffect(() => {
        scrollToActive();
    }, [activeTabId, scrollToActive]);

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        // Add dragging class after a tick
        setTimeout(() => {
            const el = e.currentTarget as HTMLElement;
            el.classList.add('dragging');
        }, 0);
    }, []);

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        const el = e.currentTarget as HTMLElement;
        el.classList.remove('dragging');
        setDraggedIndex(null);
        setDropTarget(null);
    }, []);

    // Which side of the hovered tab the drop indicator belongs on: a tab dragged
    // right lands after the hovered tab, dragged left it lands before it.
    const sideForTarget = useCallback((from: number, to: number): 'left' | 'right' =>
        (to > from ? 'right' : 'left'), []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedIndex === null || draggedIndex === index) {
            setDropTarget(null);
            return;
        }
        setDropTarget({ index, side: sideForTarget(draggedIndex, index) });
    }, [draggedIndex, sideForTarget]);

    // Only clear the indicator when the pointer genuinely leaves the tab bar.
    // Moving between two adjacent tabs fires dragleave on the old tab *after*
    // dragenter on the new one, so clearing unconditionally made the indicator
    // flicker and disappear.
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setDropTarget(null);
    }, []);

    const commitDrop = useCallback((fromIndex: number, toIndex: number) => {
        if (isNaN(fromIndex) || fromIndex === toIndex) return;
        // Moving the preview tab means you intend to keep it — promote it first.
        const draggedTab = tabs[fromIndex];
        if (draggedTab?.isPreview) {
            onDoubleClickTab(draggedTab.id);
        }
        onReorderTabs(fromIndex, toIndex);
    }, [onReorderTabs, tabs, onDoubleClickTab]);

    const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        commitDrop(parseInt(e.dataTransfer.getData('text/plain'), 10), toIndex);
        setDraggedIndex(null);
        setDropTarget(null);
    }, [commitDrop]);

    // ---- Trailing drop zone -------------------------------------------------
    // The flex row is only as wide as its tabs, so the empty space to the right
    // of the last tab belonged to no drop target at all. Dropping there did
    // nothing and showed nothing. This zone flexes to fill that space and drops
    // at the end of the bar.
    const handleTrailingDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedIndex === null) return;
        const last = tabs.length - 1;
        // Dragging the last tab into the trailing space is a no-op.
        setDropTarget(draggedIndex === last ? null : { index: last, side: 'right' });
    }, [draggedIndex, tabs.length]);

    const handleTrailingDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        commitDrop(parseInt(e.dataTransfer.getData('text/plain'), 10), tabs.length - 1);
        setDraggedIndex(null);
        setDropTarget(null);
    }, [commitDrop, tabs.length]);

    if (tabs.length === 0) return null;

    const tabIndex = (id: string) => tabs.findIndex(t => t.id === id);

    return (
        <>
            <div className="endpoint-tabs-bar border-b bg-[var(--background)] border-[var(--border)] shrink-0 select-none">
                <div
                    ref={scrollRef}
                    className="endpoint-tabs-scroll scrollbar-thin"
                >
                    {tabs.map((tab, index) => {
                        const isActive = tab.id === activeTabId;
                        const isHovered = tab.id === hoveredTabId;
                        const isDragging = draggedIndex === index;
                        const isDropTarget = dropTarget?.index === index && draggedIndex !== index;
                        // The indicator is rendered as a real element rather than a
                        // box-shadow so it can sit on either edge and stay visible on
                        // the very last tab, where an inset shadow used to be clipped.
                        const showLeftIndicator = isDropTarget && dropTarget?.side === 'left';
                        const showRightIndicator = isDropTarget && dropTarget?.side === 'right';
                        return (
                            <Tip key={tab.id} content={`${tab.method.toUpperCase()} ${tab.path}`} placement="bottom">
                                <div
                                    data-tab-id={tab.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, index)}
                                    className={clsx(
                                        'endpoint-tab group shrink-0 flex items-center gap-1.5 px-2 py-1.5 cursor-default transition-all border-r border-[var(--border)] min-w-0 max-w-[200px]',
                                        isActive
                                            ? 'bg-[var(--surface)] text-[var(--text-heading)]'
                                            : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
                                        isDragging && 'dragging cursor-grabbing',
                                        !isDragging && 'cursor-pointer',
                                    )}
                                    onClick={() => onSelectTab(tab.id)}
                                    onDoubleClick={() => { if (tab.isPreview) onDoubleClickTab(tab.id); }}
                                    onMouseDown={(e) => handleMiddleClick(e, tab.id)}
                                    onContextMenu={(e) => handleContextMenu(e, tab.id)}
                                    onMouseEnter={() => setHoveredTabId(tab.id)}
                                    onMouseLeave={() => setHoveredTabId(null)}
                                >
                                    {showLeftIndicator && (
                                        <span className="endpoint-tab-drop-indicator left" />
                                    )}
                                    {showRightIndicator && (
                                        <span className="endpoint-tab-drop-indicator right" />
                                    )}
                                    {isActive && (
                                        <span className="endpoint-tab-active-indicator" />
                                    )}
                                    <MethodBadge method={tab.method} size="xs" className="shrink-0 w-8 h-3.5" />
                                    <span
                                        className={clsx(
                                            'text-[11px] truncate font-medium inline-block pr-0.5',
                                            tab.isPreview && 'italic',
                                        )}
                                    >
                                        {tab.label}
                                    </span>
                                    <button
                                        className={clsx(
                                            'endpoint-tab-close shrink-0 size-4 rounded flex items-center justify-center transition-all cursor-pointer',
                                            isHovered || isActive
                                                ? 'opacity-100 hover:bg-[var(--method-delete)]/15 hover:text-[var(--method-delete)]'
                                                : 'opacity-0 pointer-events-none',
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCloseTab(tab.id);
                                        }}
                                    >
                                        <i className="ph ph-x text-[10px]" />
                                    </button>
                                </div>
                            </Tip>
                        );
                    })}
                    {/* Fills the empty space after the last tab so dropping there
                        targets the end of the bar instead of falling through. */}
                    <div
                        className="endpoint-tabs-trailing"
                        onDragOver={handleTrailingDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleTrailingDrop}
                        aria-hidden="true"
                    />
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-[5000] min-w-[180px] rounded-xl border shadow-xl py-1 bg-[var(--surface)] border-[var(--border)] animate-fade-in"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => { onCloseAllLeft(contextMenu.tabId); setContextMenu(null); }}
                        disabled={tabIndex(contextMenu.tabId) === 0}
                    >
                        <i className="ph ph-arrow-left text-[12px] text-[var(--text-muted)]" />
                        Close All to the Left
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => { onCloseAllRight(contextMenu.tabId); setContextMenu(null); }}
                        disabled={tabIndex(contextMenu.tabId) === tabs.length - 1}
                    >
                        <i className="ph ph-arrow-right text-[12px] text-[var(--text-muted)]" />
                        Close All to the Right
                    </button>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => { onCloseOthers(contextMenu.tabId); setContextMenu(null); }}
                        disabled={tabs.length <= 1}
                    >
                        <i className="ph ph-x-circle text-[12px] text-[var(--method-delete)]" />
                        Close Others
                    </button>
                </div>
            )}
        </>
    );
}