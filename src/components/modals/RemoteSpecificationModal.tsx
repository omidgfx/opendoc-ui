import {useEffect, useState} from 'react';
import {useModalTransition} from '../../hooks/useModalTransition';
import {normalizeRemoteSpecUrl} from '../../utils/specification/remoteSpec';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';

interface RemoteSpecificationModalProps {
    isOpen: boolean;
    downloaderConfigured: boolean;
    isLoading: boolean;
    loadStatus: string | null;
    onLoad: (url: string) => Promise<unknown>;
    onLoaded: () => void;
    onClose: () => void;
}

export default function RemoteSpecificationModal({
    isOpen,
    downloaderConfigured,
    isLoading,
    loadStatus,
    onLoad,
    onLoaded,
    onClose,
}: RemoteSpecificationModalProps) {
    const transition = useModalTransition(isOpen, onClose);
    const [url, setUrl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [showCorsHelp, setShowCorsHelp] = useState(!downloaderConfigured);
    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setSubmitted(false);
        setShowCorsHelp(!downloaderConfigured);
    }, [isOpen, downloaderConfigured]);
    useModalShortcuts({
        isOpen,
        onClose: transition.requestClose,
        onSubmit: () => void load(),
        canSubmit: !isLoading && !!url.trim(),
        enabled: !isLoading,
    });
    const load = async () => {
        setError(null);
        setSubmitted(true);
        let normalized: string;
        try {
            normalized = normalizeRemoteSpecUrl(url);
        } catch (validationError) {
            setError(validationError instanceof Error ? validationError.message : 'Enter a valid HTTP or HTTPS URL.');
            return;
        }
        try {
            await onLoad(normalized);
            onLoaded();
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'The specification could not be loaded.');
            setShowCorsHelp(true);
        }
    };
    if (!transition.shouldRender) return null;
    return (
        <div
            className={`${transition.backdropClassName} fixed inset-0 z-[5200] bg-black/65 backdrop-blur-[3px]`}
            onMouseDown={event => {
                if (event.target === event.currentTarget && !isLoading) transition.requestClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="remote-specification-title"
                className="modal-surface flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3.5 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className="ph-fill ph-globe-hemisphere-west text-[18px]" />
                        </span>
                        <div className="min-w-0">
                            <h2
                                id="remote-specification-title"
                                className="text-sm font-extrabold text-[var(--text-heading)]"
                            >
                                Load specification from URL
                            </h2>
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                {downloaderConfigured
                                    ? 'The configured downloader is tried first, with direct browser fallbacks.'
                                    : 'The browser downloads the document directly from its remote server.'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Close URL specification loader"
                        disabled={isLoading}
                        onClick={transition.requestClose}
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                        <i className="ph ph-x" />
                    </button>
                </header>

                <form
                    onSubmit={event => {
                        event.preventDefault();
                        void load();
                    }}
                    className="modal-scroll-region min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin"
                >
                    <label
                        className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
                        htmlFor="remote-specification-url"
                    >
                        OpenAPI or Swagger URL
                    </label>
                    <div className="relative mt-2">
                        <i className="ph ph-link-simple pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--text-muted)]" />
                        <input
                            id="remote-specification-url"
                            autoFocus
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            spellCheck={false}
                            value={url}
                            disabled={isLoading}
                            onChange={event => setUrl(event.target.value)}
                            placeholder="https://api.example.com/openapi.yaml"
                            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 font-mono text-[11px] text-[var(--text-heading)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
                        />
                    </div>

                    {submitted && loadStatus && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2.5 text-[10px] text-[var(--primary)]"
                        >
                            <i className={`ph ph-arrows-clockwise text-[13px] ${isLoading ? 'animate-spin' : ''}`} />
                            <span>{loadStatus}</span>
                        </div>
                    )}

                    {error && (
                        <div
                            role="alert"
                            className="mt-3 rounded-xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 px-3 py-2.5 text-[10px] leading-relaxed text-[var(--method-delete)]"
                        >
                            <div className="flex items-start gap-2">
                                <i className="ph ph-warning-circle mt-0.5 shrink-0 text-[13px]" />
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 rounded-xl border border-[var(--method-put)]/25 bg-[var(--method-put)]/5 p-3 text-[10px] leading-relaxed text-[var(--text)]">
                        <div className="flex items-start gap-2">
                            <i className="ph ph-info mt-0.5 shrink-0 text-[13px] text-[var(--method-put)]" />
                            <p>
                                Browser requests can fail when the remote host does not permit CORS. OpenDoc first tries
                                the exact URL and then retries with OpenDoc&apos;s HTTP/HTTPS scheme after a transport
                                failure.
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-expanded={showCorsHelp}
                            onClick={() => setShowCorsHelp(current => !current)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-[var(--method-put)] hover:bg-[var(--method-put)]/10 cursor-pointer"
                        >
                            <i className={`ph ph-caret-${showCorsHelp ? 'down' : 'right'} text-[10px]`} />
                            CORS configuration help
                        </button>
                        {showCorsHelp && (
                            <div className="mt-2 space-y-2 border-t border-[var(--method-put)]/15 pt-2">
                                <p>The remote server should answer GET and OPTIONS requests with headers similar to:</p>
                                <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 font-mono text-[9px] leading-relaxed text-[var(--text-heading)] select-all">{`Access-Control-Allow-Origin: ${typeof window !== 'undefined' ? window.location.origin : 'https://docs.example.com'}
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Content-Type, If-None-Match, If-Modified-Since
Access-Control-Expose-Headers: ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL`}</pre>
                                <p className="text-[var(--text-muted)]">
                                    If you cannot change that server, configure an OpenDoc specification downloader
                                    during the build.
                                </p>
                            </div>
                        )}
                    </div>
                </form>

                <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-5">
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={transition.requestClose}
                        className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isLoading || !url.trim()}
                        onClick={() => void load()}
                        className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <i className="ph ph-spinner-gap animate-spin" /> Loading…
                            </>
                        ) : (
                            <>
                                <i className="ph ph-download-simple" /> Load URL
                            </>
                        )}
                    </button>
                </footer>
            </section>
        </div>
    );
}
