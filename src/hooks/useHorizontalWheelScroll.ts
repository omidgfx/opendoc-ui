import {useEffect, type RefObject} from 'react';

/** A strip counts as scrolled to an edge within this many pixels. */
const EDGE_TOLERANCE = 2;

/**
 * Lets a horizontally scrollable strip answer the wheel, so a trackpad or a
 * plain mouse can reach content that is out of view. React registers wheel
 * listeners passively, so the listener has to be attached by hand.
 *
 * The gesture is only taken when the strip can really move: sub-pixel widths
 * used to make the "already at the end" test fail forever, which trapped the
 * page scroll under the cursor.
 */
export function useHorizontalWheelScroll(ref: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            const maxScroll = element.scrollWidth - element.clientWidth;
            if (maxScroll <= EDGE_TOLERANCE) return;
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (!delta) return;
            const next = Math.max(0, Math.min(maxScroll, element.scrollLeft + delta));
            if (Math.abs(next - element.scrollLeft) < 1) return;
            event.preventDefault();
            element.scrollLeft = next;
        };
        element.addEventListener('wheel', onWheel, {passive: false});
        return () => element.removeEventListener('wheel', onWheel);
    }, [ref]);
}
