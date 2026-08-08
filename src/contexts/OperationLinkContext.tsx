import React, {createContext, useContext, useMemo} from 'react';
import type {OpenApiSpec} from '../types';
import {buildOperationLinkIndex, type OperationLinkTarget} from '../utils/docLinks';

interface OperationLinkContextValue {
    index: Record<string, OperationLinkTarget>;
    parsableKey: string;
}

const OperationLinkContext = createContext<OperationLinkContextValue>({index: {}, parsableKey: ''});

export function OperationLinkProvider({spec, parsableKey, children,}: {
    spec: OpenApiSpec | null;
    parsableKey: string;
    children: React.ReactNode;
}) {
    const index = useMemo(() => buildOperationLinkIndex(spec), [spec]);
    const value = useMemo(() => ({index, parsableKey}), [index, parsableKey]);
    return <OperationLinkContext.Provider value={value}>{children}</OperationLinkContext.Provider>;
}

export function useOperationLinkIndex() {
    return useContext(OperationLinkContext);
}
