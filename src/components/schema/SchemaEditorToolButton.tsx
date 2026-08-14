import clsx from 'clsx';

interface SchemaEditorToolButtonProps {
    active?: boolean;
    onClick: () => void;
    icon: string;
    label: string;
    toggle?: boolean;
}

export default function SchemaEditorToolButton({
    active = false,
    onClick,
    icon,
    label,
    toggle = false,
}: SchemaEditorToolButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={toggle ? active : undefined}
            className={clsx(
                'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-bold transition-colors cursor-pointer',
                toggle && active
                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]',
            )}
        >
            <i className={clsx(`ph ${icon} text-[13px]`, !toggle && 'text-[var(--primary)]')} />
            <span className="hidden md:inline">{label}</span>
        </button>
    );
}
