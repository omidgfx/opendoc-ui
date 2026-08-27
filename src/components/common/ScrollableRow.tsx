import {useEffect, useRef, type ReactNode} from 'react';
import clsx from 'clsx';
import {useHorizontalStrip} from '../../hooks/useHorizontalStrip';

interface ScrollableRowProps {
    children: ReactNode;
    className?: string;
    /** Keeps the content on one line, which is what routes and URLs want. */
    nowrap?: boolean;
    /** Off inside a button or a link, which already takes the focus. */
    focusable?: boolean;
}

/**
 * Content that is too wide stays reachable: it scrolls sideways with touch,
 * trackpad, mouse wheel and drag, without a scrollbar and without truncating
 * what it holds. A soft fade marks the side that still has content — the
 * scrolling equivalent of an ellipsis. End chevrons appear on hover only when
 * that side can still scroll. While it does scroll it takes the focus, so the
 * keyboard reaches the rest of the line too.
 */
export default function ScrollableRow({children, className, nowrap = true, focusable = true}: ScrollableRowProps) {
    const ref = useRef<HTMLDivElement>(null);
    const {edges, overflows, hovered, dragging, onScroll, onHoverEnter, onHoverLeave, scrollStart, scrollEnd, measure} =
        useHorizontalStrip(ref);

    useEffect(() => {
        measure();
    }, [measure, children]);

    const fade =
        edges.start && edges.end
            ? 'linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)'
            : edges.end
              ? 'linear-gradient(90deg, #000 calc(100% - 16px), transparent 100%)'
              : edges.start
                ? 'linear-gradient(90deg, transparent 0, #000 16px)'
                : undefined;

    const showStart = hovered && overflows && edges.start;
    const showEnd = hovered && overflows && edges.end;

    return (
        <div className={clsx('relative min-w-0', className)} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
            <div
                ref={ref}
                onScroll={onScroll}
                tabIndex={focusable && overflows ? 0 : undefined}
                role={focusable && overflows ? 'group' : undefined}
                className={clsx(
                    'min-w-0 overflow-x-auto scrollbar-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40',
                    nowrap && 'whitespace-nowrap',
                    overflows && (dragging ? 'cursor-grabbing select-none' : 'cursor-grab'),
                )}
                style={fade ? {maskImage: fade, WebkitMaskImage: fade} : undefined}
            >
                {children}
            </div>
            {showStart && (
                <button
                    type="button"
                    aria-label="Scroll left"
                    onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        scrollStart();
                    }}
                    className="absolute left-0 top-1/2 z-[2] flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)] shadow-sm hover:bg-[var(--surface-hover)] cursor-pointer"
                >
                    <i className="ph ph-caret-left text-[12px]" />
                </button>
            )}
            {showEnd && (
                <button
                    type="button"
                    aria-label="Scroll right"
                    onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        scrollEnd();
                    }}
                    className="absolute right-0 top-1/2 z-[2] flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)] shadow-sm hover:bg-[var(--surface-hover)] cursor-pointer"
                >
                    <i className="ph ph-caret-right text-[12px]" />
                </button>
            )}
        </div>
    );
}
