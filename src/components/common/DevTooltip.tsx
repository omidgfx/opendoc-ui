import React, {useCallback, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';

/**
 * Temporary DEV-ONLY code-name tooltips for chat feedback.
 *
 * Non-intrusive harness:
 * - The app UI stays fully clickable (no host hover handlers).
 * - Only the small red mark is interactive.
 * - Hover the mark → tip appears after a short delay, fixed to the mark
 *   (does not follow the mouse).
 * - Click the mark → pin until Copy / ✕ / Escape / outside click.
 * - Copy writes `` `Name` `` to the clipboard.
 *
 * - Production: `import.meta.env.DEV` is false → children only.
 * - Kill switch: `DEV_TOOLTIPS_ENABLED = false`.
 * - Full removal: delete this file + every `DevTooltip` usage.
 */

export const DEV_TOOLTIPS_ENABLED = true;

/** Hover must stay on the mark this long before the tip opens. */
const OPEN_DELAY_MS = 450;
/** Grace period when leaving mark → tip so Copy stays reachable. */
const CLOSE_DELAY_MS = 280;

const showDevTooltips = (): boolean => Boolean(import.meta.env.DEV) && DEV_TOOLTIPS_ENABLED;

let claimOwner: string | null = null;
const claimListeners = new Map<string, () => void>();

const claimTip = (id: string, close: () => void) => {
    if (claimOwner && claimOwner !== id) claimListeners.get(claimOwner)?.();
    claimOwner = id;
    claimListeners.set(id, close);
};

const releaseTip = (id: string) => {
    claimListeners.delete(id);
    if (claimOwner === id) claimOwner = null;
};

export interface DevTooltipProps {
    name: string;
    children?: React.ReactNode;
    placement?: 'above' | 'start' | 'inside-top';
    inline?: boolean;
    className?: string;
    badgeClassName?: string;
}

type TipPos = {top: number; left: number};

const copyCitedName = async (name: string): Promise<boolean> => {
    const payload = `\`${name}\``;
    try {
        await navigator.clipboard.writeText(payload);
        return true;
    } catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = payload;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch {
            return false;
        }
    }
};

/** Fixed position near the mark — never tracks the cursor. */
const posNearMark = (mark: DOMRect, tipW: number, tipH: number): TipPos => {
    const pad = 8;
    const gap = 6;
    // Prefer above the mark; flip below if needed.
    let top = mark.top - tipH - gap;
    let left = mark.left;
    if (top < pad) top = mark.bottom + gap;
    if (left + tipW > window.innerWidth - pad) left = window.innerWidth - tipW - pad;
    if (left < pad) left = pad;
    if (top + tipH > window.innerHeight - pad) top = window.innerHeight - tipH - pad;
    if (top < pad) top = pad;
    return {top, left};
};

