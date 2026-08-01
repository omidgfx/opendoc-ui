import React, {useEffect, useMemo, useRef, useState} from 'react';
import * as jsYaml from 'js-yaml';
import clsx from 'clsx';
import {OpenApiSpec, Parsable, ParsableConfig} from '../../types';
import {normalizeOpenApiSpec} from '../../utils/openapi';
import {fetchSpecText} from '../../utils/specCache';
import {Tip} from '../common/Tooltip';
import type {LocalHistoryEntry} from '../../utils/localHistory';

type ApiSpecificationSelectorModalProps = {
    isOpen: boolean;
    specifications: ParsableConfig;
    selectedKey: string;
    activeSpecification: OpenApiSpec | null;
    isLocalMode: boolean;
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    localHistory: LocalHistoryEntry[];
    onSelectHistoryEntry: (entry: LocalHistoryEntry) => void;
    onRemoveHistoryEntry: (key: string) => void;
    onClearHistory: () => void;
    localOpenError: string | null;
    onDismissLocalError: () => void;
    onSelect: (key: string) => void;
    onClose: () => void;
};

type SpecificationSummary = {
    title: string;
    version: string;
    formatVersion: string;
    description: string;
    endpointCount: number;
    schemaCount: number;
    tagCount: number;
    serverCount: number;
    securedEndpointCount: number;
    methods: string[];
};

type SummaryState = {
    status: 'loading' | 'ready' | 'error';
    summary?: SpecificationSummary;
    message?: string;
};

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

const summarizeSpecification = (spec: OpenApiSpec): SpecificationSummary => {
    let endpointCount = 0;
    let securedEndpointCount = 0;
    const tags = new Set<string>();
    const methods = new Set<string>();

    Object.values(spec.paths || {}).forEach((pathItem) => {
        Object.entries(pathItem || {}).forEach(([method, operation]) => {
            if (!HTTP_METHODS.includes(method.toLowerCase())) return;
            endpointCount += 1;
            methods.add(method.toUpperCase());
            const op = operation as any;
            (op?.tags || ['General']).forEach((tag: string) => tags.add(tag));
            const security = op?.security === undefined ? spec.security : op.security;
            if (Array.isArray(security) && security.length > 0) securedEndpointCount += 1;
        });
    });

    return {
        title: spec.info?.title || 'Untitled API',
        version: spec.info?.version || 'Not specified',
        formatVersion: spec.openapi || spec.swagger || 'OpenAPI',
        description: spec.info?.description || 'No description is provided for this API specification.',
        endpointCount,
        schemaCount: Object.keys(spec.components?.schemas || {}).length,
        tagCount: tags.size,
        serverCount: spec.servers?.length || 0,
        securedEndpointCount,
        methods: Array.from(methods).sort()
    };
};

const parseSpecification = (text: string): OpenApiSpec => {
    const trimmed = text.trim();
    const parsed = trimmed.startsWith('{') || trimmed.startsWith('[')
        ? JSON.parse(text)
        : jsYaml.load(text);
    return normalizeOpenApiSpec(parsed);
};

const loadSpecification = async (item: Parsable): Promise<OpenApiSpec> => {
    if (item.rawSpec) return parseSpecification(item.rawSpec);
    if (!item.url) throw new Error('No source URL is configured.');

    const raw = await fetchSpecText(item.url);
    return parseSpecification(raw);
};

const formatRelativeTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
};

