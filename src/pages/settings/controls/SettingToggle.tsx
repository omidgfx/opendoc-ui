import clsx from 'clsx';

interface SettingToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    ariaLabel: string;
    disabled?: boolean;
}

/** Switch used by every boolean setting. */
export default function SettingToggle({checked, onChange, ariaLabel, disabled = false}: SettingToggleProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={clsx(
                'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                checked
                    ? 'bg-[var(--primary)] border-[var(--primary)]'
                    : 'bg-[var(--surface-hover)] border-[var(--border)]',
            )}
        >
            <span
                className={clsx(
                    'absolute top-[2px] size-[14px] rounded-full transition-all',
                    checked ? 'left-[18px] bg-[var(--primary-contrast)]' : 'left-[2px] bg-[var(--text-muted)]',
                )}
            />
        </button>
    );
}
