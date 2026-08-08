import { useCallback, useEffect, useRef, useState } from 'react';
export function useModalTransition(isOpen: boolean, onClose: () => void, durationMs = 180) {
    const [rendered, setRendered] = useState(isOpen);
    const [closing, setClosing] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const clearTimer = useCallback(() => {
        if (timerRef.current)
            clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);
    useEffect(() => {
        clearTimer();
        if (isOpen) {
            setRendered(true);
            setClosing(false);
            return;
        }
        if (rendered) {
            setClosing(true);
            timerRef.current = setTimeout(() => {
                setRendered(false);
                setClosing(false);
                timerRef.current = null;
            }, durationMs);
        }
    }, [isOpen, durationMs, clearTimer]);
    useEffect(() => clearTimer, [clearTimer]);
    const requestClose = useCallback(() => {
        if (closing)
            return;
        setClosing(true);
        clearTimer();
        timerRef.current = setTimeout(() => {
            closeRef.current();
            setRendered(false);
            setClosing(false);
            timerRef.current = null;
        }, durationMs);
    }, [closing, durationMs, clearTimer]);
    return {
        shouldRender: rendered || isOpen,
        closing,
        requestClose,
        backdropClassName: `modal-backdrop${closing ? ' modal-closing' : ''}`,
    };
}
