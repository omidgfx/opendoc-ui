import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ActiveAuth, OpenApiSpec, ParsableConfig } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import ApiSpecificationSelectorModal from '../modals/ApiSpecificationSelectorModal';
import { Tip } from '../common/Tooltip';
// @ts-ignore
import Logo from '../../logo.svg?react';

interface TopbarProps {
    parsables: ParsableConfig;
    selectedParsableKey: string;
    onSelectParsable: (key: string) => void;
    activeAuth: ActiveAuth;
    onUpdateAuth: (auth: ActiveAuth) => void;
    onOpenAuthModal: () => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    currentThemeMode: 'light' | 'dark';
    onToggleThemeMode: () => void;
    onDownloadSpec: () => void;
    title: string;
    showSchemaExplorer: boolean;
    spec: OpenApiSpec | null;
    showHome: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onOpenMobileSidebar: () => void;
    onOpenThemeModal: () => void;
}

export default function Topbar({
    parsables, selectedParsableKey, onSelectParsable,
    activeAuth, searchQuery, onSearchChange,
    currentThemeMode, onToggleThemeMode, onDownloadSpec,
    title, showSchemaExplorer, spec,
    selectedThemeName, onSelectTheme, isCollapsed, onToggleCollapse,
    onOpenMobileSidebar, onOpenAuthModal, onOpenThemeModal,
}: TopbarProps & { selectedThemeName: string; onSelectTheme: (n: string) => void }) {
    const [showSpecificationModal, setShowSpecificationModal] = useState(false);
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                const ae = document.activeElement;
                if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
                e.preventDefault();
                if (isMobile) setShowMobileSearch(true);
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isMobile]);

    const authConnected = activeAuth.activeScheme && activeAuth.activeScheme !== 'none';

    return (
        <>
            <div className="h-14 sm:h-16 border-b px-2 sm:px-3 flex items-center justify-between select-none shrink-0 font-sans z-30 bg-[var(--navbar)] border-[var(--border)] gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <Tip content={isMobile ? 'Open menu' : (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar')} placement="bottom">
                        <button
                            onClick={isMobile ? onOpenMobileSidebar : onToggleCollapse}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-all cursor-pointer text-[var(--text-heading)] shrink-0">
                            <i className={`ph ${isMobile ? 'ph-list' : (isCollapsed ? 'ph-list' : 'ph-sidebar-simple')} text-[18px]`}></i>
                        </button>
                    </Tip>

                    <div className="flex items-center gap-2 hover:opacity-80 transition-all cursor-pointer select-none shrink-0">
                        <span className="size-8 sm:size-9 overflow-hidden"><Logo className="size-full" /></span>
                        <span className="font-extrabold text-sm tracking-tight hidden sm:inline text-[var(--text-heading)]">OpenDoc UI</span>
                    </div>

                    {!isMobile && (
                        <>
                            <div className="h-6 w-[1px] bg-[var(--border)]"></div>
                            <Tip content="Switch API specification">
                                <button type="button" onClick={() => setShowSpecificationModal(true)}
                                    className="flex h-8 w-48 lg:w-56 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-left text-[var(--text-heading)] transition-all cursor-pointer hover:bg-[var(--surface-hover)]">
                                    <i className="ph-fill ph-files shrink-0 text-[14px] text-[var(--primary)]" />
                                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                                        {parsables[selectedParsableKey]?.title || selectedParsableKey || 'API Specifications'}
                                    </span>
                                    <i className="ph ph-caret-down shrink-0 text-[10px] text-[var(--text-muted)]" />
                                </button>
                            </Tip>
                        </>
                    )}
                </div>

                {/* Desktop search */}
                {!showSchemaExplorer && !isMobile && (
                    <div className="hidden md:flex items-center relative max-w-md w-72 lg:w-96 select-none">
                        <input ref={searchInputRef} type="text" placeholder="Global Search (Ctrl+K)..." value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-9 pr-14 h-8 text-xs rounded-lg border outline-none focus:border-[var(--primary)] transition-all font-sans border-[var(--border)] text-[var(--text)] bg-[var(--background)]" />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                            <i className="ph ph-magnifying-glass text-[14px]"></i>
                        </div>
                        {searchQuery ? (
                            <button onClick={() => onSearchChange('')} className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-[var(--text-muted)]">
                                <i className="ph ph-x text-[14px]"></i>
                            </button>
                        ) : (
                            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none select-none">
                                <kbd className="px-1.5 py-0.5 text-[9px] font-sans font-extrabold rounded border select-none bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]">Ctrl+K</kbd>
                            </div>
                        )}
                    </div>
                )}

                {/* Title (mobile center) */}
                {isMobile && !showMobileSearch && (
                    <div className="flex-1 min-w-0 px-2">
                        <div className="text-[11px] text-[var(--text-muted)] font-medium truncate">{title}</div>
                    </div>
                )}

                <div className="flex items-center gap-1 shrink-0">
                    {!showSchemaExplorer && isMobile && (
                        <Tip content="Search" placement="bottom">
                            <button onClick={() => setShowMobileSearch(v => !v)}
                                className="size-8 rounded-lg flex items-center justify-center border cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                                <i className="ph ph-magnifying-glass text-[16px]"></i>
                            </button>
                        </Tip>
                    )}

                    {!isMobile && (
                        <>
                            <Tip content={authConnected ? 'Authentication active — click to edit' : 'Configure authentication'}>
                                <button onClick={onOpenAuthModal}
                                    className="h-8 ps-2.5 pe-2 border cursor-pointer border-[var(--border)] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all select-none hover:bg-[var(--surface-hover)]">
                                    <i className={clsx('ph-fill ph-lock-key text-[14px]',
                                        authConnected ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]')}></i>
                                    <span className="hidden lg:inline">{authConnected ? `${activeAuth.activeScheme.toUpperCase()}` : 'Authorize'}</span>
                                    {authConnected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--method-get)] animate-pulse"></span>}
                                </button>
                            </Tip>

                            <Tip content="Download raw specification">
                                <button onClick={onDownloadSpec}
                                    className="size-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                                    <i className="ph-fill ph-download-simple text-[14px] text-[var(--primary)]"></i>
                                </button>
                            </Tip>

                            <Tip content="Choose theme">
                                <button type="button" onClick={onOpenThemeModal}
                                    className="hidden lg:flex h-8 w-44 items-center gap-2 rounded-lg border px-3 text-left transition-all cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                                    <i className="ph-fill ph-palette shrink-0 text-[14px] text-[var(--primary)]"></i>
                                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{selectedThemeName}</span>
                                    <i className="ph ph-squares-four shrink-0 text-[12px] text-[var(--text-muted)]/60"></i>
                                </button>
                            </Tip>
                        </>
                    )}

                    <Tip content={currentThemeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                        <button onClick={onToggleThemeMode}
                            className="size-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                            {currentThemeMode === 'dark'
                                ? <i className="ph ph-sun text-[var(--method-put)] text-[16px]"></i>
                                : <i className="ph-fill ph-moon text-[var(--primary)] text-[16px]"></i>}
                        </button>
                    </Tip>
                </div>
            </div>

            {showMobileSearch && !showSchemaExplorer && isMobile && (
                <div className="sm:hidden border-b px-3 py-2 flex items-center gap-2 bg-[var(--navbar)] border-[var(--border)]">
                    <div className="relative flex-1 min-w-0">
                        <input ref={searchInputRef} type="text" autoFocus placeholder="Search..." value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-9 pr-8 h-9 text-xs rounded-lg border outline-none focus:border-[var(--primary)] bg-[var(--background)] border-[var(--border)] text-[var(--text)]" />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                            <i className="ph ph-magnifying-glass text-[14px]"></i>
                        </div>
                        {searchQuery && (
                            <button onClick={() => onSearchChange('')} className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer text-[var(--text-muted)]">
                                <i className="ph ph-x text-[14px]"></i>
                            </button>
                        )}
                    </div>
                    <button onClick={() => setShowMobileSearch(false)} className="text-xs font-semibold text-[var(--text-muted)] px-2 py-1 cursor-pointer shrink-0">Cancel</button>
                </div>
            )}

            <ApiSpecificationSelectorModal
                isOpen={showSpecificationModal}
                specifications={parsables}
                selectedKey={selectedParsableKey}
                activeSpecification={spec}
                onSelect={(k) => { onSelectParsable(k); setShowSpecificationModal(false); }}
                onClose={() => setShowSpecificationModal(false)} />
        </>
    );
}
