import React, {useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {TooltipContext} from './TooltipContext';
import {positionFor, samePosition, type TooltipPosition} from './tooltipPosition';

interface TipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    placement?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
    disabled?: boolean;
    interactive?: boolean;
    variant?: 'default' | 'surface';
    fullWidth?: boolean;
    wrapperClassName?: string;
    closable?: boolean;
}

const blockElements = new Set(['article', 'div', 'form', 'li', 'ol', 'p', 'section', 'ul']);

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
    const {delay: contextDelay, claim, release} = useContext(TooltipContext);
    const delay = delayProp ?? contextDelay;
    const tooltipId = `tooltip-${useId().replace(/:/g, '')}`;
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [position, setPosition] = useState<TooltipPosition | null>(null);
    const timerRef = useRef<number | null>(null);
    const wrapperRef = useRef<HTMLElement | null>(null);
    const tooltipRef = useRef<HTMLSpanElement | null>(null);
    const pointerDownAtRef = useRef(0);
    const setWrapperRef = useCallback((node: HTMLElement | null) => {
        wrapperRef.current = node;
    }, []);
    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setPending(false);
    }, []);
    const close = useCallback(() => {
        clearTimer();
        release(tooltipId);
        setOpen(false);
        setPosition(null);
    }, [clearTimer, release, tooltipId]);
    const openNow = useCallback(() => {
        setPending(false);
        claim(tooltipId, close);
        setOpen(true);
    }, [claim, close, tooltipId]);
    const show = useCallback(() => {
        clearTimer();
        if (delay <= 0) {
            openNow();
            return;
        }
        setPending(true);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            openNow();
        }, delay);
    }, [clearTimer, delay, openNow]);
    const showFromFocus = useCallback(
        (event: React.FocusEvent) => {
            if (Date.now() - pointerDownAtRef.current < 500) return;
            const surface = (event.target as HTMLElement | null)?.closest<HTMLElement>('.modal-surface');
            const suppressUntil = Number(surface?.dataset.suppressTooltipsUntil || 0);
            if (suppressUntil > Date.now()) return;
            show();
        },
        [show],
    );
    const hide = useCallback(() => {
        clearTimer();
        if (!interactive) {
            close();
            return;
        }
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            close();
        }, 180);
    }, [clearTimer, close, interactive]);
    const updatePosition = useCallback(() => {
        const trigger = wrapperRef.current;
        const tooltip = tooltipRef.current;
        if (!trigger || !tooltip) return;
        const rect = trigger.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
            close();
            return;
        }
        const next = positionFor(rect, placement, {
            width: tooltip.offsetWidth,
            height: tooltip.offsetHeight,
        });
        setPosition(current => (current && samePosition(current, next) ? current : next));
    }, [close, placement]);

    useEffect(
        () => () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            release(tooltipId);
        },
        [release, tooltipId],
    );
    useEffect(() => {
        if (!open && !pending) return;
        const closeOnScroll = () => close();
        const closeOnResize = () => close();
        const closeOnWindowBlur = () => close();
        const closeOnVisibility = () => {
            if (document.visibilityState !== 'visible') close();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && (wrapperRef.current?.contains(target) || tooltipRef.current?.contains(target))) return;
            close();
        };
        window.addEventListener('scroll', closeOnScroll, true);
        window.addEventListener('wheel', closeOnScroll, {capture: true, passive: true});
        window.addEventListener('touchmove', closeOnScroll, {capture: true, passive: true});
        window.addEventListener('resize', closeOnResize);
        window.addEventListener('blur', closeOnWindowBlur);
        document.addEventListener('visibilitychange', closeOnVisibility);
        document.addEventListener('keydown', closeOnEscape, true);
        document.addEventListener('pointerdown', closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener('scroll', closeOnScroll, true);
            window.removeEventListener('wheel', closeOnScroll, true);
            window.removeEventListener('touchmove', closeOnScroll, true);
            window.removeEventListener('resize', closeOnResize);
            window.removeEventListener('blur', closeOnWindowBlur);
            document.removeEventListener('visibilitychange', closeOnVisibility);
            document.removeEventListener('keydown', closeOnEscape, true);
            document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
        };
    }, [open, pending, close]);
    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }
        updatePosition();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
        if (wrapperRef.current) observer?.observe(wrapperRef.current);
        if (tooltipRef.current) observer?.observe(tooltipRef.current);
        return () => observer?.disconnect();
    }, [open, updatePosition]);

    const childProps = children.props as Record<string, any>;
    const existingDescribedBy =
        typeof childProps['aria-describedby'] === 'string' ? childProps['aria-describedby'] : '';
    const describedBy =
        open && position
            ? [existingDescribedBy, tooltipId].filter(Boolean).join(' ')
            : existingDescribedBy || undefined;
    const Wrapper = typeof children.type === 'string' && blockElements.has(children.type) ? 'div' : 'span';
    const wrapperClassNameResolved =
        `${fullWidth ? 'relative block w-full' : 'relative inline-flex max-w-full'} ${wrapperClassName}`.trim();
    const tooltipThemeClass =
        variant === 'surface'
            ? 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)]'
            : 'bg-[var(--text-heading)] text-[var(--background)]';
    if (disabled || !content) return children;
    return (
        <Wrapper
            ref={setWrapperRef}
            className={wrapperClassNameResolved}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocusCapture={showFromFocus}
            onBlurCapture={hide}
            onPointerDownCapture={() => {
                pointerDownAtRef.current = Date.now();
                close();
            }}
        >
            {React.cloneElement(children as React.ReactElement<any>, {
                title: undefined,
                'aria-describedby': describedBy,
            })}
            {open &&
                typeof document !== 'undefined' &&
                createPortal(
                    <span
                        ref={tooltipRef}
                        id={tooltipId}
                        role="tooltip"
                        onMouseEnter={interactive ? show : undefined}
                        onMouseLeave={interactive ? hide : undefined}
                        onFocusCapture={interactive ? show : undefined}
                        onBlurCapture={interactive ? hide : undefined}
                        style={
                            position
                                ? {
                                      top: position.top,
                                      left: position.left,
                                      transform: position.transform,
                                      maxWidth: 'min(380px, calc(100vw - 16px))',
                                  }
                                : {
                                      top: 0,
                                      left: 0,
                                      visibility: 'hidden',
                                      maxWidth: 'min(380px, calc(100vw - 16px))',
                                  }
                        }
                        className={`fixed z-[10000] w-max whitespace-normal break-words rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-snug shadow-2xl ${position ? 'tooltip-fade-in' : ''} ${interactive || closable ? 'pointer-events-auto' : 'pointer-events-none'} ${tooltipThemeClass}`}
                    >
                        {closable ? (
                            <span className="flex items-start gap-1.5">
                                <span className="min-w-0 flex-1">{content}</span>
                                <button
                                    type="button"
                                    aria-label="Close tooltip"
                                    onClick={event => {
                                        event.stopPropagation();
                                        close();
                                    }}
                                    className="flex size-4 shrink-0 items-center justify-center rounded-full text-inherit opacity-60 transition-opacity hover:bg-[var(--primary)]/15 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 cursor-pointer"
                                >
                                    <i className="ph ph-x text-[11px]" aria-hidden="true" />
                                </button>
                            </span>
                        ) : (
                            content
                        )}
                    </span>,
                    document.body,
                )}
        </Wrapper>
    );
}
