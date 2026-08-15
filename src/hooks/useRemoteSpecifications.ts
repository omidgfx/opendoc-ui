import {useCallback, useState} from 'react';
import type {OpenApiSpec} from '../types';
import {parseSpecDraft} from '../utils/specification/appSpec';
import {clearCachedSpec, fetchSpec, type FetchSpecResult, SpecFetchError} from '../utils/storage/specCache';
import {
    clearRemoteHistory,
    findRemoteHistoryEntry,
    type RemoteHistoryEntry,
    readRemoteHistory,
    removeRemoteHistoryEntry,
    upsertRemoteHistory,
} from '../utils/storage/remoteHistory';
import {
    createRemoteSpecRequester,
    normalizeRemoteSpecUrl,
    remoteRequestModeLabel,
    remoteSpecKey,
    RemoteSpecRequestError,
    type RemoteRequestAttempt,
    type RemoteRequestMode,
} from '../utils/specification/remoteSpec';
import {
    getRawSpecDocument,
    registerRawSpecDocument,
    registerSpecDiagnostics,
    registerSpecSourceUri,
} from '../utils/specification/specSource';
import {processWithOpenApiEngine} from '../utils/openapi/engine';

const MAX_REMOTE_SPEC_BYTES = 10 * 1024 * 1024;

export interface ActiveRemoteSpec {
    key: string;
    title: string;
    url: string;
    requestMode: RemoteRequestMode | 'cache';
}

interface AppliedRemoteSpec {
    key: string;
    document: OpenApiSpec;
    switchingSpec: boolean;
    fetchInfo: FetchSpecResult<OpenApiSpec>;
}

interface UseRemoteSpecificationsOptions {
    enabled: boolean;
    downloaderTemplate?: string;
    selectedSpecKey: string;
    onApply: (value: AppliedRemoteSpec) => void;
}

export interface RemoteLoadResult {
    entry: RemoteHistoryEntry;
    fetchInfo: FetchSpecResult<OpenApiSpec>;
}

const remoteErrorMessage = (error: unknown, hasDownloader: boolean): string => {
    if (error instanceof SpecFetchError) return `${error.code}: ${error.message}`;
    if (error instanceof RemoteSpecRequestError) {
        return hasDownloader
            ? 'The downloader and both direct browser attempts failed. Check the downloader, CORS policy, DNS, and URL scheme.'
            : 'Both direct browser attempts failed. The server may be unreachable or may not allow browser CORS requests.';
    }
    if (error instanceof DOMException && error.name === 'AbortError')
        return 'The remote specification request timed out.';
    if (error instanceof SyntaxError) return `The downloaded document is not valid JSON or YAML: ${error.message}`;
    if (error instanceof Error) return error.message;
    return 'The remote specification could not be loaded.';
};

