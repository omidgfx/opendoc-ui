import clsx from 'clsx';
import {type TabItem, VIEW_TAB_META, type ViewTabKind} from '../endpoint/EndpointTabs';
import MethodBadge from '../common/MethodBadge';

interface TabSwitcherOverlayProps {
    open: boolean;
    tabs: TabItem[];
    activeTabId: string | null;
    selectedIndex: number;
    onCancel: () => void;
    onSelect: (id: string) => void;
}

export default function TabSwitcherOverlay({
    open,
    tabs,
    activeTabId,
    selectedIndex,
    onCancel,
    onSelect,
}: TabSwitcherOverlayProps) {
    if (!open || tabs.length <= 1) return null;
    return (
        <div
            className="modal-backdrop fixed inset-0 z-[6000] bg-black/40 backdrop-blur-[2px] md:!items-start md:pt-[16vh]"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <div className="modal-surface w-[440px] max-w-[92vw] rounded-2xl border shadow-2xl overflow-hidden bg-[var(--surface)] border-[var(--border)]">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--background)]">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                        <i className="ph ph-tabs text-[13px] text-[var(--primary)]" />
                        Tab Switcher
                    </span>
                    <span className="text-[9.5px] text-[var(--text-muted)] flex items-center gap-1 select-none">
                        <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)]">
                            Ctrl
                        </kbd>
                        +<kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)]">`</kbd>
                        <span className="mx-1 opacity-50">·</span> release to switch
                    </span>
                </div>
                <div className="py-1.5 max-h-[52vh] overflow-y-auto scrollbar-thin">
                    {tabs.map((tab, index) => {
                        const selected = index === Math.min(selectedIndex, tabs.length - 1);
                        const current = tab.id === activeTabId;
                        const viewTabMeta =
                            tab.kind && tab.kind !== 'endpoint' ? VIEW_TAB_META[tab.kind as ViewTabKind] : null;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => onSelect(tab.id)}
                                className={clsx(
                                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
                                    selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--surface-hover)]',
                                )}
                            >
                                {viewTabMeta ? (
                                    <span className="shrink-0 w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--primary)] bg-[var(--background)]">
                                        <i className={`${viewTabMeta.icon} text-[14px]`} />
                                    </span>
                                ) : (
                                    <MethodBadge method={tab.method} size="xs" className="shrink-0 w-10 h-4" />
                                )}
                                <span
                                    className={clsx(
                                        'flex-1 min-w-0 truncate text-xs font-semibold',
                                        selected ? 'text-[var(--text-heading)]' : 'text-[var(--text)]',
                                    )}
                                >
                                    {tab.label}
                                </span>
                                {current && (
                                    <span className="shrink-0 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-[var(--primary)]">
                                        <i className="ph-fill ph-dot-outline text-[10px]" />
                                        Current
                                    </span>
                                )}
                                {tab.isPreview && (
                                    <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        Preview
                                    </span>
                                )}
                                {selected && (
                                    <i className="ph ph-caret-right text-[14px] text-[var(--primary)] shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
