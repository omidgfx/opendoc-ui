import {type ChangeEvent, useCallback, useRef, useState} from 'react';
import type {OpenApiSpec} from '../types';
import {
    clearLocalHistory,
    type LocalHistoryEntry,
    readLocalHistory,
    removeLocalHistoryEntry,
    upsertLocalHistory,
} from '../utils/localHistory';
import {type LocalSpec, parseSpecDraft} from '../utils/appSpec';

const stableTextHash = (text: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
};

interface AppliedLocalSpec {
    key: string;
    document: OpenApiSpec;
    switchingSpec: boolean;
}

interface UseLocalSpecificationsOptions {
    selectedSpecKey: string;
    onApply: (value: AppliedLocalSpec) => void;
}

export function useLocalSpecifications({selectedSpecKey, onApply}: UseLocalSpecificationsOptions) {
    const [localSpec, setLocalSpec] = useState<LocalSpec | null>(null);
    const [localHistory, setLocalHistory] = useState<LocalHistoryEntry[]>(() => readLocalHistory());
    const [localOpenError, setLocalOpenError] = useState<string | null>(null);
    const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);
    const applyLocalSpec = useCallback((raw: string, fileName: string, file: File | null) => {
        const document = parseSpecDraft(raw);
        const title = document.info?.title || fileName.replace(/\.(json|ya?ml)$/i, '') || fileName;
        // The content fingerprint prevents two unrelated local files with the
        // same filename from sharing tabs, runner inputs, or credentials.
        const key = `local:${fileName}:${stableTextHash(raw)}`;
        const entry: LocalHistoryEntry = {key, title, fileName, raw, openedAt: Date.now()};
        setLocalSpec({key, title, fileName, raw, file});
        upsertLocalHistory(entry);
        setLocalHistory(readLocalHistory());
        onApply({key, document, switchingSpec: key !== selectedSpecKey});
        return document;
    }, [selectedSpecKey, onApply]);
    const handleFileChosen = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file)
            return;
        setLocalOpenError(null);
        try {
            applyLocalSpec(await file.text(), file.name, file);
        } catch (error) {
            setLocalOpenError(`"${file.name}" could not be parsed as JSON or YAML.`);
            console.error('Failed to open local spec file', error);
        }
    }, [applyLocalSpec]);
    const handleSelectHistoryEntry = useCallback((entry: LocalHistoryEntry) => {
        setLocalOpenError(null);
        try {
            applyLocalSpec(entry.raw, entry.fileName, null);
        } catch (error) {
            setLocalOpenError(`"${entry.fileName}" could not be parsed anymore.`);
            console.error('Failed to reopen spec from history', error);
        }
    }, [applyLocalSpec]);
    const handleRemoveHistoryEntry = useCallback((key: string) => {
        removeLocalHistoryEntry(key);
        setLocalHistory(readLocalHistory());
    }, []);
    const handleClearHistory = useCallback(() => {
        clearLocalHistory();
        setLocalHistory([]);
    }, []);
    return {
        localSpec,
        localHistory,
        localOpenError,
        setLocalOpenError,
        hiddenFileInputRef,
        applyLocalSpec,
        handleFileChosen,
        handleSelectHistoryEntry,
        handleRemoveHistoryEntry,
        handleClearHistory,
    };
}
