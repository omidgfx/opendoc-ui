import React, {createContext, useCallback, useContext, useEffect, useRef, useState,} from 'react';
import {
    arrow,
    autoUpdate,
    flip,
    FloatingArrow,
    FloatingPortal,
    offset,
    shift,
    useDismiss,
    useFloating,
    useFocus,
    useHover,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import clsx from 'clsx';

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
    return (
        <TooltipContext.Provider value={{delay}}>{children}</TooltipContext.Provider>
    );
}

interface TipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    placement?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
    disabled?: boolean;
    /** Hide on mobile/touch? Default false — still shows on focus for a11y. */
}

/**
 * Accessible, theme-aware tooltip powered by @floating-ui/react.
 * Auto-positions (flip, shift), theme-styled, renders via portal.
 *
 * Usage:
 *   <Tip content="Copy path"><button>...</button></Tip>
 */
export function Tip({
                        content,
                        children,
                        placement = 'top',
                        delay: delayProp,
                        disabled,
                    }: TipProps) {
    const {delay: ctxDelay} = useContext(TooltipContext);
    const delay = delayProp ?? ctxDelay;

    const [open, setOpen] = useState(false);
    const arrowRef = useRef<SVGSVGElement | null>(null);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement,
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(8),
            flip({fallbackAxisSideDirection: 'start', padding: 8}),
            shift({padding: 8}),
            arrow({element: arrowRef, padding: 6}),
        ],
    });

    const hover = useHover(context, {
        move: false,
        delay: {open: delay, close: 0},
        enabled: !disabled,
    });
    const focus = useFocus(context, {enabled: !disabled});
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: 'tooltip'});

    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
        focus,
        dismiss,
        role,
    ]);

    // React 19: `ref` is a regular prop on the element (`children.props.ref`).
    // Keep the merged callback stable. Passing a freshly-created ref array to
    // `useMergeRefs` on every render can make Floating UI repeatedly detach and
    // reattach its reference, eventually causing a maximum-update-depth crash.
    const childrenRef = (children as any).props?.ref;
    const childrenRefRef = useRef<any>(childrenRef);
    childrenRefRef.current = childrenRef;
    const mergedRef = useCallback((node: Element | null) => {
        refs.setReference(node);
        const childRef = childrenRefRef.current;
        if (typeof childRef === 'function') childRef(node);
        else if (childRef && typeof childRef === 'object') childRef.current = node;
    }, [refs.setReference]);

    // Hide the tooltip as soon as the page/sidebar scrolls — a tooltip that
    // follows the scrolled element around looks broken.
    useEffect(() => {
        if (!open) return;
        const hide = () => setOpen(false);
        window.addEventListener('scroll', hide, true);
        return () => window.removeEventListener('scroll', hide, true);
    }, [open]);

    if (disabled || !content) {
        return children;
    }

    return (
        <>
            {React.cloneElement(children as React.ReactElement<any>, {
                ...getReferenceProps({
                    ...(children.props as any),
                    ref: mergedRef,
                }),
                // Remove native title so we don't get double tooltips.
                title: undefined,
            })}
            {open && (
                <FloatingPortal>
                    <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="z-[9999] pointer-events-none"
                    >
                        <div
                            className={clsx(
                                'px-2.5 py-1.5 rounded-md text-[11px] font-medium leading-snug shadow-lg max-w-[320px] sm:max-w-[380px] whitespace-normal break-words [overflow-wrap:anywhere]',
                                'bg-[var(--text-heading)] text-[var(--background)]'
                            )}
                        >
                            {content}
                            <FloatingArrow
                                ref={arrowRef}
                                context={context}
                                className="fill-[var(--text-heading)]"
                                height={6}
                                width={10}
                            />
                        </div>
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}