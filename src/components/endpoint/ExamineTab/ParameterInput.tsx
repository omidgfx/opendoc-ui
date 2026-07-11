interface ParameterInputProps {
    param: any;
    value: any;
    onChange: (val: any) => void;
}

export default function ParameterInput({ param, value, onChange }: ParameterInputProps) {
    // Array-enum → multi-select checkboxes
    if (param.type === 'array' && param.items?.enum) {
        const enumValues = param.items.enum as string[];
        const selectedValues: string[] = Array.isArray(value) ? value : value ? [String(value)] : [];
        const toggle = (val: string) => {
            const next = selectedValues.includes(val) ? selectedValues.filter(v => v !== val) : [...selectedValues, val];
            onChange(next);
        };
        return (
            <div className="flex flex-wrap gap-2">
                {enumValues.map((val: string) => (
                    <label key={val} className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={selectedValues.includes(val)}
                            onChange={() => toggle(val)}
                            className="w-3.5 h-3.5 accent-[var(--primary)]"
                        />
                        <span className="font-mono">{val}</span>
                    </label>
                ))}
            </div>
        );
    }

    return (
        <input
            type="text"
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors focus:border-[var(--primary)] bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"
            placeholder={param.description || 'value'}
        />
    );
}
