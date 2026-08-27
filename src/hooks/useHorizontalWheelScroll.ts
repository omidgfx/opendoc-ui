import {type RefObject} from 'react';
import {useHorizontalStrip} from './useHorizontalStrip';

/**
 * Back-compat wrapper: wheel + drag + edge measurement for a horizontal strip.
 * Prefer `useHorizontalStrip` when end buttons or hover state are needed.
 */
export function useHorizontalWheelScroll(ref: RefObject<HTMLElement | null>): void {
    useHorizontalStrip(ref);
}
