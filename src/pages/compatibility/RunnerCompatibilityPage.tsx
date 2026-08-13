import {useMemo, useState} from 'react';
import type {OpenApiSpec} from '../../types';
import CustomDropdown from '../../components/common/CustomDropdown';
import MethodBadge from '../../components/common/MethodBadge';
import ReferenceStatusNotice from '../../components/common/ReferenceStatusNotice';
import {collectReferenceIssues, createBundledOpenApiDocument, missingReferenceDocuments} from '../../utils/openapi';
import {analyzeRunnerCompatibility, type RunnerCompatibilityRating} from '../../utils/runnerCompatibility';
import {getRawSpecDocument} from '../../utils/specSource';
import {createLlmsText} from '../../utils/llmsExport';

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

const ratingTone: Record<RunnerCompatibilityRating, string> = {
    A: 'bg-[var(--method-get)]/10 text-[var(--method-get)] border-[var(--method-get)]/25',
    B: 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/25',
    C: 'bg-[var(--method-put)]/10 text-[var(--method-put)] border-[var(--method-put)]/25',
    D: 'bg-[var(--method-delete)]/10 text-[var(--method-delete)] border-[var(--method-delete)]/25',
};

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
    const safeName = (spec.info?.title || specKey || 'openapi').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
    const raw = getRawSpecDocument(spec);
    return (
        <div className="flex-1 h-full overflow-y-auto p-3 sm:p-5 md:p-7 scrollbar-thin">
            <div className="space-y-4">
                <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h1 className="text-xl font-extrabold text-[var(--text-heading)]">Runner Compatibility</h1>
                        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-[var(--text-muted)]">
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
                                    'application/json',
                                )
                            }
                            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[10px] font-bold hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            <i className="ph ph-download-simple me-1" /> Original
                        </button>
                        <button
                            type="button"
                            disabled={issues.some(issue => issue.status === 'unresolved')}
                            title={
                                issues.some(issue => issue.status === 'unresolved')
                                    ? 'Add the missing referenced files before creating a bundled copy.'
                                    : 'Download a derived self-contained copy; the original remains unchanged.'
                            }
                            onClick={() =>
                                downloadText(
                                    JSON.stringify(createBundledOpenApiDocument(spec), null, 2),
                                    `${safeName || 'openapi'}-bundled.json`,
                                    'application/json',
                                )
                            }
                            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[10px] font-bold hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                            <i className="ph ph-package me-1" /> Bundled copy
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                downloadText(createLlmsText(spec), `${safeName || 'openapi'}-llms.txt`, 'text/plain')
                            }
                            className="rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
                        >
                            <i className="ph ph-robot me-1" /> llms.txt
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {[
                        ['Operations', report.totalOperations],
                        ['Standard', report.standardOperations],
                        ['Review', report.reviewOperations],
                        ['Browser', report.browserLimitedOperations],
                        ['Binary', report.binaryOperations],
                        ['Unresolved', report.unresolvedOperations],
                    ].map(([label, value]) => (
                        <div
                            key={String(label)}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                        >
                            <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                {label}
                            </span>
                            <strong className="mt-1 block text-xl text-[var(--text-heading)]">{value}</strong>
                        </div>
                    ))}
                </div>

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
                        <table className="w-full min-w-[980px] border-collapse text-left text-[10px]">
                            <thead className="sticky top-0 z-10 bg-[var(--background)] text-[8px] uppercase tracking-wider text-[var(--text-muted)]">
                                <tr>
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
                                {endpoints.map(endpoint => (
                                    <tr
                                        key={`${endpoint.method}:${endpoint.path}`}
                                        className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]"
                                    >
                                        <td className="px-2 py-1.5">
                                            <span
                                                className={`inline-flex min-w-12 items-center justify-center rounded-md border px-1.5 py-1 font-black ${ratingTone[endpoint.rating]}`}
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
                                        <td className="max-w-56 truncate px-2 py-1.5" title={endpoint.summary}>
                                            {endpoint.summary}
                                        </td>
                                        <td className="max-w-44 truncate px-2 py-1.5 font-mono" title={endpoint.auth}>
                                            {endpoint.auth}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono">{endpoint.parameterCount}</td>
                                        <td
                                            className="max-w-36 truncate px-2 py-1.5 font-mono"
                                            title={endpoint.requestMediaTypes.join(', ')}
                                        >
                                            {endpoint.requestMediaTypes.join(', ') || '—'}
                                        </td>
                                        <td
                                            className="max-w-36 truncate px-2 py-1.5 font-mono"
                                            title={endpoint.responseMediaTypes.join(', ')}
                                        >
                                            {endpoint.responseMediaTypes.join(', ') || '—'}
                                        </td>
                                        <td
                                            className="max-w-60 truncate px-2 py-1.5"
                                            title={endpoint.notes.join(' · ')}
                                        >
                                            {endpoint.notes.join(' · ') || 'Ready'}
                                        </td>
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
