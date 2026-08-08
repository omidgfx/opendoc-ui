import type { ReactNode } from 'react';
import { TooltipContext } from './TooltipContext';
interface TooltipProviderProps {
    children: ReactNode;
    delay?: number;
}
export default function TooltipProvider({ children, delay = 300 }: TooltipProviderProps) {
    return <TooltipContext.Provider value={{ delay }}>{children}</TooltipContext.Provider>;
}
