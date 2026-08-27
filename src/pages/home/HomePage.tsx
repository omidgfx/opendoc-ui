import {useState} from 'react';
import {ActiveAuth, OpenApiSpec} from '@/src/types';
import Markdown from '@/src/components/common/Markdown';
import ShareModal from '@/src/components/modals/ShareModal';
import {Tip} from '@/src/components/common/Tooltip';
import {getDocumentOperations, getPathItemOperations} from '@/src/utils/openapi';
import MethodBadge from '@/src/components/common/MethodBadge';
import RunnerCompatibilityReport from './RunnerCompatibilityReport';

interface HomeViewProps {
    spec: OpenApiSpec | null;
    specKey: string;
    activeAuth: ActiveAuth;
    onSelectEndpoint: (path: string, method: string) => void;
    onOpenCompatibility: () => void;
    selectedEndpoint?: {
        path: string;
        method: string;
    } | null;
    selectedServer?: string;
    onSelectServer?: (server: string) => void;
    onDeepLinkResponse?: (path: string, method: string, code: string) => void;
}

export default function HomeView({
    spec,
    specKey,
    activeAuth,
    onSelectEndpoint,
    onOpenCompatibility,
    selectedEndpoint,
    selectedServer,
    onSelectServer,
    onDeepLinkResponse,
}: HomeViewProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [shareModal, setShareModal] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const handleShareSpec = () => {
        const url = typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#response-')[0] : '';
        setShareModal({
            url,
            title: spec?.info?.title || 'API Specification',
            description:
                spec?.info?.description?.slice(0, 200) || `Check out ${spec?.info?.title || 'this API'} documentation`,
        });
    };
    if (!spec) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none opacity-60">
                <span className="w-14 h-14 rounded-full flex items-center justify-center text-lg mb-3 bg-[var(--border)] text-[var(--text-muted)]">
                    <i className="ph ph-spinner animate-spin"></i>
                </span>
                <p className="text-sm font-semibold text-[var(--text-heading)]">Loading API specification details...</p>
            </div>
        );
    }
    const {title, description, version} = spec.info || {title: 'OpenDoc API', description: '', version: '1.0.0'};
    const specLogo = (spec.info as any)?.['x-logo'] as
        {url?: string; altText?: string; href?: string; backgroundColor?: string} | undefined;
    const tagGroups = Array.isArray((spec as any)['x-tagGroups']) ? ((spec as any)['x-tagGroups'] as any[]) : [];
    const generatedAt = typeof (spec as any)['x-generated-at'] === 'string' ? (spec as any)['x-generated-at'] : '';
    const complexityNotes =
        (spec as any)['x-complexity-notes'] && typeof (spec as any)['x-complexity-notes'] === 'object'
            ? ((spec as any)['x-complexity-notes'] as Record<string, any>)
            : null;
    const specMetaFacts = [
        spec.info.summary ? {label: 'Summary', value: spec.info.summary} : null,
        spec.jsonSchemaDialect ? {label: 'JSON Schema dialect', value: spec.jsonSchemaDialect} : null,
        spec.info.termsOfService
            ? {label: 'Terms of service', value: spec.info.termsOfService, href: spec.info.termsOfService}
            : null,
        generatedAt ? {label: 'Generated at', value: generatedAt} : null,
    ].filter(Boolean) as Array<{label: string; value: string; href?: string}>;
    const getEndpointsList = () => {
        const list: Array<{
            path: string;
            method: string;
            summary: string;
            tags: string[];
        }> = [];
        getDocumentOperations(spec).forEach(({path, method, operation}) => {
            list.push({
                path,
                method,
                summary: operation.summary || '',
                tags: operation.tags || ['General'],
            });
        });
        return list;
    };
    const allEndpoints = getEndpointsList();
    const methodCounts = allEndpoints.reduce<Record<string, number>>((counts, endpoint) => {
        const method = endpoint.method.toUpperCase();
        counts[method] = (counts[method] || 0) + 1;
        return counts;
    }, {});
    const methodStatistics = Object.entries(methodCounts).sort(([left], [right]) => {
        const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT', 'QUERY'];
        const leftIndex = order.indexOf(left);
        const rightIndex = order.indexOf(right);
        return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
    });
    const largestMethodCount = Math.max(...methodStatistics.map(([, count]) => count), 1);
    const specificationStatistics = [
        {label: 'Operations', value: allEndpoints.length, icon: 'ph-fill ph-path', color: 'var(--primary)'},
        {
            label: 'Schemas',
            value: Object.keys(spec.components?.schemas || {}).length,
            icon: 'ph-fill ph-diamonds-four',
            color: 'var(--accent)',
        },
        {
            label: 'Tags',
            value: new Set(allEndpoints.flatMap(endpoint => endpoint.tags)).size,
            icon: 'ph-fill ph-tag',
            color: 'var(--method-put)',
        },
        {
            label: 'Servers',
            value: spec.servers?.length || 0,
            icon: 'ph-fill ph-hard-drives',
            color: 'var(--method-get)',
        },
    ];
    const filteredEndpoints = allEndpoints.filter(ep => {
        const term = searchTerm.toLowerCase();
        return (
            ep.path.toLowerCase().includes(term) ||
            ep.method.toLowerCase().includes(term) ||
            ep.summary.toLowerCase().includes(term) ||
            ep.tags.some(t => t.toLowerCase().includes(term))
        );
    });
    const webhookOperations = Object.entries(spec.webhooks || {}).flatMap(([name, pathItem]) =>
        getPathItemOperations(pathItem).map(entry => ({name, ...entry})),
    );
    const unresolvedWebhooks = Object.entries(spec.webhooks || {}).filter(([, pathItem]: [string, any]) =>
        Boolean(pathItem?.$ref),
    );
    const renderSecuritySchemes = () => {
        const schemes = spec.components?.securitySchemes;
        if (!schemes || Object.keys(schemes).length === 0) {
            return (
                <p className="text-xs italic text-[var(--text-muted)]">
                    No security schemes are defined in this specification.
                </p>
            );
        }
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(schemes).map(([key, config]: [string, any]) => (
                    <div key={key} className="p-4 rounded-xl border bg-[var(--surface-hover)] border-[var(--border)]">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs uppercase font-bold px-2 py-0.5 rounded border text-[var(--primary)] bg-[var(--primary)]/5 border-[var(--primary)]/20">
                                {config.type === 'apiKey'
                                    ? 'API Key'
                                    : config.type === 'http'
                                      ? String(config.scheme || '').toLowerCase() === 'basic'
                                          ? 'Basic Auth'
                                          : 'Bearer Token'
                                      : config.type === 'openIdConnect'
                                        ? 'OpenID Connect'
                                        : config.type === 'mutualTLS'
                                          ? 'Mutual TLS'
                                          : config.type}
                            </span>
                            <span className="font-mono text-xs font-bold text-[var(--text-heading)]">{key}</span>
                        </div>
                        {config.description && (
                            <p className="text-[11px] mb-2 text-[var(--text)]">{config.description}</p>
                        )}
                        <ul className="text-[10px] space-y-1 font-mono text-inherit text-[var(--text-muted)]">
                            {config.name && (
                                <li>
                                    Param Name: <span>{config.name}</span>
                                </li>
                            )}
                            {config.in && (
                                <li>
                                    Source In: <span>{config.in}</span>
                                </li>
                            )}
                            {config.scheme && (
                                <li>
                                    HTTP Scheme: <span>{config.scheme}</span>
                                </li>
                            )}
                        </ul>
                    </div>
                ))}
            </div>
        );
    };
    return (
        <div className="flex-1 w-full h-full overflow-y-auto p-3 sm:p-4 md:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0">
            <div className="w-full p-6 md:p-8 rounded-2xl border relative overflow-hidden bg-[var(--surface)] border-[var(--border)]">
                <div className="relative z-10 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="px-2.5 py-1 rounded-full text-[10px] uppercase font-extrabold tracking-wider font-mono border bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">
                                VERSION {version}
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-[10px] uppercase font-extrabold tracking-wider font-mono border opacity-60 bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">
                                {spec.swagger ? `Swagger v${spec.swagger}` : `OAS v${spec.openapi || '3.x'}`}
                            </span>
                        </div>
                        <Tip content="Share this specification">
                            <button
                                onClick={handleShareSpec}
                                className="h-8 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)] hover:opacity-90 shadow-sm"
                            >
                                <i className="ph ph-share-network text-[14px]"></i>
                                <span className="hidden sm:inline">Share Spec</span>
                            </button>
                        </Tip>
                    </div>

                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                            {specLogo?.url && (
                                <div className="flex shrink-0 flex-col items-center gap-1.5">
                                    <div
                                        className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-sm"
                                        style={
                                            specLogo.backgroundColor
                                                ? {backgroundColor: specLogo.backgroundColor}
                                                : undefined
                                        }
                                    >
                                        {specLogo.href ? (
                                            <a
                                                href={specLogo.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex h-full w-full items-center justify-center"
                                            >
                                                <img
                                                    src={specLogo.url}
                                                    alt={specLogo.altText || `${title} logo`}
                                                    className="max-h-full max-w-full object-contain"
                                                />
                                            </a>
                                        ) : (
                                            <img
                                                src={specLogo.url}
                                                alt={specLogo.altText || `${title} logo`}
                                                className="max-h-full max-w-full object-contain"
                                            />
                                        )}
                                    </div>
                                    {specLogo.altText && specLogo.altText !== title && (
                                        <span className="max-w-24 text-center text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                            {specLogo.altText}
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="min-w-0 space-y-1">
                                <h1 className="text-2xl md:text-3.5xl font-extrabold tracking-tight text-[var(--text-heading)] break-words">
                                    {title}
                                </h1>
                                <p className="text-xs text-[var(--text-muted)]">
                                    Specification Landing Hub & Overview Portal
                                </p>
                                {spec.info.summary && (
                                    <p className="max-w-3xl text-sm leading-relaxed text-[var(--text)]">
                                        {spec.info.summary}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    {specMetaFacts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {specMetaFacts.map(fact => (
                                <span
                                    key={fact.label}
                                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]"
                                >
                                    <span className="font-black uppercase tracking-wider">{fact.label}</span>
                                    {fact.href ? (
                                        <a
                                            href={fact.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="truncate font-mono text-[var(--primary)] hover:underline"
                                        >
                                            {fact.value}
                                        </a>
                                    ) : (
                                        <code className="truncate font-mono text-[var(--text-heading)]">
                                            {fact.value}
                                        </code>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="absolute right-0 bottom-0 top-0 w-1/3 pointer-events-none opacity-[0.03] flex items-center justify-center select-none">
                    <i className="ph ph-file-text text-[160px] text-[var(--primary)]"></i>
                </div>
            </div>

            <section data-specification-statistics className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Specification Statistics
                        </h2>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            Loaded as{' '}
                            <code className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-heading)]">
                                {specKey || 'default'}
                            </code>
                        </p>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">
                        Method bars use the active theme&apos;s HTTP colors.
                    </span>
                </div>
                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(460px,1.15fr)]">
                    <div className="grid grid-cols-2 gap-2">
                        {specificationStatistics.map(statistic => (
                            <div
                                key={statistic.label}
                                className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                            >
                                <span
                                    className="flex size-8 items-center justify-center rounded-xl"
                                    style={{
                                        backgroundColor: `color-mix(in srgb, ${statistic.color} 12%, transparent)`,
                                        color: statistic.color,
                                    }}
                                >
                                    <i className={`${statistic.icon} text-[16px]`} />
                                </span>
                                <strong className="mt-3 block text-2xl font-black text-[var(--text-heading)]">
                                    {statistic.value}
                                </strong>
                                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                    {statistic.label}
                                </span>
                                <span
                                    className="absolute inset-x-0 bottom-0 h-0.5"
                                    style={{backgroundColor: statistic.color}}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-xs font-extrabold text-[var(--text-heading)]">
                                    Operations by method
                                </h3>
                                <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">
                                    Relative operation count in this document
                                </p>
                            </div>
                            <i className="ph ph-chart-bar text-[18px] text-[var(--text-muted)]" />
                        </div>
                        {methodStatistics.length > 0 ? (
                            <div className="mt-4 flex h-44 min-w-0 items-end gap-2 border-b border-[var(--border)] px-1 sm:gap-3">
                                {methodStatistics.map(([method, count]) => {
                                    const color = `var(--method-${method.toLowerCase()}, var(--primary))`;
                                    const height = Math.max(10, (count / largestMethodCount) * 100);
                                    return (
                                        <Tip
                                            key={method}
                                            content={`${method}: ${count} operation${count === 1 ? '' : 's'}`}
                                            wrapperClassName="h-full min-w-0 flex-1"
                                        >
                                            <div className="group flex h-full w-full min-w-0 flex-col items-center justify-end gap-1.5">
                                                <span className="font-mono text-[10px] font-black text-[var(--text-heading)]">
                                                    {count}
                                                </span>
                                                <div className="flex h-[118px] w-full max-w-12 items-end rounded-t-lg bg-[var(--background)]">
                                                    <div
                                                        className="w-full rounded-t-lg transition-[height,opacity] duration-300 group-hover:opacity-80"
                                                        style={{height: `${height}%`, backgroundColor: color}}
                                                    />
                                                </div>
                                                <span
                                                    className="max-w-full truncate font-mono text-[8px] font-black"
                                                    style={{color}}
                                                >
                                                    {method}
                                                </span>
                                            </div>
                                        </Tip>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-4 flex h-44 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)]">
                                No path operations are declared.
                            </div>
                        )}
                    </div>
                </div>
                <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
                    OpenDoc renders from a derived in-memory view for consistent browsing; the original OpenAPI or
                    Swagger source remains unchanged. Runner requests are sent directly from this browser to the
                    selected server.
                </p>
            </section>

            {(spec.info.contact || spec.info.license || tagGroups.length > 0 || complexityNotes) && (
                <section className="space-y-4">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Document Identity & Extensions
                        </h2>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            Additional specification metadata beyond paths, schemas, and responses.
                        </p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <div className="space-y-4">
                            {(spec.info.contact || spec.info.license) && (
                                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                                    <h3 className="text-xs font-extrabold text-[var(--text-heading)]">
                                        Publisher metadata
                                    </h3>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {spec.info.contact && (
                                            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                                                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                                    Contact
                                                </div>
                                                <div className="mt-2 space-y-1 text-[var(--text)]">
                                                    {spec.info.contact.name && <div>{spec.info.contact.name}</div>}
                                                    {spec.info.contact.email && (
                                                        <a
                                                            href={`mailto:${spec.info.contact.email}`}
                                                            className="text-[var(--primary)] hover:underline"
                                                        >
                                                            {spec.info.contact.email}
                                                        </a>
                                                    )}
                                                    {spec.info.contact.url && (
                                                        <a
                                                            href={spec.info.contact.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block break-all text-[var(--primary)] hover:underline"
                                                        >
                                                            {spec.info.contact.url}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {spec.info.license && (
                                            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                                                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                                    License
                                                </div>
                                                <div className="mt-2 space-y-1 text-[var(--text)]">
                                                    <div>{spec.info.license.name}</div>
                                                    {spec.info.license.identifier && (
                                                        <code className="inline-block rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-heading)]">
                                                            {spec.info.license.identifier}
                                                        </code>
                                                    )}
                                                    {spec.info.license.url && (
                                                        <a
                                                            href={spec.info.license.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block break-all text-[var(--primary)] hover:underline"
                                                        >
                                                            {spec.info.license.url}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {tagGroups.length > 0 && (
                                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-xs font-extrabold text-[var(--text-heading)]">
                                            Tag groups
                                        </h3>
                                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                            x-tagGroups
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-3">
                                        {tagGroups.map((group: any, index: number) => (
                                            <div
                                                key={`${group.name || 'group'}:${index}`}
                                                className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
                                            >
                                                <div className="text-[11px] font-bold text-[var(--text-heading)]">
                                                    {group.name || `Group ${index + 1}`}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {(Array.isArray(group.tags) ? group.tags : []).map(
                                                        (tag: string) => (
                                                            <span
                                                                key={`${group.name}:${tag}`}
                                                                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text)]"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {complexityNotes && (
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xs font-extrabold text-[var(--text-heading)]">
                                        Complexity notes
                                    </h3>
                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                        x-complexity-notes
                                    </span>
                                </div>
                                <div className="mt-3 space-y-2 text-xs text-[var(--text)]">
                                    {Object.entries(complexityNotes).map(([key, value]) => (
                                        <div
                                            key={key}
                                            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                                        >
                                            <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                                {key}
                                            </div>
                                            <div className="mt-1">
                                                {Array.isArray(value) ? (
                                                    <ul className="list-disc space-y-1 ps-4">
                                                        {value.map((item, index) => (
                                                            <li key={`${key}:${index}`}>{String(item)}</li>
                                                        ))}
                                                    </ul>
                                                ) : typeof value === 'object' && value !== null ? (
                                                    <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-[var(--surface)] px-2 py-2 font-mono text-[10px] text-[var(--text-heading)]">
                                                        {JSON.stringify(value, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-heading)]">
                                                        {String(value)}
                                                    </code>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            <RunnerCompatibilityReport
                spec={spec}
                onSelectEndpoint={onSelectEndpoint}
                onOpenCompatibility={onOpenCompatibility}
            />

            <div className="w-full flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 min-w-0 space-y-8">
                    {(description || spec.externalDocs) && (
                        <div className="space-y-3">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                About this Specification
                            </h2>
                            <div className="p-6 flex gap-6 rounded-2xl border max-w-none prose text-sm leading-relaxed space-y-4 bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">
                                {description && <Markdown text={description} />}
                                {spec.externalDocs && spec.externalDocs.url && (
                                    <div className="pt-3 border-t mt-3 flex flex-col gap-1.5 border-[var(--border)]">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Specification Reference Docs
                                        </p>
                                        <div>
                                            <a
                                                href={spec.externalDocs.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--primary-contrast)] transition-all hover:opacity-90 cursor-pointer shadow-sm select-none bg-[var(--primary)]"
                                            >
                                                <i className="ph ph-arrow-square-out text-[10px]"></i>
                                                <span>
                                                    {spec.externalDocs.description || 'View External Documentation'}
                                                </span>
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {spec.servers && spec.servers.length > 0 && (
                        <div className="space-y-3">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Configured Edge Servers
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {spec.servers.map((srv, sIdx) => (
                                    <div
                                        key={sIdx}
                                        className="p-4 rounded-xl border flex flex-col gap-2 shadow-sm bg-[var(--surface)] border-[var(--border)]"
                                    >
                                        <div className="font-bold text-xs text-[var(--text-heading)]">
                                            {srv.description || `Root Server #${sIdx + 1}`}
                                        </div>
                                        <div className="font-mono text-xs select-all px-2.5 py-1.5 rounded-lg border flex items-center justify-between bg-[var(--background)] border-[var(--border)] text-[var(--primary)]">
                                            <span className="truncate mr-2">{srv.url}</span>
                                            <i className="ph ph-link text-[10px] opacity-70"></i>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(webhookOperations.length > 0 || unresolvedWebhooks.length > 0) && (
                        <div className="space-y-3">
                            <div>
                                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    Webhooks
                                </h2>
                                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                                    Incoming operations initiated by the API provider. They are documented here but are
                                    not sent by the API Runner.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {webhookOperations.map(({name, method, operation}) => (
                                    <div
                                        key={`${name}:${method}`}
                                        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                                    >
                                        <div className="flex items-center gap-2">
                                            <MethodBadge method={method} size="xs" />
                                            <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                                                {name}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                                            {operation.summary || operation.description || 'Incoming webhook operation'}
                                        </p>
                                        <span className="mt-2 inline-flex rounded bg-[var(--background)] px-2 py-1 text-[9px] font-bold text-[var(--text-muted)]">
                                            Documentation only
                                        </span>
                                    </div>
                                ))}
                                {unresolvedWebhooks.map(([name, pathItem]: [string, any]) => (
                                    <div
                                        key={name}
                                        className="rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 p-4 text-xs"
                                    >
                                        <strong className="text-[var(--text-heading)]">{name}</strong>
                                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                                            Unresolved reference: <code>{pathItem.$ref}</code>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Security & Credentialing Methods
                        </h2>
                        <div className="p-6 rounded-2xl border bg-[var(--surface)] border-[var(--border)]">
                            {renderSecuritySchemes()}
                        </div>
                    </div>
                </div>
            </div>

            {shareModal && (
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            )}
        </div>
    );
}
