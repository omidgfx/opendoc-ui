import clsx from 'clsx';
import type {ResponseDefinition} from '../../../types';
import {Tip} from '../../common/Tooltip';

interface ResponseCodeNavigatorProps {
    responses: Record<string, ResponseDefinition>;
    activeCode: string | null;
    expandedCodes: ReadonlySet<string>;
    onSelect: (code: string) => void;
}

const responseTone = (code: string) => {
    if (code === 'default')
        return {
            text: 'text-[var(--method-get)]',
            background: 'bg-[var(--method-get)]',
            border: 'border-[var(--method-get)]',
        };
    if (code.startsWith('2'))
        return {
            text: 'text-[var(--method-get)]',
            background: 'bg-[var(--method-get)]',
            border: 'border-[var(--method-get)]',
        };
    if (code.startsWith('3'))
        return {
            text: 'text-[var(--method-put)]',
            background: 'bg-[var(--method-put)]',
            border: 'border-[var(--method-put)]',
        };
    return {
        text: 'text-[var(--method-delete)]',
        background: 'bg-[var(--method-delete)]',
        border: 'border-[var(--method-delete)]',
    };
};

export default function ResponseCodeNavigator({
    responses,
    activeCode,
    expandedCodes,
    onSelect,
}: ResponseCodeNavigatorProps) {
    const entries = Object.entries(responses);
    if (entries.length === 0) return null;
    return (
        <nav
            data-response-navigator="vertical"
            aria-label="Response code navigator"
            className="sticky top-3 flex w-16 shrink-0 flex-col items-center gap-2.5 px-1 py-3"
        >
            {entries.map(([code, response]) => {
                const active = code === activeCode;
                const expanded = expandedCodes.has(code);
                const tone = responseTone(code);
                return (
                    <Tip
                        key={code}
                        content={
                            <span className="flex flex-col gap-0.5">
                                <span className="font-mono text-[10px] font-bold">Response {code}</span>
                                <span className="leading-snug opacity-85">
                                    {response.description || 'Response details'}
                                </span>
                            </span>
                        }
                        placement="right"
                        fullWidth
                    >
                        <button
                            type="button"
                            aria-pressed={active}
                            aria-controls={`response-${code}`}
                            aria-label={`Open response ${code}: ${response.description || 'Response details'}`}
                            onClick={() => onSelect(code)}
                            className={clsx(
                                'group flex w-full items-center gap-2 text-start transition-all duration-200 cursor-pointer',
                                active ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                            )}
                        >
                            <span
                                data-response-indicator={code}
                                data-expanded={expanded ? 'true' : 'false'}
                                className={clsx(
                                    'size-1.5 shrink-0 rounded-full border transition-all duration-200',
                                    expanded
                                        ? `${tone.background} ${tone.border} opacity-100`
                                        : `${tone.border} opacity-60 group-hover:opacity-100`,
                                )}
                                aria-hidden="true"
                            />
                            <span
                                data-response-code-label={code}
                                className={clsx(
                                    'min-w-0 flex-1 truncate font-mono text-[10px] font-semibold leading-tight transition-colors duration-200',
                                    active
                                        ? tone.text
                                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-heading)]',
                                )}
                            >
                                {code}
                            </span>
                        </button>
                    </Tip>
                );
            })}
        </nav>
    );
}
