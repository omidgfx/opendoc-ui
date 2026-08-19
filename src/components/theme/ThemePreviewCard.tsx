import type {AppTheme} from '../../types';
import MiniPagePreview from './MiniPagePreview';
import MethodColorsPreview from './MethodColorsPreview';
import ThemeNamePreview from './ThemeNamePreview';
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
            className="group relative w-full rounded-2xl border bg-[var(--surface)] p-2 text-left transition-all duration-200 cursor-pointer focus:outline-none"
            style={{
                backgroundColor: selected ? alpha(activePalette.primary, '12') : undefined,
                borderColor: selected ? activePalette.primary : 'var(--border)',
                boxShadow: selected
                    ? `0 0 0 2px ${alpha(activePalette.primary, '30')}, 0 16px 34px rgba(0,0,0,.13)`
                    : '0 6px 20px rgba(0,0,0,.06)',
            }}
        >
            {selected && (
                <span
                    className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-[var(--primary-contrast)] shadow-md"
                    style={{right: 14, top: 14, backgroundColor: activePalette.primary}}
                >
                    <i className="ph ph-check text-[12px]" />
                </span>
            )}
            <span className="pointer-events-none grid grid-cols-2 gap-1.5 rounded-xl" style={{height: 210}}>
                <ThemeNamePreview theme={theme} mode={resolvedThemeMode} />
                <MethodColorsPreview palette={activePalette} />
                <MiniPagePreview palette={theme.light} mode="light" />
                <MiniPagePreview palette={theme.dark} mode="dark" />
            </span>
        </button>
    );
}
