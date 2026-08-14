import {useRef, useState, type MouseEvent, type ReactNode} from 'react';
import clsx from 'clsx';

interface RunnerFieldFrameProps {
    children: ReactNode;
    className?: string;
    active?: boolean;
    onActivate?: () => void;
    ariaLabel?: string;
}

const interactiveSelector =
    'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="button"]:not([aria-disabled="true"]), a[href]';

export default function RunnerFieldFrame({children, className, active, onActivate, ariaLabel}: RunnerFieldFrameProps) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [internalActive, setInternalActive] = useState(false);
    const controlled = active !== undefined;
    const isActive = controlled ? active : internalActive;
    const activate = () => {
        if (!controlled) setInternalActive(true);
        onActivate?.();
    };
    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-runner-field]') !== event.currentTarget) return;
        activate();
        if (target.closest(interactiveSelector)) return;
        const preferred = frameRef.current?.querySelector<HTMLElement>(interactiveSelector);
        (preferred || frameRef.current)?.focus({preventScroll: true});
    };
    return (
        <div
            ref={frameRef}
            data-runner-field
            data-runner-field-active={isActive ? 'true' : 'false'}
            role="group"
            aria-label={ariaLabel}
            tabIndex={0}
            onClick={handleClick}
            onFocusCapture={activate}
            onBlurCapture={event => {
                if (controlled) return;
                const next = event.relatedTarget;
                if (!(next instanceof Node) || !event.currentTarget.contains(next)) setInternalActive(false);
            }}
            className={clsx(
                'relative min-w-0 rounded-xl outline-none transition-[background-color,box-shadow] duration-150',
                isActive
                    ? 'bg-[var(--primary)]/[0.045] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,transparent)]'
                    : 'hover:bg-[var(--surface-hover)]/45',
                className,
            )}
        >
            {children}
        </div>
    );
}
