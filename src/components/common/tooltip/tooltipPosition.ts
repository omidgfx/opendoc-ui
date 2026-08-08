export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
export interface TooltipSize {
    width: number;
    height: number;
}
export interface TooltipPosition {
    top: number;
    left: number;
    transform: string;
    placement: TooltipPlacement;
}
const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE = 8;
export const INITIAL_TOOLTIP_SIZE: TooltipSize = { width: 320, height: 48 };
export const samePosition = (left: TooltipPosition, right: TooltipPosition): boolean => left.top === right.top
    && left.left === right.left
    && left.transform === right.transform
    && left.placement === right.placement;
const clampCenter = (value: number, size: number, viewport: number): number => {
    const min = Math.min(TOOLTIP_EDGE + size / 2, viewport / 2);
    const max = Math.max(viewport - TOOLTIP_EDGE - size / 2, viewport / 2);
    return Math.min(Math.max(value, min), max);
};
export const positionFor = (rect: DOMRect, requested: TooltipPlacement, size: TooltipSize): TooltipPosition => {
    const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
    const available: Record<TooltipPlacement, number> = {
        top: rect.top,
        bottom: viewportHeight - rect.bottom,
        left: rect.left,
        right: viewportWidth - rect.right,
    };
    const required: Record<TooltipPlacement, number> = {
        top: size.height + TOOLTIP_GAP,
        bottom: size.height + TOOLTIP_GAP,
        left: size.width + TOOLTIP_GAP,
        right: size.width + TOOLTIP_GAP,
    };
    const fallbackOrder: Record<TooltipPlacement, TooltipPlacement[]> = {
        top: ['top', 'bottom', 'right', 'left'],
        bottom: ['bottom', 'top', 'right', 'left'],
        left: ['left', 'right', 'bottom', 'top'],
        right: ['right', 'left', 'bottom', 'top'],
    };
    const resolved = fallbackOrder[requested].find(side => available[side] >= required[side])
        || fallbackOrder[requested].slice().sort((a, b) => available[b] - available[a])[0];
    const centerX = clampCenter(rect.left + rect.width / 2, size.width, viewportWidth);
    const centerY = clampCenter(rect.top + rect.height / 2, size.height, viewportHeight);
    if (resolved === 'bottom')
        return {
            top: rect.bottom + TOOLTIP_GAP,
            left: centerX,
            transform: 'translateX(-50%)',
            placement: resolved
        };
    if (resolved === 'left')
        return {
            top: centerY,
            left: Math.max(TOOLTIP_EDGE, rect.left - TOOLTIP_GAP),
            transform: 'translate(-100%, -50%)',
            placement: resolved
        };
    if (resolved === 'right')
        return {
            top: centerY,
            left: Math.min(viewportWidth - TOOLTIP_EDGE, rect.right + TOOLTIP_GAP),
            transform: 'translateY(-50%)',
            placement: resolved
        };
    return {
        top: Math.max(TOOLTIP_EDGE, rect.top - TOOLTIP_GAP),
        left: centerX,
        transform: 'translate(-50%, -100%)',
        placement: resolved
    };
};
