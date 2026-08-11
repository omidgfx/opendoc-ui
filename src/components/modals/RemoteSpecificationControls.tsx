import {useState} from 'react';
import clsx from 'clsx';
import type {RemoteHistoryEntry} from '../../utils/remoteHistory';
import {remoteRequestModeLabel} from '../../utils/remoteSpec';
import {formatRelativeTime} from '../../utils/specification/selector';
import ConfirmModal from '../common/ConfirmModal';

interface RemoteSpecificationControlsProps {
    selectedKey: string;
    downloaderConfigured: boolean;
    error: string | null;
    history: RemoteHistoryEntry[];
    onOpenLoader: () => void;
    onSelectHistoryEntry: (entry: RemoteHistoryEntry) => Promise<unknown>;
    onRemoveHistoryEntry: (key: string) => Promise<void> | void;
    onClearHistory: () => Promise<void> | void;
    onLoaded: () => void;
}

const displayUrl = (value: string): string => {
    try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}${url.search ? '?…' : ''}`;
    } catch {
        return value;
    }
};

export default function RemoteSpecificationControls({
    selectedKey,
    downloaderConfigured,
    error,
    history,
    onOpenLoader,
    onSelectHistoryEntry,
    onRemoveHistoryEntry,
    onClearHistory,
    onLoaded,
}: RemoteSpecificationControlsProps) {
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const openHistoryEntry = async (entry: RemoteHistoryEntry) => {
        if (loadingKey) return;
        setLoadingKey(entry.key);
        try {
            await onSelectHistoryEntry(entry);
            onLoaded();
        } catch {
            // The shared remote loader exposes the classified error below.
        } finally {
            setLoadingKey(null);
        }
    };
    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={onOpenLoader}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] p-4 text-left transition-all hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/5 group cursor-pointer"
            >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] group-hover:border-[var(--primary)]/40">
                    <i className="ph-fill ph-globe-hemisphere-west text-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-xs font-extrabold text-[var(--text-heading)]">Load from URL</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                        {downloaderConfigured
                            ? 'Use the configured downloader with automatic browser fallbacks'
                            : 'Download directly in this browser; the remote host must permit CORS'}
                    </span>
                </span>
                <i className="ph ph-caret-right text-[12px] text-[var(--text-muted)]" />
            </button>

            {error && (
                <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-3 py-2.5 text-[10px] leading-relaxed text-[var(--method-delete)]"
                >
                    <i className="ph ph-warning-circle mt-0.5 shrink-0 text-[13px]" />
                    <span>{error}</span>
                </div>
            )}

            {history.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]">
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            Recent URLs · {history.length}
                        </span>
                        <button
                            type="button"
                            onClick={() => setConfirmClear(true)}
                            className="rounded-lg px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        {history.map(entry => {
                            const selected = entry.key === selectedKey;
                            const loading = loadingKey === entry.key;
                            return (
                                <div
                                    key={entry.key}
                                    className={clsx(
                                        'flex items-center gap-2 px-2 py-1.5',
                                        selected && 'bg-[var(--primary)]/5',
                                    )}
                                >
                                    <button
                                        type="button"
                                        disabled={!!loadingKey}
                                        onClick={() => void openHistoryEntry(entry)}
                                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--surface-hover)] disabled:opacity-60 cursor-pointer disabled:cursor-wait"
                                    >
                                        <i
                                            className={clsx(
                                                'ph shrink-0 text-[14px] text-[var(--primary)]',
                                                loading ? 'ph-spinner-gap animate-spin' : 'ph-globe-hemisphere-west',
                                            )}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="block min-w-0 truncate text-[11px] font-bold text-[var(--text-heading)]">
                                                    {entry.title}
                                                </span>
                                                {selected && (
                                                    <span className="shrink-0 rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-[8px] font-bold text-[var(--primary)]">
                                                        Active
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className="block truncate font-mono text-[9px] text-[var(--text-muted)]"
                                                title={entry.url}
                                            >
                                                {displayUrl(entry.url)}
                                            </span>
                                            <span className="block text-[8px] text-[var(--text-muted)]/80">
                                                {formatRelativeTime(entry.openedAt)}
                                                {entry.requestMode &&
                                                    ` · ${entry.requestMode === 'cache' ? 'cache' : remoteRequestModeLabel(entry.requestMode)}`}
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!!loadingKey}
                                        onClick={() => void onRemoveHistoryEntry(entry.key)}
                                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                        aria-label={`Remove ${entry.title} from URL history`}
                                    >
                                        <i className="ph ph-x text-[12px]" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmClear}
                title="Clear URL history?"
                message="This removes all recent specification URLs and their cached documents from this browser."
                confirmLabel="Clear history"
                destructive
                onConfirm={() => void onClearHistory()}
                onClose={() => setConfirmClear(false)}
            />
        </div>
    );
}
