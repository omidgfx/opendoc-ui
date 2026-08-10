import {type Dispatch, type SetStateAction, useCallback, useState} from 'react';
import type {OpenApiSpec, Parsable, ParsableConfig} from '../types';
import {clearAllCachedSpecs, clearCachedSpec} from '../utils/specCache';
import {specStorage, uiStorage} from '../utils/storage';
import {clearAIConversations, clearAISessionSecrets, clearAllAIConversations} from '../utils/aiStorage';
import {type LocalSpec, parseSpecDraft} from '../utils/appSpec';

interface UseSpecificationActionsOptions {
    selectedSpecKey: string;
    parsables: ParsableConfig;
    localSpec: LocalSpec | null;
    loadSpec: (key: string, parsable: Parsable, forceRefresh?: boolean) => Promise<void>;
    applyLocalSpec: (raw: string, fileName: string, file: File | null) => OpenApiSpec;
    applyLocalBundle: (bundle: Record<string, string>, preferredFile?: File | null) => Promise<OpenApiSpec>;
    setSpec: Dispatch<SetStateAction<OpenApiSpec | null>>;
    setLoadedSpecKey: Dispatch<SetStateAction<string>>;
    setLocalOpenError: Dispatch<SetStateAction<string | null>>;
}

export function useSpecificationActions({
    selectedSpecKey,
    parsables,
    localSpec,
    loadSpec,
    applyLocalSpec,
    applyLocalBundle,
    setSpec,
    setLoadedSpecKey,
    setLocalOpenError,
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
            } else if (localSpec) {
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
            setLocalOpenError('Could not re-read the specification.');
        } finally {
            await minimumVisible;
            setIsRefreshingSpec(false);
        }
    }, [
        selectedSpecKey,
        parsables,
        localSpec,
        loadSpec,
        applyLocalSpec,
        applyLocalBundle,
        setSpec,
        setLoadedSpecKey,
        setLocalOpenError,
    ]);
    const reloadSpecification = useCallback(
        async (specKey: string) => {
            if (specKey === selectedSpecKey) await refreshSpec();
        },
        [selectedSpecKey, refreshSpec],
    );
    const resetSpecification = useCallback(
        async (specKey: string) => {
            await clearAIConversations(specKey);
            await specStorage.clear(specKey);
            const source = parsables[specKey];
            if (source?.url) await clearCachedSpec(source.url);
            window.setTimeout(() => window.location.reload(), 0);
        },
        [parsables],
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
