import { useEffect, useRef } from 'react';
export function useSwipeEdgeOpen(enabled: boolean, onOpen: () => void, edgeThreshold = 28, minDistance = 50) {
    const startRef = useRef<{
        x: number;
        y: number;
        startedAtEdge: boolean;
    } | null>(null);
    useEffect(() => {
        if (!enabled)
            return;
        const onTouchStart = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!t)
                return;
            startRef.current = {
                x: t.clientX,
                y: t.clientY,
                startedAtEdge: t.clientX <= edgeThreshold,
            };
        };
        const onTouchMove = () => {
        };
        const onTouchEnd = (e: TouchEvent) => {
            const s = startRef.current;
            startRef.current = null;
            if (!s?.startedAtEdge)
                return;
            const t = e.changedTouches[0];
            if (!t)
                return;
            const dx = t.clientX - s.x;
            const dy = Math.abs(t.clientY - s.y);
            if (dx >= minDistance && dy < dx * 0.9) {
                onOpen();
            }
        };
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, [enabled, onOpen, edgeThreshold, minDistance]);
}
