import {useRef, type ReactNode} from 'react';
import clsx from 'clsx';
import {useHorizontalWheelScroll} from '../../hooks/useHorizontalWheelScroll';

interface ScrollableRowProps {
    children: ReactNode;
    className?: string;
    /** Keeps the content on one line, which is what routes and URLs want. */
    nowrap?: boolean;
}

/**
 * Content that is too wide stays reachable: it scrolls sideways with touch,
 * trackpad and mouse wheel, without a scrollbar and without truncating what it
 * holds. Used wherever an endpoint route or a URL is printed.
 */
export default function ScrollableRow({children, className, nowrap = true}: ScrollableRowProps) {
    const ref = useRef<HTMLDivElement>(null);
    useHorizontalWheelScroll(ref);
    return (
        <div
            ref={ref}
            className={clsx('min-w-0 overflow-x-auto scrollbar-none', nowrap && 'whitespace-nowrap', className)}
        >
            {children}
        </div>
    );
}
