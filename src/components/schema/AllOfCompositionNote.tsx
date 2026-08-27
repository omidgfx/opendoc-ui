import clsx from 'clsx';
import type {AllOfComposition} from '../../utils/schema/combinators';
import {COMBINATOR_META} from '../../utils/schema/combinators';
import CombinatorLabel from '../common/CombinatorLabel';
import {Tip} from '../common/Tooltip';

interface AllOfCompositionNoteProps {
    composition: AllOfComposition;
    /** Inline sits on one line inside a table cell. */
    variant?: 'block' | 'inline';
    /** Opens a referenced part in the schema modal. */
    onInspect?: (refName: string) => void;
    /** What the merged object is, in the words of the surrounding view. */
    subject?: string;
    className?: string;
}

/**
 * allOf is not a choice between branches, it is one object assembled from all
 * of them. The table below this note shows that assembled object, and the note
 * says where its fields come from — an empty part is counted, not offered.
 */
export default function AllOfCompositionNote({
    composition,
    variant = 'block',
    onInspect,
    subject = 'body',
    className,
}: AllOfCompositionNoteProps) {
    const {parts, fieldCount, requiredCount} = composition;
    // A named part is worth showing even when it declares nothing: the reader
    // knows that name from the specification and would look for it.
    const named = parts.filter(part => !part.empty || part.refName || part.label !== 'Empty part');
    const anonymousEmpty = parts.length - named.length;
    return (
        <div className={clsx(variant === 'inline' ? 'space-y-1' : 'space-y-1.5', className)}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <CombinatorLabel meta={COMBINATOR_META.allOf} variant={variant === 'inline' ? 'inline' : 'caption'} />
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                    Every part applies at once, so the {subject} is the one object below:{' '}
                    <span className="font-bold text-[var(--text-heading)]">
                        {fieldCount} field{fieldCount === 1 ? '' : 's'}
                    </span>
                    {requiredCount > 0 && <>, {requiredCount} required</>}.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Assembled from
                </span>
                {named.map((part, index) => {
                    const chip = (
                        <span
                            className={clsx(
                                'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold',
                                part.empty
                                    ? 'border-dashed border-[var(--border)] bg-transparent text-[var(--text-muted)]'
                                    : part.refName
                                      ? ''
                                      : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-heading)]',
                            )}
                            style={
                                !part.empty && part.refName
                                    ? {
                                          color: COMBINATOR_META.allOf.color,
                                          borderColor: `color-mix(in srgb, ${COMBINATOR_META.allOf.color} 25%, transparent)`,
                                          backgroundColor: `color-mix(in srgb, ${COMBINATOR_META.allOf.color} 10%, transparent)`,
                                      }
                                    : undefined
                            }
                        >
                            {part.refName && <i className="ph ph-diamonds-four text-[11px]" />}
                            {part.label}
                            {part.fieldCount > 0 && part.refName && (
                                <span className="font-mono text-[9px] opacity-70">{part.fieldCount}</span>
                            )}
                            {part.empty && <span className="font-normal italic opacity-80">· empty</span>}
                        </span>
                    );
                    return (
                        <span key={`${part.label}-${index}`} className="inline-flex items-center gap-1.5">
                            {index > 0 && <span className="text-[10px] text-[var(--text-muted)]">+</span>}
                            {part.refName && onInspect ? (
                                <Tip content={`Inspect ${part.refName}`}>
                                    <button
                                        type="button"
                                        onClick={() => onInspect(part.refName as string)}
                                        className="cursor-pointer transition-opacity hover:opacity-80"
                                    >
                                        {chip}
                                    </button>
                                </Tip>
                            ) : part.empty ? (
                                <Tip content="This part declares no properties or constraints, so it adds nothing to the object.">
                                    <span className="cursor-help">{chip}</span>
                                </Tip>
                            ) : part.description ? (
                                <Tip content={part.description}>{chip}</Tip>
                            ) : (
                                chip
                            )}
                        </span>
                    );
                })}
                {anonymousEmpty > 0 && (
                    <Tip content="Declared parts that carry no properties or constraints — nothing to show.">
                        <span className="cursor-help text-[10px] italic text-[var(--text-muted)]">
                            + {anonymousEmpty} empty part{anonymousEmpty === 1 ? '' : 's'}
                        </span>
                    </Tip>
                )}
            </div>
        </div>
    );
}
