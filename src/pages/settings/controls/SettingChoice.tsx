import clsx from 'clsx';

export interface SettingChoiceOption<Value extends string> {
    value: Value;
    label: string;
    icon?: string;
}

interface SettingChoiceProps<Value extends string> {
    value: Value;
    options: SettingChoiceOption<Value>[];
    onChange: (value: Value) => void;
    ariaLabel: string;
}

/** Segmented control for short, constant option sets. */
export default function SettingChoice<Value extends string>({
    value,
    options,
    onChange,
    ariaLabel,
}: SettingChoiceProps<Value>) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className="flex gap-0.5 rounded-xl border p-0.5 bg-[var(--background)] border-[var(--border)]"
        >
            {options.map(option => {
                const isSelected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => onChange(option.value)}
                        className={clsx(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[11px] font-bold transition-all',
                            isSelected
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                        )}
                    >
                        {option.icon && <i className={clsx(option.icon, 'text-[13px]')} />}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
