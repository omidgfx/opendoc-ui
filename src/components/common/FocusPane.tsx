import React from 'react';
import clsx from 'clsx';

interface FocusPaneProps {
    active: boolean;
    onActivate: () => void;
    className?: string;
    fillHeight?: boolean;
    children: React.ReactNode;
}

export default function FocusPane({active, onActivate, className, fillHeight = true, children}: FocusPaneProps) {
    return (
        <div
            onMouseDownCapture={onActivate}
            onFocusCapture={onActivate}
            className={clsx(
                'min-w-0 flex flex-col overflow-hidden border-2 rounded-xl transition-colors duration-150',
                fillHeight && 'h-full',
                active ? 'border-[var(--primary)]/50' : 'border-[var(--border)]/50',
                className,
            )}
        >
            {children}
        </div>
    );
}
