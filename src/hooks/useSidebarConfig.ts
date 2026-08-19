import {useCallback, useEffect, useRef, useState} from 'react';
import {readSidebarConfig, SIDEBAR_CONFIG_EVENT, writeSidebarConfig, type SidebarConfig} from '../utils/sidebar/tree';

/** Shared navigation configuration: the sidebar menu and the settings page are
 *  two views of the same per-specification document. */
export function useSidebarConfig(specKey: string) {
    const [config, setConfig] = useState<SidebarConfig>(() => readSidebarConfig(specKey || ''));
    const configRef = useRef(config);
    configRef.current = config;
    useEffect(() => {
        setConfig(readSidebarConfig(specKey || ''));
    }, [specKey]);
    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{specKey: string; config: SidebarConfig}>).detail;
            if (!detail || detail.specKey !== (specKey || '')) return;
            setConfig(detail.config);
        };
        window.addEventListener(SIDEBAR_CONFIG_EVENT, handler);
        return () => window.removeEventListener(SIDEBAR_CONFIG_EVENT, handler);
    }, [specKey]);
    const updateConfig = useCallback(
        (patch: Partial<SidebarConfig>) => {
            // Persisting broadcasts to the other views, so it must never run
            // inside a state updater.
            setConfig(writeSidebarConfig(specKey || '', {...configRef.current, ...patch}));
        },
        [specKey],
    );
    return {config, updateConfig};
}
