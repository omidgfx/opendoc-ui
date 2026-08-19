import React, {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, OpenApiSpec, ParsableConfig, ThemeMode} from '../../types';
import {useBreakpoint} from '../../hooks/useBreakpoint';
import ApiSpecificationSelectorModal from '../modals/ApiSpecificationSelectorModal';
import {Tip} from '../common/Tooltip';
import type {LocalHistoryEntry} from '../../utils/storage/localHistory';
import type {RemoteHistoryEntry} from '../../utils/storage/remoteHistory';
import SearchHistoryDropdown from '../common/SearchHistoryDropdown';
import {specStorage} from '../../utils/storage/index';
import BrandLogo from '@/src/components/brand/BrandLogo';

interface TopbarProps {
    parsables: ParsableConfig;
    selectedParsableKey: string;
    onSelectParsable: (key: string) => void;
    activeAuth: ActiveAuth;
    onUpdateAuth: (auth: ActiveAuth) => void;
    onOpenAuthModal: () => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onDownloadSpec: () => void;
    title: string;
    showSchemaExplorer: boolean;
    spec: OpenApiSpec | null;
    specFreshness?: {
        freshness: 'network' | 'cache' | 'revalidated' | 'stale';
        fetchedAt: number;
        refreshError?: string;
    } | null;
    showHome: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onOpenMobileSidebar: () => void;
    onOpenAssistant: () => void;
    themeMode: ThemeMode;
    resolvedThemeMode: 'light' | 'dark';
    onSetThemeMode: (mode: ThemeMode) => void;
    onOpenSettings: () => void;
    isLocalMode: boolean;
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    onRefreshSpec: () => void;
    onReloadSpecification: (key: string) => void | Promise<void>;
    onResetSpecification: (key: string, options?: {clearNotes?: boolean}) => void | Promise<void>;
    onResetAllConfigurations: () => void;
    isRefreshingSpec: boolean;
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
    onSearchHasResults?: (q: string) => boolean;
    hideSearch?: boolean;
}

