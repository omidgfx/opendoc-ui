import {useCallback, useMemo, useRef, type ReactNode} from 'react';
import {TooltipContext} from './TooltipContext';

interface TooltipProviderProps {
    children: ReactNode;
    delay?: number;
}

export default function TooltipProvider({children, delay = 500}: TooltipProviderProps) {
    const activeRef = useRef<{
        id: string;
        close: () => void;
    } | null>(null);
    const claim = useCallback((id: string, close: () => void) => {
        if (activeRef.current?.id !== id) activeRef.current?.close();
        activeRef.current = {id, close};
    }, []);
    const release = useCallback((id: string) => {
        if (activeRef.current?.id === id) activeRef.current = null;
    }, []);
    const value = useMemo(() => ({delay, claim, release}), [delay, claim, release]);
    return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>;
}
