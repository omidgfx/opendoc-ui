import clsx from 'clsx';
import type {AISourceRef} from '../../../types';

interface AssistantCitationsProps {
    citations?: AISourceRef[];
    onOpenEndpoint: (path: string, method: string) => void;
}

export default function AssistantCitations({citations, onOpenEndpoint}: AssistantCitationsProps) {
    if (!citations || citations.length === 0) return null;
    return (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border)]/70 pt-2.5">
            <span
                className="me-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                <i className="ph ph-quotes text-[12px]"/>Sources
            </span>
            {citations.map(source => {
                const isEndpoint = source.kind === 'endpoint' && source.path && source.method;
                return (
                    <button key={source.id} type="button"
                            onClick={() => isEndpoint && onOpenEndpoint(source.path!, source.method!.toLowerCase())}
                            className={clsx(
                                'rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)] transition-colors',
                                isEndpoint ? 'cursor-pointer hover:border-[var(--primary)]/50 hover:text-[var(--primary)]' : 'cursor-default',
                            )}>
                        {source.label}
                    </button>
                );
            })}
        </div>
    );
}
