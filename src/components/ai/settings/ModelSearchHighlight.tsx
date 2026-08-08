interface ModelSearchHighlightProps {
    text: string;
    query: string;
}

export default function ModelSearchHighlight({text, query}: ModelSearchHighlightProps) {
    const terms = query.trim().split(/\s+/).filter(Boolean)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) return <>{text}</>;
    const splitMatcher = new RegExp(`(${terms.join('|')})`, 'giu');
    const matcher = new RegExp(`(${terms.join('|')})`, 'iu');
    return <>{text.split(splitMatcher).map((part, index) => matcher.test(part)
        ? <mark key={`${part}-${index}`} className="rounded bg-[var(--highlight)] text-inherit">{part}</mark>
        : <span key={`${part}-${index}`}>{part}</span>)}</>;
}
