import {useEffect, useRef, useState} from 'react';
import type {OpenApiSpec, Parsable, ParsableConfig} from '../types';
import {fetchSpec, type FetchSpecResult} from '../utils/specCache';
import {parseSpecDraft} from '../utils/appSpec';
import {
    getRawSpecDocument,
    registerRawSpecDocument,
    registerSpecDiagnostics,
    registerSpecSourceUri,
} from '../utils/specSource';
import {processWithOpenApiEngine} from '../utils/openapi/engine';

export function useSpecLoader(selectedSpecKey: string, parsables: ParsableConfig) {
    const [spec, setSpec] = useState<OpenApiSpec | null>(null);
    const [loadedSpecKey, setLoadedSpecKey] = useState('');
    const [isLoadingSpec, setIsLoadingSpec] = useState(false);
    const [selectedServer, setSelectedServer] = useState('');
    const [specFetchInfo, setSpecFetchInfo] = useState<FetchSpecResult<OpenApiSpec> | null>(null);
    const loadSequenceRef = useRef(0);
    const loadSpec = async (specKey: string, parsable: Parsable, forceRefresh = false) => {
        const sequence = ++loadSequenceRef.current;
        setIsLoadingSpec(true);
        setLoadedSpecKey('');
        setSpec(null);
        try {
            let document: OpenApiSpec | null = null;
            let fetchInfo: FetchSpecResult<OpenApiSpec> | null = null;
            if (parsable.isCustom === true && parsable.rawSpec) {
                const parsed = parseSpecDraft(parsable.rawSpec);
                const sourceUri = typeof window !== 'undefined' ? window.location.href : undefined;
                const processed = await processWithOpenApiEngine(parsable.rawSpec, parsed, sourceUri);
                document = processed.document;
                if (document) {
                    const rawMeta = getRawSpecDocument(parsed);
                    if (rawMeta) registerRawSpecDocument(document, rawMeta.text, rawMeta.document, rawMeta.dialect);
                    registerSpecSourceUri(document, sourceUri);
                    registerSpecDiagnostics(document, processed.diagnostics);
                }
            } else if (parsable.url) {
                fetchInfo = await fetchSpec<OpenApiSpec>(parsable.url, {
                    force: forceRefresh,
                    validate: raw => parseSpecDraft(raw),
                });
                const parsed = fetchInfo.parsed || null;
                if (parsed) {
                    const processed = await processWithOpenApiEngine(fetchInfo.raw, parsed, parsable.url);
                    document = processed.document;
                    const rawMeta = getRawSpecDocument(parsed);
                    if (rawMeta) registerRawSpecDocument(document, rawMeta.text, rawMeta.document, rawMeta.dialect);
                    registerSpecSourceUri(document, parsable.url);
                    registerSpecDiagnostics(document, processed.diagnostics);
                }
            }
            if (sequence !== loadSequenceRef.current) return;
            setSpecFetchInfo(fetchInfo);
            setSpec(document);
            setLoadedSpecKey(document ? specKey : '');
            if (document) setSelectedServer(document.servers?.[0]?.url || 'https://api.example.com');
        } catch (error) {
            if (sequence !== loadSequenceRef.current) return;
            console.error(`Failed to load spec '${specKey}'`, error);
            setLoadedSpecKey('');
            setSpecFetchInfo(null);
            setSpec(null);
        } finally {
            if (sequence === loadSequenceRef.current) setIsLoadingSpec(false);
        }
    };
    useEffect(() => {
        if (!selectedSpecKey) return;
        const parsable = parsables[selectedSpecKey];
        if (parsable) void loadSpec(selectedSpecKey, parsable);
    }, [selectedSpecKey, parsables]);
    return {
        spec,
        setSpec,
        loadedSpecKey,
        setLoadedSpecKey,
        isLoadingSpec,
        setIsLoadingSpec,
        selectedServer,
        setSelectedServer,
        specFetchInfo,
        setSpecFetchInfo,
        loadSpec,
    };
}
