import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import {Tip} from './Tooltip';

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
    /** Short caption rendered before the strip, e.g. "One of". */
    label?: string;
    ariaLabel: string;
}

const OVERFLOW_BUTTON_WIDTH = 34;
const GAP = 6;

/**
 * A single row of choices that never wraps: it measures itself, keeps as many
 * tabs as fit and moves the rest into a ⋮ menu, re-deciding whenever its width
 * changes. Used wherever a schema offers alternatives (oneOf / anyOf), which
 * could otherwise throw an unbounded number of buttons onto the page.
 */
export default function AdaptiveTabStrip({items, activeId, onSelect, label, ariaLabel}: AdaptiveTabStripProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(items.length);
    const [menuOpen, setMenuOpen] = useState(false);
    useLayoutEffect(() => {
        const container = containerRef.current;
        const measure = measureRef.current;
        if (!container || !measure) return;
        const recalculate = () => {
            const available = container.clientWidth;
            if (!available) return;
            const widths = Array.from(measure.children).map(child => (child as HTMLElement).offsetWidth);
            let used = 0;
            let fits = 0;
            for (let index = 0; index < widths.length; index += 1) {
                const next = used + widths[index] + (index > 0 ? GAP : 0);
                const needsOverflow = index < widths.length - 1;
                if (next + (needsOverflow ? GAP + OVERFLOW_BUTTON_WIDTH : 0) > available) break;
                used = next;
                fits += 1;
            }
            setVisibleCount(Math.max(1, fits));
        };
        recalculate();
        const observer = new ResizeObserver(recalculate);
        observer.observe(container);
        return () => observer.disconnect();
    }, [items]);
    useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);
    if (items.length === 0) return null;
    const activeIndex = Math.max(
        0,
        items.findIndex(item => item.id === activeId),
    );
    // The active choice always stays visible, even when it lives in the tail.
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
        <div className="flex min-w-0 items-center gap-1.5">
            {label && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {label}
                </span>
            )}
            <div ref={containerRef} className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                {/* Off-screen twin used only to measure the natural tab widths. */}
                <div ref={measureRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 flex">
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
                {overflow.length > 0 && (
                    <div ref={menuRef} className="relative shrink-0">
                        <Tip content={`${overflow.length} more`}>
                            <button
                                type="button"
                                aria-label={`Show ${overflow.length} more options`}
                                aria-expanded={menuOpen}
                                aria-haspopup="menu"
                                onClick={() => setMenuOpen(open => !open)}
                                className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-heading)] transition-colors hover:bg-[var(--surface-hover)]"
                            >
                                <i className="ph ph-dots-three-vertical text-[14px]" />
                            </button>
                        </Tip>
                        {menuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border p-1 shadow-2xl scrollbar-thin bg-[var(--surface)] border-[var(--border)]"
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
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
