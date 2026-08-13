import {useEffect, useRef, useState} from 'react';
import CustomDropdown from '../../common/CustomDropdown';

interface ParameterInputProps {
    param: any;
    value: any;
    onChange: (val: any) => void;
}

const choiceText = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

const schemaType = (schema: any, fallback?: unknown): string => {
    if (Array.isArray(schema?.type)) return schema.type.find((item: string) => item !== 'null') || 'string';
    return String(schema?.type || fallback || 'string');
};

export default function ParameterInput({param, value, onChange}: ParameterInputProps) {
    const [pendingItem, setPendingItem] = useState('');
    const [manualMode, setManualMode] = useState(false);
    const customInputRef = useRef<HTMLInputElement | null>(null);
    const schema = param.schema ?? param;
    const itemSchema = schema.items || param.items || {};
    const type = schemaType(schema, param.type);
    const isArray = type === 'array' || param.type === 'array';
    const enumValues = !isArray
        ? Array.isArray(schema.enum)
            ? schema.enum
            : schema.const !== undefined
              ? [schema.const]
              : type === 'boolean'
                ? [true, false]
                : null
        : null;
    const stringValue = value === undefined || value === null ? '' : String(value);
    const documentedIndex = enumValues?.findIndex((item: any) => choiceText(item) === stringValue) ?? -1;
    const customValueActive = manualMode || (stringValue !== '' && documentedIndex < 0 && !!enumValues);
    const selectedValues: string[] = Array.isArray(value)
        ? value.map(choiceText)
        : value === undefined || value === null || value === ''
          ? []
          : String(value)
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
    const parameterIdentity = `${String(param.in || '')}:${String(param.name || '')}:${JSON.stringify(
        schema.enum ?? schema.const ?? schema.type ?? '',
    )}`;
    useEffect(() => {
        setManualMode(false);
        setPendingItem('');
    }, [parameterIdentity]);
    useEffect(() => {
        if (manualMode && documentedIndex >= 0) setManualMode(false);
    }, [documentedIndex, manualMode]);
    useEffect(() => {
        if (!manualMode) return;
        let innerFrame: number | null = null;
        const outerFrame = requestAnimationFrame(() => {
            innerFrame = requestAnimationFrame(() => customInputRef.current?.focus());
        });
        return () => {
            cancelAnimationFrame(outerFrame);
            if (innerFrame !== null) cancelAnimationFrame(innerFrame);
        };
    }, [manualMode]);

    if (isArray && Array.isArray(itemSchema.enum)) {
        const enumValues = itemSchema.enum as any[];
        const enumTexts = enumValues.map(choiceText);
        const customValues = selectedValues.filter(item => !enumTexts.includes(item));
        const toggle = (item: any) => {
            const text = choiceText(item);
            onChange(
                selectedValues.includes(text)
                    ? selectedValues.filter(valueItem => valueItem !== text)
                    : [...selectedValues, text],
            );
        };
        const addCustomItem = () => {
            const next = pendingItem.trim();
            if (!next || selectedValues.includes(next)) return;
            onChange([...selectedValues, next]);
            setPendingItem('');
        };
        return (
            <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                    {enumValues.map((item, index) => (
                        <label
                            key={`${choiceText(item)}:${index}`}
                            className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs"
                        >
                            <input
                                type="checkbox"
                                checked={selectedValues.includes(choiceText(item))}
                                onChange={() => toggle(item)}
                                className="h-3.5 w-3.5 accent-[var(--primary)]"
                            />
                            <span className="font-mono">{choiceText(item)}</span>
                        </label>
                    ))}
                </div>
                {customValues.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {customValues.map((item, index) => (
                            <span
                                key={`${item}:${index}`}
                                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[10px] text-[var(--text-heading)]"
                            >
                                <span className="max-w-[220px] truncate">{item}</span>
                                <button
                                    type="button"
                                    onClick={() => onChange(selectedValues.filter(valueItem => valueItem !== item))}
                                    className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                    aria-label={`Remove custom value ${item}`}
                                >
                                    <i className="ph ph-x text-[9px]" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <input
                        type="text"
                        aria-label={`${param.name} custom array item`}
                        value={pendingItem}
                        onChange={event => setPendingItem(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                addCustomItem();
                            }
                        }}
                        placeholder="Add custom array item"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                    />
                    <button
                        type="button"
                        onClick={addCustomItem}
                        className="rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
                    >
                        <i className="ph ph-plus me-1" />
                        Add custom
                    </button>
                </div>
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
                    {selectedValues.map((item, index) => (
                        <span
                            key={`${item}-${index}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[10px] text-[var(--text-heading)]"
                        >
                            <span className="max-w-[220px] truncate">{item}</span>
                            <button
                                type="button"
                                onClick={() => onChange(selectedValues.filter((_, itemIndex) => itemIndex !== index))}
                                className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                aria-label={`Remove item ${index + 1}`}
                            >
                                <i className="ph ph-x text-[9px]" />
                            </button>
                        </span>
                    ))}
                    {selectedValues.length === 0 && (
                        <span className="text-[10px] italic text-[var(--text-muted)]">No values added</span>
                    )}
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        aria-label={`${param.name} array item`}
                        value={pendingItem}
                        onChange={event => setPendingItem(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                addItem();
                            }
                        }}
                        placeholder="Add array item"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                    />
                    <button
                        type="button"
                        onClick={addItem}
                        className="rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
                    >
                        <i className="ph ph-plus me-1" />
                        Add
                    </button>
                </div>
            </div>
        );
    }

    if (enumValues) {
        const selectedChoice = customValueActive
            ? '__custom__'
            : documentedIndex >= 0
              ? `documented:${documentedIndex}`
              : '__empty__';
        return (
            <div className="space-y-2">
                <CustomDropdown
                    value={selectedChoice}
                    ariaLabel={`${param.name} documented values`}
                    onChange={selected => {
                        if (selected === '__custom__') {
                            setManualMode(true);
                            onChange('');
                            return;
                        }
                        setManualMode(false);
                        if (selected === '__empty__') {
                            onChange('');
                            return;
                        }
                        const index = Number(selected.split(':')[1]);
                        onChange(index >= 0 ? choiceText(enumValues[index]) : '');
                    }}
                    options={[
                        {value: '__empty__', label: '— Empty / omitted —'},
                        ...enumValues.map((item: any, index: number) => ({
                            value: `documented:${index}`,
                            label: choiceText(item),
                        })),
                        {value: '__custom__', label: 'Custom value…'},
                    ]}
                    className="w-full"
                />
                {customValueActive && (
                    <input
                        ref={customInputRef}
                        type="text"
                        aria-label={`${param.name} custom value`}
                        value={stringValue}
                        onChange={event => onChange(event.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none transition-colors focus:border-[var(--primary)]"
                        placeholder="Enter any value for a permissive test"
                    />
                )}
            </div>
        );
    }

    const firstNamedExample = Object.values(param.examples || {})[0] as any;
    const example =
        param.example ??
        firstNamedExample?.dataValue ??
        firstNamedExample?.value ??
        firstNamedExample?.serializedValue ??
        schema.example ??
        schema.default;
    const inputMode = type === 'integer' ? 'numeric' : type === 'number' ? 'decimal' : undefined;
    return (
        <input
            type="text"
            inputMode={inputMode}
            aria-label={`${param.name} value`}
            value={stringValue}
            onChange={event => onChange(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none transition-colors focus:border-[var(--primary)]"
            placeholder={
                example !== undefined
                    ? choiceText(example)
                    : type === 'object'
                      ? 'JSON value'
                      : schema.format
                        ? `${schema.format} value`
                        : param.description || 'value'
            }
        />
    );
}
