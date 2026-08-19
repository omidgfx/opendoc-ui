import clsx from 'clsx';
import {Tip} from './Tooltip';

export type TypeBadgeTone = 'null' | 'nullable' | 'deprecated' | 'const' | 'format' | 'neutral';

interface TypeBadgeProps {
    /** Text shown inside the badge, e.g. "null" or "read-only". */
    label: string;
    tone?: TypeBadgeTone;
    icon?: string;
    /** Hover explanation; the badge stays silent when omitted. */
    tip?: string;
    className?: string;
}

const TONE_CLASSES: Record<TypeBadgeTone, string> = {
    null: 'border-[var(--method-delete)]/30 bg-[var(--method-delete)]/10 text-[var(--method-delete)]',
    nullable: 'border-[var(--method-put)]/30 bg-[var(--method-put)]/10 text-[var(--method-put)]',
    deprecated: 'border-[var(--method-put)]/30 bg-[var(--method-put)]/10 text-[var(--method-put)]',
    const: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]',
    format: 'border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)]',
    neutral: 'border-[var(--border)] bg-[var(--text-muted)]/10 text-[var(--text-muted)]',
};

/**
 * One badge for the type facts that show up all over the documentation and the
 * Runner — `null` branches first, then nullability, deprecation, const values
 * and formats — so they read the same wherever they appear.
 */
export default function TypeBadge({label, tone = 'neutral', icon, tip, className}: TypeBadgeProps) {
    const badge = (
        <span
            className={clsx(
                'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase leading-none tracking-wide',
                TONE_CLASSES[tone],
                className,
            )}
        >
            {icon && <i className={clsx(icon, 'text-[10px]')} />}
            {label}
        </span>
    );
    return tip ? <Tip content={tip}>{badge}</Tip> : badge;
}

/** The `null` branch of a union or a pure-null schema. */
export const NullTypeBadge = ({className}: {className?: string}) => (
    <TypeBadge
        label="null"
        tone="null"
        icon="ph ph-prohibit"
        tip="This branch accepts the JSON value null."
        className={className}
    />
);