export default function Topbar({
    parsables,
    selectedParsableKey,
    onSelectParsable,
    activeAuth,
    searchQuery,
    onSearchChange,
    onDownloadSpec,
    title,
    showSchemaExplorer,
    spec,
    specFreshness,
    isCollapsed,
    onToggleCollapse,
    onOpenMobileSidebar,
    onOpenAssistant,
    onOpenAuthModal,
    themeMode,
    resolvedThemeMode,
    onSetThemeMode,
    onOpenSettings,
    isLocalMode,
    canOpenLocal,
    onOpenLocalFile,
    onRefreshSpec,
    onReloadSpecification,
    onResetSpecification,
    onResetAllConfigurations,
    isRefreshingSpec,
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
    onSearchHasResults,
    hideSearch,
}: TopbarProps) {
    const [showSpecificationModal, setShowSpecificationModal] = useState(false);
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [searchHistoryVersion, setSearchHistoryVersion] = useState(0);
    const saveSearchHistory = (q: string) => {
        if (!selectedParsableKey || q.trim().length < 3) return;
        const items = specStorage.getJSON<string[]>(
            selectedParsableKey,
            'search_history',
            [],
            v => Array.isArray(v) && v.every(x => typeof x === 'string'),
        );
        const next = [q.trim(), ...items.filter(x => x !== q.trim())].slice(0, 10);
        specStorage.setJSON(selectedParsableKey, 'search_history', next);
        setSearchHistoryVersion(v => v + 1);
    };
    const lastSavedSearchRef = useRef('');
    useEffect(() => {
        if (!selectedParsableKey) return;
        const q = searchQuery.trim();
        if (q.length < 3 || q === lastSavedSearchRef.current) return;
        const t = setTimeout(() => {
            lastSavedSearchRef.current = q;
            if (!onSearchHasResults || onSearchHasResults(q)) {
                saveSearchHistory(q);
            }
        }, 3000);
        return () => clearTimeout(t);
    }, [searchQuery, selectedParsableKey]);
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            saveSearchHistory(searchQuery);
            (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
            (e.target as HTMLInputElement).blur();
        }
    };
    const handleSearchFocus = () => {
        if (searchBlurTimer.current) {
            clearTimeout(searchBlurTimer.current);
            searchBlurTimer.current = null;
        }
        setSearchFocused(true);
    };
    const handleSearchBlur = () => {
        searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150);
    };
    const searchInputRef = useRef<HTMLInputElement>(null);
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';
    const hasSpec = !!spec;
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                const ae = document.activeElement;
                if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
                if (hideSearch) return;
                e.preventDefault();
                if (isMobile) setShowMobileSearch(true);
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isMobile, hideSearch]);
    const authConnected = activeAuth.activeScheme && activeAuth.activeScheme !== 'none';
    const selectedSpecificationIsRemote = selectedParsableKey.startsWith('remote:');
    const selectedSpecificationIsLocal =
        !!selectedParsableKey && !selectedSpecificationIsRemote && !parsables[selectedParsableKey];
    const selectedSpecificationTitle =
        parsables[selectedParsableKey]?.title || spec?.info?.title || selectedParsableKey || 'API Specifications';
    const selectorButton = isLocalMode ? (
        (canOpenLocal || remoteLoadingEnabled) && (
            <Tip
                content={
                    canOpenLocal ? 'Open a specification from your device or URL' : 'Load a specification from URL'
                }
            >
                <button
                    type="button"
                    onClick={() => setShowSpecificationModal(true)}
                    className="flex h-8 w-40 xl:w-48 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-left text-[var(--text-heading)] transition-all cursor-pointer hover:bg-[var(--surface-hover)]"
                >
                    <i
                        className={clsx(
                            'ph-fill shrink-0 text-[14px] text-[var(--primary)]',
                            hasSpec
                                ? selectedSpecificationIsRemote
                                    ? 'ph-globe-hemisphere-west'
                                    : 'ph-file-code'
                                : canOpenLocal
                                  ? 'ph-folder-open'
                                  : 'ph-globe-hemisphere-west',
                        )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                        {hasSpec ? selectedSpecificationTitle : 'Open specification'}
                    </span>
                    <i className="ph ph-caret-down shrink-0 text-[10px] text-[var(--text-muted)]" />
                </button>
            </Tip>
        )
    ) : (
        <Tip content="Switch API specification">
            <button
                type="button"
                onClick={() => setShowSpecificationModal(true)}
                className="flex h-8 w-44 xl:w-56 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-left text-[var(--text-heading)] transition-all cursor-pointer hover:bg-[var(--surface-hover)]"
            >
                <i
                    className={clsx(
                        'ph-fill shrink-0 text-[14px] text-[var(--primary)]',
                        selectedSpecificationIsRemote
                            ? 'ph-globe-hemisphere-west'
                            : selectedSpecificationIsLocal
                              ? 'ph-file-code'
                              : 'ph-files',
                    )}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{selectedSpecificationTitle}</span>
                {hasSpec && (
                    <span
                        role="button"
                        tabIndex={-1}
                        aria-label="Reload specification"
                        onClick={e => {
                            e.stopPropagation();
                            onRefreshSpec();
                        }}
                        className="shrink-0 flex items-center justify-center size-5 rounded text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    >
                        <i
                            className={`ph ph-arrows-clockwise text-[11px] inline-block ${isRefreshingSpec ? 'animate-spin' : ''}`}
                        ></i>
                    </span>
                )}
                <i className="ph ph-caret-down shrink-0 text-[10px] text-[var(--text-muted)]" />
            </button>
        </Tip>
    );
    return (
        <>
            <div className="app-topbar h-14 sm:h-16 border-b px-2 sm:px-3 flex items-center justify-between select-none shrink-0 font-sans z-30 bg-[var(--navbar)] border-[var(--border)] gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <Tip
                        content={isMobile ? 'Open menu' : isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        placement="bottom"
                    >
                        <button
                            onClick={isMobile ? onOpenMobileSidebar : onToggleCollapse}
                            aria-label={isMobile ? 'Open menu' : isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-all cursor-pointer text-[var(--text-heading)] shrink-0"
                        >
                            <i
                                className={`ph ${isMobile ? 'ph-list' : isCollapsed ? 'ph-list' : 'ph-sidebar-simple'} text-[18px]`}
                            ></i>
                        </button>
                    </Tip>

                    <BrandLogo
                        type={null}
                        logoFrame={false}
                        logoClassName="size-8 sm:size-9 p-1"
                        wordmarkClassName="text-sm text-[var(--text-heading)]"
                        className="select-none shrink-0"
                    />

                    {!isMobile && (
                        <>
                            <div className="h-6 w-[1px] bg-[var(--border)] shrink-0"></div>
                            {selectorButton}
                            {specFreshness?.freshness === 'stale' && (
                                <Tip
                                    content={`Using cached specification from ${new Date(specFreshness.fetchedAt).toLocaleString()}${specFreshness.refreshError ? ` · Refresh failed: ${specFreshness.refreshError}` : ''}`}
                                >
                                    <span
                                        role="status"
                                        className="inline-flex items-center gap-1 rounded-md border border-[var(--method-put)]/30 bg-[var(--method-put)]/10 px-2 py-1 text-[9px] font-bold text-[var(--method-put)]"
                                    >
                                        <i className="ph ph-warning-circle" /> Cached spec
                                    </span>
                                </Tip>
                            )}
                        </>
                    )}
                </div>

                {isMobile && isLocalMode && (canOpenLocal || remoteLoadingEnabled) && (
                    <Tip content="Open a specification from your device" placement="bottom">
                        <button
                            type="button"
                            onClick={() => setShowSpecificationModal(true)}
                            className="h-8 px-2.5 rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)] shrink-0"
                        >
                            <i className="ph-fill ph-folder-open text-[14px] text-[var(--primary)]"></i>
                            <span className="text-[10px] font-bold hidden sm:inline">Open</span>
                        </button>
                    </Tip>
                )}

                {hasSpec && !showSchemaExplorer && !isMobile && !hideSearch && (
                    <div className="flex flex-1 items-center relative max-w-md min-w-0 select-none">
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Global Search (Ctrl+K)..."
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                            onFocus={handleSearchFocus}
                            onBlur={handleSearchBlur}
                            onKeyDown={handleSearchKeyDown}
                            className="w-full min-w-0 pl-9 pr-14 h-8 text-xs rounded-lg border outline-none focus:border-[var(--primary)] focus:bg-[var(--surface)] transition-all font-sans border-[var(--border)] text-[var(--text)] bg-[var(--background)]"
                        />
                        {searchFocused && selectedParsableKey && (
                            <SearchHistoryDropdown
                                key={searchHistoryVersion}
                                specKey={selectedParsableKey}
                                query={searchQuery}
                                onPick={q => onSearchChange(q)}
                                onClose={() => setSearchFocused(false)}
                            />
                        )}
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                            <i className="ph ph-magnifying-glass text-[14px]"></i>
                        </div>
                        {searchQuery ? (
                            <button
                                onClick={() => onSearchChange('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-[var(--text-muted)]"
                            >
                                <i className="ph ph-x text-[14px]"></i>
                            </button>
                        ) : (
                            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none select-none">
                                <kbd className="px-1.5 py-0.5 text-[9px] font-sans font-extrabold rounded border select-none bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]">
                                    Ctrl+K
                                </kbd>
                            </div>
                        )}
                    </div>
                )}

                {isMobile && !showMobileSearch && (
                    <div className="flex-1 min-w-0 px-2">
                        <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] font-medium truncate">
                            <span className="truncate">{title}</span>
                            {specFreshness?.freshness === 'stale' && (
                                <Tip content="Using cached specification">
                                    <span role="status" className="shrink-0 text-[var(--method-put)]">
                                        <i className="ph ph-warning-circle" />
                                    </span>
                                </Tip>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-1 shrink-0">
                    {hasSpec && (
                        <Tip content="Open AI Assistant" placement="bottom">
                            <button
                                type="button"
                                onClick={onOpenAssistant}
                                aria-label="Open AI Assistant"
                                className="size-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)]"
                            >
                                <i className="ph-fill ph-sparkle text-[15px]" />
                            </button>
                        </Tip>
                    )}
                    {hasSpec && !showSchemaExplorer && isMobile && !hideSearch && (
                        <Tip content="Search" placement="bottom">
                            <button
                                onClick={() => setShowMobileSearch(v => !v)}
                                aria-label="Search"
                                className="size-8 rounded-lg flex items-center justify-center border cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                            >
                                <i className="ph ph-magnifying-glass text-[16px]"></i>
                            </button>
                        </Tip>
                    )}

                    {!isMobile && hasSpec && (
                        <>
                            <Tip
                                content={
                                    authConnected ? 'Authentication active — click to edit' : 'Configure authentication'
                                }
                            >
                                <button
                                    onClick={onOpenAuthModal}
                                    className="h-8 ps-2.5 pe-2 border cursor-pointer border-[var(--border)] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all select-none hover:bg-[var(--surface-hover)]"
                                >
                                    <i
                                        className={clsx(
                                            'ph-fill ph-lock-key text-[14px]',
                                            authConnected ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]',
                                        )}
                                    ></i>
                                    <span className="hidden lg:inline">
                                        {authConnected ? `${activeAuth.activeScheme.toUpperCase()}` : 'Authorize'}
                                    </span>
                                    {authConnected && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--method-get)] animate-pulse"></span>
                                    )}
                                </button>
                            </Tip>

                            <Tip content="Download raw specification">
                                <button
                                    onClick={onDownloadSpec}
                                    aria-label="Download raw specification"
                                    className="size-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                                >
                                    <i className="ph-fill ph-download-simple text-[14px] text-[var(--primary)]"></i>
                                </button>
                            </Tip>
                        </>
                    )}

                    {hasSpec && (
                        <Tip content="Open settings">
                            <button
                                type="button"
                                onClick={onOpenSettings}
                                aria-label="Open settings"
                                className="size-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                            >
                                <i className="ph-fill ph-gear-six text-[14px] text-[var(--primary)]"></i>
                            </button>
                        </Tip>
                    )}

                    {hasSpec && (
                        <div
                            role="radiogroup"
                            aria-label="Color mode"
                            className="flex gap-0.5 rounded-lg border p-0.5 border-[var(--border)] bg-[var(--background)]"
                        >
                            {(
                                [
                                    ['system', 'ph ph-monitor', `Follow system (${resolvedThemeMode})`],
                                    ['light', 'ph-fill ph-sun', 'Light mode'],
                                    ['dark', 'ph-fill ph-moon', 'Dark mode'],
                                ] as [ThemeMode, string, string][]
                            ).map(([mode, icon, tip]) => (
                                <Tip key={mode} content={tip}>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={themeMode === mode}
                                        aria-label={tip}
                                        onClick={() => onSetThemeMode(mode)}
                                        className={clsx(
                                            'size-7 rounded-[7px] flex items-center justify-center transition-all cursor-pointer',
                                            themeMode === mode
                                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]',
                                        )}
                                    >
                                        <i className={clsx(icon, 'text-[13px]')} />
                                    </button>
                                </Tip>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showMobileSearch && !showSchemaExplorer && isMobile && (
                <div className="border-b px-3 py-2 flex items-center gap-2 bg-[var(--navbar)] border-[var(--border)]">
                    <div className="relative flex-1 min-w-0">
                        <input
                            ref={searchInputRef}
                            type="text"
                            autoFocus
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                            onFocus={handleSearchFocus}
                            onBlur={handleSearchBlur}
                            onKeyDown={handleSearchKeyDown}
                            className="w-full pl-9 pr-8 h-9 text-xs rounded-lg border outline-none focus:border-[var(--primary)] focus:bg-[var(--surface)] bg-[var(--background)] border-[var(--border)] text-[var(--text)]"
                        />
                        {searchFocused && selectedParsableKey && (
                            <SearchHistoryDropdown
                                key={searchHistoryVersion}
                                specKey={selectedParsableKey}
                                query={searchQuery}
                                onPick={q => onSearchChange(q)}
                                onClose={() => setSearchFocused(false)}
                            />
                        )}
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                            <i className="ph ph-magnifying-glass text-[14px]"></i>
                        </div>
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange('')}
                                className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer text-[var(--text-muted)]"
                            >
                                <i className="ph ph-x text-[14px]"></i>
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowMobileSearch(false)}
                        className="text-xs font-semibold text-[var(--text-muted)] px-2 py-1 cursor-pointer shrink-0"
                    >
                        Cancel
                    </button>
                </div>
            )}

            <ApiSpecificationSelectorModal
                isOpen={showSpecificationModal}
                specifications={parsables}
                selectedKey={selectedParsableKey}
                activeSpecification={spec}
                isLocalMode={isLocalMode}
                canOpenLocal={canOpenLocal}
                onOpenLocalFile={() => {
                    setShowSpecificationModal(false);
                    onOpenLocalFile();
                }}
                onReloadSpecification={onReloadSpecification}
                onResetSpecification={onResetSpecification}
                onResetAllConfigurations={onResetAllConfigurations}
                localHistory={localHistory}
                onSelectHistoryEntry={onSelectHistoryEntry}
                onRemoveHistoryEntry={onRemoveHistoryEntry}
                onClearHistory={onClearHistory}
                localOpenError={localOpenError}
                onDismissLocalError={onDismissLocalError}
                remoteLoadingEnabled={remoteLoadingEnabled}
                downloaderConfigured={downloaderConfigured}
                remoteHistory={remoteHistory}
                remoteOpenError={remoteOpenError}
                isLoadingRemoteSpec={isLoadingRemoteSpec}
                remoteLoadStatus={remoteLoadStatus}
                onLoadRemoteUrl={onLoadRemoteUrl}
                onSelectRemoteHistoryEntry={onSelectRemoteHistoryEntry}
                onRemoveRemoteHistoryEntry={onRemoveRemoteHistoryEntry}
                onClearRemoteHistory={onClearRemoteHistory}
                onSelect={k => {
                    onSelectParsable(k);
                    setShowSpecificationModal(false);
                }}
                onClose={() => setShowSpecificationModal(false)}
            />
        </>
    );
}
