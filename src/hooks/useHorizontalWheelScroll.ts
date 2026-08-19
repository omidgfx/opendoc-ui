import {useEffect, type RefObject} from 'react';

/**
 * Lets a horizontally scrollable strip answer the wheel, so a trackpad or a
 * plain mouse can reach content that is out of view. React registers wheel
 * listeners passively, so the listener has to be attached by hand, and the
 * gesture is handed back to the page as soon as the strip cannot move further.
 */
export function useHorizontalWheelScroll(ref: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            if (element.scrollWidth <= element.clientWidth) return;
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (!delta) return;
            const atStart = element.scrollLeft <= 0;
            const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
            if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
            event.preventDefault();
            element.scrollLeft += delta;
        };
        element.addEventListener('wheel', onWheel, {passive: false});
        return () => element.removeEventListener('wheel', onWheel);
    }, [ref]);
}
