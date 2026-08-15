import React, {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import {OpenApiSpec, Parsable, ParsableConfig} from '../../types';
import {clearCachedSpec} from '../../utils/storage/specCache';
import {Tip} from '../common/Tooltip';
import type {LocalHistoryEntry} from '../../utils/storage/localHistory';
import type {RemoteHistoryEntry} from '../../utils/storage/remoteHistory';
import {useModalTransition} from '../../hooks/useModalTransition';
import RemoteSpecificationModal from './RemoteSpecificationModal';
import RemoteSpecificationControls from './RemoteSpecificationControls';
import {
    formatRelativeTime,
    loadSpecification,
    summarizeSpecification,
    type SummaryState,
} from '@/src/utils/specification/selector';

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
    remoteLoadingEnabled: boolean;
    downloaderConfigured: boolean;
    remoteHistory: RemoteHistoryEntry[];
    remoteOpenError: string | null;
    isLoadingRemoteSpec: boolean;
    remoteLoadStatus: string | null;
    onLoadRemoteUrl: (url: string) => Promise<unknown>;
    onSelectRemoteHistoryEntry: (entry: RemoteHistoryEntry) => Promise<unknown>;
    onRemoveRemoteHistoryEntry: (key: string) => Promise<void> | void;
    onClearRemoteHistory: () => Promise<void> | void;
    onSelect: (key: string) => void;
    onReloadSpecification?: (key: string) => void | Promise<void>;
    onResetSpecification?: (key: string, options?: {clearNotes?: boolean}) => void | Promise<void>;
    onResetAllConfigurations?: () => void | Promise<void>;
    onClose: () => void;
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
    remoteLoadingEnabled,
    downloaderConfigured,
    remoteHistory,
    remoteOpenError,
    isLoadingRemoteSpec,
    remoteLoadStatus,
    onLoadRemoteUrl,
    onSelectRemoteHistoryEntry,
    onRemoveRemoteHistoryEntry,
    onClearRemoteHistory,
    onSelect,
    onReloadSpecification,
    onResetSpecification,
    onResetAllConfigurations,
    onClose,
}: ApiSpecificationSelectorModalProps) {
    const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
    const [reloadingKeys, setReloadingKeys] = useState<Record<string, boolean>>({});
    const [confirmAction, setConfirmAction] = useState<{
        kind: 'spec' | 'all';
        key?: string;
    } | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [clearNotesOnReset, setClearNotesOnReset] = useState(false);
    const [showRemoteLoader, setShowRemoteLoader] = useState(false);
    const {shouldRender, requestClose, backdropClassName} = useModalTransition(isOpen, onClose);
    const confirmTransition = useModalTransition(!!confirmAction, () => setConfirmAction(null));
    const entries = useMemo(() => Object.entries(specifications), [specifications]);
    const isHybridMode = canOpenLocal && !isLocalMode;
    useEffect(() => {
        if (confirmAction) setClearNotesOnReset(false);
    }, [confirmAction]);
    const prevActiveSpecRef = useRef<OpenApiSpec | null>(null);
    useEffect(() => {
        if (!isOpen) return;
        if (isLocalMode) {
            if (prevActiveSpecRef.current && prevActiveSpecRef.current !== activeSpecification) {
                requestClose();
            }
            prevActiveSpecRef.current = activeSpecification;
        }
    }, [isOpen, isLocalMode, activeSpecification, requestClose]);
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const initial: Record<string, SummaryState> = {};
        entries.forEach(([key]) => {
            initial[key] =
                key === selectedKey && activeSpecification
                    ? {status: 'ready', summary: summarizeSpecification(activeSpecification)}
                    : {status: 'loading'};
        });
        setSummaries(initial);
        entries.forEach(async ([key, item]) => {
            if (key === selectedKey && activeSpecification) return;
            try {
                const loaded = await loadSpecification(item);
                if (!cancelled) {
                    setSummaries(current => ({
                        ...current,
                        [key]: {status: 'ready', summary: summarizeSpecification(loaded)},
                    }));
                }
            } catch (error) {
                if (!cancelled) {
                    setSummaries(current => ({
                        ...current,
                        [key]: {
                            status: 'error',
                            message: error instanceof Error ? error.message : 'Unable to inspect this specification.',
                        },
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
            if (event.key !== 'Escape') return;
            if (showRemoteLoader) return;
            if (confirmAction) {
                confirmTransition.requestClose();
                return;
            }
            const visibleModalCount = Array.from(document.querySelectorAll<HTMLElement>('.modal-surface')).filter(
                element => element.getClientRects().length > 0,
            ).length;
            if (visibleModalCount > 1) return;
            requestClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, requestClose, confirmAction, showRemoteLoader]);
    const reloadSpecification = async (key: string, item: Parsable) => {
        if (reloadingKeys[key]) return;
        setReloadingKeys(current => ({...current, [key]: true}));
        setSummaries(current => ({...current, [key]: {status: 'loading'}}));
        try {
            if (item.url) await clearCachedSpec(item.url);
            const loaded = await loadSpecification(item);
            setSummaries(current => ({...current, [key]: {status: 'ready', summary: summarizeSpecification(loaded)}}));
            if (key === selectedKey) await onReloadSpecification?.(key);
        } catch (error) {
            setSummaries(current => ({
                ...current,
                [key]: {
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unable to reload this specification.',
                },
            }));
        } finally {
            setReloadingKeys(current => {
                const next = {...current};
                delete next[key];
                return next;
            });
        }
    };
    const confirmReset = async () => {
        if (!confirmAction || isConfirming) return;
        setIsConfirming(true);
        try {
            if (confirmAction.kind === 'all') await onResetAllConfigurations?.();
            else if (confirmAction.key)
                await onResetSpecification?.(confirmAction.key, {clearNotes: clearNotesOnReset});
            setConfirmAction(null);
            requestClose();
        } finally {
            setIsConfirming(false);
        }
    };
    if (!shouldRender) return null;
    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[2500] bg-black/60 backdrop-blur-[2px]`}
            onMouseDown={event => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-specification-selector-title"
                className="modal-surface modal-surface-stable flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
            >
                <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 sm:px-5 py-2.5 sm:py-4 shrink-0 modal-header-mobile-pad">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className={clsx('ph-fill text-[18px]', isLocalMode ? 'ph-folder-open' : 'ph-files')} />
                        </span>
                        <div className="min-w-0">
                            <h2
                                id="api-specification-selector-title"
                                className="text-sm font-extrabold text-[var(--text-heading)]"
                            >
                                {isLocalMode ? 'Open specification' : 'API Specifications'}
                            </h2>
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                {isLocalMode
                                    ? 'Open a JSON or YAML descriptor from your device, or pick one from your history.'
                                    : isHybridMode
                                      ? 'Choose a configured specification or open your own JSON/YAML files.'
                                      : 'Choose a specification and review its contents before opening it.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {remoteLoadingEnabled && (
                            <Tip content="Load an OpenAPI specification from URL">
                                <button
                                    type="button"
                                    onClick={() => setShowRemoteLoader(true)}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--primary)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                    aria-label="Load specification from URL"
                                >
                                    <i className="ph-fill ph-globe-hemisphere-west text-[15px]" />
                                </button>
                            </Tip>
                        )}
                        {canOpenLocal && (
                            <Tip content="Open JSON / YAML from your device">
                                <button
                                    type="button"
                                    onClick={onOpenLocalFile}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--primary)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                    aria-label="Open a specification file from your device"
                                >
                                    <i className="ph-fill ph-folder-open text-[15px]" />
                                </button>
                            </Tip>
                        )}
                        <Tip content="Reset all saved configurations">
                            <button
                                type="button"
                                onClick={() => setConfirmAction({kind: 'all'})}
                                className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--method-delete)]/25 px-2.5 text-[var(--method-delete)] transition-colors hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                aria-label="Reset all saved configurations"
                            >
                                <i className="ph ph-arrow-counter-clockwise text-[14px]" />
                                <span className="hidden sm:inline text-[10px] font-bold">Reset all</span>
                            </button>
                        </Tip>
                        <Tip content="Close">
                            <button
                                type="button"
                                onClick={requestClose}
                                autoFocus
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                aria-label="Close API specification selector"
                            >
                                <i className="ph ph-x" />
                            </button>
                        </Tip>
                    </div>
                </header>

                {isLocalMode ? (
                    <div className="modal-scroll-region min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
                        {localOpenError && (
                            <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-3.5 py-2.5 text-[11px] text-[var(--method-delete)]">
                                <i className="ph ph-warning-circle text-[14px]" />
                                <span className="flex-1">{localOpenError}</span>
                                <button
                                    type="button"
                                    onClick={onDismissLocalError}
                                    className="cursor-pointer text-[var(--method-delete)] hover:opacity-70"
                                >
                                    <i className="ph ph-x text-[12px]" />
                                </button>
                            </div>
                        )}

                        {remoteLoadingEnabled && (
                            <div className="mb-4">
                                <RemoteSpecificationControls
                                    selectedKey={selectedKey}
                                    downloaderConfigured={downloaderConfigured}
                                    error={remoteOpenError}
                                    history={remoteHistory}
                                    onOpenLoader={() => setShowRemoteLoader(true)}
                                    onSelectHistoryEntry={onSelectRemoteHistoryEntry}
                                    onRemoveHistoryEntry={onRemoveRemoteHistoryEntry}
                                    onClearHistory={onClearRemoteHistory}
                                    onLoaded={requestClose}
                                />
                            </div>
                        )}

                        {canOpenLocal && (
                            <button
                                type="button"
                                onClick={onOpenLocalFile}
                                className="w-full rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] p-6 text-center transition-all cursor-pointer hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/5 group"
                            >
                                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition-colors group-hover:border-[var(--primary)]/40">
                                    <i className="ph-fill ph-folder-plus text-[20px]" />
                                </span>
                                <span className="mt-3 block text-sm font-extrabold text-[var(--text-heading)]">
                                    Open specification file(s)
                                </span>
                                <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                                    Select one bundled file or all related JSON/YAML files · stays on your device
                                </span>
                            </button>
                        )}

                        <div className="mt-5 mb-2 flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                                Recently opened · {localHistory.length}
                            </span>
                            {localHistory.length > 0 && (
                                <button
                                    type="button"
                                    onClick={onClearHistory}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                >
                                    <i className="ph ph-trash text-[11px]" />
                                    Clear history
                                </button>
                            )}
                        </div>

                        {localHistory.length === 0 ? (
                            <p className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center text-[11px] text-[var(--text-muted)]">
                                Nothing opened yet. Files you open are listed here and kept in your browser&apos;s
                                persistent storage.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {localHistory.map(entry => {
                                    const selected = entry.key === selectedKey;
                                    return (
                                        <div
                                            key={entry.key}
                                            className={clsx(
                                                'flex items-center gap-3 rounded-2xl border p-3 transition-all',
                                                selected
                                                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                                                    : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]/50',
                                            )}
                                        >
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                                                <i className="ph-fill ph-file-code text-[14px]" />
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onSelectHistoryEntry(entry)}
                                                className="min-w-0 flex-1 text-left cursor-pointer"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-xs font-extrabold text-[var(--text-heading)]">
                                                        {entry.title}
                                                    </span>
                                                    {selected && (
                                                        <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--primary-contrast)]">
                                                            Current
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 block truncate font-mono text-[9.5px] text-[var(--text-muted)]">
                                                    {entry.fileName} · {formatRelativeTime(entry.openedAt)}
                                                </span>
                                            </button>
                                            <Tip content="Reset this specification's saved configuration">
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmAction({kind: 'spec', key: entry.key})}
                                                    className="size-7 shrink-0 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                                    aria-label={`Reset saved configuration for ${entry.title}`}
                                                >
                                                    <i className="ph ph-arrow-counter-clockwise text-[13px]" />
                                                </button>
                                            </Tip>
                                            <button
                                                type="button"
                                                onClick={() => onRemoveHistoryEntry(entry.key)}
                                                className="size-7 shrink-0 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                                aria-label={`Remove ${entry.title} from history`}
                                            >
                                                <i className="ph ph-x text-[13px]" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="modal-scroll-region min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
                            {remoteLoadingEnabled && (
                                <div className="mb-5">
                                    <RemoteSpecificationControls
                                        selectedKey={selectedKey}
                                        downloaderConfigured={downloaderConfigured}
                                        error={remoteOpenError}
                                        history={remoteHistory}
                                        onOpenLoader={() => setShowRemoteLoader(true)}
                                        onSelectHistoryEntry={onSelectRemoteHistoryEntry}
                                        onRemoveHistoryEntry={onRemoveRemoteHistoryEntry}
                                        onClearHistory={onClearRemoteHistory}
                                        onLoaded={requestClose}
                                    />
                                </div>
                            )}
                            {isHybridMode && (
                                <div className="mb-5 space-y-3">
                                    {localOpenError && (
                                        <div className="flex items-center gap-2 rounded-xl border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-3.5 py-2.5 text-[11px] text-[var(--method-delete)]">
                                            <i className="ph ph-warning-circle text-[14px]" />
                                            <span className="flex-1">{localOpenError}</span>
                                            <button
                                                type="button"
                                                onClick={onDismissLocalError}
                                                className="cursor-pointer hover:opacity-70"
                                                aria-label="Dismiss local specification error"
                                            >
                                                <i className="ph ph-x text-[12px]" />
                                            </button>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={onOpenLocalFile}
                                        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] p-4 text-left transition-all cursor-pointer hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/5 group"
                                    >
                                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] group-hover:border-[var(--primary)]/40">
                                            <i className="ph-fill ph-folder-plus text-[18px]" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-xs font-extrabold text-[var(--text-heading)]">
                                                Open your own specification
                                            </span>
                                            <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                                                Select JSON/YAML files from your device · nothing is uploaded
                                            </span>
                                        </span>
                                        <i className="ph ph-caret-right text-[12px] text-[var(--text-muted)]" />
                                    </button>

                                    {localHistory.length > 0 && (
                                        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]">
                                            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                                                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                                    Recent local specifications
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={onClearHistory}
                                                    className="rounded-lg px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <div className="divide-y divide-[var(--border)]">
                                                {localHistory.map(entry => (
                                                    <div
                                                        key={entry.key}
                                                        className="flex items-center gap-2 px-2 py-1.5"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onSelectHistoryEntry(entry);
                                                                requestClose();
                                                            }}
                                                            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--surface-hover)] cursor-pointer"
                                                        >
                                                            <i className="ph-fill ph-file-code shrink-0 text-[14px] text-[var(--primary)]" />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[11px] font-bold text-[var(--text-heading)]">
                                                                    {entry.title}
                                                                </span>
                                                                <span className="block truncate text-[9px] text-[var(--text-muted)]">
                                                                    {entry.fileName} ·{' '}
                                                                    {formatRelativeTime(entry.openedAt)}
                                                                </span>
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => onRemoveHistoryEntry(entry.key)}
                                                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                                            aria-label={`Remove ${entry.title} from history`}
                                                        >
                                                            <i className="ph ph-x text-[12px]" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                Configured specifications
                            </div>
                            <div className="space-y-3">
                                {entries.map(([key, item]) => {
                                    const state = summaries[key] || {status: 'loading'};
                                    const summary = state.summary;
                                    const selected = key === selectedKey;
                                    return (
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            key={key}
                                            onClick={() => {
                                                onSelect(key);
                                                requestClose();
                                            }}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    onSelect(key);
                                                    requestClose();
                                                }
                                            }}
                                            className={clsx(
                                                'w-full rounded-2xl border p-4 text-left transition-all cursor-pointer',
                                                selected
                                                    ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm'
                                                    : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface-hover)]',
                                            )}
                                            aria-pressed={selected}
                                        >
                                            <div className="flex items-start gap-4">
                                                <span
                                                    className={clsx(
                                                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-[17px]',
                                                        selected
                                                            ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]'
                                                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
                                                    )}
                                                >
                                                    <i className="ph-fill ph-file-code" />
                                                </span>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="truncate text-sm font-extrabold text-[var(--text-heading)]">
                                                                    {item.title || key}
                                                                </h3>
                                                                {selected && (
                                                                    <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--primary-contrast)]">
                                                                        Current
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {summary && summary.title !== (item.title || key) && (
                                                                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                                                                    {summary.title}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {summary && (
                                                                <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[9px] text-[var(--text-muted)]">
                                                                    {summary.formatVersion} · v{summary.version}
                                                                </span>
                                                            )}
                                                            <Tip content="Reload specification">
                                                                <button
                                                                    type="button"
                                                                    onClick={event => {
                                                                        event.stopPropagation();
                                                                        void reloadSpecification(key, item);
                                                                    }}
                                                                    className="flex size-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                                                                    aria-label={`Reload ${item.title || key}`}
                                                                >
                                                                    <i
                                                                        className={clsx(
                                                                            'ph ph-arrows-clockwise text-[12px]',
                                                                            reloadingKeys[key] && 'animate-spin',
                                                                        )}
                                                                    />
                                                                </button>
                                                            </Tip>
                                                            <Tip content="Reset this specification's saved configuration">
                                                                <button
                                                                    type="button"
                                                                    onClick={event => {
                                                                        event.stopPropagation();
                                                                        setConfirmAction({kind: 'spec', key});
                                                                    }}
                                                                    className="flex size-7 items-center justify-center rounded-lg border border-[var(--method-delete)]/25 text-[var(--method-delete)] transition-colors hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                                                    aria-label={`Reset saved configuration for ${item.title || key}`}
                                                                >
                                                                    <i className="ph ph-arrow-counter-clockwise text-[12px]" />
                                                                </button>
                                                            </Tip>
                                                        </div>
                                                    </div>

                                                    {state.status === 'loading' && (
                                                        <div className="mt-4 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                                            <i className="ph ph-spinner animate-spin text-[var(--primary)]" />
                                                            Inspecting specification…
                                                        </div>
                                                    )}

                                                    {state.status === 'error' && (
                                                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/5 px-3 py-2 text-[10px] text-[var(--method-delete)]">
                                                            <i className="ph ph-warning-circle" />
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
                                                                    [
                                                                        'Schemas',
                                                                        summary.schemaCount,
                                                                        'ph-diamonds-four',
                                                                    ],
                                                                    ['Groups', summary.tagCount, 'ph-folders'],
                                                                    ['Servers', summary.serverCount, 'ph-hard-drives'],
                                                                    [
                                                                        'Secured',
                                                                        summary.securedEndpointCount,
                                                                        'ph-lock-key',
                                                                    ],
                                                                ].map(([label, value, icon]) => (
                                                                    <span
                                                                        key={String(label)}
                                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[9px] text-[var(--text-muted)]"
                                                                    >
                                                                        <i className={`ph ${icon}`} />
                                                                        <strong className="text-[var(--text-heading)]">
                                                                            {value}
                                                                        </strong>{' '}
                                                                        {label}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            {summary.methods.length > 0 && (
                                                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                                    <span className="mr-1 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                                                        Methods
                                                                    </span>
                                                                    {summary.methods.map(method => (
                                                                        <span
                                                                            key={method}
                                                                            className="rounded bg-[var(--primary)]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[var(--primary)]"
                                                                        >
                                                                            {method}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                <i className="ph ph-caret-right mt-3 shrink-0 text-[12px] text-[var(--text-muted)]" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                <footer className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-5 py-3 text-[10px] text-[var(--text-muted)]">
                    {isLocalMode ? (
                        <span>
                            {localHistory.length} local{remoteLoadingEnabled ? ` · ${remoteHistory.length} URL` : ''}
                        </span>
                    ) : isHybridMode ? (
                        <span>
                            {entries.length} configured · {localHistory.length} local
                            {remoteLoadingEnabled ? ` · ${remoteHistory.length} URL` : ''}
                        </span>
                    ) : (
                        <span>
                            {entries.length} configured{remoteLoadingEnabled ? ` · ${remoteHistory.length} URL` : ''}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={requestClose}
                        className="rounded-xl border border-[var(--border)] px-4 py-2 font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                        Cancel
                    </button>
                </footer>
            </section>

            <RemoteSpecificationModal
                isOpen={showRemoteLoader}
                downloaderConfigured={downloaderConfigured}
                isLoading={isLoadingRemoteSpec}
                loadStatus={remoteLoadStatus}
                onLoad={onLoadRemoteUrl}
                onLoaded={() => {
                    setShowRemoteLoader(false);
                    requestClose();
                }}
                onClose={() => setShowRemoteLoader(false)}
            />

            {confirmTransition.shouldRender && confirmAction && (
                <div
                    className={`${confirmTransition.backdropClassName} fixed inset-0 z-[2600] bg-black/55 backdrop-blur-[2px]`}
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget && !isConfirming) confirmTransition.requestClose();
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reset-config-confirm-title"
                        className="modal-surface modal-confirm-surface w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-delete)]/10 text-[var(--method-delete)]">
                                <i className="ph ph-arrow-counter-clockwise text-[18px]" />
                            </span>
                            <h3
                                id="reset-config-confirm-title"
                                className="text-sm font-extrabold text-[var(--text-heading)]"
                            >
                                {confirmAction.kind === 'all'
                                    ? 'Reset all configurations?'
                                    : 'Reset this specification?'}
                            </h3>
                        </header>
                        <div className="px-4 py-4">
                            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                                {confirmAction.kind === 'all'
                                    ? 'This clears saved general UI settings, local notes, and all per-spec configurations, then reloads the application.'
                                    : 'This clears the saved settings, tabs, inputs, theme, hidden endpoints, and navigation preferences for this specification, then reloads it. Local notes are preserved by default.'}
                            </p>
                            {confirmAction.kind === 'spec' && (
                                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                                    <input
                                        type="checkbox"
                                        checked={clearNotesOnReset}
                                        onChange={event => setClearNotesOnReset(event.target.checked)}
                                        className="mt-0.5 size-4 accent-[var(--method-delete)]"
                                    />
                                    <span>
                                        <span className="block text-[11px] font-bold text-[var(--text-heading)]">
                                            Clear local notes too
                                        </span>
                                        <span className="mt-0.5 block text-[9px] text-[var(--text-muted)]">
                                            Default is off. Enable this only if notes and todos should be permanently
                                            deleted.
                                        </span>
                                    </span>
                                </label>
                            )}
                        </div>
                        <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                            <button
                                type="button"
                                disabled={isConfirming}
                                onClick={confirmTransition.requestClose}
                                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isConfirming}
                                onClick={() => void confirmReset()}
                                className="whitespace-nowrap rounded-xl bg-[var(--method-delete)] px-4 py-2 text-xs font-bold text-[var(--method-delete-contrast)] hover:brightness-110 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                            >
                                {isConfirming ? 'Resetting…' : 'Reset configuration'}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}
