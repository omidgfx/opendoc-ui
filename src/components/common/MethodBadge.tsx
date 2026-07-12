import React from 'react';
import clsx from 'clsx';

const METHOD_CLASSES: Record<string, { text: string; background: string; contrast: string }> = {
    get: {
        text: 'text-[var(--method-get)]',
        background: 'bg-[var(--method-get)]',
        contrast: 'text-[var(--method-get-contrast)]'
    },
    head: {
        text: 'text-[var(--method-head)]',
        background: 'bg-[var(--method-head)]',
        contrast: 'text-[var(--method-head-contrast)]'
    },
    post: {
        text: 'text-[var(--method-post)]',
        background: 'bg-[var(--method-post)]',
        contrast: 'text-[var(--method-post-contrast)]'
    },
    put: {
        text: 'text-[var(--method-put)]',
        background: 'bg-[var(--method-put)]',
        contrast: 'text-[var(--method-put-contrast)]'
    },
    delete: {
        text: 'text-[var(--method-delete)]',
        background: 'bg-[var(--method-delete)]',
        contrast: 'text-[var(--method-delete-contrast)]'
    },
    patch: {
        text: 'text-[var(--method-patch)]',
        background: 'bg-[var(--method-patch)]',
        contrast: 'text-[var(--method-patch-contrast)]'
    },
    connect: {
        text: 'text-[var(--method-connect)]',
        background: 'bg-[var(--method-connect)]',
        contrast: 'text-[var(--method-connect-contrast)]'
    },
    options: {
        text: 'text-[var(--method-options)]',
        background: 'bg-[var(--method-options)]',
        contrast: 'text-[var(--method-options-contrast)]'
    },
    trace: {
        text: 'text-[var(--method-trace)]',
        background: 'bg-[var(--method-trace)]',
        contrast: 'text-[var(--method-trace-contrast)]'
    }
};

const FALLBACK_CLASSES = {
    text: 'text-[var(--text-muted)]',
    background: 'bg-[var(--text-muted)]',
    contrast: 'text-[var(--background)]'
};

export type MethodBadgeSize = 'xs' | 'sm' | 'md' | 'lg';
export type MethodBadgeVariant = 'soft' | 'solid' | 'plain';

export interface MethodBadgeProps {
    method: string;
    className?: string;
    size?: MethodBadgeSize;
    variant?: MethodBadgeVariant;
    title?: string;
}

const SIZE_CLASSES: Record<MethodBadgeSize, string> = {
    xs: 'text-[8px] px-1.5 py-0.5 leading-none',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5'
};

export default function MethodBadge({
                                        method,
                                        className,
                                        size = 'sm',
                                        variant = 'soft',
                                        title
                                    }: MethodBadgeProps) {
    const normalized = (method || '').toLowerCase().trim();
    const colors = METHOD_CLASSES[normalized] || FALLBACK_CLASSES;
    const label = (method || '').toUpperCase() || 'UNKNOWN';

    return (
        <span
            className={clsx(
                'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded font-mono font-extrabold uppercase select-none',
                SIZE_CLASSES[size],
                variant === 'soft' && [colors.text, 'border border-current/20 bg-current/15'],
                variant === 'solid' && [colors.background, colors.contrast],
                variant === 'plain' && colors.text,
                className
            )}
            title={title}
        >
            {label}
        </span>
    );
}