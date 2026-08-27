import React from 'react';
import clsx from 'clsx';

/**
 * Temporary red code-name badges for chat feedback.
 *
 * DEV ONLY — `import.meta.env.DEV` is false in production builds, so these
 * never ship. When the labeling pass is done, delete this file and every
 * `<DevTooltip …>` / `devLabel=…` usage (grep `DevTooltip` / `devLabel`).
 *
 * Usage:
 *   <DevTooltip name="CodeViewer.root">{…}</DevTooltip>
 *   <DevTooltip name="handle.caret" inline />   // badge only, no wrap
 */

/** Flip to `false` to hide every badge without ripping call sites out yet. */
export const DEV_TOOLTIPS_ENABLED = true;

const showDevTooltips = (): boolean => Boolean(import.meta.env.DEV) && DEV_TOOLTIPS_ENABLED;

export interface DevTooltipProps {
    /** Stable code name to cite in chat (e.g. `CodeViewer.fieldHandle`). */
    name: string;
    children?: React.ReactNode;
    /**
     * Where the red badge sits relative to the wrapped content.
     * - `above` (default): top-left, hanging slightly outside
     * - `start`: left edge mid
     * - `inside-top`: inside the box at top-left
     */
    placement?: 'above' | 'start' | 'inside-top';
    /** Badge only — no wrapper around children (for tight spots / portals). */
    inline?: boolean;
    className?: string;
    /** Extra classes on the red pill itself. */
    badgeClassName?: string;
}

const badgeClass = (placement: DevTooltipProps['placement'], inline?: boolean) =>
    clsx(
        'pointer-events-none select-none whitespace-nowrap rounded-[3px] border border-red-800',
        'bg-red-600 px-[5px] py-px font-mono text-[9px] font-bold leading-tight text-white',
        'shadow-[0_1px_2px_rgba(0,0,0,0.35)] z-[2147483000]',
        !inline && 'absolute',
        !inline && placement === 'above' && 'left-0 top-0 -translate-y-[calc(100%+2px)]',
        !inline && placement === 'start' && 'left-0 top-1/2 -translate-x-[calc(100%+4px)] -translate-y-1/2',
        !inline && placement === 'inside-top' && 'left-0.5 top-0.5',
        inline && 'inline-flex align-middle',
    );

/**
 * Renders a red code-name badge. In production (or when disabled) children
 * pass through unchanged and inline badges render nothing.
 */
export default function DevTooltip({
    name,
    children,
    placement = 'above',
    inline = false,
    className,
    badgeClassName,
}: DevTooltipProps) {
    if (!showDevTooltips()) {
        if (inline) return null;
        return <>{children}</>;
    }

    const badge = (
        <span className={clsx(badgeClass(placement, inline), badgeClassName)} data-dev-tooltip={name} title={name}>
            {name}
        </span>
    );

    if (inline) return badge;

    return (
        <div className={clsx('relative', className)} data-dev-tooltip-host={name}>
            {badge}
            {children}
        </div>
    );
}
