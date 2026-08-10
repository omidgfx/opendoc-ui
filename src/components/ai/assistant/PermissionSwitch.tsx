import clsx from 'clsx';

interface PermissionSwitchProps {
    checked: boolean;
    onChange: () => void;
    label: string;
    checkedClass: string;
    uncheckedClass: string;
}

export default function PermissionSwitch({
    checked,
    onChange,
    label,
    checkedClass,
    uncheckedClass,
}: PermissionSwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={checked}
            onClick={onChange}
            className={clsx(
                'relative flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50',
                checked ? checkedClass : uncheckedClass,
            )}
        >
            <span
                aria-hidden="true"
                className="absolute size-5 rounded-full bg-white shadow-md transition-transform"
                style={{left: '4px', top: '50%', transform: `translate(${checked ? '20px' : '0px'}, -50%)`}}
            />
        </button>
    );
}
