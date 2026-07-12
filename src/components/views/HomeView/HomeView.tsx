import {useState} from 'react';
import {ActiveAuth, OpenApiSpec} from '../../../types';
import Markdown from '../../common/Markdown';
import ShareModal from '../../modals/ShareModal';
import { useEscClose } from '../../../hooks/useEscClose';
import { Tip } from '../../common/Tooltip';

interface HomeViewProps {
    spec: OpenApiSpec | null;
    activeAuth: ActiveAuth;
    onSelectEndpoint: (path: string, method: string) => void;
    selectedEndpoint?: { path: string; method: string; } | null;
    selectedServer?: string;
    onSelectServer?: (server: string) => void;
    onDeepLinkResponse?: (path: string, method: string, code: string) => void;
}

export default function HomeView({
                                     spec,
                                     activeAuth,
                                     onSelectEndpoint,
                                     selectedEndpoint,
                                     selectedServer,
                                     onSelectServer,
                                     onDeepLinkResponse
                                 }: HomeViewProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [shareModal, setShareModal] = useState<{ url: string; title: string; description?: string } | null>(null);

    useEscClose(!!shareModal, () => setShareModal(null), !!shareModal);

    const handleShareSpec = () => {
        const url = typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#response-')[0] : '';
        // Ensure spec home link - strip endpoint/api part, keep only parsable home
        // For simplicity use current href which should be spec home when in HomeView
        setShareModal({
            url,
            title: spec?.info?.title || 'API Specification',
            description: spec?.info?.description?.slice(0, 200) || `Check out ${spec?.info?.title || 'this API'} documentation`
        });
    };

    if (!spec) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none opacity-60">
                <span
                    className="w-14 h-14 rounded-full flex items-center justify-center text-lg mb-3 bg-[var(--border)] text-[var(--text-muted)]">

                    <i className="ph ph-spinner animate-spin"></i>
                </span>
                <p className="text-sm font-semibold text-[var(--text-heading)]">Loading API specification
                    details...</p>
            </div>);

    }

    const {title, description, version} = spec.info || {title: 'OpenDoc API', description: '', version: '1.0.0'};

    // Calculate endpoints
    const getEndpointsList = () => {
        const list: Array<{ path: string; method: string; summary: string; tags: string[]; }> = [];
        if (!spec.paths) return list;

        Object.entries(spec.paths).forEach(([pStr, pItem]: [string, any]) => {
            Object.entries(pItem).forEach(([mStr, op]: [string, any]) => {
                if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(mStr.toLowerCase())) {
                    list.push({
                        path: pStr,
                        method: mStr.toLowerCase(),
                        summary: op.summary || '',
                        tags: op.tags || ['General']
                    });
                }
            });
        });

        return list;
    };

    const allEndpoints = getEndpointsList();
    const filteredEndpoints = allEndpoints.filter((ep) => {
        const term = searchTerm.toLowerCase();
        return (
            ep.path.toLowerCase().includes(term) ||
            ep.method.toLowerCase().includes(term) ||
            ep.summary.toLowerCase().includes(term) ||
            ep.tags.some((t) => t.toLowerCase().includes(term)));

    });

    const renderSecuritySchemes = () => {
        const schemes = spec.components?.securitySchemes;
        if (!schemes || Object.keys(schemes).length === 0) {
            return (
                <p className="text-xs italic text-[var(--text-muted)]">
                    No explicit security authentication schemes specified at securityComponents.
                </p>);

        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(schemes).map(([key, config]: [string, any]) =>
                    <div key={key} className="p-4 rounded-xl border bg-[var(--surface-hover)] border-[var(--border)]">

                        <div className="flex items-center gap-2 mb-1.5">
                            <span
                                className="text-xs uppercase font-bold px-2 py-0.5 rounded border text-[var(--primary)] bg-[var(--primary)]/5 border-[var(--primary)]/20">
                                {config.type === 'apiKey' ? 'API Key' : config.type === 'http' ? config.scheme === 'basic' ? 'Basic Auth' : 'Bearer Hash' : config.type}
                            </span>
                            <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                                {key}</span>
                        </div>
                        {config.description &&
                            <p className="text-[11px] mb-2 text-[var(--text)]">{config.description}</p>}
                        <ul className="text-[10px] space-y-1 font-mono text-inherit text-[var(--text-muted)]">

                            {config.name &&
                                <li>Param Name: <span style={{}}>{config.name}</span></li>}
                            {config.in &&
                                <li>Source In: <span style={{}}>{config.in}</span></li>}
                            {config.scheme &&
                                <li>HTTP Scheme: <span style={{}}>{config.scheme}</span>
                                </li>}
                        </ul>
                    </div>
                )}
            </div>);

    };

    return (
        <div
            className="flex-1 w-full h-full overflow-y-auto p-3 sm:p-4 md:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0">
            {/* API Hero Frame */}
            <div
                className="max-w-7xl mx-auto w-full p-6 md:p-8 rounded-2xl border relative overflow-hidden bg-[var(--surface)] border-[var(--border)]">

                <div className="relative z-10 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <span
                                className="px-2.5 py-1 rounded-full text-[10px] uppercase font-extrabold tracking-wider font-mono border bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">


                                VERSION {version}
                            </span>
                            <span
                                className="px-2.5 py-1 rounded-full text-[10px] uppercase font-extrabold tracking-wider font-mono border opacity-60 bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">


                                {spec.swagger ? `Swagger v${spec.swagger}` : `OAS v${spec.openapi || '3.x'}`}
                            </span>
                        </div>
                        <Tip content="Share this specification">
                            <button
                                onClick={handleShareSpec}
                                className="h-8 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)] hover:opacity-90 shadow-sm">
                                <i className="ph ph-share-network text-[14px]"></i>
                                <span className="hidden sm:inline">Share Spec</span>
                            </button>
                        </Tip>
                    </div>

                    <div className="space-y-1">
                        <h1 className="text-2xl md:text-3.5xl font-extrabold tracking-tight text-[var(--text-heading)]">

                            {title}
                        </h1>
                        <p className="text-xs text-[var(--text-muted)]">
                            Specification Landing Hub & Overview Portal
                        </p>
                    </div>
                </div>

                {/* Decorative background */}
                <div
                    className="absolute right-0 bottom-0 top-0 w-1/3 pointer-events-none opacity-[0.03] flex items-center justify-center select-none">
                    <i className="ph ph-file-text text-[160px] text-[var(--primary)]"></i>
                </div>
            </div>

            <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 min-w-0 space-y-8">
                    {/* Description Block */}
                    {(description || spec.externalDocs) &&
                        <div className="space-y-3">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">

                                About this Specification
                            </h2>
                            <div
                                className="p-6 flex gap-6 rounded-2xl border max-w-none prose text-sm leading-relaxed space-y-4 bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">


                                {description && <Markdown text={description}/>}
                                {spec.externalDocs && spec.externalDocs.url &&
                                    <div className="pt-3 border-t mt-3 flex flex-col gap-1.5 border-[var(--border)]">

                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Specification Reference Docs</p>
                                        <div>
                                            <a
                                                href={spec.externalDocs.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--primary-contrast)] transition-all hover:opacity-90 cursor-pointer shadow-sm select-none bg-[var(--primary)]">


                                                <i className="ph ph-arrow-square-out text-[10px]"></i>
                                                <span>{spec.externalDocs.description || 'View External Documentation'}</span>
                                            </a>
                                        </div>
                                    </div>
                                }
                            </div>
                        </div>
                    }

                    {/* Configured Servers */}
                    {spec.servers && spec.servers.length > 0 &&
                        <div className="space-y-3">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">

                                Configured Edge Servers
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {spec.servers.map((srv, sIdx) =>
                                    <div key={sIdx}
                                         className="p-4 rounded-xl border flex flex-col gap-2 shadow-sm bg-[var(--surface)] border-[var(--border)]">

                                        <div className="font-bold text-xs text-[var(--text-heading)]">
                                            {srv.description || `Root Server #${sIdx + 1}`}
                                        </div>
                                        <div
                                            className="font-mono text-xs select-all px-2.5 py-1.5 rounded-lg border flex items-center justify-between bg-[var(--background)] border-[var(--border)] text-[var(--primary)]">


                                            <span className="truncate mr-2">{srv.url}</span>
                                            <i className="ph ph-link text-[10px] opacity-70"></i>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    }

                    {/* Security Credentials */}
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

            {shareModal &&
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            }
        </div>);

}