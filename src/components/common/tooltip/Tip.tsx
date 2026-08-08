import React, {useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {TooltipContext} from './TooltipContext';
import {INITIAL_TOOLTIP_SIZE, positionFor, samePosition, type TooltipPosition,} from './tooltipPosition';

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
    /** Extra classes for sizing the trigger wrapper. */
    wrapperClassName?: string;
    /** Render a close button inside the tooltip so users can dismiss it. */
    closable?: boolean;
}


const blockElements = new Set(['article', 'div', 'form', 'li', 'ol', 'p', 'section', 'ul']);

/**
 * A portal tooltip with fixed positioning and collision-aware side flipping.
 * It intentionally avoids callback refs from positioning libraries: switching
 * specifications can unmount many tooltips at once, and a stateful ref setter
 * during that deletion can create a React maximum-update-depth loop. The object
 * refs below never update React state and the portal keeps the tooltip above
 * scroll containers and dialogs.
 */
export default function Tip({
                                content,
                                children,
                                placement = 'top',
                                delay: delayProp,
                                disabled,
                                interactive = false,
                                variant = 'default',
                                fullWidth = false,
                                wrapperClassName = '',
                                closable = false,
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
    const wrapperClassNameResolved = `${fullWidth ? 'relative block w-full' : 'relative inline-flex max-w-full'} ${wrapperClassName}`.trim();
    const tooltipThemeClass = variant === 'surface'
        ? 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)]'
        : 'bg-[var(--text-heading)] text-[var(--background)]';

    if (disabled || !content) return children;

    return (
        <Wrapper
            ref={setWrapperRef}
            className={wrapperClassNameResolved}
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
                    className={`fixed z-[10000] w-max max-w-[320px] whitespace-normal break-words rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-snug shadow-2xl sm:max-w-[380px] ${interactive || closable ? 'pointer-events-auto' : 'pointer-events-none'} ${tooltipThemeClass}`}
                >
                    {closable ? (
                        <span className="flex items-start gap-1.5">
                            <span className="min-w-0 flex-1">{content}</span>
                            <button
                                type="button"
                                aria-label="Close tooltip"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    close();
                                }}
                                className="flex size-4 shrink-0 items-center justify-center rounded-full text-inherit opacity-60 transition-opacity hover:bg-[var(--primary)]/15 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 cursor-pointer"
                            >
                                <i className="ph ph-x text-[11px]" aria-hidden="true"/>
                            </button>
                        </span>
                    ) : content}
                </span>,
                document.body,
            )}
        </Wrapper>
    );
}
