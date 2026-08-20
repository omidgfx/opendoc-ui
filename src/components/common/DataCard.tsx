import type {ReactNode} from 'react';
import clsx from 'clsx';

export interface DataCardFact {
    label: string;
    value: ReactNode;
    /** Facts that need the full width, such as a description or a note. */
    wide?: boolean;
}

interface DataCardProps {
    /** Leading identity of the row, usually a name or a route. */
    title: ReactNode;
    /** Status shown opposite the title, e.g. required or a rating. */
    badge?: ReactNode;
    subtitle?: ReactNode;
    facts: DataCardFact[];
    className?: string;
}

/**
 * One row of a table, rendered as a card for panes too narrow for columns.
 * Every card list in the application uses this shape, so a row reads the same
 * whether it came from a parameter table, a schema table or a report.
 */
export default function DataCard({title, badge, subtitle, facts, className}: DataCardProps) {
    const visible = facts.filter(fact => fact.value !== undefined && fact.value !== null && fact.value !== '');
    return (
        <div
            className={clsx(
                'rounded-xl border p-3 shadow-sm transition-colors border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/30',
                className,
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">{title}</div>
                {badge && <div className="shrink-0">{badge}</div>}
            </div>
            {subtitle && <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{subtitle}</div>}
            {visible.length > 0 && (
                <dl className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-2 border-t pt-2.5 border-[var(--border)] @xs:grid-cols-2">
                    {visible.map(fact => (
                        <div key={fact.label} className={clsx('min-w-0', fact.wide && '@xs:col-span-2')}>
                            <dt className="mb-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                {fact.label}
                            </dt>
                            <dd className="min-w-0 text-[11px] leading-relaxed text-[var(--text)]">{fact.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

/** The requiredness of a field, in the tone the tables already use. */
export function RequiredBadge({required}: {required: boolean}) {
    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
                required
                    ? 'border-[var(--method-delete)]/30 bg-[var(--method-delete)]/10 text-[var(--method-delete)]'
                    : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]',
            )}
        >
            {required && <i className="ph-fill ph-asterisk text-[8px]" />}
            {required ? 'Required' : 'Optional'}
        </span>
    );
}
