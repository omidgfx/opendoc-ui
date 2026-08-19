import {useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';
import {Tip} from './Tooltip';
import {readPortalThemeVariables} from '../../utils/theme/themeCss';
import {useHorizontalWheelScroll} from '../../hooks/useHorizontalWheelScroll';

export interface AdaptiveTabItem {
    id: string;
    label: string;
    /** Extra help shown on hover and inside the overflow menu. */
    description?: string;
}

interface AdaptiveTabStripProps {
    items: AdaptiveTabItem[];
    activeId: string;
    onSelect: (id: string) => void;
    /** Caption rendered above the row, e.g. "One of". */
    label?: string;
    /** Caption node, for callers that colour their own label. */
    labelNode?: ReactNode;
    ariaLabel: string;
}

/** A tab counts as visible once this much of it is inside the rail. */
const VISIBLE_RATIO = 0.7;

/**
 * One scrollable row of choices. Every alternative stays on the rail — it
 * scrolls with touch, trackpad and mouse wheel and hides its scrollbar — while
 * the ⋮ menu lists only the ones that are currently out of sight, and picking
 * one scrolls the rail to it. Used wherever a schema offers alternatives
 * (oneOf / anyOf), which could otherwise throw an unbounded number of buttons
 * onto the page.
 */
export default function AdaptiveTabStrip({
    items,
    activeId,
    onSelect,
    label,
    labelNode,
    ariaLabel,
}: AdaptiveTabStripProps) {
    const railRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef(new Map<string, HTMLButtonElement>());
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [hiddenIds, setHiddenIds] = useState<string[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({top: 0, left: 0, width: 240, openAbove: false, maxHeight: 288});
    useHorizontalWheelScroll(railRef);
    const measureHidden = useCallback(() => {
        const rail = railRef.current;
        if (!rail) return;
        const railRect = rail.getBoundingClientRect();
        const hidden = items
            .filter(item => {
                const tab = tabRefs.current.get(item.id);
                if (!tab) return false;
                const rect = tab.getBoundingClientRect();
                const overlap = Math.min(rect.right, railRect.right) - Math.max(rect.left, railRect.left);
                return rect.width > 0 && overlap / rect.width < VISIBLE_RATIO;
            })
            .map(item => item.id);
        setHiddenIds(current =>
            current.length === hidden.length && current.every((id, index) => id === hidden[index]) ? current : hidden,
        );
    }, [items]);
    useLayoutEffect(() => {
        measureHidden();
        const rail = railRef.current;
        if (!rail) return;
        const observer = new ResizeObserver(measureHidden);
        observer.observe(rail);
        Array.from(rail.children).forEach(child => observer.observe(child));
        return () => observer.disconnect();
    }, [measureHidden]);
    useEffect(() => {
        // Keep the selected branch reachable without hunting for it.
        tabRefs.current.get(activeId)?.scrollIntoView({block: 'nearest', inline: 'nearest'});
        measureHidden();
    }, [activeId, measureHidden]);
    const updateMenuPosition = useCallback((optionCount: number) => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect || typeof window === 'undefined') return;
        const width = Math.min(260, Math.max(200, window.innerWidth - 16));
        const estimatedHeight = Math.min(288, optionCount * 40 + 8);
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
        const spaceAbove = Math.max(0, rect.top - 8);
        const openAbove = spaceBelow < Math.min(estimatedHeight, 140) && spaceAbove > spaceBelow;
        setMenuPosition({
            top: openAbove ? rect.top - 4 : rect.bottom + 4,
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
            width,
            openAbove,
            maxHeight: Math.max(96, Math.min(288, openAbove ? spaceAbove : spaceBelow)),
        });
    }, []);
    useEffect(() => {
        if (!menuOpen) return;
        updateMenuPosition(hiddenIds.length);
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
            setMenuOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        const onViewportChange = () => setMenuOpen(false);
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('scroll', onViewportChange, true);
        };
    }, [menuOpen, hiddenIds.length, updateMenuPosition]);
    useEffect(() => {
        if (hiddenIds.length === 0) setMenuOpen(false);
    }, [hiddenIds.length]);
    if (items.length === 0) return null;
    const hidden = new Set(hiddenIds);
    const reveal = (id: string) => {
        onSelect(id);
        setMenuOpen(false);
        const tab = tabRefs.current.get(id);
        tab?.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'});
    };
    return (
        <div className="min-w-0 space-y-1.5">
            {labelNode ||
                (label && (
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        {label}
                    </span>
                ))}
            <div className="flex min-w-0 items-center gap-1.5">
                <div
                    ref={railRef}
                    role="tablist"
                    aria-label={ariaLabel}
                    onScroll={measureHidden}
                    className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none scroll-smooth"
                >
                    {items.map(item => {
                        const isActive = item.id === activeId;
                        const tab = (
                            <button
                                key={item.id}
                                ref={node => {
                                    if (node) tabRefs.current.set(item.id, node);
                                    else tabRefs.current.delete(item.id);
                                }}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onSelect(item.id)}
                                className={clsx(
                                    'shrink-0 cursor-pointer select-none rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                                    isActive
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                        : 'bg-[var(--text-muted)]/5 border-[var(--border)]/10 hover:bg-[var(--text-muted)]/15',
                                )}
                            >
                                {item.label}
                            </button>
                        );
                        return item.description ? (
                            <Tip key={item.id} content={item.description}>
                                {tab}
                            </Tip>
                        ) : (
                            tab
                        );
                    })}
                </div>
                {hiddenIds.length > 0 && (
                    <Tip content={`${hiddenIds.length} more out of view`}>
                        <button
                            ref={buttonRef}
                            type="button"
                            aria-label={`Show ${hiddenIds.length} option${hiddenIds.length === 1 ? '' : 's'} that ${
                                hiddenIds.length === 1 ? 'is' : 'are'
                            } out of view`}
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                            onClick={() => setMenuOpen(open => !open)}
                            className={clsx(
                                'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors',
                                menuOpen
                                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                                    : 'border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]',
                            )}
                        >
                            <i className="ph ph-dots-three-vertical text-[14px]" />
                        </button>
                    </Tip>
                )}
            </div>
            {/* Portalled, because the rail itself has to clip its content. */}
            {menuOpen &&
                hiddenIds.length > 0 &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        aria-label={ariaLabel}
                        className="fixed z-[999999] overflow-y-auto rounded-xl border p-1 shadow-2xl scrollbar-thin bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
                        style={{
                            top: menuPosition.top,
                            left: menuPosition.left,
                            width: menuPosition.width,
                            maxHeight: menuPosition.maxHeight,
                            transform: menuPosition.openAbove ? 'translateY(-100%)' : undefined,
                            ...readPortalThemeVariables(buttonRef.current),
                        }}
                    >
                        {items
                            .filter(item => hidden.has(item.id))
                            .map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={item.id === activeId}
                                    onClick={() => reveal(item.id)}
                                    className={clsx(
                                        'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors',
                                        item.id === activeId
                                            ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                            : 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    <span className="w-full truncate">{item.label}</span>
                                    {item.description && (
                                        <span className="w-full truncate text-[10px] font-normal text-[var(--text-muted)]">
                                            {item.description}
                                        </span>
                                    )}
                                </button>
                            ))}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
