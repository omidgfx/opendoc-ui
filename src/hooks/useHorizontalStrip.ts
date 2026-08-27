import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';

/** Treat the strip as non-overflowing below this leftover width. */
const EDGE_TOLERANCE = 1;
/** Wheel / button motion eases toward the target over a few frames. */
const WHEEL_LERP = 0.28;
/** Near either end, snap fully so content is never clipped by 1–2px. */
const END_SNAP_PX = 6;
/** Clicking an end button moves by this fraction of the visible width. */
const BUTTON_STEP_RATIO = 0.75;

export type HorizontalStripEdges = {start: boolean; end: boolean};

const maxScrollOf = (element: HTMLElement): number =>
    Math.max(0, Math.round(element.scrollWidth) - Math.round(element.clientWidth));

const clampScroll = (left: number, maxScroll: number): number => {
    if (maxScroll <= 0) return 0;
    let next = left;
    if (next <= END_SNAP_PX) next = 0;
    else if (next >= maxScroll - END_SNAP_PX) next = maxScroll;
    return Math.max(0, Math.min(maxScroll, next));
};

/**
 * Shared horizontal-strip behaviour for ScrollableRow and AdaptiveTabStrip:
 * - wheel / trackpad scrolls the strip and blocks page scroll only when the
 *   strip actually overflows
 * - wheel motion is eased; ends snap fully so content is never clipped
 * - start/end affordances are derived from scroll position (no drag pan)
 */
export function useHorizontalStrip(ref: RefObject<HTMLElement | null>) {
    const [edges, setEdges] = useState<HorizontalStripEdges>({start: false, end: false});
    const [overflows, setOverflows] = useState(false);
    const [hovered, setHovered] = useState(false);

    const targetLeft = useRef(0);
    const animating = useRef(false);
    const rafId = useRef<number | null>(null);

    const cancelAnim = useCallback(() => {
        if (rafId.current !== null) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }
        animating.current = false;
    }, []);

    const measure = useCallback(() => {
        const element = ref.current;
        if (!element) return;
        const maxScroll = maxScrollOf(element);
        const nextOverflows = maxScroll > EDGE_TOLERANCE;
        setOverflows(nextOverflows);
        const left = element.scrollLeft;
        const next = {
            start: nextOverflows && left > EDGE_TOLERANCE,
            end: nextOverflows && left < maxScroll - EDGE_TOLERANCE,
        };
        setEdges(current => (current.start === next.start && current.end === next.end ? current : next));
    }, [ref]);

    const tick = useCallback(() => {
        const element = ref.current;
        if (!element) {
            cancelAnim();
            return;
        }
        const maxScroll = maxScrollOf(element);
        targetLeft.current = clampScroll(targetLeft.current, maxScroll);
        const current = element.scrollLeft;
        const delta = targetLeft.current - current;
        if (Math.abs(delta) < 0.4) {
            element.scrollLeft = targetLeft.current;
            cancelAnim();
            measure();
            return;
        }
        // Ease; finish hard when very close so ends never leave a 1–2px gap.
        const stepped = current + delta * WHEEL_LERP;
        element.scrollLeft = Math.abs(targetLeft.current - stepped) < 1 ? targetLeft.current : stepped;
        measure();
        rafId.current = requestAnimationFrame(tick);
    }, [cancelAnim, measure, ref]);

    const animateTo = useCallback(
        (left: number) => {
            const element = ref.current;
            if (!element) return;
            const maxScroll = maxScrollOf(element);
            targetLeft.current = clampScroll(left, maxScroll);
            if (!animating.current) {
                animating.current = true;
                rafId.current = requestAnimationFrame(tick);
            }
        },
        [ref, tick],
    );

    const scrollByStep = useCallback(
        (direction: -1 | 1) => {
            const element = ref.current;
            if (!element) return;
            const maxScroll = maxScrollOf(element);
            if (maxScroll <= EDGE_TOLERANCE) return;
            // Prefer the live target so repeated clicks chain correctly mid-ease.
            const base = animating.current ? targetLeft.current : element.scrollLeft;
            const step = Math.max(80, element.clientWidth * BUTTON_STEP_RATIO);
            animateTo(base + direction * step);
        },
        [animateTo, ref],
    );

    // Wheel: take over only when the strip overflows; ease + end-snap.
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            const maxScroll = maxScrollOf(element);
            if (maxScroll <= EDGE_TOLERANCE) return;
            // Strip can scroll — always consume the gesture so the page does not move.
            event.preventDefault();
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (!delta) return;
            const base = animating.current ? targetLeft.current : element.scrollLeft;
            animateTo(base + delta);
        };
        element.addEventListener('wheel', onWheel, {passive: false});
        return () => element.removeEventListener('wheel', onWheel);
    }, [animateTo, ref]);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        // Keep the eased target aligned with any external scroll (e.g. scrollTo).
        const onScroll = () => {
            if (!animating.current) targetLeft.current = element.scrollLeft;
            measure();
        };
        measure();
        const observer = new ResizeObserver(() => {
            const maxScroll = maxScrollOf(element);
            targetLeft.current = clampScroll(targetLeft.current, maxScroll);
            if (element.scrollLeft > maxScroll) element.scrollLeft = maxScroll;
            measure();
        });
        observer.observe(element);
        Array.from(element.children).forEach(child => observer.observe(child));
        element.addEventListener('scroll', onScroll, {passive: true});
        return () => {
            observer.disconnect();
            element.removeEventListener('scroll', onScroll);
            cancelAnim();
        };
    }, [cancelAnim, measure, ref]);

    const onHoverEnter = useCallback(() => setHovered(true), []);
    const onHoverLeave = useCallback(() => setHovered(false), []);

    return {
        edges,
        overflows,
        hovered,
        measure,
        onHoverEnter,
        onHoverLeave,
        scrollByStep,
        scrollStart: () => scrollByStep(-1),
        scrollEnd: () => scrollByStep(1),
    };
}
