import {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '../../../types';
import CustomDropdown from '../../common/CustomDropdown';
import StructuredValueEditor from './StructuredValueEditor';
import {Tip} from '../../common/Tooltip';
import {enumDropdownOptions, enumValueDescriptions, enumValueText} from '../../../utils/enumOptions';
import {resolved} from '../../../utils/runner/recursiveBody';

interface ParameterInputProps {
    param: any;
    value: any;
    onChange: (val: any) => void;
    spec: OpenApiSpec;
}

const schemaType = (schema: any, fallback?: unknown): string => {
    if (Array.isArray(schema?.type)) return schema.type.find((item: string) => item !== 'null') || 'string';
    return String(schema?.type || fallback || 'string');
};

export default function ParameterInput({param, value, onChange, spec}: ParameterInputProps) {
    const [pendingItem, setPendingItem] = useState('');
    const [manualMode, setManualMode] = useState(false);
    const customInputRef = useRef<HTMLInputElement | null>(null);
    const sourceSchema = param.schema ?? param;
    const schema = resolved(sourceSchema, spec);
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
    const pattern = String(schema.pattern || param.pattern || '');
    // Live pattern feedback: the field says whether the value would be accepted
    // before the request is ever sent.
    const patternState = useMemo((): {status: 'idle' | 'match' | 'mismatch' | 'broken'; message: string} => {
        if (!pattern) return {status: 'idle', message: ''};
        if (!stringValue) return {status: 'idle', message: `Must match ${pattern}`};
        try {
            return new RegExp(pattern).test(stringValue)
                ? {status: 'match', message: `Matches ${pattern}`}
                : {status: 'mismatch', message: `Does not match ${pattern}`};
        } catch {
            return {status: 'broken', message: `The pattern ${pattern} is not a valid regular expression.`};
        }
    }, [pattern, stringValue]);
    // A value that does not match a pattern is a warning, not an error: the
    // Runner still lets it through for negative testing.
    const patternColor =
        patternState.status === 'match'
            ? 'var(--method-get)'
            : patternState.status === 'idle'
              ? 'var(--border)'
              : 'var(--method-put)';
    const patternInputClassName = clsx(
        'w-full rounded-lg border bg-[var(--background)] py-2 ps-3 text-xs text-[var(--text-heading)] outline-none transition-colors',
        pattern ? 'pe-9' : 'pe-3',
        patternState.status === 'idle' && 'focus:border-[var(--primary)]',
    );
    // Inline, so the focus colour of the base class can never win over the
    // state the indicator is showing.
    const patternInputStyle = patternState.status === 'idle' ? undefined : {borderColor: patternColor};
    const patternIndicator =
        patternState.status === 'idle' || !pattern ? null : (
            <Tip
                content={patternState.message}
                // Inline, because the tooltip wrapper carries its own
                // `relative` class and class order would decide the winner.
                wrapperStyle={{position: 'absolute', insetInlineEnd: 4, top: '50%', transform: 'translateY(-50%)'}}
                wrapperClassName="z-[1] cursor-help p-1 leading-none"
            >
                <span className="text-[13px] leading-none" style={{color: patternColor}}>
                    <i
                        className={
                            patternState.status === 'match' ? 'ph-fill ph-check-circle' : 'ph-fill ph-warning-circle'
                        }
                    />
                </span>
            </Tip>
        );
    const documentedIndex = enumValues?.findIndex((item: any) => enumValueText(item) === stringValue) ?? -1;
    const customValueActive = manualMode || (stringValue !== '' && documentedIndex < 0 && !!enumValues);
    const listFromText = (text: string): string[] => {
        const trimmed = text.trim();
        // A saved array may arrive as JSON text; splitting that on commas would
        // tear the document apart, so parse it first.
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(enumValueText);
            } catch {}
        }
        return trimmed
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    };
    const selectedValues: string[] = Array.isArray(value)
        ? value.map(enumValueText)
        : value === undefined || value === null || value === ''
          ? []
          : listFromText(String(value));
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
        const enumTexts = enumValues.map(enumValueText);
        const enumDescriptions = enumValueDescriptions(itemSchema);
        const customValues = selectedValues.filter(item => !enumTexts.includes(item));
        const toggle = (item: any) => {
            const text = enumValueText(item);
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
                            key={`${enumValueText(item)}:${index}`}
                            className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs"
                        >
                            <input
                                type="checkbox"
                                checked={selectedValues.includes(enumValueText(item))}
                                onChange={() => toggle(item)}
                                className="h-3.5 w-3.5 accent-[var(--primary)]"
                            />
                            <span className="min-w-0">
                                <span className="block font-mono">{enumValueText(item)}</span>
                                {enumDescriptions.get(enumValueText(item)) && (
                                    <span className="block text-[9px] text-[var(--text-muted)]">
                                        {enumDescriptions.get(enumValueText(item))}
                                    </span>
                                )}
                            </span>
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
                        onChange(index >= 0 ? enumValueText(enumValues[index]) : '');
                    }}
                    options={[
                        {value: '__empty__', label: '— Empty / omitted —'},
                        ...enumDropdownOptions(
                            enumValues,
                            {
                                ...schema,
                                description: param.description || sourceSchema.description || schema.description,
                            },
                            (_item, index) => `documented:${index}`,
                        ),
                        {value: '__custom__', label: 'Custom value…'},
                    ]}
                    className="w-full"
                />
                {customValueActive && (
                    <div className="relative">
                        <input
                            ref={customInputRef}
                            type="text"
                            aria-label={`${param.name} custom value`}
                            aria-invalid={patternState.status === 'mismatch'}
                            value={stringValue}
                            onChange={event => onChange(event.target.value)}
                            className={patternInputClassName}
                            style={patternInputStyle}
                            placeholder="Enter any value for a permissive test"
                        />
                        {patternIndicator}
                    </div>
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
    if (type === 'object') {
        return (
            <StructuredValueEditor
                value={stringValue}
                onChange={onChange}
                ariaLabel={`${param.name} value`}
                placeholder={example !== undefined ? enumValueText(example) : '{ "key": "value" }'}
            />
        );
    }
    return (
        <div className="relative">
            <input
                type="text"
                inputMode={inputMode}
                aria-label={`${param.name} value`}
                aria-invalid={patternState.status === 'mismatch'}
                value={stringValue}
                onChange={event => onChange(event.target.value)}
                className={patternInputClassName}
                style={patternInputStyle}
                placeholder={
                    example !== undefined
                        ? enumValueText(example)
                        : schema.format
                          ? `${schema.format} value`
                          : param.description || 'value'
                }
            />
            {patternIndicator}
        </div>
    );
}
