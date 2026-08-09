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
import {processLocalOpenApiBundle} from '../utils/openapi/engine';
import {registerRawSpecDocument, registerSpecDiagnostics} from '../utils/specSource';
import {validateOpenApiDocument} from '../utils/openapi';
import * as jsYaml from 'js-yaml';

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

const parseLoose = (raw: string): unknown => {
    const trimmed = raw.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(raw) : jsYaml.load(raw);
};

export function useLocalSpecifications({selectedSpecKey, onApply}: UseLocalSpecificationsOptions) {
    const [localSpec, setLocalSpec] = useState<LocalSpec | null>(null);
    const [localHistory, setLocalHistory] = useState<LocalHistoryEntry[]>(() => readLocalHistory());
    const [localOpenError, setLocalOpenError] = useState<string | null>(null);
    const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

    const storeAndApply = useCallback((options: {
        raw: string;
        fileName: string;
        file: File | null;
        document: OpenApiSpec;
        bundle?: Record<string, string>;
        diagnostics?: any[];
    }) => {
        const {raw, fileName, file, document, bundle, diagnostics = []} = options;
        const title = document.info?.title || fileName.replace(/\.(json|ya?ml)$/i, '') || fileName;
        const identityText = bundle
            ? Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b)).map(([name, text]) => `${name}\u0000${text}`).join('\u0001')
            : raw;
        const key = `local:${fileName}:${stableTextHash(identityText)}`;
        const entry: LocalHistoryEntry = {key, title, fileName, raw, bundle, openedAt: Date.now()};
        setLocalSpec({key, title, fileName, raw, file, bundle});
        upsertLocalHistory(entry);
        setLocalHistory(readLocalHistory());
        if (diagnostics.length)
            registerSpecDiagnostics(document, diagnostics);
        try {
            const rawDocument = parseLoose(raw);
            registerRawSpecDocument(document, raw, rawDocument, validateOpenApiDocument(rawDocument).version);
        } catch {
            // The processed document remains usable even if raw metadata cannot be reconstructed.
        }
        onApply({key, document, switchingSpec: key !== selectedSpecKey});
        return document;
    }, [selectedSpecKey, onApply]);

    const applyLocalSpec = useCallback((raw: string, fileName: string, file: File | null) => {
        const document = parseSpecDraft(raw);
        return storeAndApply({raw, fileName, file, document});
    }, [storeAndApply]);

    const applyLocalBundle = useCallback(async (bundle: Record<string, string>, preferredFile?: File | null) => {
        const files = Object.entries(bundle).map(([name, raw]) => ({name, raw}));
        const processed = await processLocalOpenApiBundle(files);
        const rootFile = preferredFile && (preferredFile.webkitRelativePath || preferredFile.name) === processed.rootName
            ? preferredFile
            : null;
        return storeAndApply({
            raw: processed.rootRaw,
            fileName: processed.rootName,
            file: rootFile,
            document: processed.document,
            bundle,
            diagnostics: processed.diagnostics,
        });
    }, [storeAndApply]);

    const handleFileChosen = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const chosen = Array.from(event.target.files || []);
        event.target.value = '';
        if (chosen.length === 0)
            return;
        setLocalOpenError(null);
        try {
            if (chosen.length === 1) {
                const file = chosen[0];
                applyLocalSpec(await file.text(), file.name, file);
                return;
            }
            const bundle: Record<string, string> = {};
            await Promise.all(chosen.map(async file => {
                bundle[file.webkitRelativePath || file.name] = await file.text();
            }));
            await applyLocalBundle(bundle, chosen[0]);
        } catch (error) {
            setLocalOpenError(`The selected OpenAPI file set could not be parsed or resolved.`);
            console.error('Failed to open local specification files', error);
        }
    }, [applyLocalSpec, applyLocalBundle]);

    const handleSelectHistoryEntry = useCallback((entry: LocalHistoryEntry) => {
        setLocalOpenError(null);
        void (async () => {
            try {
                if (entry.bundle && Object.keys(entry.bundle).length > 1)
                    await applyLocalBundle(entry.bundle, null);
                else
                    applyLocalSpec(entry.raw, entry.fileName, null);
            } catch (error) {
                setLocalOpenError(`"${entry.fileName}" could not be parsed anymore.`);
                console.error('Failed to reopen spec from history', error);
            }
        })();
    }, [applyLocalSpec, applyLocalBundle]);

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
        applyLocalBundle,
        handleFileChosen,
        handleSelectHistoryEntry,
        handleRemoveHistoryEntry,
        handleClearHistory,
    };
}