export function useRemoteSpecifications({
    enabled,
    downloaderTemplate,
    selectedSpecKey,
    onApply,
}: UseRemoteSpecificationsOptions) {
    const [remoteHistory, setRemoteHistory] = useState<RemoteHistoryEntry[]>(() =>
        enabled ? readRemoteHistory() : [],
    );
    const [activeRemoteSpec, setActiveRemoteSpec] = useState<ActiveRemoteSpec | null>(null);
    const [remoteOpenError, setRemoteOpenError] = useState<string | null>(null);
    const [isLoadingRemoteSpec, setIsLoadingRemoteSpec] = useState(false);
    const [remoteLoadAttempt, setRemoteLoadAttempt] = useState<RemoteRequestAttempt | null>(null);

    const loadRemoteSpec = useCallback(
        async (inputUrl: string, options: {force?: boolean} = {}): Promise<RemoteLoadResult> => {
            if (!enabled) throw new Error('This build does not include URL specification loading.');
            const url = normalizeRemoteSpecUrl(inputUrl);
            const key = remoteSpecKey(url);
            setRemoteOpenError(null);
            setRemoteLoadAttempt(null);
            setIsLoadingRemoteSpec(true);
            let latestResponseMode: RemoteRequestMode | undefined;
            const requester = createRemoteSpecRequester({
                downloaderTemplate,
                pageProtocol: typeof window !== 'undefined' ? window.location.protocol : 'https:',
                onAttempt: attempt => {
                    setRemoteLoadAttempt(attempt);
                    if (attempt.state === 'response') latestResponseMode = attempt.mode;
                },
            });
            try {
                const fetchInfo = await fetchSpec<OpenApiSpec>(url, {
                    force: options.force,
                    maxBytes: MAX_REMOTE_SPEC_BYTES,
                    validate: raw => parseSpecDraft(raw),
                    request: requester,
                });
                const parsed = fetchInfo.parsed;
                if (!parsed)
                    throw new Error('The downloaded document could not be parsed as an OpenAPI specification.');
                const processed = await processWithOpenApiEngine(fetchInfo.raw, parsed, url, requester);
                const document = processed.document;
                const rawMeta = getRawSpecDocument(parsed);
                if (rawMeta) registerRawSpecDocument(document, rawMeta.text, rawMeta.document, rawMeta.dialect);
                registerSpecSourceUri(document, url);
                registerSpecDiagnostics(document, processed.diagnostics);
                const requestMode: RemoteRequestMode | 'cache' =
                    fetchInfo.freshness === 'cache' || fetchInfo.freshness === 'stale'
                        ? 'cache'
                        : latestResponseMode || 'direct';
                const title = document.info?.title || new URL(url).hostname;
                const entry: RemoteHistoryEntry = {
                    key,
                    title,
                    url,
                    openedAt: Date.now(),
                    requestMode,
                };
                upsertRemoteHistory(entry);
                setRemoteHistory(readRemoteHistory());
                setActiveRemoteSpec({key, title, url, requestMode});
                onApply({key, document, switchingSpec: key !== selectedSpecKey, fetchInfo});
                return {entry, fetchInfo};
            } catch (error) {
                const message = remoteErrorMessage(error, !!downloaderTemplate?.trim());
                setRemoteOpenError(message);
                throw new Error(message, {cause: error});
            } finally {
                setIsLoadingRemoteSpec(false);
            }
        },
        [enabled, downloaderTemplate, onApply, selectedSpecKey],
    );

    const restoreRemoteSpec = useCallback(
        async (key: string): Promise<boolean> => {
            if (!enabled) return false;
            const entry = findRemoteHistoryEntry(key);
            if (!entry) return false;
            try {
                await loadRemoteSpec(entry.url);
                return true;
            } catch {
                return false;
            }
        },
        [enabled, loadRemoteSpec],
    );

    const handleSelectRemoteHistoryEntry = useCallback(
        (entry: RemoteHistoryEntry) => loadRemoteSpec(entry.url),
        [loadRemoteSpec],
    );

    const handleRemoveRemoteHistoryEntry = useCallback(async (key: string) => {
        const entry = findRemoteHistoryEntry(key);
        removeRemoteHistoryEntry(key);
        setRemoteHistory(readRemoteHistory());
        if (entry) await clearCachedSpec(entry.url);
    }, []);

    const handleClearRemoteHistory = useCallback(async () => {
        const entries = readRemoteHistory();
        clearRemoteHistory();
        setRemoteHistory([]);
        await Promise.all(entries.map(entry => clearCachedSpec(entry.url)));
    }, []);

    const remoteLoadStatus = remoteLoadAttempt
        ? remoteLoadAttempt.state === 'requesting'
            ? `Trying ${remoteRequestModeLabel(remoteLoadAttempt.mode)}…`
            : remoteLoadAttempt.state === 'response'
              ? `${remoteRequestModeLabel(remoteLoadAttempt.mode)} returned HTTP ${remoteLoadAttempt.status}.`
              : `${remoteRequestModeLabel(remoteLoadAttempt.mode)} failed; trying the next available route…`
        : null;

    return {
        activeRemoteSpec,
        remoteHistory,
        remoteOpenError,
        setRemoteOpenError,
        isLoadingRemoteSpec,
        remoteLoadStatus,
        loadRemoteSpec,
        restoreRemoteSpec,
        handleSelectRemoteHistoryEntry,
        handleRemoveRemoteHistoryEntry,
        handleClearRemoteHistory,
    };
}
