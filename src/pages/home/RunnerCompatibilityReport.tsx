import {useMemo} from 'react';
import type {OpenApiSpec} from '@/src/types';
import {
    analyzeRunnerCompatibility,
    type RunnerCompatibilityCategory,
    type RunnerCompatibilityFinding,
} from '@/src/utils/runnerCompatibility';

interface RunnerCompatibilityReportProps {
    spec: OpenApiSpec;
    onSelectEndpoint: (path: string, method: string) => void;
}

const presentation: Record<
    RunnerCompatibilityCategory,
    {label: string; icon: string; border: string; background: string; text: string}
> = {
    unresolved: {
        label: 'Unresolved',
        icon: 'ph-link-break',
        border: 'border-[var(--method-delete)]/30',
        background: 'bg-[var(--method-delete)]/5',
        text: 'text-[var(--method-delete)]',
    },
    partial: {
        label: 'Review',
        icon: 'ph-warning',
        border: 'border-[var(--method-put)]/30',
        background: 'bg-[var(--method-put)]/5',
        text: 'text-[var(--method-put)]',
    },
    browser: {
        label: 'Browser limit',
        icon: 'ph-browser',
        border: 'border-[var(--primary)]/25',
        background: 'bg-[var(--primary)]/5',
        text: 'text-[var(--primary)]',
    },
    binary: {
        label: 'Binary-safe',
        icon: 'ph-file-zip',
        border: 'border-[var(--accent)]/30',
        background: 'bg-[var(--accent)]/5',
        text: 'text-[var(--accent)]',
    },
};

const Finding = ({
    finding,
    onSelectEndpoint,
}: {
    finding: RunnerCompatibilityFinding;
    onSelectEndpoint: (path: string, method: string) => void;
}) => {
    const tone = presentation[finding.category];
    const visibleEndpoints = finding.endpoints.slice(0, 5);
    return (
        <div className={`rounded-xl border p-3 ${tone.border} ${tone.background}`}>
            <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${tone.text}`}>
                    <i className={`ph ${tone.icon} text-[15px]`} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xs font-extrabold text-[var(--text-heading)]">{finding.title}</h3>
                        <span className={`text-[8px] font-black uppercase tracking-wider ${tone.text}`}>
                            {tone.label} · {finding.endpoints.length}
                        </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{finding.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {visibleEndpoints.map(endpoint => (
                            <button
                                key={`${endpoint.method}:${endpoint.path}`}
                                type="button"
                                onClick={() => onSelectEndpoint(endpoint.path, endpoint.method.toLowerCase())}
                                title={endpoint.summary}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-left font-mono text-[9px] text-[var(--text-heading)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                <span className={`shrink-0 font-black ${tone.text}`}>{endpoint.method}</span>
                                <span className="max-w-[260px] truncate">{endpoint.path}</span>
                            </button>
                        ))}
                        {finding.endpoints.length > visibleEndpoints.length && (
                            <span className="inline-flex items-center rounded-lg px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)]">
                                +{finding.endpoints.length - visibleEndpoints.length} more
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function RunnerCompatibilityReport({spec, onSelectEndpoint}: RunnerCompatibilityReportProps) {
    const report = useMemo(() => analyzeRunnerCompatibility(spec), [spec]);
    const summary = [
        {
            label: 'Operations',
            value: report.totalOperations,
            detail: 'statically inspected',
            color: 'text-[var(--text-heading)]',
        },
        {
            label: 'No static limits',
            value: report.standardOperations,
            detail: 'standard browser requests',
            color: 'text-[var(--method-get)]',
        },
        {
            label: 'Needs review',
            value: report.reviewOperations,
            detail: 'partial or unresolved',
            color: 'text-[var(--method-put)]',
        },
        {
            label: 'Browser-limited',
            value: report.browserLimitedOperations,
            detail: 'cookies, headers, or transport',
            color: 'text-[var(--primary)]',
        },
        {
            label: 'Declared binary',
            value: report.binaryOperations,
            detail: 'stream cancelled safely',
            color: 'text-[var(--accent)]',
        },
    ];

    return (
        <section data-runner-compatibility-report className="space-y-3">
            <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Runner Compatibility
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    A static preflight of this specification against OpenDoc&apos;s browser Runner. This report cannot
                    predict CORS, DNS, authentication state, server behavior, or payloads omitted or mislabeled by the
                    specification.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {summary.map(item => (
                    <div
                        key={item.label}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
                    >
                        <span className="block text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            {item.label}
                        </span>
                        <strong className={`mt-1 block text-xl font-extrabold ${item.color}`}>{item.value}</strong>
                        <span className="mt-0.5 block text-[9px] text-[var(--text-muted)]">{item.detail}</span>
                    </div>
                ))}
            </div>
            {report.findings.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    {report.findings.map(finding => (
                        <Finding key={finding.id} finding={finding} onSelectEndpoint={onSelectEndpoint} />
                    ))}
                </div>
            ) : (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--method-get)]/25 bg-[var(--method-get)]/5 px-3 py-3 text-xs text-[var(--text)]">
                    <i className="ph ph-check-circle text-[16px] text-[var(--method-get)]" />
                    No statically detectable Runner limitations were found.
                </div>
            )}
        </section>
    );
}
