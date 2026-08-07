import React from 'react';
import clsx from 'clsx';

interface FocusPaneProps {
    active: boolean;
    onActivate: () => void;
    className?: string;
    /** When false, omit the built-in `h-full` sizing so the caller (e.g. a fixed-height
     *  wrapper on mobile) can fully control this pane's height instead. Defaults to true. */
    fillHeight?: boolean;
    children: React.ReactNode;
}

/**
 * A dedicated wrapper used in side-by-side (docs + runner) mode so the user
 * can visually tell which pane is currently "active" (i.e. which pane will
 * receive keyboard shortcuts like Ctrl+Enter or Ctrl+Up/Down). The border
 * lights up in the primary color while its pane holds focus/activity.
 */
export default function FocusPane({active, onActivate, className, fillHeight = true, children}: FocusPaneProps) {
    return (
        <div
            onMouseDownCapture={onActivate}
            onFocusCapture={onActivate}
            className={clsx(
                'min-w-0 flex flex-col overflow-hidden border-2 rounded-xl transition-colors duration-150',
                fillHeight && 'h-full',
                active ? 'border-[var(--primary)]/50' : 'border-[var(--border)]/50',
                className
            )}
        >
            {children}
        </div>
    );
}
