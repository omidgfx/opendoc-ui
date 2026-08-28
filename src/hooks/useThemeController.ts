import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ThemeMode} from '../types';
import {THEME_LIST, isKnownThemeRef, resolveTheme} from '../data/themes';
import {specStorage} from '../utils/storage/index';
import {applyThemeCssVariables, createThemeCssVariables} from '../utils/theme/themeCss';

export function useThemeController(selectedSpecKey: string, configThemeRef?: string) {
    const [selectedThemeName, setSelectedThemeName] = useState(THEME_LIST[0].name);
    const [currentThemeMode, setCurrentThemeMode] = useState<ThemeMode>('system');
    const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(
        () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches,
    );
    const [restoredForKey, setRestoredForKey] = useState('');
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: light)');
        const onChange = (event: MediaQueryListEvent) => setSystemPrefersLight(event.matches);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);
    const resolvedThemeMode: 'light' | 'dark' =
        currentThemeMode === 'system' ? (systemPrefersLight ? 'light' : 'dark') : currentThemeMode;
    const toggleThemeMode = useCallback(() => {
        setCurrentThemeMode(mode => {
            if (mode === 'system') return systemPrefersLight ? 'dark' : 'light';
            if (mode === 'light') return systemPrefersLight ? 'system' : 'dark';
            return systemPrefersLight ? 'light' : 'system';
        });
    }, [systemPrefersLight]);
    useEffect(() => {
        if (!selectedSpecKey) return;
        const stored = specStorage.get(selectedSpecKey, 'theme');
        const fromStorage = isKnownThemeRef(stored) ? resolveTheme(stored).name : '';
        const fromConfig = isKnownThemeRef(configThemeRef) ? resolveTheme(configThemeRef).name : '';
        setSelectedThemeName(fromStorage || fromConfig || THEME_LIST[0].name);
        const mode = specStorage.get(selectedSpecKey, 'theme_mode');
        setCurrentThemeMode(mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system');
        setRestoredForKey(selectedSpecKey);
    }, [selectedSpecKey, configThemeRef]);
    useEffect(() => {
        if (selectedSpecKey && restoredForKey === selectedSpecKey) {
            // Persist the stable slug so configs and storage share one vocabulary.
            specStorage.set(selectedSpecKey, 'theme', resolveTheme(selectedThemeName).id);
        }
    }, [selectedThemeName, selectedSpecKey, restoredForKey]);
    useEffect(() => {
        if (selectedSpecKey && restoredForKey === selectedSpecKey) {
            specStorage.set(selectedSpecKey, 'theme_mode', currentThemeMode);
        }
    }, [currentThemeMode, selectedSpecKey, restoredForKey]);
    const activeTheme = useMemo(() => resolveTheme(selectedThemeName), [selectedThemeName]);
    const activePalette = resolvedThemeMode === 'light' ? activeTheme.light : activeTheme.dark;
    useEffect(() => applyThemeCssVariables(activePalette), [activePalette]);
    const styleVars = useMemo(() => createThemeCssVariables(activePalette), [activePalette]);
    return {
        selectedThemeName,
        setSelectedThemeName,
        currentThemeMode,
        setCurrentThemeMode,
        resolvedThemeMode,
        toggleThemeMode,
        styleVars,
    };
}
