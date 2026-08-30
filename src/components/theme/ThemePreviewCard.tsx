import type {AppTheme} from '../../types';
import MiniPagePreview from './MiniPagePreview';
import MethodColorsPreview from './MethodColorsPreview';
import {alpha} from '@/src/utils/theme/selector';

export default function ThemePreviewCard({
    theme,
    selected,
    resolvedThemeMode,
    onSelect,
}: {
    theme: AppTheme;
    selected: boolean;
    resolvedThemeMode: 'light' | 'dark';
    onSelect: () => void;
}) {
    const activePalette = theme[resolvedThemeMode];

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={`Select ${theme.name} theme`}
            className="group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] text-left transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
            style={{
                backgroundColor: selected ? alpha(activePalette.primary, '10') : undefined,
                borderColor: selected ? activePalette.primary : 'var(--border)',
                boxShadow: selected
                    ? `0 0 0 2px ${alpha(activePalette.primary, '28')}, 0 14px 28px rgba(0,0,0,.12)`
                    : '0 4px 14px rgba(0,0,0,.05)',
            }}
        >
            {selected && (
                <span
                    className="absolute z-10 flex h-5 w-5 items-center justify-center rounded-full text-[var(--primary-contrast)] shadow-md"
                    style={{right: 10, top: 10, backgroundColor: activePalette.primary}}
                >
                    <i className="ph ph-check text-[11px]" />
                </span>
            )}

            <span className="pointer-events-none grid grid-cols-2 gap-1 p-1.5" style={{height: 118}}>
                <MiniPagePreview palette={theme.light} mode="light" />
                <MiniPagePreview palette={theme.dark} mode="dark" />
            </span>

            <span className="pointer-events-none px-1.5 pb-1">
                <MethodColorsPreview palette={activePalette} compact />
            </span>

            <span
                className="flex items-end justify-between gap-2 border-t px-2.5 py-2"
                style={{borderColor: 'var(--border)'}}
            >
                <span className="min-w-0">
                    <span className="block truncate text-[12px] font-extrabold leading-tight text-[var(--text-heading)]">
                        {theme.name}
                    </span>
                </span>
            </span>
        </button>
    );
}
