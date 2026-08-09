import {useState} from 'react';

interface ParameterInputProps {
    param: any;
    value: any;
    onChange: (val: any) => void;
}

export default function ParameterInput({param, value, onChange}: ParameterInputProps) {
    const [pendingItem, setPendingItem] = useState('');
    const schema = param.schema ?? param;
    const itemSchema = schema.items || param.items || {};
    const isArray = schema.type === 'array' || param.type === 'array';
    const selectedValues: string[] = Array.isArray(value)
        ? value.map(String)
        : value === undefined || value === null || value === ''
            ? []
            : String(value).split(',').map(item => item.trim()).filter(Boolean);
    if (isArray && Array.isArray(itemSchema.enum)) {
        const enumValues = itemSchema.enum as any[];
        const toggle = (item: any) => {
            const text = String(item);
            onChange(selectedValues.includes(text)
                ? selectedValues.filter(valueItem => valueItem !== text)
                : [...selectedValues, text]);
        };
        return (<div className="flex flex-wrap gap-2">
            {enumValues.map(item => <label key={String(item)}
                                           className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs"><input
                type="checkbox" checked={selectedValues.includes(String(item))} onChange={() => toggle(item)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"/><span
                className="font-mono">{String(item)}</span></label>)}
        </div>);
    }
    if (isArray) {
        const addItem = () => {
            const next = pendingItem.trim();
            if (!next)
                return;
            onChange([...selectedValues, next]);
            setPendingItem('');
        };
        return (<div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
                {selectedValues.map((item, index) => <span key={`${item}-${index}`}
                                                           className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[10px] text-[var(--text-heading)]"><span
                    className="max-w-[220px] truncate">{item}</span>
                    <button type="button"
                            onClick={() => onChange(selectedValues.filter((_, itemIndex) => itemIndex !== index))}
                            className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                            aria-label={`Remove item ${index + 1}`}><i className="ph ph-x text-[9px]"/></button>
                </span>)}
                {selectedValues.length === 0 &&
                    <span className="text-[10px] italic text-[var(--text-muted)]">No values added</span>}
            </div>
            <div className="flex gap-2"><input type="text" value={pendingItem}
                                               onChange={event => setPendingItem(event.target.value)}
                                               onKeyDown={event => {
                                                   if (event.key === 'Enter') {
                                                       event.preventDefault();
                                                       addItem();
                                                   }
                                               }} placeholder="Add array item"
                                               className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"/>
                <button type="button" onClick={addItem}
                        className="rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer">
                    <i className="ph ph-plus me-1"/>Add
                </button>
            </div>
        </div>);
    }
    const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
    const type = schema.type || param.type;
    const stringValue = value === undefined || value === null ? '' : String(value);
    const suggestions = enumValues || (type === 'boolean' ? [true, false] : []);
    const listId = `runner-options-${String(param.in || 'value')}-${String(param.name || 'parameter')}`
        .replace(/[^a-zA-Z0-9_-]/g, '-');
    // Deliberately use a text input even for numeric/date/boolean schemas. The
    // Runner is an HTTP client, not a client-side validator: malformed values
    // must be able to reach the API and produce the API's real error response.
    return <>
        <input type="text" inputMode={type === 'integer' || type === 'number' ? 'decimal' : undefined}
               list={suggestions.length > 0 ? listId : undefined}
               value={stringValue} onChange={event => onChange(event.target.value)}
               className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none transition-colors focus:border-[var(--primary)]"
               placeholder={schema.example !== undefined ? String(schema.example) : schema.default !== undefined ? String(schema.default) : type === 'object' ? 'JSON value' : param.description || 'value'}/>
        {suggestions.length > 0 && <datalist id={listId}>
            {suggestions.map((item: any) => <option key={String(item)} value={String(item)}/>)}
        </datalist>}
    </>;

}
