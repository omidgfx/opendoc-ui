import React, {createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

interface TooltipContextValue {
    delay: number;
}

const TooltipContext = createContext<TooltipContextValue>({delay: 250});

/** Wrap the app. Provides sensible defaults to all <Tip> instances. */
export function TooltipProvider({
                                    children,
                                    delay = 300,
                                }: {
    children: React.ReactNode;
    delay?: number;
}) {
    return <TooltipContext.Provider value={{delay}}>{children}</TooltipContext.Provider>;
}

interface TipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    placement?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
    disabled?: boolean;
    /** Allow the pointer to travel into the tooltip content. */
    interactive?: boolean;
    /** Use the theme surface instead of the normal dark tooltip treatment. */
    variant?: 'default' | 'surface';
    /** Preserve a full-width block trigger such as an endpoint row. */
    fullWidth?: boolean;
}

type TooltipPlacement = NonNullable<TipProps['placement']>;

interface TooltipSize {
    width: number;
    height: number;
}

interface TooltipPosition {
    top: number;
    left: number;
    transform: string;
    placement: TooltipPlacement;
}

const blockElements = new Set(['article', 'div', 'form', 'li', 'ol', 'p', 'section', 'ul']);
const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE = 8;
const INITIAL_TOOLTIP_SIZE: TooltipSize = {width: 320, height: 48};

const samePosition = (left: TooltipPosition, right: TooltipPosition): boolean =>
    left.top === right.top
    && left.left === right.left
    && left.transform === right.transform
    && left.placement === right.placement;

const clampCenter = (value: number, size: number, viewport: number): number => {
    const min = Math.min(TOOLTIP_EDGE + size / 2, viewport / 2);
    const max = Math.max(viewport - TOOLTIP_EDGE - size / 2, viewport / 2);
    return Math.min(Math.max(value, min), max);
};

/** Pick the requested side when it fits, otherwise flip to a visible side. */
const positionFor = (
    rect: DOMRect,
    requested: TooltipPlacement,
    size: TooltipSize,
): TooltipPosition => {
    const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
    const available: Record<TooltipPlacement, number> = {
        top: rect.top,
        bottom: viewportHeight - rect.bottom,
        left: rect.left,
        right: viewportWidth - rect.right,
    };
    const required: Record<TooltipPlacement, number> = {
        top: size.height + TOOLTIP_GAP,
        bottom: size.height + TOOLTIP_GAP,
        left: size.width + TOOLTIP_GAP,
        right: size.width + TOOLTIP_GAP,
    };
    const fallbackOrder: Record<TooltipPlacement, TooltipPlacement[]> = {
        top: ['top', 'bottom', 'right', 'left'],
        bottom: ['bottom', 'top', 'right', 'left'],
        left: ['left', 'right', 'bottom', 'top'],
        right: ['right', 'left', 'bottom', 'top'],
    };
    const resolved = fallbackOrder[requested].find(side => available[side] >= required[side])
        || fallbackOrder[requested].slice().sort((a, b) => available[b] - available[a])[0];
    const centerX = clampCenter(rect.left + rect.width / 2, size.width, viewportWidth);
    const centerY = clampCenter(rect.top + rect.height / 2, size.height, viewportHeight);

    if (resolved === 'bottom') return {top: rect.bottom + TOOLTIP_GAP, left: centerX, transform: 'translateX(-50%)', placement: resolved};
    if (resolved === 'left') return {top: centerY, left: Math.max(TOOLTIP_EDGE, rect.left - TOOLTIP_GAP), transform: 'translate(-100%, -50%)', placement: resolved};
    if (resolved === 'right') return {top: centerY, left: Math.min(viewportWidth - TOOLTIP_EDGE, rect.right + TOOLTIP_GAP), transform: 'translateY(-50%)', placement: resolved};
    return {top: Math.max(TOOLTIP_EDGE, rect.top - TOOLTIP_GAP), left: centerX, transform: 'translate(-50%, -100%)', placement: resolved};
};

