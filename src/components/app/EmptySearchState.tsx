export default function EmptySearchState() {
    return (<div className="flex-1 w-full h-full overflow-y-auto scrollbar-thin">
        <div className="min-h-full flex flex-col items-center justify-center px-6 text-center select-none">
            <span
                className="size-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--primary)]">
                <i className="ph-fill ph-magnifying-glass text-[20px]"/>
            </span>
            <h2 className="mt-4 text-base font-extrabold text-[var(--text-heading)]">
                Search the specification
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
                Type a path, summary, tag or schema name in the search field to find endpoints across this API.
            </p>
        </div>
    </div>);
}
