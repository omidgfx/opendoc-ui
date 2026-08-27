import Markdown from '../../common/Markdown';
import CodeViewer from '../../common/CodeViewer';
import type {LinkDefinition, OpenApiSpec} from '../../../types';
import {resolveReference} from '../../../utils/openapi';
interface ResponseLinksPanelProps {
    links: Record<string, LinkDefinition | {$ref: string}>;
    spec: OpenApiSpec;
}

const stringifyValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const isStructured = (value: unknown): boolean =>
    !!value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

export default function ResponseLinksPanel({links, spec}: ResponseLinksPanelProps) {
    const entries = Object.entries(links || {})
        .map(([name, raw]) => [name, (resolveReference(raw, spec) || raw) as LinkDefinition] as const)
        .filter(([, link]) => !!link && typeof link === 'object');
    if (entries.length === 0) return null;
    return (
        <div className="min-w-0">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--primary)]">
                                <i className="ph ph-arrows-left-right text-[11px]" />
                                Response links
                            </span>
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[9px] font-mono text-[var(--text-muted)]">
                                {entries.length}
                            </span>
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                            Follow-up operations derived from this response. Runtime expressions remain source truth;
                            OpenDoc shows them exactly as declared.
                        </p>
                    </div>
                </div>
                <div className="mt-3 space-y-3">
                    {entries.map(([name, link]) => {
                        const target = link.operationId || link.operationRef || 'Linked operation';
                        const parameterEntries = Object.entries(link.parameters || {});
                        const targetKind = link.operationId
                            ? 'operationId'
                            : link.operationRef
                              ? 'operationRef'
                              : 'target';
                        return (
                            <div
                                key={name}
                                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
                                        {name}
                                    </span>
                                    <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        {targetKind}
                                    </span>
                                    <code className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-mono text-[var(--text-heading)] break-all">
                                        {target}
                                    </code>
                                </div>
                                {link.description && (
                                    <div className="mt-2 text-xs leading-relaxed text-[var(--text)]">
                                        <Markdown text={link.description} />
                                    </div>
                                )}
                                {link.server?.url && (
                                    <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                                        Server:{' '}
                                        <code className="font-mono text-[var(--text-heading)]">{link.server.url}</code>
                                    </div>
                                )}
                                {parameterEntries.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Runtime parameters
                                        </h5>
                                        <div className="overflow-x-auto scrollbar-thin">
                                            <table className="w-full min-w-[360px] border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="border-b border-[var(--border)]">
                                                        <th className="px-2 py-1.5 font-semibold text-[var(--text-heading)]">
                                                            Parameter
                                                        </th>
                                                        <th className="px-2 py-1.5 font-semibold text-[var(--text-heading)]">
                                                            Expression / Value
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {parameterEntries.map(([parameterName, value]) => (
                                                        <tr
                                                            key={parameterName}
                                                            className="border-b border-[var(--border)]/70 last:border-b-0"
                                                        >
                                                            <td className="px-2 py-1.5 font-mono text-[10px] font-bold text-[var(--text-heading)]">
                                                                {parameterName}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-[var(--text)]">
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    {typeof value === 'string' &&
                                                                        value.includes('$') && (
                                                                            <span className="rounded-full border border-[var(--method-put)]/20 bg-[var(--method-put)]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--method-put)]">
                                                                                runtime expression
                                                                            </span>
                                                                        )}
                                                                    <code className="break-all rounded bg-[var(--background)] px-1.5 py-1 font-mono text-[10px] text-[var(--primary)]">
                                                                        {stringifyValue(value)}
                                                                    </code>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                                {link.requestBody !== undefined && (
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center gap-1.5">
                                            <i className="ph ph-brackets-curly text-[12px] text-[var(--primary)]" />
                                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                Linked request body
                                            </h5>
                                        </div>
                                        {isStructured(link.requestBody) ? (
                                            <CodeViewer
                                                code={stringifyValue(link.requestBody)}
                                                language="json"
                                                maxHeight="220px"
                                            />
                                        ) : (
                                            <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 font-mono text-[10px] text-[var(--primary)]">
                                                {stringifyValue(link.requestBody)}
                                            </code>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
