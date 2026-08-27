import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';

/** A strip counts as scrolled to an edge within this many pixels. */
const EDGE_TOLERANCE = 2;
/** Wheel deltas are eased toward this target over a few frames. */
const WHEEL_LERP = 0.35;
/** Clicking an end button moves by this fraction of the visible width. */
const BUTTON_STEP_RATIO = 0.75;

export type HorizontalStripEdges = {start: boolean; end: boolean};

/**
 * Shared horizontal-strip behaviour for ScrollableRow and AdaptiveTabStrip:
 * - wheel / trackpad scrolls the strip and blocks page scroll only when the
 *   strip actually overflows
 * - wheel motion is eased (not a hard jump)
 * - pointer drag pans the strip
 * - start/end affordances are derived from scroll position
 */
export function useHorizontalStrip(ref: RefObject<HTMLElement | null>) {
    const [edges, setEdges] = useState<HorizontalStripEdges>({start: false, end: false});
    const [overflows, setOverflows] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);

    const targetLeft = useRef(0);
    const animating = useRef(false);
    const dragOrigin = useRef<{x: number; scroll: number} | null>(null);
    const movedDuringDrag = useRef(false);

    const measure = useCallback(() => {
        const element = ref.current;
        if (!element) return;
        const maxScroll = element.scrollWidth - element.clientWidth;
        const nextOverflows = maxScroll > EDGE_TOLERANCE;
        setOverflows(nextOverflows);
        const next = {
            start: element.scrollLeft > EDGE_TOLERANCE,
            end: nextOverflows && element.scrollLeft < maxScroll - EDGE_TOLERANCE,
        };
        setEdges(current => (current.start === next.start && current.end === next.end ? current : next));
    }, [ref]);

    const tick = useCallback(() => {
        const element = ref.current;
        if (!element) {
            animating.current = false;
            return;
        }
        const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
        targetLeft.current = Math.max(0, Math.min(maxScroll, targetLeft.current));
        const current = element.scrollLeft;
        const delta = targetLeft.current - current;
        if (Math.abs(delta) < 0.5) {
            element.scrollLeft = targetLeft.current;
            animating.current = false;
            measure();
            return;
        }
        element.scrollLeft = current + delta * WHEEL_LERP;
        measure();
        requestAnimationFrame(tick);
    }, [measure, ref]);

    const animateTo = useCallback(
        (left: number, behavior: ScrollBehavior = 'auto') => {
            const element = ref.current;
            if (!element) return;
            const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
            const clamped = Math.max(0, Math.min(maxScroll, left));
            if (behavior === 'smooth') {
                animating.current = false;
                element.scrollTo({left: clamped, behavior: 'smooth'});
                // measure after the smooth scroll settles
                window.setTimeout(measure, 320);
                return;
            }
            targetLeft.current = clamped;
            if (!animating.current) {
                animating.current = true;
                requestAnimationFrame(tick);
            }
        },
        [measure, ref, tick],
    );

    const scrollByStep = useCallback(
        (direction: -1 | 1) => {
            const element = ref.current;
            if (!element) return;
            const step = Math.max(80, element.clientWidth * BUTTON_STEP_RATIO);
            animateTo(element.scrollLeft + direction * step, 'smooth');
        },
        [animateTo, ref],
    );

    // Wheel: take over only when the strip overflows; ease the motion.
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            const maxScroll = element.scrollWidth - element.clientWidth;
            if (maxScroll <= EDGE_TOLERANCE) return;
            // Strip can scroll — always consume the gesture so the page does not move.
            event.preventDefault();
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (!delta) return;
            const base = animating.current ? targetLeft.current : element.scrollLeft;
            targetLeft.current = Math.max(0, Math.min(maxScroll, base + delta));
            if (!animating.current) {
                animating.current = true;
                requestAnimationFrame(tick);
            }
        };
        element.addEventListener('wheel', onWheel, {passive: false});
        return () => element.removeEventListener('wheel', onWheel);
    }, [ref, tick]);

    // Pointer drag to pan.
    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const onPointerDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const maxScroll = element.scrollWidth - element.clientWidth;
            if (maxScroll <= EDGE_TOLERANCE) return;
            // Ignore drag starts on interactive controls so chips/tabs still click.
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, [role="button"], [role="tab"]')) return;
            dragOrigin.current = {x: event.clientX, scroll: element.scrollLeft};
            movedDuringDrag.current = false;
            animating.current = false;
            try {
                element.setPointerCapture(event.pointerId);
            } catch {
                /* ignore */
            }
        };

        const onPointerMove = (event: PointerEvent) => {
            const origin = dragOrigin.current;
            if (!origin) return;
            const dx = event.clientX - origin.x;
            if (Math.abs(dx) > 3) movedDuringDrag.current = true;
            if (!movedDuringDrag.current) return;
            event.preventDefault();
            setDragging(true);
            const maxScroll = element.scrollWidth - element.clientWidth;
            element.scrollLeft = Math.max(0, Math.min(maxScroll, origin.scroll - dx));
            targetLeft.current = element.scrollLeft;
            measure();
        };

        const onPointerUp = (event: PointerEvent) => {
            if (!dragOrigin.current) return;
            dragOrigin.current = null;
            setDragging(false);
            try {
                element.releasePointerCapture(event.pointerId);
            } catch {
                /* ignore */
            }
            measure();
        };

        element.addEventListener('pointerdown', onPointerDown);
        element.addEventListener('pointermove', onPointerMove);
        element.addEventListener('pointerup', onPointerUp);
        element.addEventListener('pointercancel', onPointerUp);
        return () => {
            element.removeEventListener('pointerdown', onPointerDown);
            element.removeEventListener('pointermove', onPointerMove);
            element.removeEventListener('pointerup', onPointerUp);
            element.removeEventListener('pointercancel', onPointerUp);
        };
    }, [measure, ref]);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        Array.from(element.children).forEach(child => observer.observe(child));
        return () => observer.disconnect();
    }, [measure, ref]);

    const onScroll = measure;

    const onHoverEnter = useCallback(() => setHovered(true), []);
    const onHoverLeave = useCallback(() => setHovered(false), []);

    return {
        edges,
        overflows,
        hovered,
        dragging,
        measure,
        onScroll,
        onHoverEnter,
        onHoverLeave,
        scrollByStep,
        scrollStart: () => scrollByStep(-1),
        scrollEnd: () => scrollByStep(1),
    };
}
