import clsx from 'clsx';

interface SearchHighlightedTextProps {
    text: string;
    query: string;
    deprecated?: boolean;
    startOnly?: boolean;
}

export default function SearchHighlightedText({
    text,
    query,
    deprecated = false,
    startOnly = false,
}: SearchHighlightedTextProps) {
    const terms = query
        .trim()
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) {
        return <span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>{text}</span>;
    }
    if (startOnly) {
        const match = text.match(new RegExp(`^(${terms.join('|')})`, 'iu'));
        if (!match) return <span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>{text}</span>;
        return (
            <span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>
                <mark className="rounded-sm bg-[var(--highlight)] text-inherit">{match[0]}</mark>
                <span>{text.slice(match[0].length)}</span>
            </span>
        );
    }
    const regex = new RegExp(`(${terms.join('|')})`, 'iu');
    const splitRegex = new RegExp(`(${terms.join('|')})`, 'giu');
    return (
        <span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>
            {text.split(splitRegex).map((part, index) =>
                regex.test(part) ? (
                    <mark key={`${part}-${index}`} className="rounded-sm bg-[var(--highlight)] text-inherit">
                        {part}
                    </mark>
                ) : (
                    <span key={`${part}-${index}`}>{part}</span>
                ),
            )}
        </span>
    );
}
