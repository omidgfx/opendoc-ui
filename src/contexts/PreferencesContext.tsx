import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {
    APP_PREFERENCES_EVENT,
    DEFAULT_APP_PREFERENCES,
    readAppPreferences,
    resetAppPreferences,
    writeAppPreferences,
    withEndpointRepresentation,
    withModalRepresentation,
    type AppPreferences,
    type IndicatorIconKind,
    type RepresentationMode,
} from '../utils/storage/preferences';

interface PreferencesContextValue {
    preferences: AppPreferences;
    setPreference: <Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) => void;
    toggleIndicatorIcon: (kind: IndicatorIconKind, enabled: boolean) => void;
    /** Records a documentation schema/example choice under the active scope. */
    setEndpointRepresentation: (endpointKey: string, mode: RepresentationMode, schemaName?: string | null) => void;
    /** Records a schema modal schema/example choice under the active scope. */
    setModalRepresentation: (schemaName: string, mode: RepresentationMode) => void;
    resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
    preferences: DEFAULT_APP_PREFERENCES,
    setPreference: () => {},
    toggleIndicatorIcon: () => {},
    setEndpointRepresentation: () => {},
    setModalRepresentation: () => {},
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
    const setEndpointRepresentation = useCallback(
        (endpointKey: string, mode: RepresentationMode, schemaName?: string | null) => {
            setPreferences(current => {
                const next = withEndpointRepresentation(current, endpointKey, mode, schemaName);
                writeAppPreferences(next);
                return next;
            });
        },
        [],
    );
    const setModalRepresentation = useCallback((schemaName: string, mode: RepresentationMode) => {
        setPreferences(current => {
            const next = withModalRepresentation(current, schemaName, mode);
            writeAppPreferences(next);
            return next;
        });
    }, []);
    const resetPreferences = useCallback(() => {
        setPreferences(resetAppPreferences());
    }, []);
    const value = useMemo(
        () => ({
            preferences,
            setPreference,
            toggleIndicatorIcon,
            setEndpointRepresentation,
            setModalRepresentation,
            resetPreferences,
        }),
        [
            preferences,
            setPreference,
            toggleIndicatorIcon,
            setEndpointRepresentation,
            setModalRepresentation,
            resetPreferences,
        ],
    );
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
