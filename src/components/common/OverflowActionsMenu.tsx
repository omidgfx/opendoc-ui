import {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';
import {Tip} from './Tooltip';
import {readPortalThemeVariables} from '../../utils/theme/themeCss';

export interface OverflowAction {
    id: string;
    label: string;
    icon: string;
    onSelect: () => void;
    /** Shown instead of the label right after the action ran, e.g. "Copied". */
    doneLabel?: string;
}

interface OverflowActionsMenuProps {
    actions: OverflowAction[];
    ariaLabel: string;
    className?: string;
}

/**
 * The actions of a header, folded into a single ⋮ button. Narrow panes cannot
 * afford a row of icons next to a route, and hiding the actions outright would
 * lose them.
 */
export default function OverflowActionsMenu({actions, ariaLabel, className}: OverflowActionsMenuProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [doneId, setDoneId] = useState<string | null>(null);
    const [position, setPosition] = useState({top: 0, left: 0, width: 220, openAbove: false});
    const updatePosition = useCallback(() => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect || typeof window === 'undefined') return;
        const width = Math.min(240, Math.max(180, window.innerWidth - 16));
        const estimatedHeight = actions.length * 36 + 8;
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
        setPosition({
            top: openAbove ? rect.top - 4 : rect.bottom + 4,
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
            width,
            openAbove,
        });
    }, [actions.length]);
    useEffect(() => {
        if (!open) return;
        updatePosition();
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        const onViewportChange = () => setOpen(false);
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('scroll', onViewportChange, true);
        };
    }, [open, updatePosition]);
    if (actions.length === 0) return null;
    return (
        <>
            <Tip content={ariaLabel}>
                <button
                    ref={buttonRef}
                    type="button"
                    aria-label={ariaLabel}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen(current => !current)}
                    className={clsx(
                        'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors',
                        open
                            ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                            : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]',
                        className,
                    )}
                >
                    <i className="ph-bold ph-dots-three-vertical text-[16px]" />
                </button>
            </Tip>
            {open &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        aria-label={ariaLabel}
                        className="fixed z-[999999] overflow-hidden rounded-xl border p-1 shadow-2xl bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
                        style={{
                            top: position.top,
                            left: position.left,
                            width: position.width,
                            transform: position.openAbove ? 'translateY(-100%)' : undefined,
                            ...readPortalThemeVariables(buttonRef.current),
                        }}
                    >
                        {actions.map(action => (
                            <button
                                key={action.id}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    action.onSelect();
                                    if (action.doneLabel) {
                                        setDoneId(action.id);
                                        window.setTimeout(() => setDoneId(null), 1500);
                                    }
                                    setOpen(false);
                                }}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition-colors text-[var(--text)] hover:bg-[var(--surface-hover)]"
                            >
                                <i className={clsx(action.icon, 'text-[13px] text-[var(--primary)]')} />
                                {doneId === action.id ? action.doneLabel : action.label}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}
