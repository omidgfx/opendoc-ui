import {useMemo, useState} from 'react';
import type {OpenApiSpec} from '../../types';
import CustomDropdown from '../../components/common/CustomDropdown';
import {Tip} from '../../components/common/Tooltip';
import MethodBadge from '../../components/common/MethodBadge';
import ReferenceStatusNotice from '../../components/common/ReferenceStatusNotice';
import {collectReferenceIssues, createBundledOpenApiDocument, missingReferenceDocuments} from '../../utils/openapi';
import {analyzeRunnerCompatibility, type RunnerCompatibilityRating} from '../../utils/runner/runnerCompatibility';
import {getRawSpecDocument} from '../../utils/specification/specSource';
import {createLlmsText} from '../../utils/export/llmsExport';

interface RunnerCompatibilityPageProps {
    spec: OpenApiSpec;
    specKey: string;
    onSelectEndpoint: (path: string, method: string) => void;
    onAddReferencedFiles?: () => void;
}

const downloadText = (text: string, fileName: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

const ratingPresentation: Record<
    RunnerCompatibilityRating,
    {
        label: string;
        detail: string;
        icon: string;
        color: string;
        tone: string;
    }
> = {
    A: {
        label: 'Ready',
        detail: 'No static browser limitation',
        icon: 'ph-fill ph-check-circle',
        color: 'var(--method-get)',
        tone: 'bg-[var(--method-get)]/10 text-[var(--method-get)] border-[var(--method-get)]/25',
    },
    B: {
        label: 'Browser-limited',
        detail: 'Browser-managed behavior',
        icon: 'ph-fill ph-browser',
        color: 'var(--primary)',
        tone: 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/25',
    },
    C: {
        label: 'Review',
        detail: 'Partial static support',
        icon: 'ph-fill ph-warning',
        color: 'var(--method-put)',
        tone: 'bg-[var(--method-put)]/10 text-[var(--method-put)] border-[var(--method-put)]/25',
    },
    D: {
        label: 'Unresolved',
        detail: 'References or auth are missing',
        icon: 'ph-fill ph-link-break',
        color: 'var(--method-delete)',
        tone: 'bg-[var(--method-delete)]/10 text-[var(--method-delete)] border-[var(--method-delete)]/25',
    },
};

const RATINGS: RunnerCompatibilityRating[] = ['A', 'B', 'C', 'D'];

const TooltipCell = ({value, className}: {value: string; className: string}) => (
    <td className={className}>
        <Tip content={value} fullWidth disabled={!value || value === '—'}>
            <span className="block truncate">{value}</span>
        </Tip>
    </td>
);

export default function RunnerCompatibilityPage({
    spec,
    specKey,
    onSelectEndpoint,
    onAddReferencedFiles,
}: RunnerCompatibilityPageProps) {
    const report = useMemo(() => analyzeRunnerCompatibility(spec), [spec]);
    const issues = useMemo(() => collectReferenceIssues(spec), [spec]);
    const missingFiles = useMemo(() => missingReferenceDocuments(spec), [spec]);
    const [query, setQuery] = useState('');
    const [rating, setRating] = useState('all');
    const endpoints = report.endpoints.filter(endpoint => {
        if (rating !== 'all' && endpoint.rating !== rating) return false;
        const needle = query.trim().toLowerCase();
        return (
            !needle ||
            endpoint.path.toLowerCase().includes(needle) ||
            endpoint.method.toLowerCase().includes(needle) ||
            endpoint.summary.toLowerCase().includes(needle) ||
            endpoint.auth.toLowerCase().includes(needle) ||
            endpoint.notes.some(note => note.toLowerCase().includes(needle))
        );
    });
    const ratingCounts = useMemo(
        () =>
            Object.fromEntries(
                RATINGS.map(current => [
                    current,
                    report.endpoints.filter(endpoint => endpoint.rating === current).length,
                ]),
            ) as Record<RunnerCompatibilityRating, number>,
        [report.endpoints],
    );
    const readinessScore = report.totalOperations
        ? Math.round(report.endpoints.reduce((total, endpoint) => total + endpoint.score, 0) / report.totalOperations)
        : 100;
    const readinessColor =
        readinessScore >= 90
            ? 'var(--method-get)'
            : readinessScore >= 75
              ? 'var(--primary)'
              : readinessScore >= 55
                ? 'var(--method-put)'
                : 'var(--method-delete)';
    const safeName = (spec.info?.title || specKey || 'openapi').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
    const raw = getRawSpecDocument(spec);
    const hasUnresolvedReferences = issues.some(issue => issue.status === 'unresolved');
    return (
        <div className="flex-1 h-full overflow-y-auto p-3 sm:p-5 md:p-7 scrollbar-thin">
            <div className="space-y-4">
                <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                <i className="ph-fill ph-shield-check text-[19px]" />
                            </span>
                            <div>
                                <h1 className="text-xl font-extrabold text-[var(--text-heading)]">
                                    Runner Compatibility
                                </h1>
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                    Overview report
                                </span>
                            </div>
                        </div>
                        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-[var(--text-muted)]">
                            Static endpoint-level compatibility for the browser Runner. Runtime CORS, DNS, server
                            behavior, and credentials remain environment-dependent.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                downloadText(
                                    raw?.text || JSON.stringify(spec, null, 2),
                                    `${safeName || 'openapi'}-original.${raw?.text && !raw.text.trimStart().startsWith('{') ? 'yaml' : 'json'}`,
                                    raw?.text && !raw.text.trimStart().startsWith('{')
                                        ? 'application/yaml'
                                        : 'application/json',
                                )
                            }
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[10px] font-extrabold text-[var(--text-heading)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--background)] text-[var(--text-muted)]">
                                <i className="ph ph-download-simple text-[17px]" />
                            </span>
                            Original
                        </button>
                        <Tip
                            content={
                                hasUnresolvedReferences
                                    ? 'Add the missing referenced files before creating a bundled copy.'
                                    : 'Download a derived self-contained copy; the original remains unchanged.'
                            }
                        >
                            <button
                                type="button"
                                disabled={hasUnresolvedReferences}
                                onClick={() =>
                                    downloadText(
                                        JSON.stringify(createBundledOpenApiDocument(spec), null, 2),
                                        `${safeName || 'openapi'}-bundled.json`,
                                        'application/json',
                                    )
                                }
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-3 text-[10px] font-extrabold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/14 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                            >
                                <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--accent)]/10">
                                    <i className="ph ph-package text-[17px]" />
                                </span>
                                Bundled copy
                            </button>
                        </Tip>
                        <button
                            type="button"
                            onClick={() =>
                                downloadText(createLlmsText(spec), `${safeName || 'openapi'}-llms.txt`, 'text/plain')
                            }
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/8 px-3 text-[10px] font-extrabold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/14 cursor-pointer"
                        >
                            <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--primary)]/10">
                                <i className="ph ph-robot text-[17px]" />
                            </span>
                            llms.txt
                        </button>
                    </div>
                </header>

                <div
                    role="note"
                    className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/6 px-3 py-2.5 text-[10px] leading-relaxed text-[var(--text-muted)]"
                >
                    <i className="ph-fill ph-info text-[17px] text-[var(--accent)]" />
                    <p>
                        <strong className="text-[var(--text-heading)]">Bundled copy</strong> creates a derived,
                        self-contained JSON file by embedding references that OpenDoc can resolve. It helps consumers
                        and tools that require one file.{' '}
                        <strong className="text-[var(--text-heading)]">Original</strong> downloads the untouched source,
                        while <strong className="text-[var(--text-heading)]">llms.txt</strong> exports a compact text
                        index. None of these exports changes the loaded OpenAPI document.
                    </p>
                </div>

                <section
                    data-compatibility-statistics
                    aria-label="Runner compatibility statistics"
                    className="grid gap-3 lg:grid-cols-[250px_minmax(0,1fr)]"
                >
                    <div className="flex items-center gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <div
                            className="relative flex size-28 shrink-0 items-center justify-center rounded-full p-2"
                            style={{
                                background: `conic-gradient(${readinessColor} ${readinessScore}%, var(--border) ${readinessScore}% 100%)`,
                            }}
                        >
                            <div className="flex size-full flex-col items-center justify-center rounded-full bg-[var(--surface)] shadow-inner">
                                <strong className="text-2xl font-black text-[var(--text-heading)]">
                                    {readinessScore}
                                </strong>
                                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    score
                                </span>
                            </div>
                        </div>
                        <div className="min-w-0">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                Overall readiness
                            </span>
                            <strong className="mt-1 block text-lg font-black text-[var(--text-heading)]">
                                {report.totalOperations} operations
                            </strong>
                            <p className="mt-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
                                Average of every endpoint&apos;s static Runner score.
                            </p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xs font-extrabold text-[var(--text-heading)]">
                                    Rating distribution
                                </h2>
                                <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">
                                    Exclusive A–D rating assigned to every operation
                                </p>
                            </div>
                            <i className="ph ph-chart-donut text-[19px] text-[var(--text-muted)]" />
                        </div>
                        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--background)]">
                            {RATINGS.map(current => {
                                const percentage = report.totalOperations
                                    ? (ratingCounts[current] / report.totalOperations) * 100
                                    : 0;
                                return percentage > 0 ? (
                                    <Tip
                                        key={current}
                                        content={`${current}: ${ratingCounts[current]} (${Math.round(percentage)}%)`}
                                        wrapperClassName="h-full"
                                        wrapperStyle={{width: `${percentage}%`}}
                                    >
                                        <span
                                            className="block h-full w-full"
                                            style={{backgroundColor: ratingPresentation[current].color}}
                                        />
                                    </Tip>
                                ) : null;
                            })}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                            {RATINGS.map(current => {
                                const presentation = ratingPresentation[current];
                                const percentage = report.totalOperations
                                    ? Math.round((ratingCounts[current] / report.totalOperations) * 100)
                                    : 0;
                                return (
                                    <div
                                        key={current}
                                        className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-2.5 py-2"
                                    >
                                        <span
                                            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                                            style={{
                                                color: presentation.color,
                                                backgroundColor: `color-mix(in srgb, ${presentation.color} 12%, transparent)`,
                                            }}
                                        >
                                            <i className={`${presentation.icon} text-[14px]`} />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex items-baseline gap-1.5">
                                                <strong className="text-sm font-black text-[var(--text-heading)]">
                                                    {ratingCounts[current]}
                                                </strong>
                                                <span className="text-[8px] font-bold text-[var(--text-muted)]">
                                                    {percentage}%
                                                </span>
                                            </div>
                                            <span className="block truncate text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                                {current} · {presentation.label}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {issues.length > 0 && (
                    <div className="space-y-2">
                        {issues.slice(0, 6).map(issue => (
                            <ReferenceStatusNotice
                                key={`${issue.status}:${issue.path}:${issue.ref}`}
                                issue={issue}
                                onAddFiles={onAddReferencedFiles}
                                compact={issues.length > 1}
                            />
                        ))}
                        {issues.length > 6 && (
                            <p className="text-[10px] text-[var(--text-muted)]">
                                +{issues.length - 6} more reference issues
                            </p>
                        )}
                        {missingFiles.length > 0 && (
                            <p className="text-[10px] text-[var(--text-muted)]">
                                Missing documents: <span className="font-mono">{missingFiles.join(', ')}</span>
                            </p>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1">
                        <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-xs text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Filter endpoints, auth, or compatibility notes…"
                            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-xs outline-none focus:border-[var(--primary)]"
                        />
                    </div>
                    <CustomDropdown
                        value={rating}
                        onChange={setRating}
                        ariaLabel="Filter compatibility rating"
                        options={[
                            {value: 'all', label: 'All ratings'},
                            {value: 'A', label: 'A · Ready'},
                            {value: 'B', label: 'B · Browser-limited'},
                            {value: 'C', label: 'C · Review'},
                            {value: 'D', label: 'D · Unresolved'},
                        ]}
                        className="w-full sm:w-52"
                    />
                </div>

                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="max-h-[62vh] overflow-auto scrollbar-thin">
                        <table className="w-full min-w-[1020px] border-collapse text-left text-[10px]">
                            <thead className="sticky top-0 z-10 bg-[var(--background)] text-[8px] uppercase tracking-wider text-[var(--text-muted)]">
                                <tr>
                                    <th className="w-10 px-2 py-2 text-right">#</th>
                                    <th className="px-2 py-2">Rating</th>
                                    <th className="px-2 py-2">Operation</th>
                                    <th className="px-2 py-2">Summary</th>
                                    <th className="px-2 py-2">Auth</th>
                                    <th className="px-2 py-2">Inputs</th>
                                    <th className="px-2 py-2">Request</th>
                                    <th className="px-2 py-2">Responses</th>
                                    <th className="px-2 py-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {endpoints.map((endpoint, index) => (
                                    <tr
                                        key={`${endpoint.method}:${endpoint.path}`}
                                        className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]"
                                    >
                                        <td className="px-2 py-1.5 text-right font-mono font-bold text-[var(--text-muted)]">
                                            {index + 1}
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <span
                                                className={`inline-flex min-w-12 items-center justify-center rounded-md border px-1.5 py-1 font-black ${ratingPresentation[endpoint.rating].tone}`}
                                            >
                                                {endpoint.rating} · {endpoint.score}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onSelectEndpoint(endpoint.path, endpoint.method.toLowerCase())
                                                }
                                                className="flex max-w-[310px] items-center gap-1.5 text-left hover:text-[var(--primary)] cursor-pointer"
                                            >
                                                <MethodBadge method={endpoint.method} size="xs" className="shrink-0" />
                                                <span className="truncate font-mono">{endpoint.path}</span>
                                            </button>
                                        </td>
                                        <TooltipCell value={endpoint.summary} className="max-w-56 px-2 py-1.5" />
                                        <TooltipCell value={endpoint.auth} className="max-w-44 px-2 py-1.5 font-mono" />
                                        <td className="px-2 py-1.5 font-mono">{endpoint.parameterCount}</td>
                                        <TooltipCell
                                            value={endpoint.requestMediaTypes.join(', ') || '—'}
                                            className="max-w-36 px-2 py-1.5 font-mono"
                                        />
                                        <TooltipCell
                                            value={endpoint.responseMediaTypes.join(', ') || '—'}
                                            className="max-w-36 px-2 py-1.5 font-mono"
                                        />
                                        <TooltipCell
                                            value={endpoint.notes.join(' · ') || 'Ready'}
                                            className="max-w-60 px-2 py-1.5"
                                        />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {endpoints.length === 0 && (
                            <p className="p-8 text-center text-xs text-[var(--text-muted)]">
                                No endpoints match these filters.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
