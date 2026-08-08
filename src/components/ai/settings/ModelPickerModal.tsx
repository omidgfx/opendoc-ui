import clsx from 'clsx';
import type { AIModelOption } from '@/src/types';
import ModelSearchHighlight from './ModelSearchHighlight';
interface ModelPickerModalProps {
    visible: boolean;
    backdropClassName: string;
    currentModel: string;
    models: AIModelOption[];
    search: string;
    tier: 'all' | 'free' | 'premium';
    refreshing: boolean;
    onSearchChange: (value: string) => void;
    onTierChange: (value: 'all' | 'free' | 'premium') => void;
    onRefresh: () => void;
    onSelect: (model: AIModelOption) => void;
    onClose: () => void;
}
export default function ModelPickerModal({ visible, backdropClassName, currentModel, models, search, tier, refreshing, onSearchChange, onTierChange, onRefresh, onSelect, onClose }: ModelPickerModalProps) {
    if (!visible)
        return null;
    return (<div className={`${backdropClassName} fixed inset-0 z-[6100] bg-black/45`} onMouseDown={event => {
            if (event.target === event.currentTarget)
                onClose();
        }}>
            <div role="dialog" aria-modal="true" aria-labelledby="ai-model-picker-title" className="modal-surface modal-surface-model-picker flex h-[76vh] max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div className="min-w-0"><h3 id="ai-model-picker-title" className="text-sm font-extrabold text-[var(--text-heading)]">Choose a model</h3><p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">Search by model name or slug. Current: {currentModel || 'none'}</p></div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={onRefresh} disabled={refreshing} className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-50 cursor-pointer"><i className={clsx('ph ph-arrows-clockwise text-[13px]', refreshing && 'animate-spin')}/>{refreshing ? 'Refreshing…' : 'Refresh models'}</button>
                        <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"><i className="ph ph-x"/></button>
                    </div>
                </header>
                <div className="space-y-2 border-b border-[var(--border)] p-3">
                    <div className="relative"><i className="ph ph-magnifying-glass pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)]"/><input autoFocus value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Filter models by name or slug…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-2.5 ps-9 pe-3 text-xs outline-none focus:border-[var(--primary)]"/></div>
                    <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--background)] p-1">
                        {(['free', 'premium', 'all'] as const).map(filter => <button key={filter} type="button" onClick={() => onTierChange(filter)} className={clsx('flex-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer', tier === filter ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>{filter}</button>)}
                    </div>
                </div>
                <div className="modal-scroll-region min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
                    {models.length === 0 ? <p className="px-3 py-10 text-center text-xs text-[var(--text-muted)]">No models match this filter.</p> : models.map(model => {
            const selected = model.id === currentModel;
            return <button key={model.id} type="button" onClick={() => onSelect(model)} className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer', selected ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-hover)]')}><span className={clsx('flex size-7 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'bg-[var(--background)] text-[var(--text-muted)]')}><i className={selected ? 'ph ph-check text-[13px]' : 'ph ph-cpu text-[13px]'}/></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-[var(--text-heading)]"><ModelSearchHighlight text={model.label} query={search}/></span><span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--text-muted)]"><ModelSearchHighlight text={model.id} query={search}/></span></span><span className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">{model.tier}</span></button>;
        })}
                </div>
            </div>
        </div>);
}
