import {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import {Tip} from '../common/Tooltip';
import type {SchemaBranchChoice} from '../../utils/schema/branchChoices';
import {
    readSchemaAllOfFocus,
    readSchemaAnyOfSelections,
    readSchemaBranchSelections,
    toggleSchemaAnyOfSelection,
    writeSchemaAllOfFocus,
    writeSchemaAnyOfSelection,
    writeSchemaBranchSelection,
} from '../../utils/schema/branchSelections';
import {
    COMBINATOR_META,
    combinatorActiveSurfaceStyle,
    combinatorSelectionIconClass,
} from '../../utils/schema/combinators';
import type {CombinatorKind} from '../../utils/schema/combinators';

interface SchemaOneOfMenuButtonProps {
    selectionKey: string;
    choices: SchemaBranchChoice[];
    className?: string;
}

/**
 * Header caret for parameter / nested schema pickers. Handles oneOf
 * (exclusive), anyOf (multi-select), allOf (Combined vs part focus), and
 * not (inspection-only negated schema).
 */
export default function SchemaOneOfMenuButton({selectionKey, choices, className}: SchemaOneOfMenuButtonProps) {
    const [open, setOpen] = useState(false);
    const [revision, setRevision] = useState(0);
    const ref = useRef<HTMLDivElement | null>(null);
    const oneOfSelections = readSchemaBranchSelections(selectionKey);
    const allOfFocus = readSchemaAllOfFocus(selectionKey);
    const anyOfSelections = readSchemaAnyOfSelections(selectionKey);
    void revision;

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

    const kinds = new Set(choices.map(c => c.kind || 'oneOf'));
    const tip =
        kinds.size > 1
            ? 'Select oneOf / anyOf / focus allOf / inspect not'
            : kinds.has('allOf')
              ? 'Focus allOf part'
              : kinds.has('anyOf')
                ? 'Select anyOf branches'
                : kinds.has('not')
                  ? 'Inspect negated schema'
                  : 'Select oneOf schema';

    return (
        <div ref={ref} className={clsx('relative shrink-0 select-none', className)}>
            <Tip content={tip}>
                <button
                    type="button"
                    onClick={() => setOpen(current => !current)}
                    className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] cursor-pointer"
                    aria-label={tip}
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'} text-[14px]`} />
                </button>
            </Tip>

            {open && (
                <div className="absolute right-0 top-full z-30 mt-1 flex min-w-[240px] max-w-[320px] flex-col gap-1 overflow-hidden rounded-xl border bg-[var(--surface)] p-1.5 shadow-2xl border-[var(--border)]">
                    {choices.map(choice => {
                        const kind = choice.kind || 'oneOf';
                        return (
                            <div
                                key={`${kind}:${choice.path}`}
                                className="flex flex-col gap-1 border-b last:border-b-0 border-[var(--border)]/70 pb-1 last:pb-0"
                            >
                                <div
                                    className="px-2.5 py-2 text-[9px] font-black uppercase tracking-wider"
                                    style={{
                                        color: COMBINATOR_META[
                                            kind === 'allOf'
                                                ? 'allOf'
                                                : kind === 'anyOf'
                                                  ? 'anyOf'
                                                  : kind === 'not'
                                                    ? 'not'
                                                    : 'oneOf'
                                        ].color,
                                    }}
                                >
                                    {kind === 'allOf'
                                        ? 'allOf · '
                                        : kind === 'anyOf'
                                          ? 'anyOf · '
                                          : kind === 'not'
                                            ? 'not · '
                                            : 'oneOf · '}
                                    {choice.title}
                                </div>
                                {choice.options.map(option => {
                                    const combinatorKind: CombinatorKind =
                                        kind === 'allOf'
                                            ? 'allOf'
                                            : kind === 'anyOf'
                                              ? 'anyOf'
                                              : kind === 'not'
                                                ? 'not'
                                                : 'oneOf';
                                    const meta = COMBINATOR_META[combinatorKind];
                                    const branchCount = choice.options.filter(item => item.index >= 0).length;
                                    const anySelected = anyOfSelections[choice.path];
                                    const anyAll = kind === 'anyOf' && (!anySelected || anySelected.length === 0);
                                    const active =
                                        kind === 'allOf'
                                            ? (() => {
                                                  const focus = allOfFocus[choice.path];
                                                  if (option.index < 0) return focus === null || focus === undefined;
                                                  return focus === option.index;
                                              })()
                                            : kind === 'anyOf'
                                              ? option.index < 0
                                                  ? anyAll || (anySelected?.length || 0) >= branchCount
                                                  : anyAll
                                                    ? true
                                                    : (anySelected || []).includes(option.index)
                                              : kind === 'not'
                                                ? true
                                                : (oneOfSelections[choice.path] ?? 0) === option.index;
                                    return (
                                        <button
                                            key={`${choice.path}:${option.index}`}
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                if (kind === 'allOf') {
                                                    writeSchemaAllOfFocus(
                                                        selectionKey,
                                                        choice.path,
                                                        option.index < 0 ? null : option.index,
                                                    );
                                                    setOpen(false);
                                                } else if (kind === 'anyOf') {
                                                    if (option.index < 0) {
                                                        writeSchemaAnyOfSelection(selectionKey, choice.path, []);
                                                    } else {
                                                        toggleSchemaAnyOfSelection(
                                                            selectionKey,
                                                            choice.path,
                                                            option.index,
                                                            branchCount,
                                                        );
                                                    }
                                                    // keep open for multi-toggle
                                                } else if (kind === 'not') {
                                                    // Inspection only — no selection state to write.
                                                    setOpen(false);
                                                } else {
                                                    writeSchemaBranchSelection(selectionKey, choice.path, option.index);
                                                    setOpen(false);
                                                }
                                                setRevision(current => current + 1);
                                            }}
                                            className={clsx(
                                                'flex w-full cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors',
                                                !active && 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                                            )}
                                            style={combinatorActiveSurfaceStyle(combinatorKind, active)}
                                        >
                                            <span className="mt-0.5 flex h-[14px] w-[14px] shrink-0 items-center justify-center">
                                                <i
                                                    className={clsx(
                                                        kind === 'not'
                                                            ? meta.icon
                                                            : combinatorSelectionIconClass(combinatorKind, active),
                                                        'text-[14px]',
                                                    )}
                                                    style={active ? {color: meta.color} : undefined}
                                                />
                                            </span>
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
                        );
                    })}
                </div>
            )}
        </div>
    );
}
