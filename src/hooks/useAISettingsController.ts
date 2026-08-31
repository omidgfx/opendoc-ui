import {useCallback, useEffect, useMemo, useState} from 'react';
import type {AIManagedPolicy, AISettings} from '../types';
import {managedSettingsFromPolicy} from '../utils/ai/managed';
import {readAIProfiles, readAISettings, writeAISettings} from '../utils/ai/storage';

/**
 * Classic mode: user-owned profiles and settings persisted locally.
 * Managed mode: settings are synthesized from the server-published policy,
 * never persisted, and every write path is an inert no-op — the user can
 * neither see nor change AI authorization or provider configuration.
 */
export function useAISettingsController(managed: AIManagedPolicy | null = null, policyUrl = '') {
    const managedActive = !!managed && managed.ready;
    const [aiSettings, setAISettings] = useState<AISettings>(() => readAISettings());
    const [userProfileCount, setUserProfileCount] = useState(() => readAIProfiles().length);
    const [aiSettingsReady, setAISettingsReady] = useState(false);
    useEffect(() => {
        if (managedActive || !aiSettingsReady) return;
        writeAISettings(aiSettings);
    }, [aiSettings, aiSettingsReady, managedActive]);
    const handleAISettingsSave = useCallback(
        (settings: AISettings) => {
            if (managedActive) return;
            setAISettings(settings);
            setUserProfileCount(readAIProfiles().length);
        },
        [managedActive],
    );
    const effectiveSettings = useMemo(
        () => (managedActive && managed ? managedSettingsFromPolicy(managed, policyUrl) : aiSettings),
        [managedActive, managed, policyUrl, aiSettings],
    );
    return {
        aiSettings: effectiveSettings,
        setAISettings,
        aiSettingsReady,
        setAISettingsReady,
        hasAIProfile: managedActive || (!managed && userProfileCount > 0),
        handleAISettingsSave,
    };
}
