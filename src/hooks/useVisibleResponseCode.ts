import {useEffect, useState, type RefObject} from 'react';

/**
 * The response the reader is currently looking at, tracked by observing the
 * response cards inside a scroll container. It reports only what is on screen —
 * scrolling must never open, collapse or navigate anything by itself.
 */
export function useVisibleResponseCode(
    scrollRef: RefObject<HTMLElement | null>,
    codes: string[],
    enabled = true,
): string | null {
    const key = codes.join('|');
    const [visibleCode, setVisibleCode] = useState<string | null>(null);
    useEffect(() => {
        const root = scrollRef.current;
        if (!enabled || !root || codes.length === 0) return;
        const elements = codes
            .map(code => ({code, element: root.querySelector<HTMLElement>(`#response-${CSS.escape(code)}`)}))
            .filter((entry): entry is {code: string; element: HTMLElement} => !!entry.element);
        if (elements.length === 0) return;
        const ratios = new Map<string, number>();
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    const code = elements.find(item => item.element === entry.target)?.code;
                    if (code) ratios.set(code, entry.isIntersecting ? entry.intersectionRatio : 0);
                });
                // The first card that is actually on screen wins, so the reader
                // sees the response they are reading, not the largest one.
                const current = elements.find(item => (ratios.get(item.code) || 0) > 0.02);
                if (current) setVisibleCode(previous => (previous === current.code ? previous : current.code));
            },
            {root, threshold: [0, 0.02, 0.25, 0.5], rootMargin: '-64px 0px -55% 0px'},
        );
        elements.forEach(item => observer.observe(item.element));
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollRef, key, enabled]);
    return visibleCode;
}
