import clsx from 'clsx';

interface SearchHighlightedTextProps {
    text: string;
    query: string;
    deprecated?: boolean;
}

export default function SearchHighlightedText({text, query, deprecated = false}: SearchHighlightedTextProps) {
    const terms = query.trim().split(/[\s._-]+/).filter(Boolean)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) {
        return <span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>{text}</span>;
    }
    const regex = new RegExp(`(${terms.join('|')})`, 'iu');
    const splitRegex = new RegExp(`(${terms.join('|')})`, 'giu');
    return (<span className={clsx('truncate', deprecated && 'opacity-70 line-through')}>
        {text.split(splitRegex).map((part, index) => regex.test(part)
            ? <mark key={`${part}-${index}`} className="rounded-sm bg-[var(--highlight)] text-inherit">{part}</mark>
            : <span key={`${part}-${index}`}>{part}</span>)}
    </span>);
}
