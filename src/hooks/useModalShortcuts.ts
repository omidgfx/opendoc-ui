import {useEffect, useRef} from 'react';
import {getBreakpoint} from './useBreakpoint';

interface ModalShortcutOptions {
    /** Whether the surface is currently on screen. */
    isOpen: boolean;
    /** Dismiss the surface — bound to Escape and to the mobile back gesture. */
    onClose: () => void;
    /** Primary action — bound to Ctrl/⌘ + Enter. */
    onSubmit?: () => void;
    /** Blocks the primary action while the form is incomplete or busy. */
    canSubmit?: boolean;
    /** Turns every shortcut off, e.g. while a nested dialog owns the keyboard. */
    enabled?: boolean;
    /**
     * Adds a history entry so the mobile back gesture dismisses the surface
     * instead of leaving the page. Pass false for surfaces that already drive
     * browser navigation themselves — the schema modal stack encodes its state
     * in the route and must keep owning its own history.
     */
    closeOnBackNavigation?: boolean;
}

interface HistoryGuard {
    marker: string;
    active: boolean;
    dismissedByHistory: boolean;
}

let modalHistoryCounter = 0;

/**
 * One contract for every modal: Escape dismisses, Ctrl/⌘ + Enter submits, and
 * on phones and tablets the back gesture dismisses instead of navigating away.
 */
export function useModalShortcuts({
    isOpen,
    onClose,
    onSubmit,
    canSubmit = true,
    enabled = true,
    closeOnBackNavigation = true,
}: ModalShortcutOptions): void {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const canSubmitRef = useRef(canSubmit);
    canSubmitRef.current = canSubmit;
    const guardRef = useRef<HistoryGuard | null>(null);
    useEffect(() => {
        if (!isOpen || !enabled) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
            if (!onSubmitRef.current || !canSubmitRef.current) return;
            event.preventDefault();
            onSubmitRef.current();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, enabled]);
    useEffect(() => {
        if (!isOpen || !enabled || !closeOnBackNavigation) return;
        if (typeof window === 'undefined' || getBreakpoint() === 'desktop') return;
        // An entry we already own may still be on top when this effect re-runs
        // (React re-invokes effects in development); reuse it instead of
        // stacking a second one, which would swallow the first back gesture.
        const owned = guardRef.current;
        const reusable = !!owned && window.history.state?.opendocModal === owned.marker;
        const marker = reusable ? owned!.marker : `opendoc-modal-${(modalHistoryCounter += 1)}`;
        if (!reusable) {
            window.history.pushState({...(window.history.state || {}), opendocModal: marker}, '', window.location.href);
        }
        const guard: HistoryGuard = {marker, active: true, dismissedByHistory: false};
        guardRef.current = guard;
        const onPopState = () => {
            guard.dismissedByHistory = true;
            onCloseRef.current();
        };
        window.addEventListener('popstate', onPopState);
        return () => {
            window.removeEventListener('popstate', onPopState);
            guard.active = false;
            // Closing through the UI must drop the entry we added, so the back
            // gesture does not need a second press afterwards. Deferred by a
            // tick so a re-running effect can claim the same entry instead.
            window.setTimeout(() => {
                if (guardRef.current?.active) return;
                if (guard.dismissedByHistory) return;
                if (window.history.state?.opendocModal !== marker) return;
                guardRef.current = null;
                window.history.back();
            }, 0);
        };
    }, [isOpen, enabled, closeOnBackNavigation]);
}
