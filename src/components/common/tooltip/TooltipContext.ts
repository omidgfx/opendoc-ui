import {createContext} from 'react';

export interface TooltipContextValue {
    delay: number;
    claim: (id: string, close: () => void) => void;
    release: (id: string) => void;
}

export const TooltipContext = createContext<TooltipContextValue>({
    delay: 500,
    claim: () => undefined,
    release: () => undefined,
});
