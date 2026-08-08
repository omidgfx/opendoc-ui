import type {ReactNode} from 'react';
import {TooltipContext} from './TooltipContext';

interface TooltipProviderProps {
    children: ReactNode;
    delay?: number;
}

/** Wrap the app and provide sensible defaults to every Tip instance. */
export default function TooltipProvider({children, delay = 300}: TooltipProviderProps) {
    return <TooltipContext.Provider value={{delay}}>{children}</TooltipContext.Provider>;
}
