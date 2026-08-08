import { useCallback, useEffect, useState } from 'react';
import type { AISettings } from '../types';
import { readAIProfiles, readAISettings, writeAISettings } from '../utils/aiStorage';
export function useAISettingsController() {
    const [aiSettings, setAISettings] = useState<AISettings>(() => readAISettings());
    const [hasAIProfile, setHasAIProfile] = useState(() => readAIProfiles().length > 0);
    const [aiSettingsReady, setAISettingsReady] = useState(false);
    const [showAISettings, setShowAISettings] = useState(false);
    useEffect(() => {
        if (aiSettingsReady)
            writeAISettings(aiSettings);
    }, [aiSettings, aiSettingsReady]);
    const handleAISettingsSave = useCallback((settings: AISettings) => {
        setAISettings(settings);
        setHasAIProfile(readAIProfiles().length > 0);
    }, []);
    return {
        aiSettings,
        setAISettings,
        aiSettingsReady,
        setAISettingsReady,
        hasAIProfile,
        showAISettings,
        setShowAISettings,
        handleAISettingsSave,
    };
}
