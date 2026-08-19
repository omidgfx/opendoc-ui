import {useEffect, useState, type RefObject} from 'react';

/**
 * Width of an element, tracked with a ResizeObserver. Layout decisions inside
 * the endpoint workspace depend on the room the pane actually has — in split
 * view or with the notes sidebar open that is nothing like the viewport.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const update = () => setWidth(element.getBoundingClientRect().width);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}
