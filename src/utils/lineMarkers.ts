import {RECURSIVE_SCHEMA_ICON} from './schemaProperties';
import type {MockLineMarker} from './runner/mockGenerator';

/**
 * A gutter annotation for CodeViewer: an icon rendered beside a specific
 * line number. Markers live outside the copyable code text, so they never
 * appear in selections or clipboard copies. A line may carry several
 * markers — the gutter reserves a stable icon slot for all of them.
 */
export interface CodeLineMarker {
    /** 1-based line number the icon belongs to. */
    line: number;
    /** Phosphor icon class, e.g. "ph ph-arrow-clockwise". */
    icon: string;
    /** Tooltip shown when hovering the icon. */
    tip: string;
    /** Optional extra class for the icon (color / emphasis). */
    className?: string;
}

export const DEPTH_LIMIT_ICON = 'ph ph-arrow-line-down';
export const REQUIRED_LINE_ICON = 'ph-fill ph-asterisk';
export const REFERENCED_SCHEMA_ICON = 'ph ph-diamonds-four';

/**
 * Converts the logic-level markers reported by the mock generator into
 * ready-to-render CodeViewer gutter markers. A recursive marker already
 * implies the reference, so a plain "ref" marker on the same line is
 * dropped to keep the gutter quiet.
 */
export const mockMarkersToLineMarkers = (markers: MockLineMarker[]): CodeLineMarker[] => {
    const recursiveLines = new Set(markers.filter(marker => marker.kind === 'recursive').map(marker => marker.line));
    return markers.flatMap(marker => {
        if (marker.kind === 'recursive')
            return [
                {
                    line: marker.line,
                    icon: RECURSIVE_SCHEMA_ICON,
                    className: 'text-[var(--primary)]',
                    tip: marker.ref
                        ? `Recursive reference to ${marker.ref} — expansion stops at the first cycle.`
                        : 'Recursive reference — expansion stops at the first cycle.',
                },
            ];
        if (marker.kind === 'max-depth')
            return [
                {
                    line: marker.line,
                    icon: DEPTH_LIMIT_ICON,
                    className: 'text-[var(--text-muted)]',
                    tip: 'Nesting depth limit reached — deeper content is omitted from this example.',
                },
            ];
        if (marker.kind === 'required')
            return [
                {
                    line: marker.line,
                    icon: REQUIRED_LINE_ICON,
                    className: 'text-[var(--method-delete)]',
                    tip: 'Required property.',
                },
            ];
        /* kind === 'ref' — skip when the same line already shows recursion */
        if (recursiveLines.has(marker.line)) return [];
        return [
            {
                line: marker.line,
                icon: REFERENCED_SCHEMA_ICON,
                className: 'text-[var(--accent)]',
                tip: marker.ref
                    ? marker.refOnItems
                        ? `Array items generated from referenced schema ${marker.ref}.`
                        : `Generated from referenced schema ${marker.ref}.`
                    : 'Generated from a referenced schema.',
            },
        ];
    });
};
