import {type Dispatch, type SetStateAction, useCallback, useState} from 'react';
import type {OpenApiSpec, Parsable, ParsableConfig} from '../types';
import {clearAllCachedSpecs, clearCachedSpec} from '../utils/specCache';
import {specStorage, uiStorage} from '../utils/storage';
import {clearAIConversations, clearAISessionSecrets, clearAllAIConversations} from '../utils/aiStorage';
import {type LocalSpec, parseSpecDraft} from '../utils/appSpec';
import {ENDPOINT_NOTE_PANEL_EXPANDED_STORAGE_NAME, ENDPOINT_NOTES_STORAGE_NAME} from '../utils/endpointNotes';

interface UseSpecificationActionsOptions {
    selectedSpecKey: string;
    parsables: ParsableConfig;
    localSpec: LocalSpec | null;
    activeRemoteSpec: {key: string; url: string} | null;
    loadRemoteSpec: (url: string, options?: {force?: boolean}) => Promise<unknown>;
    loadSpec: (key: string, parsable: Parsable, forceRefresh?: boolean) => Promise<void>;
    applyLocalSpec: (raw: string, fileName: string, file: File | null) => OpenApiSpec;
    applyLocalBundle: (bundle: Record<string, string>, preferredFile?: File | null) => Promise<OpenApiSpec>;
    setSpec: Dispatch<SetStateAction<OpenApiSpec | null>>;
    setLoadedSpecKey: Dispatch<SetStateAction<string>>;
    setLocalOpenError: Dispatch<SetStateAction<string | null>>;
    setRemoteOpenError: Dispatch<SetStateAction<string | null>>;
}

export function useSpecificationActions({
    selectedSpecKey,
    parsables,
    localSpec,
    activeRemoteSpec,
    loadRemoteSpec,
    loadSpec,
    applyLocalSpec,
    applyLocalBundle,
    setSpec,
    setLoadedSpecKey,
    setLocalOpenError,
    setRemoteOpenError,
}: UseSpecificationActionsOptions) {
    const [isRefreshingSpec, setIsRefreshingSpec] = useState(false);
    const refreshSpec = useCallback(async () => {
        setIsRefreshingSpec(true);
        const minimumVisible = new Promise(resolve => setTimeout(resolve, 700));
        try {
            if (selectedSpecKey && parsables[selectedSpecKey]) {
                // Force network revalidation without deleting the last-known-good
                // entry first; a failed refresh can then fall back visibly.
                await loadSpec(selectedSpecKey, parsables[selectedSpecKey], true);
            } else if (activeRemoteSpec?.key === selectedSpecKey) {
                await loadRemoteSpec(activeRemoteSpec.url, {force: true});
            } else if (localSpec?.key === selectedSpecKey) {
                if (localSpec.bundle && Object.keys(localSpec.bundle).length > 1) {
                    await applyLocalBundle(localSpec.bundle, localSpec.file);
                } else if (localSpec.file) {
                    applyLocalSpec(await localSpec.file.text(), localSpec.fileName, localSpec.file);
                } else {
                    setSpec(parseSpecDraft(localSpec.raw));
                    setLoadedSpecKey(localSpec.key);
                }
            }
        } catch (error) {
            console.error('Refresh failed', error);
            if (activeRemoteSpec?.key === selectedSpecKey)
                setRemoteOpenError(error instanceof Error ? error.message : 'Could not re-download the specification.');
            else setLocalOpenError('Could not re-read the specification.');
        } finally {
            await minimumVisible;
            setIsRefreshingSpec(false);
        }
    }, [
        selectedSpecKey,
        parsables,
        localSpec,
        activeRemoteSpec,
        loadRemoteSpec,
        loadSpec,
        applyLocalSpec,
        applyLocalBundle,
        setSpec,
        setLoadedSpecKey,
        setLocalOpenError,
        setRemoteOpenError,
    ]);
    const reloadSpecification = useCallback(
        async (specKey: string) => {
            if (specKey === selectedSpecKey) await refreshSpec();
        },
        [selectedSpecKey, refreshSpec],
    );
    const resetSpecification = useCallback(
        async (specKey: string, options: {clearNotes?: boolean} = {}) => {
            await clearAIConversations(specKey);
            await specStorage.clear(
                specKey,
                options.clearNotes ? [] : [ENDPOINT_NOTES_STORAGE_NAME, ENDPOINT_NOTE_PANEL_EXPANDED_STORAGE_NAME],
            );
            const source = parsables[specKey];
            if (source?.url) await clearCachedSpec(source.url);
            else if (activeRemoteSpec?.key === specKey) await clearCachedSpec(activeRemoteSpec.url);
            window.setTimeout(() => window.location.reload(), 0);
        },
        [parsables, activeRemoteSpec],
    );
    const resetAllConfigurations = useCallback(async () => {
        await uiStorage.clear();
        clearAISessionSecrets();
        await clearAllAIConversations();
        await specStorage.clearAll();
        await clearAllCachedSpecs();
        window.setTimeout(() => window.location.reload(), 0);
    }, []);
    return {
        isRefreshingSpec,
        handleRefreshSpec: refreshSpec,
        handleReloadSpecification: reloadSpecification,
        handleResetSpecification: resetSpecification,
        handleResetAllConfigurations: resetAllConfigurations,
    };
}
