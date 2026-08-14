import {useRef, useState, type MouseEvent, type ReactNode} from 'react';
import clsx from 'clsx';

interface RunnerFieldFrameProps {
    children: ReactNode;
    className?: string;
    active?: boolean;
    onActivate?: () => void;
    ariaLabel?: string;
}

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
        // Activate the guide branch without stealing focus: clicking the frame
        // must never jump focus into its first input.
        activate();
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
                    : 'bg-transparent',
                className,
            )}
        >
            {children}
        </div>
    );
}
