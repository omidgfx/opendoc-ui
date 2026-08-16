import {RECURSIVE_SCHEMA_ICON} from './schemaProperties';
import type {MockLineMarker} from './runner/mockGenerator';

/**
 * A gutter annotation for CodeViewer: an icon rendered beside a specific
 * line number. Markers live outside the copyable code text, so they never
 * appear in selections or clipboard copies.
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

/**
 * Converts the logic-level markers reported by the mock generator into
 * ready-to-render CodeViewer gutter markers.
 */
export const mockMarkersToLineMarkers = (markers: MockLineMarker[]): CodeLineMarker[] =>
    markers.map(marker =>
        marker.kind === 'recursive'
            ? {
                  line: marker.line,
                  icon: RECURSIVE_SCHEMA_ICON,
                  className: 'text-[var(--primary)]',
                  tip: marker.ref
                      ? `Recursive reference to ${marker.ref} — expansion stops at the first cycle.`
                      : 'Recursive reference — expansion stops at the first cycle.',
              }
            : {
                  line: marker.line,
                  icon: DEPTH_LIMIT_ICON,
                  className: 'text-[var(--text-muted)]',
                  tip: 'Nesting depth limit reached — deeper content is omitted from this example.',
              },
    );
