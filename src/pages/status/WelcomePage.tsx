import React, {useRef, useState} from 'react';
import SearchHistoryDropdown from '@/src/components/common/SearchHistoryDropdown';
import BrandLogo from '@/src/components/brand/BrandLogo';
import type {OpenApiSpec} from '@/src/types';
import {getSpecLogo} from '@/src/utils/specification/specLogo';

type WelcomeViewProps = {
    spec: OpenApiSpec | null;
    specTitle: string;
    specKey: string;
    onSearchSubmit: (q: string) => void;
    onOpenHome: () => void;
    onOpenSchemaExplorer: () => void;
    onOpenCompatibility: () => void;
};
export default function WelcomeView({
    spec,
    specTitle,
    specKey,
    onSearchSubmit,
    onOpenHome,
    onOpenSchemaExplorer,
    onOpenCompatibility,
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
    // Specification logo first; the OpenDoc brand lockup is the fallback.
    const specLogo = getSpecLogo(spec);
    return (
        <div className="flex-1 h-full overflow-y-auto scrollbar-thin relative">
            <div className="min-h-full flex flex-col items-center justify-center px-6 py-12 select-none">
                <div className="flex flex-col items-center w-full max-w-xl text-center">
                    {specLogo ? (
                        <img
                            src={specLogo.url}
                            alt=""
                            draggable={false}
                            className="mb-5 size-16 sm:size-20 shrink-0 object-contain"
                        />
                    ) : (
                        <BrandLogo
                            type={null}
                            layout="stack"
                            logoFrame={false}
                            logoClassName="size-16 sm:size-20"
                            wordmarkClassName="text-2xl sm:text-3xl text-[var(--text-heading)]"
                            className="mb-5"
                        />
                    )}
                    <p className="max-w-lg break-words text-sm font-bold text-[var(--text-muted)] sm:text-base">
                        {specTitle}
                    </p>
                    <p className="mt-1.5 text-xs text-[var(--text-muted)] max-w-md leading-relaxed">
                        Search the specification, or open an endpoint from the sidebar. Everything you open lands in the
                        tabs above.
                    </p>

                    <div className="relative mt-7 w-full max-w-lg">
                        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] pl-4 pr-1 h-12 shadow-sm transition-all hover:shadow-md focus-within:border-[var(--primary)] focus-within:shadow-md">
                            <i className="ph ph-magnifying-glass text-[18px] text-[var(--text-muted)]"></i>
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') submit();
                                }}
                                placeholder="Search paths, summaries, tags…"
                                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)]"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className="size-9 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] transition-colors cursor-pointer shrink-0"
                                >
                                    <i className="ph ph-x text-[13px]"></i>
                                </button>
                            ) : null}

                            <button
                                type="button"
                                onClick={submit}
                                aria-label="Search"
                                className="size-9 rounded-full flex items-center justify-center bg-transparent hover:bg-[var(--primary)] text-[var(--primary)] hover:text-[var(--primary-contrast)] hover:opacity-90 transition-all cursor-pointer shrink-0"
                            >
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

                    <div className="mt-5 w-full max-w-lg border-t border-dashed border-[var(--border)] pt-3.5">
                        <div className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                            <i className="ph ph-lightbulb text-[13px] leading-4 text-[var(--method-put)]"></i>
                            <p className="leading-relaxed">
                                <span className="font-bold">Tip:</span>{' '}
                                <span className="font-medium">
                                    Each link below opens as a tab next to your endpoints, so you can explore without
                                    losing your place.
                                </span>
                            </p>
                        </div>
                        <div className="mt-2 flex flex-col items-start gap-1.5">
                            <button
                                type="button"
                                onClick={onOpenHome}
                                className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                            >
                                Open the overview
                            </button>
                            <button
                                type="button"
                                onClick={onOpenSchemaExplorer}
                                className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                            >
                                Open the schema explorer
                            </button>
                            <button
                                type="button"
                                onClick={onOpenCompatibility}
                                className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                            >
                                Check runner compatibility
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
