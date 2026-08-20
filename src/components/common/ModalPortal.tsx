import {createPortal} from 'react-dom';
import type {ReactNode} from 'react';

/**
 * Renders a modal at the end of the document. A dialog opened from inside a
 * pane must not live in that pane's layer: the endpoint workspace is a
 * stacking context of its own, and a fixed backdrop rendered inside it stays
 * below the topbar and the sidebar however high its z-index is.
 */
export default function ModalPortal({children}: {children: ReactNode}) {
    if (typeof document === 'undefined') return null;
    return createPortal(children, document.body);
}
