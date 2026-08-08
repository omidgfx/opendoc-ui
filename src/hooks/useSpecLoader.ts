import {useEffect, useRef, useState} from 'react';
import type {OpenApiSpec, Parsable, ParsableConfig} from '../types';
import {fetchSpecText} from '../utils/specCache';
import {parseSpecDraft} from '../utils/appSpec';

export function useSpecLoader(selectedSpecKey: string, parsables: ParsableConfig) {
    const [spec, setSpec] = useState<OpenApiSpec | null>(null);
    const [loadedSpecKey, setLoadedSpecKey] = useState('');
    const [isLoadingSpec, setIsLoadingSpec] = useState(false);
    const [selectedServer, setSelectedServer] = useState('');
    const loadSequenceRef = useRef(0);
    const loadSpec = async (specKey: string, parsable: Parsable, forceRefresh = false) => {
        const sequence = ++loadSequenceRef.current;
        setIsLoadingSpec(true);
        setLoadedSpecKey('');
        setSpec(null);
        try {
            let document: OpenApiSpec | null = null;
            if (parsable.isCustom === true && parsable.rawSpec) {
                document = parseSpecDraft(parsable.rawSpec);
            } else if (parsable.url) {
                document = parseSpecDraft(await fetchSpecText(parsable.url, {force: forceRefresh}));
            }
            if (sequence !== loadSequenceRef.current)
                return;
            setSpec(document);
            setLoadedSpecKey(document ? specKey : '');
            if (document)
                setSelectedServer(document.servers?.[0]?.url || 'https://api.example.com');
        } catch (error) {
            if (sequence !== loadSequenceRef.current)
                return;
            console.error(`Failed to load spec '${specKey}'`, error);
            setLoadedSpecKey('');
            setSpec(null);
        } finally {
            if (sequence === loadSequenceRef.current)
                setIsLoadingSpec(false);
        }
    };
    useEffect(() => {
        if (!selectedSpecKey)
            return;
        const parsable = parsables[selectedSpecKey];
        if (parsable)
            void loadSpec(selectedSpecKey, parsable);
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
        loadSpec,
    };
}
