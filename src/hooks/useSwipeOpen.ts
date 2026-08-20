import {useEffect, useRef} from 'react';

// A modal, a bottom sheet or an overlay panel owns the whole screen while it
// is open. The gesture listens on the window, so without this it would open
// the drawer underneath them.
const OVERLAY_SELECTOR = '[aria-modal="true"], .modal-surface, .modal-backdrop, [data-overlay-backdrop]';

const overlayOwnsTheScreen = () =>
    Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).some(
        element => element.getClientRects().length > 0,
    );

export function useSwipeEdgeOpen(enabled: boolean, onOpen: () => void, edgeThreshold = 28, minDistance = 50) {
    const startRef = useRef<{
        x: number;
        y: number;
        startedAtEdge: boolean;
    } | null>(null);
    useEffect(() => {
        if (!enabled) return;
        const onTouchStart = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!t || overlayOwnsTheScreen()) {
                startRef.current = null;
                return;
            }
            startRef.current = {
                x: t.clientX,
                y: t.clientY,
                startedAtEdge: t.clientX <= edgeThreshold,
            };
        };
        const onTouchMove = () => {};
        const onTouchEnd = (e: TouchEvent) => {
            const s = startRef.current;
            startRef.current = null;
            if (!s?.startedAtEdge) return;
            const t = e.changedTouches[0];
            if (!t) return;
            const dx = t.clientX - s.x;
            const dy = Math.abs(t.clientY - s.y);
            if (dx >= minDistance && dy < dx * 0.9 && !overlayOwnsTheScreen()) {
                onOpen();
            }
        };
        window.addEventListener('touchstart', onTouchStart, {passive: true});
        window.addEventListener('touchmove', onTouchMove, {passive: true});
        window.addEventListener('touchend', onTouchEnd, {passive: true});
        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, [enabled, onOpen, edgeThreshold, minDistance]);
}
