import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {
    APP_PREFERENCES_EVENT,
    DEFAULT_APP_PREFERENCES,
    readAppPreferences,
    resetAppPreferences,
    writeAppPreferences,
    type AppPreferences,
    type IndicatorIconKind,
} from '../utils/storage/preferences';

interface PreferencesContextValue {
    preferences: AppPreferences;
    setPreference: <Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) => void;
    toggleIndicatorIcon: (kind: IndicatorIconKind, enabled: boolean) => void;
    resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
    preferences: DEFAULT_APP_PREFERENCES,
    setPreference: () => {},
    toggleIndicatorIcon: () => {},
    resetPreferences: () => {},
});

export function PreferencesProvider({children}: {children: ReactNode}) {
    const [preferences, setPreferences] = useState<AppPreferences>(() => DEFAULT_APP_PREFERENCES);
    useEffect(() => {
        setPreferences(readAppPreferences());
    }, []);
    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<AppPreferences>).detail;
            setPreferences(detail ? detail : readAppPreferences());
        };
        window.addEventListener(APP_PREFERENCES_EVENT, handler);
        return () => window.removeEventListener(APP_PREFERENCES_EVENT, handler);
    }, []);
    const setPreference = useCallback(<Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) => {
        setPreferences(current => {
            if (current[key] === value) return current;
            const next = {...current, [key]: value};
            writeAppPreferences(next);
            return next;
        });
    }, []);
    const toggleIndicatorIcon = useCallback((kind: IndicatorIconKind, enabled: boolean) => {
        setPreferences(current => {
            const disabled = new Set(current.disabledIndicatorIcons);
            if (enabled) disabled.delete(kind);
            else disabled.add(kind);
            const next = {...current, disabledIndicatorIcons: Array.from(disabled)};
            writeAppPreferences(next);
            return next;
        });
    }, []);
    const resetPreferences = useCallback(() => {
        setPreferences(resetAppPreferences());
    }, []);
    const value = useMemo(
        () => ({preferences, setPreference, toggleIndicatorIcon, resetPreferences}),
        [preferences, setPreference, toggleIndicatorIcon, resetPreferences],
    );
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
