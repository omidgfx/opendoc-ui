import type {ThemeMode} from '@/src/types';

/** One name and one icon per colour mode, so a group of buttons and the single
 *  cycling button of a narrow row always agree. */
export const THEME_MODE_META: Record<ThemeMode, {label: string; icon: string}> = {
    system: {label: 'Follow system', icon: 'ph ph-monitor'},
    light: {label: 'Light mode', icon: 'ph-fill ph-sun'},
    dark: {label: 'Dark mode', icon: 'ph-fill ph-moon'},
};

export const THEME_MODE_ORDER: ThemeMode[] = ['system', 'light', 'dark'];

/** The mode a single toggle moves to next. */
export const nextThemeMode = (mode: ThemeMode): ThemeMode =>
    THEME_MODE_ORDER[(THEME_MODE_ORDER.indexOf(mode) + 1) % THEME_MODE_ORDER.length];