/**
 * A portal tooltip with fixed positioning and collision-aware side flipping.
 * It intentionally avoids callback refs from positioning libraries: switching
 * specifications can unmount many tooltips at once, and a stateful ref setter
 * during that deletion can create a React maximum-update-depth loop. The object
 * refs below never update React state and the portal keeps the tooltip above
 * scroll containers and dialogs.
 */
export function Tip({
                        content,
                        children,
                        placement = 'top',
                        delay: delayProp,
                        disabled,
                        interactive = false,
                        variant = 'default',
                        fullWidth = false,
                    }: TipProps) {
    const {delay: ctxDelay} = useContext(TooltipContext);
    const delay = delayProp ?? ctxDelay;
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<TooltipPosition | null>(null);
    const timerRef = useRef<number | null>(null);
    const wrapperRef = useRef<HTMLElement | null>(null);
    const tooltipRef = useRef<HTMLSpanElement | null>(null);
    const setWrapperRef = useCallback((node: HTMLElement | null) => {
        wrapperRef.current = node;
    }, []);
    const tooltipId = `tooltip-${useId().replace(/:/g, '')}`;

    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };
    const show = () => {
        clearTimer();
        if (delay <= 0) {
            setOpen(true);
            return;
        }
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setOpen(true);
        }, delay);
    };
    const close = () => {
        clearTimer();
        setOpen(false);
        setPosition(null);
    };
    const hide = () => {
        clearTimer();
        if (!interactive) {
            close();
            return;
        }
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            close();
        }, 180);
    };

    useEffect(() => () => clearTimer(), []);

    const updatePosition = useCallback(() => {
        const node = wrapperRef.current;
        if (!node) return;
        const tooltip = tooltipRef.current;
        const size = tooltip
            ? {width: tooltip.offsetWidth, height: tooltip.offsetHeight}
            : INITIAL_TOOLTIP_SIZE;
        const next = positionFor(node.getBoundingClientRect(), placement, size);
        setPosition(current => current && samePosition(current, next) ? current : next);
    }, [placement]);

    // Measure while open and keep the fixed portal aligned with the trigger.
    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, updatePosition]);

    // The first position uses a safe size estimate. Once the portal has mounted,
    // measure its real dimensions and flip/clamp again without setting state if
    // the position is unchanged.
    useLayoutEffect(() => {
        if (!open || !position) return;
        const frame = window.requestAnimationFrame(updatePosition);
        return () => window.cancelAnimationFrame(frame);
    }, [open, position, updatePosition]);

    const childProps = children.props as Record<string, any>;
    const existingDescribedBy = typeof childProps['aria-describedby'] === 'string' ? childProps['aria-describedby'] : '';
    const describedBy = open ? [existingDescribedBy, tooltipId].filter(Boolean).join(' ') : existingDescribedBy || undefined;
    const Wrapper = typeof children.type === 'string' && blockElements.has(children.type) ? 'div' : 'span';
    const wrapperClassName = fullWidth ? 'relative block w-full' : 'relative inline-flex max-w-full';
    const tooltipThemeClass = variant === 'surface'
        ? 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)]'
        : 'bg-[var(--text-heading)] text-[var(--background)]';

    if (disabled || !content) return children;

    return (
        <Wrapper
            ref={setWrapperRef}
            className={wrapperClassName}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocusCapture={show}
            onBlurCapture={hide}
        >
            {React.cloneElement(children as React.ReactElement<any>, {
                title: undefined,
                'aria-describedby': describedBy,
            })}
            {open && position && typeof document !== 'undefined' && createPortal(
                <span
                    ref={tooltipRef}
                    id={tooltipId}
                    role="tooltip"
                    onMouseEnter={interactive ? show : undefined}
                    onMouseLeave={interactive ? hide : undefined}
                    onFocusCapture={interactive ? show : undefined}
                    onBlurCapture={interactive ? hide : undefined}
                    style={{top: position.top, left: position.left, transform: position.transform}}
                    className={`fixed z-[10000] w-max max-w-[320px] whitespace-normal break-words rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-snug shadow-2xl sm:max-w-[380px] ${interactive ? 'pointer-events-auto' : 'pointer-events-none'} ${tooltipThemeClass}`}
                >
                    {content}
                </span>,
                document.body,
            )}
        </Wrapper>
    );
}
