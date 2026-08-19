import type {ReactNode} from 'react';

interface SettingsGroupProps {
    title: string;
    description?: string;
    icon?: string;
    children: ReactNode;
}

/** Card wrapper every settings group uses, so the page keeps one rhythm. */
export default function SettingsGroup({title, description, icon, children}: SettingsGroupProps) {
    return (
        <section className="rounded-2xl border shadow-sm overflow-hidden bg-[var(--surface)] border-[var(--border)]">
            <header className="flex items-start gap-3 border-b px-4 py-3 sm:px-5 bg-[var(--background)] border-[var(--border)]">
                {icon && (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border text-[15px] bg-[var(--primary)]/10 border-[var(--primary)]/25 text-[var(--primary)]">
                        <i className={icon} />
                    </span>
                )}
                <div className="min-w-0">
                    <h3 className="text-[13px] font-extrabold tracking-tight text-[var(--text-heading)]">{title}</h3>
                    {description && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{description}</p>}
                </div>
            </header>
            <div className="divide-y divide-[var(--border)]">{children}</div>
        </section>
    );
}
