import React, {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {CustomDropdownOption} from '../../types/ui';

interface CustomDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: CustomDropdownOption[];
    icon?: string;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
}

export default function CustomDropdown({
    value,
    onChange,
    options,
    icon,
    className = '',
    placeholder = 'Select...',
    disabled = false,
    ariaLabel,
}: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [position, setPosition] = useState({
        top: 0,
        left: 0,
        width: 0,
        openAbove: false,
        maxHeight: 288,
    });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const openedAtRef = useRef(0);
    const listboxId = useId();
    const selectedIndex = Math.max(
        0,
        options.findIndex(option => option.value === value),
    );
    const selected = options.find(option => option.value === value);

    const updatePosition = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const described = options.some(option => !!option.description?.trim());
        const estimatedHeight = Math.min(288, options.length * (described ? 44 : 34) + 8);
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
        const spaceAbove = Math.max(0, rect.top - 8);
        const openAbove = spaceBelow < Math.min(estimatedHeight, 160) && spaceAbove > spaceBelow;
        setPosition({
            top: openAbove ? rect.top - 4 : rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            openAbove,
            maxHeight: Math.max(80, Math.min(288, openAbove ? spaceAbove : spaceBelow)),
        });
    };
    const open = (index = selectedIndex) => {
        updatePosition();
        setActiveIndex(Math.max(0, Math.min(options.length - 1, index)));
        openedAtRef.current = Date.now();
        setIsOpen(true);
    };
    const close = (restoreFocus = false) => {
        setIsOpen(false);
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const selectIndex = (index: number) => {
        const option = options[index];
        if (!option) return;
        onChange(option.value);
        close(true);
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(index => Math.min(options.length - 1, index + 1));
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(index => Math.max(0, index - 1));
            } else if (event.key === 'Home') {
                event.preventDefault();
                setActiveIndex(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                setActiveIndex(Math.max(0, options.length - 1));
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectIndex(activeIndex);
            }
        };
        const handleViewportChange = (event: Event) => {
            const target = event.target;
            if (target instanceof Node && menuRef.current?.contains(target)) return;
            if (Date.now() - openedAtRef.current < 150) return;
            close(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('scroll', handleViewportChange, true);
        window.addEventListener('resize', handleViewportChange);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('scroll', handleViewportChange, true);
            window.removeEventListener('resize', handleViewportChange);
        };
    }, [isOpen, activeIndex, options]);

    useEffect(() => {
        if (!isOpen) return;
        menuRef.current
            ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
            ?.scrollIntoView({block: 'nearest'});
    }, [isOpen, activeIndex]);

    const getThemeVars = (): React.CSSProperties => {
        if (!triggerRef.current) return {};
        const themedElement =
            triggerRef.current.closest('[style*="--background"]') ||
            triggerRef.current.closest('body') ||
            document.documentElement;
        const styles = getComputedStyle(themedElement);
        const variables: Record<string, string> = {};
        [
            '--background',
            '--surface',
            '--surface-hover',
            '--border',
            '--text',
            '--text-heading',
            '--text-muted',
            '--primary',
        ].forEach(name => {
            const property = styles.getPropertyValue(name);
            if (property) variables[name] = property;
        });
        return variables;
    };

    const hasDescriptions = options.some(option => !!option.description?.trim());
    const menuWidth =
        typeof window === 'undefined'
            ? Math.max(position.width, hasDescriptions ? 260 : 180)
            : Math.min(Math.max(position.width, hasDescriptions ? 260 : 180), window.innerWidth - 16);
    const menuLeft =
        typeof window === 'undefined'
            ? position.left
            : Math.max(8, Math.min(position.left, window.innerWidth - menuWidth - 8));
    const menuContent = isOpen && (
        <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-activedescendant={`${listboxId}-option-${activeIndex}`}
            className="fixed z-[999999] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl py-1 text-sm min-w-[180px] max-h-72 overflow-y-auto text-[var(--text)]"
            style={{
                top: position.top,
                left: menuLeft,
                width: menuWidth,
                maxHeight: position.maxHeight,
                transform: position.openAbove ? 'translateY(-100%)' : undefined,
                ...getThemeVars(),
            }}
        >
            {options.map((option, index) => (
                <div
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={option.value === value}
                    data-option-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={event => event.preventDefault()}
                    onClick={event => {
                        event.stopPropagation();
                        selectIndex(index);
                    }}
                    className={`px-3 py-2 cursor-pointer flex items-center gap-2 rounded-lg text-xs font-mono transition-colors ${index === activeIndex ? 'bg-[var(--surface-hover)]' : 'bg-transparent'} ${option.value === value ? 'font-semibold' : ''}`}
                >
                    <span
                        className={`size-2 shrink-0 rounded-full ${index === activeIndex ? 'bg-[var(--primary)]' : option.value === value ? 'bg-[var(--method-get)]' : 'bg-transparent'}`}
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description && (
                            <span className="mt-0.5 block truncate font-sans text-[9px] font-normal leading-snug text-[var(--text-muted)]">
                                {option.description}
                            </span>
                        )}
                    </span>
                </div>
            ))}
        </div>
    );

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                onClick={() => (disabled ? undefined : isOpen ? close(false) : open())}
                onKeyDown={event => {
                    if (disabled) return;
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        if (!isOpen) open(event.key === 'ArrowDown' ? selectedIndex : Math.max(0, selectedIndex));
                    }
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-lg border bg-[var(--background)] border-[var(--border)] cursor-pointer hover:border-[var(--primary)]/50 transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
                <span className="flex min-w-0 items-center gap-2 truncate">
                    {icon && <i className={icon} />}
                    <span className="font-mono truncate">{selected?.label || placeholder}</span>
                </span>
                <i className={`ph ph-caret-down text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {typeof window !== 'undefined' && createPortal(menuContent, document.body)}
        </div>
    );
}
