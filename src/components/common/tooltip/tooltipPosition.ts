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
const clamp = (value: number, minimum: number, maximum: number): number =>
    Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export const samePosition = (left: TooltipPosition, right: TooltipPosition): boolean =>
    left.top === right.top &&
    left.left === right.left &&
    left.transform === right.transform &&
    left.placement === right.placement;

export const positionFor = (rect: DOMRect, requested: TooltipPlacement, rawSize: TooltipSize): TooltipPosition => {
    const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
    const size = {
        width: Math.max(1, rawSize.width),
        height: Math.max(1, rawSize.height),
    };
    const available: Record<TooltipPlacement, number> = {
        top: rect.top - TOOLTIP_EDGE,
        bottom: viewportHeight - rect.bottom - TOOLTIP_EDGE,
        left: rect.left - TOOLTIP_EDGE,
        right: viewportWidth - rect.right - TOOLTIP_EDGE,
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
    const resolved =
        fallbackOrder[requested].find(side => available[side] >= required[side]) ||
        fallbackOrder[requested].slice().sort((left, right) => available[right] - available[left])[0];
    const centerX = clamp(
        rect.left + rect.width / 2,
        TOOLTIP_EDGE + size.width / 2,
        viewportWidth - TOOLTIP_EDGE - size.width / 2,
    );
    const centerY = clamp(
        rect.top + rect.height / 2,
        TOOLTIP_EDGE + size.height / 2,
        viewportHeight - TOOLTIP_EDGE - size.height / 2,
    );
    if (resolved === 'bottom')
        return {
            top: clamp(rect.bottom + TOOLTIP_GAP, TOOLTIP_EDGE, viewportHeight - TOOLTIP_EDGE - size.height),
            left: centerX,
            transform: 'translateX(-50%)',
            placement: resolved,
        };
    if (resolved === 'left')
        return {
            top: centerY,
            left: clamp(rect.left - TOOLTIP_GAP, TOOLTIP_EDGE + size.width, viewportWidth - TOOLTIP_EDGE),
            transform: 'translate(-100%, -50%)',
            placement: resolved,
        };
    if (resolved === 'right')
        return {
            top: centerY,
            left: clamp(rect.right + TOOLTIP_GAP, TOOLTIP_EDGE, viewportWidth - TOOLTIP_EDGE - size.width),
            transform: 'translateY(-50%)',
            placement: resolved,
        };
    return {
        top: clamp(rect.top - TOOLTIP_GAP, TOOLTIP_EDGE + size.height, viewportHeight - TOOLTIP_EDGE),
        left: centerX,
        transform: 'translate(-50%, -100%)',
        placement: resolved,
    };
};
