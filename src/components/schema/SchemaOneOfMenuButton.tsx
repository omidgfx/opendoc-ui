import {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import {Tip} from '../common/Tooltip';
import type {SchemaOneOfChoice} from '../../utils/schema/branchChoices';
import {readSchemaBranchSelections, writeSchemaBranchSelection} from '../../utils/schema/branchSelections';

interface SchemaOneOfMenuButtonProps {
    selectionKey: string;
    choices: SchemaOneOfChoice[];
    className?: string;
}

export default function SchemaOneOfMenuButton({selectionKey, choices, className}: SchemaOneOfMenuButtonProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    const selections = readSchemaBranchSelections(selectionKey);

    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (ref.current?.contains(event.target as Node)) return;
            setOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    if (choices.length === 0) return null;

    return (
        <div ref={ref} className={clsx('relative shrink-0 select-none', className)}>
            <Tip content="Select oneOf schema">
                <button
                    type="button"
                    onClick={() => setOpen(current => !current)}
                    className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] cursor-pointer"
                    aria-label="Select oneOf schema"
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'} text-[14px]`} />
                </button>
            </Tip>

            {open && (
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[240px] max-w-[320px] overflow-hidden rounded-xl border bg-[var(--surface)] p-1 shadow-2xl border-[var(--border)]">
                    {choices.map(choice => (
                        <div key={choice.path} className="border-b last:border-b-0 border-[var(--border)]/70">
                            <div className="px-2.5 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                {choice.title}
                            </div>
                            {choice.options.map(option => {
                                const active = (selections[choice.path] ?? 0) === option.index;
                                return (
                                    <button
                                        key={`${choice.path}:${option.index}`}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            writeSchemaBranchSelection(selectionKey, choice.path, option.index);
                                            setOpen(false);
                                        }}
                                        className={clsx(
                                            'flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                                            active
                                                ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                                : 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                        )}
                                    >
                                        <span
                                            className={clsx(
                                                'mt-1 size-2 shrink-0 rounded-full',
                                                active ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
                                            )}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-semibold">{option.label}</span>
                                            {option.description && (
                                                <span className="mt-0.5 block text-[9px] leading-snug text-[var(--text-muted)]">
                                                    {option.description}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
