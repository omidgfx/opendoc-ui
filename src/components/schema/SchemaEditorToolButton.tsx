import clsx from 'clsx';

interface SchemaEditorToolButtonProps {
    active?: boolean;
    onClick: () => void;
    icon: string;
    label: string;
    iconColor?: string;
}

export default function SchemaEditorToolButton({
    active,
    onClick,
    icon,
    label,
    iconColor,
}: SchemaEditorToolButtonProps) {
    return (
        <button type="button" onClick={onClick}
                className={clsx(
                    'p-1.5 rounded-md bg-[var(--background)] border text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 hover:bg-[var(--surface-hover)]',
                    active ? 'text-[var(--primary)] border-[var(--primary)]/30' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-heading)]',
                )}>
            <i className={clsx(`ph ${icon} text-[12px]`, iconColor)}/>
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}
