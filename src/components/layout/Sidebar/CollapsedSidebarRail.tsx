import clsx from 'clsx';
import {Tip} from '../../common/Tooltip';
import {useEndpointNotes} from '@/src/contexts/EndpointNotesContext';

interface CollapsedSidebarRailProps {
    isOverview: boolean;
    showSchemaExplorer: boolean;
    showNotes: boolean;
    showCompatibility: boolean;
    showAbout: boolean;
    /** True when an endpoint is the active workspace selection. */
    endpointSelected: boolean;
    /** Temporary overlay navigation is open. */
    flyoutOpen: boolean;
    onOpenHome: () => void;
    onOpenSchemaExplorer: () => void;
    onOpenNotes: () => void;
    onOpenCompatibility: () => void;
    onOpenAbout: () => void;
    onToggleFlyout: () => void;
}

export default function CollapsedSidebarRail({
    isOverview,
    showSchemaExplorer,
    showNotes,
    showCompatibility,
    showAbout: _showAbout,
    endpointSelected,
    flyoutOpen,
    onOpenHome,
    onOpenSchemaExplorer,
    onOpenNotes,
    onOpenCompatibility,
    onOpenAbout: _onOpenAbout,
    onToggleFlyout,
}: CollapsedSidebarRailProps) {
    const {notes} = useEndpointNotes();
    return (
        <div
            className="h-full flex flex-col items-center border-r select-none shrink-0 bg-[var(--sidebar)] border-[var(--border)]"
            style={{width: 56}}
        >
            <div className="flex-1 flex flex-col gap-1.5 my-2 items-center">
                <Tip content={flyoutOpen ? 'Close API navigation' : 'Browse API navigation'}>
                    <button
                        type="button"
                        onClick={onToggleFlyout}
                        aria-label={flyoutOpen ? 'Close API navigation' : 'Browse API navigation'}
                        aria-expanded={flyoutOpen}
                        aria-pressed={endpointSelected || flyoutOpen}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            flyoutOpen || endpointSelected
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                        )}
                    >
                        <i className={clsx('ph text-[16px]', flyoutOpen ? 'ph-sidebar-simple' : 'ph-list')} />
                    </button>
                </Tip>
                <Tip content="Overview">
                    <button
                        onClick={onOpenHome}
                        aria-current={isOverview ? 'page' : undefined}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            isOverview
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                        )}
                    >
                        <i className="ph-fill ph-house text-[16px]" />
                    </button>
                </Tip>
                <Tip content="Schema Explorer">
                    <button
                        onClick={onOpenSchemaExplorer}
                        aria-current={showSchemaExplorer ? 'page' : undefined}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showSchemaExplorer
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                        )}
                    >
                        <i className="ph-fill ph-diamonds-four text-[16px]" />
                    </button>
                </Tip>
                <Tip content="Local Notes">
                    <button
                        onClick={onOpenNotes}
                        aria-current={showNotes ? 'page' : undefined}
                        className={clsx(
                            'relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showNotes
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                        )}
                    >
                        <i className="ph-fill ph-note text-[16px]" />
                        {notes.length > 0 && (
                            <span
                                className={clsx(
                                    'absolute right-0.5 top-0.5 min-w-3.5 rounded-full px-1 text-center font-mono text-[7px] font-black',
                                    showNotes
                                        ? 'bg-[var(--primary-contrast)] text-[var(--primary)]'
                                        : 'bg-[var(--primary)] text-[var(--primary-contrast)]',
                                )}
                            >
                                {notes.length > 99 ? '99+' : notes.length}
                            </span>
                        )}
                    </button>
                </Tip>
                <Tip content="Runner Compatibility">
                    <button
                        onClick={onOpenCompatibility}
                        aria-current={showCompatibility ? 'page' : undefined}
                        className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer',
                            showCompatibility
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                        )}
                    >
                        <i className="ph-fill ph-shield-check text-[16px]" />
                    </button>
                </Tip>
            </div>
            <div className="mb-2 flex flex-col items-center gap-1.5">
                <Tip content="GitHub">
                    <a
                        href="https://github.com/omidgfx/opendoc-ui"
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub"
                        className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]"
                    >
                        <i className="ph-fill ph-github-logo text-[16px]" />
                    </a>
                </Tip>
            </div>
        </div>
    );
}
