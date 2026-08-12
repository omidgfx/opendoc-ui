import clsx from 'clsx';
import type {ResponseDefinition} from '../../../types';

interface ResponseCodeNavigatorProps {
    responses: Record<string, ResponseDefinition>;
    activeCode: string | null;
    isMobile: boolean;
    onSelect: (code: string) => void;
}

const codeColor = (code: string, active: boolean): string => {
    if (active) return 'bg-[var(--primary)] text-[var(--primary-contrast)]';
    if (code === 'default' || code.startsWith('2'))
        return 'bg-[var(--method-get)]/10 text-[var(--method-get)] hover:bg-[var(--method-get)]/20';
    if (code.startsWith('3'))
        return 'bg-[var(--method-put)]/10 text-[var(--method-put)] hover:bg-[var(--method-put)]/20';
    return 'bg-[var(--method-delete)]/10 text-[var(--method-delete)] hover:bg-[var(--method-delete)]/20';
};

export default function ResponseCodeNavigator({responses, activeCode, isMobile, onSelect}: ResponseCodeNavigatorProps) {
    const entries = Object.entries(responses);
    if (entries.length === 0) return null;
    const buttons = entries.map(([code, response]) => {
        const active = code === activeCode;
        return (
            <button
                key={code}
                type="button"
                aria-pressed={active}
                aria-controls={`response-${code}`}
                aria-label={`Open response ${code}: ${response.description || 'Response details'}`}
                title={`${code} · ${response.description || 'Response details'}`}
                onClick={() => onSelect(code)}
                className={clsx(
                    'group flex shrink-0 items-center rounded-md font-mono text-[9px] font-bold transition-colors cursor-pointer',
                    isMobile ? 'h-6 gap-1.5 px-2' : 'h-6 w-full justify-center px-1',
                    codeColor(code, active),
                )}
            >
                {!isMobile && (
                    <span
                        className={clsx(
                            'size-1 rounded-full transition-colors',
                            active ? 'bg-[var(--primary-contrast)]' : 'bg-current opacity-60',
                        )}
                        aria-hidden="true"
                    />
                )}
                <span>{code}</span>
            </button>
        );
    });
    if (isMobile) {
        return (
            <nav
                aria-label="Response code navigator"
                className="sticky top-0 z-20 -mx-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 p-1.5 shadow-sm backdrop-blur-sm"
            >
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">{buttons}</div>
            </nav>
        );
    }
    return (
        <nav
            aria-label="Response code navigator"
            className="sticky top-3 flex w-12 shrink-0 flex-col items-stretch gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm"
        >
            {buttons}
        </nav>
    );
}
