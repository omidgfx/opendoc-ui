import {useState} from 'react';

interface ParameterInputProps {
    param: any;
    value: any;
    onChange: (val: any) => void;
}

export default function ParameterInput({param, value, onChange}: ParameterInputProps) {
    const [pendingItem, setPendingItem] = useState('');
    const isArray = param.schema?.type === 'array' || param.type === 'array';
    const selectedValues: string[] = Array.isArray(value)
        ? value.map(String)
        : value === undefined || value === null || value === ''
            ? []
            : String(value).split(',').map(item => item.trim()).filter(Boolean);

    if (isArray && param.items?.enum) {
        const enumValues = param.items.enum as string[];
        const toggle = (item: string) => onChange(selectedValues.includes(item)
            ? selectedValues.filter(valueItem => valueItem !== item)
            : [...selectedValues, item]);
        return (
            <div className="flex flex-wrap gap-2">
                {enumValues.map((item: string) => <label key={item} className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs"><input type="checkbox" checked={selectedValues.includes(item)} onChange={() => toggle(item)} className="h-3.5 w-3.5 accent-[var(--primary)]"/><span className="font-mono">{item}</span></label>)}
            </div>
        );
    }

    if (isArray) {
        const addItem = () => {
            const next = pendingItem.trim();
            if (!next) return;
            onChange([...selectedValues, next]);
            setPendingItem('');
        };
        return (
            <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                    {selectedValues.map((item, index) => <span key={`${item}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[10px] text-[var(--text-heading)]"><span className="max-w-[220px] truncate">{item}</span><button type="button" onClick={() => onChange(selectedValues.filter((_, itemIndex) => itemIndex !== index))} className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer" aria-label={`Remove item ${index + 1}`}><i className="ph ph-x text-[9px]"/></button></span>)}
                    {selectedValues.length === 0 && <span className="text-[10px] italic text-[var(--text-muted)]">No values added</span>}
                </div>
                <div className="flex gap-2"><input type="text" value={pendingItem} onChange={event => setPendingItem(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); addItem();}}} placeholder="Add array item" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"/><button type="button" onClick={addItem} className="rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"><i className="ph ph-plus me-1"/>Add</button></div>
            </div>
        );
    }

    const type = param.schema?.type || param.type;
    const inputType = type === 'integer' || type === 'number' ? 'number' : type === 'boolean' ? 'text' : 'text';
    return <input type={inputType} value={value === undefined || value === null ? '' : String(value)} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none transition-colors focus:border-[var(--primary)]" placeholder={type === 'object' ? 'JSON value' : param.description || 'value'}/>;
}
