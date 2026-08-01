import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Option {
    value: string;
    label: string;
}

interface CustomDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    icon?: string;
    className?: string;
    placeholder?: string;
}

export default function CustomDropdown({
                                           value,
                                           onChange,
                                           options,
                                           icon,
                                           className = '',
                                           placeholder = 'Select...'
                                       }: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const selected = options.find(o => o.value === value);

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        }
    };

    const toggle = () => {
        if (!isOpen) {
            updatePosition();
        }
        setIsOpen(!isOpen);
    };

    // Close on outside click / escape / scroll / resize
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                menuRef.current && !menuRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };

        const handleScrollOrResize = () => setIsOpen(false);

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen]);

    const handleSelect = (opt: Option) => {
        onChange(opt.value);
        setIsOpen(false);
    };

    // Copy theme CSS variables from nearest ancestor so portal menu respects current theme
    const getThemeVars = (): React.CSSProperties => {
        if (!triggerRef.current) return {};
        const themedEl = triggerRef.current.closest('[style*="--background"]') ||
            triggerRef.current.closest('body') ||
            document.documentElement;
        const styles = getComputedStyle(themedEl);
        const vars: any = {};
        ['--background', '--surface', '--surface-hover', '--border', '--text', '--text-heading', '--text-muted', '--primary'].forEach(v => {
            const val = styles.getPropertyValue(v);
            if (val) vars[v] = val;
        });
        return vars;
    };

    const menuContent = isOpen && (
        <div
            ref={menuRef}
            className="fixed z-[999999] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl py-1 text-sm min-w-[180px] overflow-hidden text-[var(--text)]"
            style={{
                top: position.top,
                left: position.left,
                width: Math.max(position.width, 180),
                ...getThemeVars(),
            }}
        >
            {options.map((opt) => (
                <div
                    key={opt.value}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(opt);
                    }}
                    className={`px-3 py-2 cursor-pointer hover:bg-[var(--surface-hover)] flex items-center gap-2 text-xs font-mono ${
                        opt.value === value ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-semibold' : ''
                    }`}
                >
                    {opt.label}
                </div>
            ))}
        </div>
    );

    return (
        <div ref={triggerRef} className={`relative ${className}`}>
            <div
                onClick={toggle}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-lg border bg-[var(--background)] border-[var(--border)] cursor-pointer hover:border-[var(--primary)]/50 transition-all select-none"
            >
                <div className="flex items-center gap-2 truncate">
                    {icon && <i className={icon}></i>}
                    <span className="font-mono truncate">{selected?.label || placeholder}</span>
                </div>
                <i className={`ph ph-caret-down text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </div>

            {typeof window !== 'undefined' && createPortal(menuContent, document.body)}
        </div>
    );
}
