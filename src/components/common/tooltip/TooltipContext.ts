import {createContext} from 'react';

export interface TooltipContextValue {
    delay: number;
}

export const TooltipContext = createContext<TooltipContextValue>({delay: 250});
