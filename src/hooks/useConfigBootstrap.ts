import {type Dispatch, type SetStateAction, useEffect} from 'react';
import type {AISettings, ParsableConfig} from '../types';
import {findLocalHistoryEntry} from '../utils/localHistory';
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
}

export function useConfigBootstrap({
                                       setConfigSource,
                                       setAISettings,
                                       setAISettingsReady,
                                       setParsables,
                                       setSelectedSpecKey,
                                       setInitialLoadComplete,
                                       applyLocalSpec,
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
                    const response = await fetch('/config.json', {cache: 'no-store'});
                    if (response.ok) {
                        data = await response.json();
                        source = 'file';
                    }
                } catch (error) {
                    console.warn('config.json unreachable, running in local mode.', error);
                }
            }
            if (cancelled) return;
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
                let initialKey = '';
                if (route.parsableKey && loaded[route.parsableKey]) initialKey = route.parsableKey;
                else {
                    const savedKey = uiStorage.get('last_parsable');
                    initialKey = savedKey && loaded[savedKey] ? savedKey : Object.keys(loaded)[0] || '';
                }
                if (initialKey) setSelectedSpecKey(initialKey);
                specStorage.prune(Object.keys(loaded));
            } else if (window.location.hash) {
                const route = parseSmartRoute(window.location.hash);
                if (route.parsableKey) {
                    const entry = findLocalHistoryEntry(route.parsableKey);
                    if (entry) {
                        try {
                            applyLocalSpec(entry.raw, entry.fileName, null);
                        } catch {
                            // Ignore stale local history entries.
                        }
                    }
                }
            }
            setInitialLoadComplete(true);
        };
        void bootstrap();
        return () => {
            cancelled = true;
        };
        // Bootstrap must run once; callbacks are stable setters or initial
        // local-spec restoration behavior captured for the first load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
