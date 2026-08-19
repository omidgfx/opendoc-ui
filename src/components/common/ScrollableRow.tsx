import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import {useHorizontalWheelScroll} from '../../hooks/useHorizontalWheelScroll';

interface ScrollableRowProps {
    children: ReactNode;
    className?: string;
    /** Keeps the content on one line, which is what routes and URLs want. */
    nowrap?: boolean;
}

const EDGE = 2;

/**
 * Content that is too wide stays reachable: it scrolls sideways with touch,
 * trackpad and mouse wheel, without a scrollbar and without truncating what it
 * holds. A soft fade marks the side that still has content — the scrolling
 * equivalent of an ellipsis, which a scroll container cannot show.
 */
export default function ScrollableRow({children, className, nowrap = true}: ScrollableRowProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({start: false, end: false});
    useHorizontalWheelScroll(ref);
    const measure = useCallback(() => {
        const element = ref.current;
        if (!element) return;
        const maxScroll = element.scrollWidth - element.clientWidth;
        const next = {
            start: element.scrollLeft > EDGE,
            end: maxScroll > EDGE && element.scrollLeft < maxScroll - EDGE,
        };
        setEdges(current => (current.start === next.start && current.end === next.end ? current : next));
    }, []);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [measure, children]);
    const fade =
        edges.start && edges.end
            ? 'linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)'
            : edges.end
              ? 'linear-gradient(90deg, #000 calc(100% - 16px), transparent 100%)'
              : edges.start
                ? 'linear-gradient(90deg, transparent 0, #000 16px)'
                : undefined;
    return (
        <div
            ref={ref}
            onScroll={measure}
            className={clsx('min-w-0 overflow-x-auto scrollbar-none', nowrap && 'whitespace-nowrap', className)}
            style={fade ? {maskImage: fade, WebkitMaskImage: fade} : undefined}
        >
            {children}
        </div>
    );
}