export default function ApiSpecificationSelectorModal({
                                                          isOpen,
                                                          specifications,
                                                          selectedKey,
                                                          activeSpecification,
                                                          isLocalMode,
                                                          canOpenLocal,
                                                          onOpenLocalFile,
                                                          localHistory,
                                                          onSelectHistoryEntry,
                                                          onRemoveHistoryEntry,
                                                          onClearHistory,
                                                          localOpenError,
                                                          onDismissLocalError,
                                                          onSelect,
                                                          onClose
                                                      }: ApiSpecificationSelectorModalProps) {
    const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
    const entries = useMemo(() => Object.entries(specifications), [specifications]);

    const prevActiveSpecRef = useRef<OpenApiSpec | null>(null);

    // In local mode, closing the file picker or picking a history entry yields a
    // new active specification; once it changes the modal has done its job.
    useEffect(() => {
        if (!isOpen) return;
        if (isLocalMode) {
            if (prevActiveSpecRef.current && prevActiveSpecRef.current !== activeSpecification) {
                onClose();
            }
            prevActiveSpecRef.current = activeSpecification;
        }
    }, [isOpen, isLocalMode, activeSpecification, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const initial: Record<string, SummaryState> = {};
        entries.forEach(([key]) => {
            initial[key] = key === selectedKey && activeSpecification
                ? {status: 'ready', summary: summarizeSpecification(activeSpecification)}
                : {status: 'loading'};
        });
        setSummaries(initial);

        entries.forEach(async ([key, item]) => {
            if (key === selectedKey && activeSpecification) return;
            try {
                const loaded = await loadSpecification(item);
                if (!cancelled) {
                    setSummaries((current) => ({
                        ...current,
                        [key]: {status: 'ready', summary: summarizeSpecification(loaded)}
                    }));
                }
            } catch (error) {
                if (!cancelled) {
                    setSummaries((current) => ({
                        ...current,
                        [key]: {
                            status: 'error',
                            message: error instanceof Error ? error.message : 'Unable to inspect this specification.'
                        }
                    }));
                }
            }
        });

        return () => {
            cancelled = true;
        };
    }, [isOpen, entries, selectedKey, activeSpecification]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-specification-selector-title"
                className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl animate-zoom-in"
            >
                <header
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 sm:px-5 py-2.5 sm:py-4 shrink-0 modal-header-mobile-pad">
                    <div className="flex min-w-0 items-center gap-3">
                        <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className={clsx('ph-fill text-[18px]', isLocalMode ? 'ph-folder-open' : 'ph-files')}/>
                        </span>
                        <div className="min-w-0">
                            <h2 id="api-specification-selector-title"
                                className="text-sm font-extrabold text-[var(--text-heading)]">
                                {isLocalMode ? 'Open specification' : 'API Specifications'}
                            </h2>
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                {isLocalMode
                                    ? 'Open a JSON or YAML descriptor from your device, or pick one from your history.'
                                    : 'Choose a specification and review its contents before opening it.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isLocalMode && canOpenLocal && (
                            <Tip content="Open JSON / YAML from your device">
                                <button
                                    type="button"
                                    onClick={onOpenLocalFile}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--primary)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                    aria-label="Open a specification file from your device"
                                >
                                    <i className="ph-fill ph-folder-open text-[15px]"/>
                                </button>
                            </Tip>
                        )}
                        <Tip content="Close">
                            <button
                                type="button"
                                onClick={onClose}
                                autoFocus
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                aria-label="Close API specification selector"
                            >
                                <i className="ph ph-x"/>
                            </button>
                        </Tip>
                    </div>
                </header>

                {isLocalMode ? (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
                        {localOpenError && (
                            <div
                                className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-3.5 py-2.5 text-[11px] text-[var(--method-delete)]">
                                <i className="ph ph-warning-circle text-[14px]"/>
                                <span className="flex-1">{localOpenError}</span>
                                <button type="button" onClick={onDismissLocalError}
                                        className="cursor-pointer text-[var(--method-delete)] hover:opacity-70">
                                    <i className="ph ph-x text-[12px]"/>
                                </button>
                            </div>
                        )}

                        {canOpenLocal && (
                            <button
                                type="button"
                                onClick={onOpenLocalFile}
                                className="w-full rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] p-6 text-center transition-all cursor-pointer hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/5 group"
                            >
                                <span
                                    className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition-colors group-hover:border-[var(--primary)]/40">
                                    <i className="ph-fill ph-folder-plus text-[20px]"/>
                                </span>
                                <span className="mt-3 block text-sm font-extrabold text-[var(--text-heading)]">
                                    Open a specification file
                                </span>
                                <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                                    Swagger 2.x &amp; OpenAPI 3.x · JSON or YAML · stays on your device
                                </span>
                            </button>
                        )}

                        <div className="mt-5 mb-2 flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                                Recently opened · {localHistory.length}
                            </span>
                            {localHistory.length > 0 && (
                                <button type="button" onClick={onClearHistory}
                                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer">
                                    <i className="ph ph-trash text-[11px]"/>
                                    Clear history
                                </button>
                            )}
                        </div>

                        {localHistory.length === 0 ? (
                            <p className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center text-[11px] text-[var(--text-muted)]">
                                Nothing opened yet. Files you open are listed here and kept in your
                                browser&apos;s local storage.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {localHistory.map((entry) => {
                                    const selected = entry.key === selectedKey;
                                    return (
                                        <div key={entry.key}
                                             className={clsx(
                                                 'flex items-center gap-3 rounded-2xl border p-3 transition-all',
                                                 selected
                                                     ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                                                     : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]/50'
                                             )}>
                                            <span
                                                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                                                <i className="ph-fill ph-file-code text-[14px]"/>
                                            </span>
                                            <button type="button" onClick={() => onSelectHistoryEntry(entry)}
                                                    className="min-w-0 flex-1 text-left cursor-pointer">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-xs font-extrabold text-[var(--text-heading)]">
                                                        {entry.title}
                                                    </span>
                                                    {selected && (
                                                        <span
                                                            className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--primary-contrast)]">
                                                            Current
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 block truncate font-mono text-[9.5px] text-[var(--text-muted)]">
                                                    {entry.fileName} · {formatRelativeTime(entry.openedAt)}
                                                </span>
                                            </button>
                                            <button type="button"
                                                    onClick={() => onRemoveHistoryEntry(entry.key)}
                                                    className="size-7 shrink-0 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                                    aria-label={`Remove ${entry.title} from history`}>
                                                <i className="ph ph-x text-[13px]"/>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
                            <div className="space-y-3">
                                {entries.map(([key, item]) => {
                                    const state = summaries[key] || {status: 'loading'};
                                    const summary = state.summary;
                                    const selected = key === selectedKey;

                                    return (
                                        <button
                                            type="button"
                                            key={key}
                                            onClick={() => {
                                                onSelect(key);
                                                onClose();
                                            }}
                                            className={clsx(
                                                'w-full rounded-2xl border p-4 text-left transition-all cursor-pointer',
                                                selected
                                                    ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm'
                                                    : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface-hover)]'
                                            )}
                                            aria-pressed={selected}
                                        >
                                            <div className="flex items-start gap-4">
                                                <span className={clsx(
                                                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-[17px]',
                                                    selected
                                                        ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]'
                                                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
                                                )}>
                                                    <i className="ph-fill ph-file-code"/>
                                                </span>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="truncate text-sm font-extrabold text-[var(--text-heading)]">
                                                                    {item.title || key}
                                                                </h3>
                                                                {selected && (
                                                                    <span
                                                                        className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--primary-contrast)]">
                                                                        Current
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {summary && summary.title !== (item.title || key) && (
                                                                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{summary.title}</p>
                                                            )}
                                                        </div>
                                                        {summary && (
                                                            <span
                                                                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[9px] text-[var(--text-muted)]">
                                                                {summary.formatVersion} · v{summary.version}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {state.status === 'loading' && (
                                                        <div
                                                            className="mt-4 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                                            <i className="ph ph-spinner animate-spin text-[var(--primary)]"/>
                                                            Inspecting specification…
                                                        </div>
                                                    )}

                                                    {state.status === 'error' && (
                                                        <div
                                                            className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-3 py-2 text-[10px] text-[var(--method-delete)]">
                                                            <i className="ph ph-warning-circle"/>
                                                            {state.message}
                                                        </div>
                                                    )}

                                                    {summary && (
                                                        <>
                                                            <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-[var(--text)]">
                                                                {summary.description}
                                                            </p>
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {[
                                                                    ['Endpoints', summary.endpointCount, 'ph-path'],
                                                                    ['Schemas', summary.schemaCount, 'ph-diamonds-four'],
                                                                    ['Groups', summary.tagCount, 'ph-folders'],
                                                                    ['Servers', summary.serverCount, 'ph-hard-drives'],
                                                                    ['Secured', summary.securedEndpointCount, 'ph-lock-key']
                                                                ].map(([label, value, icon]) => (
                                                                    <span
                                                                        key={String(label)}
                                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[9px] text-[var(--text-muted)]"
                                                                    >
                                                                        <i className={`ph ${icon}`}/>
                                                                        <strong
                                                                            className="text-[var(--text-heading)]">{value}</strong> {label}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            {summary.methods.length > 0 && (
                                                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                                    <span
                                                                        className="mr-1 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">Methods</span>
                                                                    {summary.methods.map((method) => (
                                                                        <span key={method}
                                                                              className="rounded bg-[var(--primary)]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[var(--primary)]">
                                                                            {method}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                <i className="ph ph-caret-right mt-3 shrink-0 text-[12px] text-[var(--text-muted)]"/>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                <footer
                    className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-5 py-3 text-[10px] text-[var(--text-muted)]">
                    {isLocalMode ? (
                        <span>{localHistory.length} spec{localHistory.length === 1 ? '' : 's'} in local history</span>
                    ) : (
                        <span>{entries.length} API specification{entries.length === 1 ? '' : 's'} available</span>
                    )}
                    <button type="button" onClick={onClose}
                            className="rounded-xl border border-[var(--border)] px-4 py-2 font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer">
                        Cancel
                    </button>
                </footer>
            </section>
        </div>
    );
}
