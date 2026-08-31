import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {AIManagedPolicy} from '../types';
import {
    MANAGED_POLICY_CACHE_TTL_MS,
    fetchManagedPolicy,
    readRuntimeManagedConfig,
    resolveManagedActivation,
} from '../utils/ai/managed';

export type AIManagedStatus = 'off' | 'probing' | 'active' | 'unavailable';

/**
 * Discovers and tracks the deployment's managed AI policy. Fire-and-forget:
 * a failed or missing policy simply leaves classic profile mode in place.
 * Re-checks on window focus once the cache TTL elapses so backend-side
 * changes (disable, ready flag) propagate without redeploying the UI.
 */
export function useAIManagedMode(configLoaded: boolean): {
    status: AIManagedStatus;
    policy: AIManagedPolicy | null;
    policyUrl: string;
    active: boolean;
    recheck: () => void;
} {
    const activation = useMemo(() => {
        const runtimeConfig = readRuntimeManagedConfig();
        return resolveManagedActivation({
            runtimeConfig:
                runtimeConfig !== undefined
                    ? runtimeConfig
                    : typeof window !== 'undefined'
                      ? ((window as any).INITIAL_CONFIG?.ai?.managed as unknown)
                      : undefined,
            envManaged: (import.meta as any).env?.VITE_AI_MANAGED,
            envPolicyUrl: (import.meta as any).env?.VITE_AI_MANAGED_POLICY_URL,
            configLoaded,
        });
    }, [configLoaded]);
    const [status, setStatus] = useState<AIManagedStatus>('off');
    const [policy, setPolicy] = useState<AIManagedPolicy | null>(null);
    const inFlightRef = useRef(false);
    const lastProbedAtRef = useRef(0);

    const recheck = useCallback(() => {
        if (!activation.active || inFlightRef.current) return;
        inFlightRef.current = true;
        setStatus(current => (current === 'off' ? 'probing' : current));
        void fetchManagedPolicy(activation.policyUrl)
            .then(next => {
                setPolicy(next);
                setStatus(next ? 'active' : 'unavailable');
            })
            .catch(() => {
                setPolicy(null);
                setStatus('unavailable');
            })
            .finally(() => {
                inFlightRef.current = false;
                lastProbedAtRef.current = Date.now();
            });
    }, [activation.active, activation.policyUrl]);

    useEffect(() => {
        recheck();
    }, [recheck]);

    useEffect(() => {
        const onFocus = () => {
            if (Date.now() - lastProbedAtRef.current < MANAGED_POLICY_CACHE_TTL_MS) return;
            recheck();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [recheck]);

    return {status, policy, policyUrl: activation.policyUrl, active: activation.active, recheck};
}
