import clsx from 'clsx';
import MethodBadge from '@/src/components/common/MethodBadge';

interface FiltersPanelProps {
    allMethods: string[];
    allTags: string[];
    selectedMethods: string[];
    selectedTags: string[];
    onlyProtected: boolean | null;
    handleToggleMethod: (method: string) => void;
    handleToggleTag: (tag: string) => void;
    setOnlyProtected: (value: boolean | null) => void;
    handleClearFilters: () => void;
    hasActiveFilters: boolean;
}

export default function FiltersPanel({
                                         allMethods,
                                         allTags,
                                         selectedMethods,
                                         selectedTags,
                                         onlyProtected,
                                         handleToggleMethod,
                                         handleToggleTag,
                                         setOnlyProtected,
                                         handleClearFilters,
                                         hasActiveFilters,
                                     }: FiltersPanelProps) {
    return (<div className="p-4 rounded-xl border space-y-5 border-[var(--border)] bg-[var(--surface)]">
        <div className="flex h-4 items-center justify-between">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-[var(--text-muted)]">
                <i className="ph ph-funnel text-[16px]"/>
                Advanced Filters
            </h3>
            {hasActiveFilters && (<button onClick={handleClearFilters}
                                          className="text-[8px] font-bold text-[var(--method-delete)] cursor-pointer bg-transparent border-none py-0.5 px-1 rounded-md hover:bg-[var(--method-delete)]/10 transition-colors">
                Clear
            </button>)}
        </div>

        <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Method</h4>
            <div className="grid grid-cols-2 gap-1.5">
                {allMethods.map(method => {
                    const isChecked = selectedMethods.includes(method);
                    return (<button key={method} onClick={() => handleToggleMethod(method)}
                                    className={clsx('flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-xs transition-all cursor-pointer font-sans select-none hover:bg-[var(--surface-hover)]', isChecked ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] bg-transparent')}>
                        <span
                            className={clsx('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all text-[8.5px] font-bold', isChecked ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] bg-[var(--text)]/5')}>
                            {isChecked && <i className="ph ph-check"/>}
                        </span>
                        <MethodBadge method={method} size="xs" variant="plain"/>
                    </button>);
                })}
            </div>
        </div>

        <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Access</h4>
            <div className="flex flex-col gap-1.5">
                {[
                    {label: 'Any', value: null, icon: 'ph-globe'},
                    {label: 'Protected', value: true, icon: 'ph-lock-key text-[var(--method-delete)]'},
                    {label: 'Public', value: false, icon: 'ph-lock-key-open text-[var(--method-get)]'},
                ].map(option => {
                    const isSelected = onlyProtected === option.value;
                    return (<button key={option.label} onClick={() => setOnlyProtected(option.value)}
                                    className={clsx('flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all cursor-pointer font-sans select-none hover:bg-[var(--surface-hover)]', isSelected ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)] font-semibold' : 'border-[var(--border)] bg-transparent text-[var(--text)]')}>
                        <span
                            className={clsx('size-3.5 rounded-full border flex items-center justify-center shrink-0 transition-all bg-[var(--text)]/5', isSelected ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)]')}>
                            {isSelected && <i className="bg-current size-2 rounded-full block"/>}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <i className={`ph-fill ${option.icon} text-[14px]`}/>
                            <span>{option.label}</span>
                        </span>
                    </button>);
                })}
            </div>
        </div>

        <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tags</h4>
            <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto scrollbar-thin pr-1">
                {allTags.map(tag => {
                    const isChecked = selectedTags.includes(tag);
                    return (<button key={tag} onClick={() => handleToggleTag(tag)}
                                    className={clsx('flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all cursor-pointer font-sans select-none hover:bg-[var(--surface-hover)]', isChecked ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)] font-semibold' : 'border-[var(--border)] bg-transparent text-[var(--text)]')}>
                        <span
                            className={clsx('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all text-[8px] font-bold', isChecked ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] bg-[var(--text)]/5')}>
                            {isChecked && <i className="ph ph-check"/>}
                        </span>
                        <span className="truncate">{tag}</span>
                    </button>);
                })}
            </div>
        </div>
    </div>);
}
