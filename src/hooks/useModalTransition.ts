import {useCallback, useEffect, useRef, useState} from 'react';

const FOCUSABLE = [
    'button:not([disabled])', 'a[href]', 'input:not([disabled])', 'select:not([disabled])',
    'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

const topModalSurface = (): HTMLElement | null => {
    const surfaces = Array.from(document.querySelectorAll<HTMLElement>('.modal-surface'))
        .filter(element => element.getClientRects().length > 0);
    return surfaces[surfaces.length - 1] || null;
};

export function useModalTransition(isOpen: boolean, onClose: () => void, durationMs = 180) {
    const [rendered, setRendered] = useState(isOpen);
    const [closing, setClosing] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
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
    useEffect(() => {
        if (isOpen || typeof document === 'undefined')
            return;
        const remember = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement) || target.closest('.modal-surface, .modal-backdrop'))
                return;
            previousFocusRef.current = target;
        };
        remember(document.activeElement);
        const onFocus = (event: FocusEvent) => remember(event.target);
        document.addEventListener('focusin', onFocus, true);
        return () => document.removeEventListener('focusin', onFocus, true);
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen || typeof document === 'undefined')
            return;
        const activeBeforeModal = document.activeElement;
        if (activeBeforeModal instanceof HTMLElement && !activeBeforeModal.closest('.modal-surface, .modal-backdrop'))
            previousFocusRef.current = activeBeforeModal;
        focusTimerRef.current = setTimeout(() => {
            const surface = topModalSurface();
            if (!surface)
                return;
            surface.setAttribute('role', surface.getAttribute('role') || 'dialog');
            surface.setAttribute('aria-modal', 'true');
            if (!surface.hasAttribute('tabindex'))
                surface.tabIndex = -1;
            const autofocus = surface.querySelector<HTMLElement>('[autofocus]');
            const first = autofocus || surface.querySelector<HTMLElement>(FOCUSABLE);
            (first || surface).focus({preventScroll: true});
        }, 0);
        const trapFocus = (event: KeyboardEvent) => {
            if (event.key !== 'Tab')
                return;
            const surface = topModalSurface();
            if (!surface)
                return;
            const focusable = Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
            if (focusable.length === 0) {
                event.preventDefault();
                surface.focus();
                return;
            }
            const current = document.activeElement as HTMLElement | null;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (current === first || !surface.contains(current))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (current === last || !surface.contains(current))) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', trapFocus, true);
        return () => {
            document.removeEventListener('keydown', trapFocus, true);
            if (focusTimerRef.current)
                clearTimeout(focusTimerRef.current);
            focusTimerRef.current = null;
            const previous = previousFocusRef.current;
            if (previous?.isConnected)
                setTimeout(() => previous.focus({preventScroll: true}), 0);
        };
    }, [isOpen]);
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
