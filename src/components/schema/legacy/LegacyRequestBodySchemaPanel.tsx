/**
 * LEGACY — kept unused on purpose.
 *
 * Snapshot of the Request Body Context schema panel as it lived inside
 * ViewTab before the shared SchemaViewer. Response Body and Schema Modal
 * still use their own existing viewers; this file is only a reference so
 * nothing is lost while the new viewer is evaluated in Request Body only.
 *
 * Do not import this module into product UI.
 */

import type {ReactNode} from 'react';

/** Documented shape of the props the old inline panel closed over. */
export interface LegacyRequestBodySchemaPanelProps {
    selectedRequestBodyContentType: string;
    requestBodyShapeLabel: string;
    requestBodyShapeHint: string;
    requestBodyShapeIcon: string;
    hasComposition: boolean;
    hasChoice: boolean;
    activeTab: 'example' | 'schema' | 'spec-example';
    hasSpecExamples: boolean;
    /** Rendered markup of the previous implementation, for side-by-side review. */
    notes?: string;
}

/**
 * Intentionally renders nothing. The previous JSX remains in git history
 * (ViewTab request pane) and in the plot notes; keeping a typed stub stops
 * the tree from forgetting the seam while Request Body runs SchemaViewer.
 */
export default function LegacyRequestBodySchemaPanel(_props: LegacyRequestBodySchemaPanelProps): ReactNode {
    return null;
}

export const LEGACY_REQUEST_BODY_SCHEMA_PANEL_NOTE =
    'Old Request Body schema tabs/panes lived inline in ViewTab; Response and Schema Modal still use the prior viewers for comparison.';
