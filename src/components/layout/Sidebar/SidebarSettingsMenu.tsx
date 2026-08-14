import type {RefObject} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';
import type {SidebarConfig, SidebarFolderBehavior, SidebarSortBy, SidebarSortDirection} from '@/src/utils/sidebar/tree';

interface SidebarSettingsMenuProps {
    open: boolean;
    menuRef: RefObject<HTMLDivElement | null>;
    position: {
        top: number;
        left: number;
    };
    config: SidebarConfig;
    isMobile: boolean;
    folderItemRef: RefObject<HTMLDivElement | null>;
    folderOpen: boolean;
    folderPosition: {
        top: number;
        left: number;
    };
    sortItemRef: RefObject<HTMLDivElement | null>;
    sortOpen: boolean;
    sortPosition: {
        top: number;
        left: number;
    };
    closeAll: () => void;
    closeFolder: () => void;
    openFolder: () => void;
    setFolderOpen: (open: boolean) => void;
    updateFolder: (value: SidebarFolderBehavior) => void;
    closeSort: () => void;
    openSort: () => void;
    scheduleSortClose: () => void;
    updateConfig: (patch: Partial<SidebarConfig>) => void;
    hiddenEndpointCount: number;
    onUnhideAllEndpoints: () => void;
}

export default function SidebarSettingsMenu(props: SidebarSettingsMenuProps) {
    const {
        open: settingsMenuOpen,
        menuRef: settingsMenuRef,
        position: settingsMenuPosition,
        config: sidebarConfig,
        isMobile,
        folderItemRef: folderBehaviorItemRef,
        folderOpen: folderBehaviorMenuOpen,
        folderPosition: folderBehaviorMenuPosition,
        sortItemRef: sortMenuItemRef,
        sortOpen: sortMenuOpen,
        sortPosition: sortMenuPosition,
        closeAll: closeAllSubmenus,
        closeFolder: closeFolderBehaviorMenu,
        openFolder: openFolderBehaviorMenu,
        setFolderOpen: setFolderBehaviorMenuOpen,
        updateFolder: updateFolderBehavior,
        closeSort: closeSortMenu,
        openSort: openSortMenu,
        scheduleSortClose: scheduleSortMenuClose,
        updateConfig: updateSidebarConfig,
        hiddenEndpointCount,
        onUnhideAllEndpoints,
    } = props;
    return (
        <>
            {settingsMenuOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        ref={settingsMenuRef}
                        role="menu"
                        aria-label="API navigation settings"
                        className="fixed z-[10000] w-[252px] rounded-xl border shadow-2xl py-1.5 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] animate-fade-in"
                        style={{
                            top: settingsMenuPosition.top,
                            left: settingsMenuPosition.left,
                        }}
                        onClick={event => event.stopPropagation()}
                        onContextMenu={event => event.preventDefault()}
                    >
                        <div className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            Navigation settings
                        </div>

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.displayRoutes}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({displayRoutes: !sidebarConfig.displayRoutes});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-path text-[14px] text-[var(--primary)] shrink-0" />
                            <span className="flex-1 min-w-0">Show endpoint routes</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.displayRoutes
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.flattenTags}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({flattenTags: !sidebarConfig.flattenTags});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-arrows-out-line-horizontal text-[14px] text-[var(--primary)] shrink-0" />
                            <span className="flex-1 min-w-0">Flatten tag folders</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.flattenTags
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.pagesFirst}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({pagesFirst: !sidebarConfig.pagesFirst});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-stack text-[14px] text-[var(--primary)] shrink-0" />
                            <span className="flex-1 min-w-0">Pages first</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.pagesFirst
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.compactMethodNames}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({compactMethodNames: !sidebarConfig.compactMethodNames});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-text-aa text-[14px] text-[var(--primary)] shrink-0" />
                            <span className="flex-1 min-w-0">Compact method names</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.compactMethodNames
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <div
                            ref={folderBehaviorItemRef}
                            className="relative"
                            onMouseLeave={() => {
                                if (!isMobile) closeFolderBehaviorMenu();
                            }}
                        >
                            <button
                                type="button"
                                role="menuitem"
                                aria-haspopup="menu"
                                aria-expanded={folderBehaviorMenuOpen}
                                onMouseEnter={() => {
                                    if (!isMobile) openFolderBehaviorMenu();
                                }}
                                onClick={() => {
                                    if (isMobile && folderBehaviorMenuOpen) closeFolderBehaviorMenu();
                                    else openFolderBehaviorMenu();
                                }}
                                className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                            >
                                <i className="ph ph-tree-structure text-[14px] text-[var(--primary)] shrink-0" />
                                <span className="flex-1 min-w-0">Tag folder behavior</span>
                                <span className="text-[10px] text-[var(--text-muted)]">
                                    {sidebarConfig.folderBehavior === 'single' ? 'Single open' : 'Multiple open'}
                                </span>
                                <i className="ph ph-caret-right text-[11px] text-[var(--text-muted)] shrink-0" />
                            </button>

                            {folderBehaviorMenuOpen && (
                                <div
                                    role="menu"
                                    aria-label="Tag folder behavior"
                                    className="fixed z-[10001] w-[218px] rounded-xl border shadow-2xl py-1 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] animate-fade-in"
                                    style={{
                                        top: folderBehaviorMenuPosition.top,
                                        left: folderBehaviorMenuPosition.left,
                                    }}
                                    onMouseEnter={() => {
                                        if (!isMobile) setFolderBehaviorMenuOpen(true);
                                    }}
                                    onMouseLeave={() => {
                                        if (!isMobile) closeFolderBehaviorMenu();
                                    }}
                                    onClick={event => event.stopPropagation()}
                                >
                                    <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        Tag folder behavior
                                    </div>
                                    {[
                                        {
                                            value: 'multiple' as SidebarFolderBehavior,
                                            label: 'Allow multiple tag folders open',
                                            description: 'Folders stay open independently',
                                        },
                                        {
                                            value: 'single' as SidebarFolderBehavior,
                                            label: 'One tag folder open at a time',
                                            description: 'Opening one closes the others',
                                        },
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={sidebarConfig.folderBehavior === option.value}
                                            onClick={() => updateFolderBehavior(option.value)}
                                            className={clsx(
                                                'w-full text-left px-3 py-2 text-[11px] flex items-start gap-2 transition-colors cursor-pointer hover:bg-[var(--surface-hover)]',
                                                sidebarConfig.folderBehavior === option.value
                                                    ? 'text-[var(--primary)]'
                                                    : 'text-[var(--text)]',
                                            )}
                                        >
                                            <i
                                                className={clsx(
                                                    'ph ph-check text-[11px] shrink-0 mt-0.5',
                                                    sidebarConfig.folderBehavior === option.value
                                                        ? 'opacity-100'
                                                        : 'opacity-0',
                                                )}
                                            />
                                            <span className="min-w-0">
                                                <span className="block font-medium">{option.label}</span>
                                                <span className="block mt-0.5 text-[9px] leading-snug text-[var(--text-muted)]">
                                                    {option.description}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div
                            ref={sortMenuItemRef}
                            className="relative"
                            onMouseLeave={() => {
                                if (!isMobile) scheduleSortMenuClose();
                            }}
                        >
                            <button
                                type="button"
                                role="menuitem"
                                aria-haspopup="menu"
                                aria-expanded={sortMenuOpen}
                                onMouseEnter={() => {
                                    if (!isMobile) openSortMenu();
                                }}
                                onClick={() => {
                                    if (isMobile && sortMenuOpen) closeSortMenu();
                                    else openSortMenu();
                                }}
                                className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                            >
                                <i className="ph ph-sort-ascending text-[14px] text-[var(--primary)] shrink-0" />
                                <span className="flex-1 min-w-0">Sort by</span>
                                <span className="text-[10px] text-[var(--text-muted)]">
                                    {sidebarConfig.sortBy === 'name'
                                        ? 'Name'
                                        : sidebarConfig.sortBy === 'method'
                                          ? 'Method'
                                          : 'Route'}
                                </span>
                                <i className="ph ph-caret-right text-[11px] text-[var(--text-muted)] shrink-0" />
                            </button>

                            {sortMenuOpen && (
                                <div
                                    role="menu"
                                    aria-label="Sort API navigation"
                                    className="fixed z-[10001] w-[174px] rounded-xl border shadow-2xl py-1 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] animate-fade-in"
                                    style={{top: sortMenuPosition.top, left: sortMenuPosition.left}}
                                    onMouseEnter={() => {
                                        if (!isMobile) openSortMenu();
                                    }}
                                    onMouseLeave={() => {
                                        if (!isMobile) scheduleSortMenuClose();
                                    }}
                                    onClick={event => event.stopPropagation()}
                                >
                                    <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        Sort by
                                    </div>
                                    {[
                                        {value: 'name' as SidebarSortBy, label: 'Name'},
                                        {value: 'method' as SidebarSortBy, label: 'Method'},
                                        {value: 'route' as SidebarSortBy, label: 'Route'},
                                    ].map(option => {
                                        const disabled = option.value === 'route' && !sidebarConfig.displayRoutes;
                                        const selected = sidebarConfig.sortBy === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="menuitemradio"
                                                aria-checked={selected}
                                                aria-disabled={disabled}
                                                disabled={disabled}
                                                onClick={() => {
                                                    if (!disabled) {
                                                        updateSidebarConfig({sortBy: option.value});
                                                        closeSortMenu();
                                                    }
                                                }}
                                                className={clsx(
                                                    'w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 transition-colors',
                                                    disabled
                                                        ? 'cursor-not-allowed opacity-35'
                                                        : 'cursor-pointer hover:bg-[var(--surface-hover)]',
                                                    selected && !disabled
                                                        ? 'text-[var(--primary)]'
                                                        : 'text-[var(--text)]',
                                                )}
                                            >
                                                <i
                                                    className={clsx(
                                                        'ph ph-check text-[11px] shrink-0',
                                                        selected ? 'opacity-100' : 'opacity-0',
                                                    )}
                                                />
                                                <span className="flex-1">{option.label}</span>
                                                {disabled && (
                                                    <i className="ph ph-lock-key text-[10px] text-[var(--text-muted)]" />
                                                )}
                                            </button>
                                        );
                                    })}
                                    <div className="my-1 border-t border-[var(--border)]" />
                                    {[
                                        {value: 'asc' as SidebarSortDirection, label: 'Ascending'},
                                        {value: 'desc' as SidebarSortDirection, label: 'Descending'},
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={sidebarConfig.sortDirection === option.value}
                                            onClick={() => {
                                                updateSidebarConfig({sortDirection: option.value});
                                                closeSortMenu();
                                            }}
                                            className={clsx(
                                                'w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--surface-hover)]',
                                                sidebarConfig.sortDirection === option.value
                                                    ? 'text-[var(--primary)]'
                                                    : 'text-[var(--text)]',
                                            )}
                                        >
                                            <i
                                                className={clsx(
                                                    'ph ph-check text-[11px] shrink-0',
                                                    sidebarConfig.sortDirection === option.value
                                                        ? 'opacity-100'
                                                        : 'opacity-0',
                                                )}
                                            />
                                            <span>{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="my-1 border-t border-[var(--border)]" />

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.hideEndpointCount}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({hideEndpointCount: !sidebarConfig.hideEndpointCount});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-hash text-[14px] text-[var(--primary)] shrink-0" />
                            <span className="flex-1 min-w-0">Hide endpoint counts</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.hideEndpointCount
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.hideProtectedIcon}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({hideProtectedIcon: !sidebarConfig.hideProtectedIcon});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-lock-key text-[14px] text-[var(--method-delete)] shrink-0" />
                            <span className="flex-1 min-w-0">Hide protected icon</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.hideProtectedIcon
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={sidebarConfig.hideDeprecatedEndpoints}
                            onClick={() => {
                                closeAllSubmenus();
                                updateSidebarConfig({hideDeprecatedEndpoints: !sidebarConfig.hideDeprecatedEndpoints});
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                        >
                            <i className="ph ph-warning-circle text-[14px] text-[var(--method-put)] shrink-0" />
                            <span className="flex-1 min-w-0">Hide deprecated endpoints</span>
                            <span
                                className={clsx(
                                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                    sidebarConfig.hideDeprecatedEndpoints
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                        : 'border-[var(--border)] text-transparent',
                                )}
                            >
                                <i className="ph ph-check text-[11px]" />
                            </span>
                        </button>

                        <div className="my-1 border-t border-[var(--border)]" />
                        <button
                            type="button"
                            role="menuitem"
                            disabled={hiddenEndpointCount === 0}
                            onClick={() => {
                                closeAllSubmenus();
                                onUnhideAllEndpoints();
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                            <i className="ph ph-eye text-[14px] text-[var(--primary)] shrink-0" />
                            <span className="min-w-0 flex-1">Unhide all endpoints</span>
                            <span className="rounded-full bg-[var(--text-muted)]/10 px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                                {hiddenEndpointCount}
                            </span>
                        </button>
                    </div>,
                    document.body,
                )}
        </>
    );
}
