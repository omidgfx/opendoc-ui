import clsx from 'clsx';
import type {ReactNode} from 'react';

interface SettingRowProps {
    label: string;
    description?: string;
    icon?: string;
    /** Indented rows read as children of the setting above them. */
    nested?: boolean;
    disabled?: boolean;
    control: ReactNode;
    children?: ReactNode;
}

/** One labelled setting: title, optional help text and its control. */
export default function SettingRow({
    label,
    description,
    icon,
    nested = false,
    disabled = false,
    control,
    children,
}: SettingRowProps) {
    return (
        <div
            className={clsx(
                'px-4 py-3 sm:px-5 transition-opacity',
                nested && 'pl-9 sm:pl-12 bg-[var(--background)]/40',
                disabled && 'opacity-50 pointer-events-none',
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                    {icon && <i className={clsx(icon, 'mt-[2px] shrink-0 text-[14px] text-[var(--primary)]')} />}
                    <div className="min-w-0">
                        <span className="block text-[12px] font-bold text-[var(--text-heading)]">{label}</span>
                        {description && (
                            <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
                                {description}
                            </span>
                        )}
                    </div>
                </div>
                <div className="shrink-0">{control}</div>
            </div>
            {children && <div className="mt-3">{children}</div>}
        </div>
    );
}
