import {useRef, type ReactNode} from 'react';
import clsx from 'clsx';
import {useElementWidth} from '../../hooks/useElementWidth';

/** Two columns of labels and values. */
export const COMPACT_CARD_LAYOUT_WIDTH = 448;
/** The usual parameter or property matrix. */
export const CARD_LAYOUT_WIDTH = 672;
/** The nine-column Runner compatibility matrix. */
export const WIDE_CARD_LAYOUT_WIDTH = 896;

interface CardOrTableProps {
    /** The reader's preference: cards are only used where they are wanted. */
    preferCards: boolean;
    /** Container width below which the columns no longer fit. */
    maxWidth: number;
    className?: string;
    cards: () => ReactNode;
    table: () => ReactNode;
}

/**
 * Renders a table as columns or as one card per row, deciding from the width
 * the pane actually has. Only the chosen layout reaches the document: a copy
 * hidden with a container query would still duplicate every value in the DOM,
 * for search, for the accessibility tree and for anyone reading the markup.
 */
export default function CardOrTable({preferCards, maxWidth, className, cards, table}: CardOrTableProps) {
    const ref = useRef<HTMLDivElement>(null);
    const width = useElementWidth(ref);
    const narrow = width > 0 && width < maxWidth;
    return (
        <div ref={ref} className={clsx('min-w-0', className)}>
            {preferCards && narrow ? cards() : table()}
        </div>
    );
}