export default function DevTooltip({
    name,
    children,
    placement = 'inside-top',
    inline = false,
    className,
}: DevTooltipProps) {
    const reactId = useId();
    const instanceId = useRef(`devtip-${reactId}`).current;
    const markRef = useRef<HTMLElement | null>(null);
    const tipRef = useRef<HTMLDivElement | null>(null);
    const openTimer = useRef<number | null>(null);
    const closeTimer = useRef<number | null>(null);
    const pinnedRef = useRef(false);
    const overTipRef = useRef(false);
    const overMarkRef = useRef(false);

    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [pos, setPos] = useState<TipPos | null>(null);
    const [copied, setCopied] = useState(false);

    const clearOpen = useCallback(() => {
        if (openTimer.current !== null) {
            window.clearTimeout(openTimer.current);
            openTimer.current = null;
        }
    }, []);

    const clearClose = useCallback(() => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    const closeNow = useCallback(() => {
        clearOpen();
        clearClose();
        releaseTip(instanceId);
        pinnedRef.current = false;
        overTipRef.current = false;
        overMarkRef.current = false;
        setPinned(false);
        setOpen(false);
        setPos(null);
        setCopied(false);
    }, [clearClose, clearOpen, instanceId]);

    const scheduleClose = useCallback(() => {
        if (pinnedRef.current) return;
        clearClose();
        closeTimer.current = window.setTimeout(() => {
            if (pinnedRef.current || overTipRef.current || overMarkRef.current) return;
            closeNow();
        }, CLOSE_DELAY_MS);
    }, [clearClose, closeNow]);

    const openNow = useCallback(
        (pin = false) => {
            clearOpen();
            clearClose();
            claimTip(instanceId, closeNow);
            if (pin) {
                pinnedRef.current = true;
                setPinned(true);
            }
            setOpen(true);
        },
        [clearClose, clearOpen, closeNow, instanceId],
    );

    const scheduleOpen = useCallback(() => {
        if (pinnedRef.current || open) {
            clearClose();
            return;
        }
        clearOpen();
        openTimer.current = window.setTimeout(() => {
            openTimer.current = null;
            if (!overMarkRef.current && !pinnedRef.current) return;
            openNow(false);
        }, OPEN_DELAY_MS);
    }, [clearClose, clearOpen, open, openNow]);

    const updatePos = useCallback(() => {
        const mark = markRef.current?.getBoundingClientRect();
        if (!mark) return;
        const tip = tipRef.current;
        const w = tip?.offsetWidth || 220;
        const h = tip?.offsetHeight || 32;
        setPos(posNearMark(mark, w, h));
    }, []);

    useLayoutEffect(() => {
        if (!open) return;
        updatePos();
    }, [open, updatePos, copied, pinned, name]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeNow();
        };
        const onDown = (event: MouseEvent) => {
            const t = event.target as Node;
            if (tipRef.current?.contains(t)) return;
            if (markRef.current?.contains(t)) return;
            // Any outside press dismisses (pinned or not) so the app never feels stuck.
            closeNow();
        };
        const onScrollOrResize = () => updatePos();
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown, true);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [open, closeNow, updatePos]);

    useEffect(
        () => () => {
            clearOpen();
            clearClose();
            releaseTip(instanceId);
        },
        [clearClose, clearOpen, instanceId],
    );

    const onMarkEnter = () => {
        overMarkRef.current = true;
        clearClose();
        scheduleOpen();
    };

    const onMarkLeave = (event: React.MouseEvent) => {
        overMarkRef.current = false;
        clearOpen();
        const related = event.relatedTarget as Node | null;
        if (related && tipRef.current?.contains(related)) {
            overTipRef.current = true;
            return;
        }
        scheduleClose();
    };

    const onMarkClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        clearOpen();
        if (open && pinnedRef.current) {
            closeNow();
            return;
        }
        openNow(true);
    };

    const onCopy = async (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const ok = await copyCitedName(name);
        if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        }
    };

    if (!showDevTooltips()) {
        if (inline) return null;
        return <>{children}</>;
    }

    const tip =
        open && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={tipRef}
                      role="tooltip"
                      id={reactId}
                      data-dev-tooltip={name}
                      data-dev-tooltip-pinned={pinned ? 'true' : undefined}
                      onMouseEnter={() => {
                          overTipRef.current = true;
                          clearClose();
                          clearOpen();
                      }}
                      onMouseLeave={() => {
                          overTipRef.current = false;
                          if (!pinnedRef.current) scheduleClose();
                      }}
                      className={clsx(
                          'fixed z-[2147483646] flex max-w-[min(360px,calc(100vw-16px))] items-center gap-1.5',
                          'rounded-md border-2 border-red-950 bg-red-600 px-2 py-1.5',
                          'font-mono text-[12px] font-bold leading-none text-white',
                          'shadow-[0_6px_20px_rgba(0,0,0,0.4)]',
                      )}
                      style={{
                          top: pos?.top ?? -9999,
                          left: pos?.left ?? -9999,
                          visibility: pos ? 'visible' : 'hidden',
                      }}
                  >
                      <span className="min-w-0 truncate select-all">{`{name}`}</span>
                      <button
                          type="button"
                          onMouseDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                          }}
                          onClick={onCopy}
                          className={clsx(
                              'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded border px-2',
                              'text-[11px] font-sans font-bold transition-colors',
                              copied
                                  ? 'border-emerald-200 bg-emerald-500 text-white'
                                  : 'border-red-950 bg-red-800 text-white hover:bg-red-950',
                          )}
                          aria-label={copied ? 'Copied' : `Copy \`${name}\``}
                      >
                          <i className={clsx('ph text-[13px]', copied ? 'ph-check-bold' : 'ph-copy')} />
                          {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                          type="button"
                          onMouseDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                          }}
                          onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              closeNow();
                          }}
                          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded border border-red-950 bg-red-800 text-white hover:bg-red-950"
                          aria-label="Close"
                      >
                          <i className="ph ph-x text-[12px]" />
                      </button>
                  </div>,
                  document.body,
              )
            : null;

    const markClass = clsx(
        // 30% transparent + compact. Only this mark captures pointer events.
        'absolute z-[6] size-1.5 cursor-help rounded-[2px] bg-red-600/70',
        'ring-1 ring-white/50 shadow-none',
        'hover:scale-150 hover:bg-red-500/80 transition-transform',
        placement === 'start' && 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
        placement === 'above' && 'left-0 top-0 -translate-y-1/2',
        placement === 'inside-top' && 'left-0.5 top-0.5',
    );

    if (inline) {
        return (
            <>
                <span
                    ref={node => {
                        markRef.current = node;
                    }}
                    data-dev-tooltip-host={name}
                    onMouseEnter={onMarkEnter}
                    onMouseLeave={onMarkLeave}
                    onClick={onMarkClick}
                    onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    className={clsx('relative inline-flex size-1.5 shrink-0 cursor-help align-middle', className)}
                    title={`Hover for \`${name}\` · click to pin`}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Dev label ${name}`}
                >
                    <span aria-hidden className="absolute inset-0 rounded-[2px] bg-red-600/70 ring-1 ring-white/50" />
                </span>
                {tip}
            </>
        );
    }

    return (
        <>
            {/* Host is layout-only — no mouse handlers, so children stay fully clickable. */}
            <div className={clsx('relative', className)} data-dev-tooltip-wrap={name}>
                <span
                    ref={node => {
                        markRef.current = node;
                    }}
                    data-dev-tooltip-host={name}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Dev label ${name}`}
                    title={`Hover for \`${name}\` · click to pin`}
                    className={markClass}
                    onMouseEnter={onMarkEnter}
                    onMouseLeave={onMarkLeave}
                    onClick={onMarkClick}
                    onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                />
                {children}
            </div>
            {tip}
        </>
    );
}
