import {useEffect} from 'react';

export function useEscStack(
    isOpen: boolean,
    stackLength: number,
    onPop: () => void,
    onCloseAll: () => void,
    enabled = true,
) {
    useEffect(() => {
        if (!isOpen) return;
        if (!enabled) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (stackLength > 1) {
                    onPop();
                } else {
                    onCloseAll();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, stackLength, onPop, onCloseAll, enabled]);
}
