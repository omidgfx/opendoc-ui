import {useEffect, useState} from 'react';

/** Keeps a panel mounted while it slides out, so an inline drawer can open
 *  and close with the same motion the mobile sidebar has. */
export function usePanelTransition(isOpen: boolean, durationMs = 300) {
    const [mounted, setMounted] = useState(isOpen);
    const [entered, setEntered] = useState(isOpen);
    useEffect(() => {
        if (!isOpen) {
            setEntered(false);
            const timer = setTimeout(() => setMounted(false), durationMs);
            return () => clearTimeout(timer);
        }
        setMounted(true);
        // Mount first, let the closed frame paint, only then slide in.
        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => setEntered(true));
        });
        return () => {
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
    }, [isOpen, durationMs]);
    return {shouldRender: mounted || isOpen, entered: entered && isOpen};
}
