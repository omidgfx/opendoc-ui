import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';
import {Tip} from './Tooltip';
import {readPortalThemeVariables} from '../../utils/theme/themeCss';

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
    ariaLabel: string;
}

const GAP = 6;
const OVERFLOW_BUTTON_WIDTH = 28;

/**
 * A single row of choices that never wraps: it measures itself, keeps as many
 * tabs as fit and moves the rest into a ⋮ menu pinned to the right end, which
 * only appears when something genuinely does not fit. Used wherever a schema
 * offers alternatives (oneOf / anyOf), which could otherwise throw an unbounded
 * number of buttons onto the page.
 */
export default function AdaptiveTabStrip({items, activeId, onSelect, label, ariaLabel}: AdaptiveTabStripProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(items.length);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({top: 0, left: 0, width: 240, openAbove: false, maxHeight: 288});
    const activeIndex = Math.max(
        0,
        items.findIndex(item => item.id === activeId),
    );
    useLayoutEffect(() => {
        const row = rowRef.current;
        const measure = measureRef.current;
        if (!row || !measure) return;
        const recalculate = () => {
            const available = row.clientWidth;
            if (!available) return;
            const widths = Array.from(measure.children).map(child => (child as HTMLElement).offsetWidth);
            const total = widths.reduce((sum, width, index) => sum + width + (index > 0 ? GAP : 0), 0);
            if (total <= available) {
                setVisibleCount(widths.length);
                return;
            }
            // Something has to move into the menu, so the row must also reserve
            // room for the overflow button itself.
            const budget = available - OVERFLOW_BUTTON_WIDTH - GAP;
            let used = 0;
            let fits = 0;
            for (let index = 0; index < widths.length; index += 1) {
                const next = used + widths[index] + (index > 0 ? GAP : 0);
                if (next > budget) break;
                used = next;
                fits += 1;
            }
            setVisibleCount(Math.max(1, fits));
        };
        recalculate();
        const observer = new ResizeObserver(recalculate);
        observer.observe(row);
        return () => observer.disconnect();
    }, [items]);
    const updateMenuPosition = useCallback((optionCount: number) => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect || typeof window === 'undefined') return;
        const width = Math.min(260, Math.max(200, window.innerWidth - 16));
        const estimatedHeight = Math.min(288, optionCount * 40 + 8);
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
        const spaceAbove = Math.max(0, rect.top - 8);
        // Flip above when the row sits near the bottom edge, so the menu is
        // never opened off screen.
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
        updateMenuPosition(items.length - visibleCount);
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
    }, [menuOpen, items.length, visibleCount, updateMenuPosition]);
    if (items.length === 0) return null;
    // The selected branch always stays on the row, even when it lives in the tail.
    const shown =
        activeIndex < visibleCount
            ? items.slice(0, visibleCount)
            : [...items.slice(0, Math.max(0, visibleCount - 1)), items[activeIndex]];
    const shownIds = new Set(shown.map(item => item.id));
    const overflow = items.filter(item => !shownIds.has(item.id));
    const tabClassName = (isActive: boolean) =>
        clsx(
            'shrink-0 cursor-pointer select-none rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150',
            isActive
                ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                : 'bg-[var(--text-muted)]/5 border-[var(--border)]/10 hover:bg-[var(--text-muted)]/15',
        );
    return (
        <div className="min-w-0 space-y-1.5">
            {label && (
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {label}
                </span>
            )}
            <div className="flex min-w-0 items-center gap-1.5">
                <div ref={rowRef} className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    {/* Off-screen twin used only to measure the natural tab widths. */}
                    <div
                        ref={measureRef}
                        aria-hidden
                        className="pointer-events-none absolute -left-[9999px] top-0 flex"
                    >
                        {items.map(item => (
                            <span key={item.id} className={tabClassName(false)}>
                                {item.label}
                            </span>
                        ))}
                    </div>
                    <div role="tablist" aria-label={ariaLabel} className="flex min-w-0 items-center gap-1.5">
                        {shown.map(item => {
                            const isActive = item.id === activeId;
                            const tab = (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => onSelect(item.id)}
                                    className={tabClassName(isActive)}
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
                </div>
                {overflow.length > 0 && (
                    <Tip content={`${overflow.length} more`}>
                        <button
                            ref={buttonRef}
                            type="button"
                            aria-label={`Show ${overflow.length} more options`}
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                            onClick={() => setMenuOpen(open => !open)}
                            className={clsx(
                                'ms-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors',
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
            {/* Portalled, because the row itself has to clip its content. */}
            {menuOpen &&
                overflow.length > 0 &&
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
                        {overflow.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={item.id === activeId}
                                onClick={() => {
                                    onSelect(item.id);
                                    setMenuOpen(false);
                                }}
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
