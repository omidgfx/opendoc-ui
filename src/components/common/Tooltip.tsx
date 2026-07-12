import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  useFloating,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  FloatingPortal,
  FloatingArrow,
  useMergeRefs,
} from '@floating-ui/react';
import clsx from 'clsx';

interface TooltipContextValue {
  delay: number;
}

const TooltipContext = createContext<TooltipContextValue>({ delay: 250 });

/** Wrap the app. Provides sensible defaults to all <Tip> instances. */
export function TooltipProvider({
  children,
  delay = 300,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <TooltipContext.Provider value={{ delay }}>{children}</TooltipContext.Provider>
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
  const { delay: ctxDelay } = useContext(TooltipContext);
  const delay = delayProp ?? ctxDelay;

  const [open, setOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement | null>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: 'start', padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef, padding: 6 }),
    ],
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: delay, close: 0 },
    enabled: !disabled,
  });
  const focus = useFocus(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const childrenRef = (children as any).ref;
  const mergedRef = useMergeRefs([refs.setReference, childrenRef]);

  if (disabled || !content) {
    return children;
  }

  return (
    <>
      {React.cloneElement(children as React.ReactElement<any>, {
        ...getReferenceProps({
          ref: mergedRef,
          ...(children.props as any),
        }),
        // Remove native title so we don't get double tooltips; data-title stores it for fallback/debug
        title: undefined,
        'data-title':
          (children.props as any).title ??
          (typeof content === 'string' ? content : undefined),
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
                'px-2.5 py-1.5 rounded-md text-[11px] font-medium leading-snug shadow-lg whitespace-nowrap max-w-[280px] whitespace-normal',
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
