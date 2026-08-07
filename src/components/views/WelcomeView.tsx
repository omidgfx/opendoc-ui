import React, {useRef, useState} from 'react';
import SearchHistoryDropdown from '../common/SearchHistoryDropdown';
// @ts-ignore
import Logo from '../../logo.svg?react';

type WelcomeViewProps = {
    specTitle: string;
    /** Spec key — the welcome search history is per-spec. */
    specKey: string;
    /** Called on Enter or the search button — actually opens the search. */
    onSearchSubmit: (q: string) => void;
    onOpenAbout: () => void;
    onOpenHome: () => void;
    onOpenLocalFile: () => void;
    canOpenLocal: boolean;
};

/**
 * The empty/home state shown when every tab is closed — a Google-style landing:
 * a centered logo, one big search field and a row of useful links. Typing does
 * not navigate; pressing Enter (or the search button inside the field) starts
 * the search. The field shows the same per-spec search history as the navbar.
 */
export default function WelcomeView({
                                        specTitle,
                                        specKey,
                                        onSearchSubmit,
                                        onOpenAbout,
                                        onOpenHome,
                                        onOpenLocalFile,
                                        canOpenLocal,
                                    }: WelcomeViewProps) {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const submit = () => {
        if (!query.trim()) return;
        onSearchSubmit(query);
    };

    const handlePick = (q: string) => {
        setQuery(q);
        onSearchSubmit(q);
    };

    const handleFocus = () => {
        if (blurTimer.current) {
            clearTimeout(blurTimer.current);
            blurTimer.current = null;
        }
        setFocused(true);
    };
    const handleBlur = () => {
        blurTimer.current = setTimeout(() => setFocused(false), 150);
    };

    return (
        <div className="flex-1 h-full overflow-y-auto scrollbar-thin relative">
            <div className="min-h-full flex flex-col items-center justify-center px-6 py-12 select-none">
                <div className="flex flex-col items-center w-full max-w-xl text-center">
                    <span className="size-16 sm:size-20 overflow-hidden mb-5">
                        <Logo className="size-full"/>
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-heading)]">
                        {specTitle}
                    </h1>
                    <p className="mt-1.5 text-xs text-[var(--text-muted)] max-w-md leading-relaxed">
                        Search the specification, or open an endpoint from the sidebar.
                        Everything you open lands in the tabs above.
                    </p>

                    {/* Big search pill — Google style */}
                    <div className="relative mt-7 w-full max-w-lg">
                        <div
                            className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] pl-4 pr-1 h-12 shadow-sm transition-all hover:shadow-md focus-within:border-[var(--primary)] focus-within:shadow-md">
                            <i className="ph ph-magnifying-glass text-[18px] text-[var(--text-muted)]"></i>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') submit();
                                }}
                                placeholder="Search paths, summaries, tags…"
                                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)]"
                            />
                            {query ? (
                                <button type="button"
                                        onClick={() => setQuery('')}
                                        className="size-9 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] transition-colors cursor-pointer shrink-0">
                                    <i className="ph ph-x text-[13px]"></i>
                                </button>
                            ) : null}
                            {/* Search button on the right side of the input */}
                            <button type="button" onClick={submit}
                                    aria-label="Search"
                                    className="size-9 rounded-full flex items-center justify-center bg-transparent hover:bg-[var(--primary)] text-[var(--primary)] hover:text-[var(--primary-contrast)] hover:opacity-90 transition-all cursor-pointer shrink-0">
                                <i className="ph ph-arrow-right text-[16px]"></i>
                            </button>
                        </div>

                        {focused && specKey && (
                            <SearchHistoryDropdown
                                specKey={specKey}
                                query={query}
                                onPick={handlePick}
                                onClose={() => setFocused(false)}
                            />
                        )}
                    </div>

                    {/* Useful links */}
                    <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                        <button type="button" onClick={onOpenHome}
                                className="h-9 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold flex items-center gap-2 text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
                            <i className="ph-fill ph-house text-[14px] text-[var(--primary)]"></i>
                            Overview
                        </button>
                        <button type="button" onClick={onOpenAbout}
                                className="h-9 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold flex items-center gap-2 text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
                            <i className="ph-fill ph-info text-[14px] text-[var(--primary)]"></i>
                            About OpenDoc UI
                        </button>
                        {canOpenLocal && (
                            <button type="button" onClick={onOpenLocalFile}
                                    className="h-9 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold flex items-center gap-2 text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
                                <i className="ph-fill ph-folder-open text-[14px] text-[var(--primary)]"></i>
                                Open a specification
                            </button>
                        )}
                    </div>

                    <p className="mt-8 text-[9.5px] font-mono text-[var(--text-muted)]/80">
                        <kbd
                            className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)]">Enter</kbd>
                        {'  to search'}
                    </p>
                </div>
            </div>
        </div>
    );
}
