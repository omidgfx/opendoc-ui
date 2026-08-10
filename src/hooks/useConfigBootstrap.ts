import {type Dispatch, type SetStateAction, useEffect} from 'react';
import type {AISettings, ParsableConfig} from '../types';
import {findLocalHistoryEntry, readLocalHistory} from '../utils/localHistory';
import {parseSmartRoute} from '../utils/routing';
import {migrateLegacyStorage, specStorage, storage, uiStorage} from '../utils/storage';
import type {ConfigSource} from '../utils/appSpec';

interface UseConfigBootstrapOptions {
    setConfigSource: Dispatch<SetStateAction<ConfigSource>>;
    setAISettings: Dispatch<SetStateAction<AISettings>>;
    setAISettingsReady: Dispatch<SetStateAction<boolean>>;
    setParsables: Dispatch<SetStateAction<ParsableConfig>>;
    setSelectedSpecKey: Dispatch<SetStateAction<string>>;
    setInitialLoadComplete: Dispatch<SetStateAction<boolean>>;
    applyLocalSpec: (raw: string, fileName: string, file: File | null) => unknown;
    applyLocalBundle: (bundle: Record<string, string>, preferredFile?: File | null) => Promise<unknown>;
}

export function useConfigBootstrap({
    setConfigSource,
    setAISettings,
    setAISettingsReady,
    setParsables,
    setSelectedSpecKey,
    setInitialLoadComplete,
    applyLocalSpec,
    applyLocalBundle,
}: UseConfigBootstrapOptions): void {
    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            migrateLegacyStorage();
            let data: any = null;
            let source: ConfigSource = 'none';
            if (window.INITIAL_CONFIG) {
                data = window.INITIAL_CONFIG;
                source = 'initial';
            } else {
                try {
                    const configUrl = new URL('config.json', document.baseURI).href;
                    const response = await fetch(configUrl, {cache: 'no-store'});
                    if (response.ok) {
                        data = await response.json();
                        source = 'file';
                    }
                } catch (error) {
                    console.warn('config.json unreachable, running in local mode.', error);
                }
            }
            if (cancelled) return;
            if (source !== 'none' && data?.allowLocalSpecifications === true) source = 'hybrid';
            const canOpenLocal = source === 'none' || source === 'hybrid';
            setConfigSource(source);
            if (data?.ai && typeof data.ai === 'object' && storage.get(uiStorage.key('ai_settings')) === '') {
                setAISettings(current => ({
                    ...current,
                    ...data.ai,
                    ...(Array.isArray(data.ai.skillPacks) ? {skillPacks: data.ai.skillPacks} : {}),
                }));
            }
            setAISettingsReady(true);
            const loaded: ParsableConfig = {};
            if (data?.parsables && typeof data.parsables === 'object') {
                Object.entries(data.parsables).forEach(([key, value]: [string, any]) => {
                    loaded[key] = {
                        theme: value.theme || 'Default Slate',
                        url: value.url || '',
                        title: value.title || key,
                        isCustom: value.isCustom === true || !!value.rawSpec,
                        rawSpec: value.rawSpec || '',
                    };
                });
            }
            setParsables(loaded);
            if (Object.keys(loaded).length > 0) {
                const route = parseSmartRoute(window.location.hash);
                let restoredLocalSpecification = false;
                if (canOpenLocal && route.parsableKey && !loaded[route.parsableKey]) {
                    const entry = findLocalHistoryEntry(route.parsableKey);
                    if (entry) {
                        try {
                            if (entry.bundle && Object.keys(entry.bundle).length > 1)
                                await applyLocalBundle(entry.bundle, null);
                            else applyLocalSpec(entry.raw, entry.fileName, null);
                            restoredLocalSpecification = true;
                        } catch {}
                    }
                }
                if (!restoredLocalSpecification) {
                    let initialKey = '';
                    if (route.parsableKey && loaded[route.parsableKey]) initialKey = route.parsableKey;
                    else {
                        const savedKey = uiStorage.get('last_parsable');
                        initialKey = savedKey && loaded[savedKey] ? savedKey : Object.keys(loaded)[0] || '';
                    }
                    if (initialKey) setSelectedSpecKey(initialKey);
                }
                const retainedKeys = canOpenLocal
                    ? [...Object.keys(loaded), ...readLocalHistory().map(entry => entry.key)]
                    : Object.keys(loaded);
                specStorage.prune(retainedKeys);
            } else if (window.location.hash) {
                const route = parseSmartRoute(window.location.hash);
                if (route.parsableKey) {
                    const entry = findLocalHistoryEntry(route.parsableKey);
                    if (entry) {
                        try {
                            if (entry.bundle && Object.keys(entry.bundle).length > 1)
                                await applyLocalBundle(entry.bundle, null);
                            else applyLocalSpec(entry.raw, entry.fileName, null);
                        } catch {}
                    }
                }
            }
            setInitialLoadComplete(true);
        };
        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, []);
}
