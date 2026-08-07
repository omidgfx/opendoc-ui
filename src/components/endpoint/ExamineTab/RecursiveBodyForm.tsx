import {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '../../../types';
import {resolveReference} from '../../../utils/openapi';
import Markdown from '../../common/Markdown';
import {Tip} from '../../common/Tooltip';

export type BodyValue = unknown;

type PathPart = string | number;

interface RecursiveBodyFormProps {
    schema: any;
    spec: OpenApiSpec;
    value: BodyValue;
    onChange: (value: BodyValue) => void;
    setPatternToTest: (pattern: string | null) => void;
    selectedFiles: Record<string, File | null>;
    setSelectedFiles: (value: Record<string, File | null>) => void;
}

interface FieldProps {
    schema: any;
    spec: OpenApiSpec;
    value: unknown;
    label: string;
    required?: boolean;
    path: PathPart[];
    depth: number;
    onChange: (path: PathPart[], value: unknown) => void;
    setPatternToTest: (pattern: string | null) => void;
    selectedFiles: Record<string, File | null>;
    setSelectedFiles: (value: Record<string, File | null>) => void;
    actions?: ReactNode;
}

const fieldClass = 'w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]';
const mutedLineClass = 'text-[var(--text-muted)]';
export const DESCRIPTION_TOOLTIP_THRESHOLD = 160;

export const usesDescriptionTooltip = (description?: string): boolean =>
    !!description && description.trim().length > DESCRIPTION_TOOLTIP_THRESHOLD;

const resolved = (schema: any, spec: OpenApiSpec): any => {
    const source = schema?.$ref ? resolveReference(schema, spec) || schema : schema || {};
    if (!Array.isArray(source.allOf)) return source;
    const merged: any = {...source, properties: {...(source.properties || {})}, required: [...(source.required || [])]};
    delete merged.allOf;
    source.allOf.forEach((part: any) => {
        const child = resolved(part, spec);
        const {properties, required, ...childMetadata} = child;
        Object.assign(merged, childMetadata);
        merged.properties = {...(merged.properties || {}), ...(properties || {})};
        merged.required = Array.from(new Set([...(merged.required || []), ...(required || [])]));
    });
    return merged;
};

export const defaultBodyValue = (schema: any, spec: OpenApiSpec): any => {
    const current = resolved(schema, spec);
    if (current.example !== undefined) return current.example;
    if (current.default !== undefined) return current.default;
    if (Array.isArray(current.enum) && current.enum.length > 0) return current.enum[0];
    if (current.oneOf?.length) return defaultBodyValue(current.oneOf[0], spec);
    if (current.anyOf?.length) return defaultBodyValue(current.anyOf[0], spec);
    if (current.type === 'object' || current.properties) {
        return Object.fromEntries(Object.entries(current.properties || {}).map(([key, child]) => [key, defaultBodyValue(child, spec)]));
    }
    if (current.type === 'array') return [];
    if (current.type === 'boolean') return false;
    if (current.type === 'integer' || current.type === 'number') return '';
    return '';
};

const setAtPath = (root: any, path: PathPart[], nextValue: unknown): any => {
    if (path.length === 0) return nextValue;
    const [head, ...tail] = path;
    const copy = Array.isArray(root) ? [...root] : {...(root && typeof root === 'object' ? root : {})};
    copy[head] = setAtPath(copy[head], tail, nextValue);
    return copy;
};

const removeAtPath = (root: any[], index: number): any[] => root.filter((_, itemIndex) => itemIndex !== index);

function DescriptionTip({description}: {description?: string}) {
    if (!description?.trim()) return null;
    return (
        <Tip interactive variant="surface" content={<div className="max-w-[300px]"><Markdown text={description} className="text-[11px] leading-relaxed"/></div>}>
            <button
                type="button"
                aria-label="Show field description"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--primary)]/75 hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
            >
                <i className="ph ph-info text-[13px]"/>
            </button>
        </Tip>
    );
}

function FieldHeader({label, required, description, typeLabel, actions}: {
    label: string;
    required?: boolean;
    description?: string;
    typeLabel?: string;
    actions?: ReactNode;
}) {
    const longDescription = usesDescriptionTooltip(description);
    return (
        <>
            <div className="flex min-h-7 min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-[var(--text-heading)]">
                        {label}{required && <b className="ms-1 text-[var(--method-delete)]">*</b>}
                    </span>
                    {longDescription && <DescriptionTip description={description}/>}
                    {typeLabel && <span className={clsx('shrink-0 font-mono text-[9px]', mutedLineClass)}>{typeLabel}</span>}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
            </div>
            {!longDescription && description?.trim() && (
                <Markdown text={description} className="mt-0.5 max-w-3xl text-[10px] leading-relaxed text-[var(--text-muted)]"/>
            )}
        </>
    );
}

function GuideBranch({children}: {children: ReactNode}) {
    return (
        <div className="relative ms-3 min-w-0 ps-5">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-0 w-px bg-[var(--border)]/65"/>
            {children}
        </div>
    );
}

function Field({schema, spec, value, label, required, path, depth, onChange, setPatternToTest, selectedFiles, setSelectedFiles, actions}: FieldProps) {
    const current = resolved(schema, spec);
    const [variantIndex, setVariantIndex] = useState(0);
    const [pendingKey, setPendingKey] = useState('');
    const type = Array.isArray(current.type) ? current.type.find((item: string) => item !== 'null') : current.type;
    const nullable = current.nullable === true || Array.isArray(current.type) && current.type.includes('null');
    const enumValues = Array.isArray(current.enum) ? current.enum : null;
    const fileKey = path.map(part => String(part)).join('.');
    const fieldFrame = 'relative min-w-0 py-2';

    if (current.oneOf?.length || current.anyOf?.length) {
        const variants = current.oneOf || current.anyOf;
        const selectedVariant = Math.min(variantIndex, variants.length - 1);
        return (
            <div className={fieldFrame}>
                {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-5 h-px w-5 bg-[var(--border)]/65" style={{insetInlineStart: '-20px'}}/>}
                <FieldHeader label={label} required={required} description={current.description} typeLabel="variant" actions={actions}/>
                <select value={selectedVariant} onChange={event => {const nextIndex = Number(event.target.value); setVariantIndex(nextIndex); onChange(path, defaultBodyValue(variants[nextIndex], spec));}} className={clsx(fieldClass, 'mt-1')}>
                    {variants.map((variant: any, index: number) => <option key={index} value={index}>{resolved(variant, spec).title || resolved(variant, spec).type || `Variant ${index + 1}`}</option>)}
                </select>
                <GuideBranch>
                    <Field schema={variants[selectedVariant]} spec={spec} value={value} label="Value" path={path} depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles}/>
                </GuideBranch>
            </div>
        );
    }

    const isBinary = current.format === 'binary' || current.contentEncoding === 'binary';
    if (isBinary) {
        const selectedFile = selectedFiles[fileKey] || null;
        return (
            <div className={fieldFrame}>
                {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-5 h-px w-5 bg-[var(--border)]/65" style={{insetInlineStart: '-20px'}}/>}
                <FieldHeader label={label} required={required} description={current.description} typeLabel="file" actions={actions}/>
                <label className="mt-1 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs hover:border-[var(--primary)]">
                    <span className="min-w-0 truncate text-[var(--text-heading)]">{selectedFile ? selectedFile.name : 'Choose a file'}</span>
                    <span className="shrink-0 text-[10px] font-bold text-[var(--primary)]">Browse</span>
                    <input type="file" className="hidden" onChange={event => setSelectedFiles({...selectedFiles, [fileKey]: event.target.files?.[0] || null})}/>
                </label>
                {selectedFile && <span className={clsx('mt-1 block text-[9px]', mutedLineClass)}>{Math.max(1, Math.round(selectedFile.size / 1024))} KB</span>}
            </div>
        );
    }

    if (type === 'object' || current.properties) {
        const objectValue = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
        const properties = current.properties || {};
        const additionalSchema = current.additionalProperties && typeof current.additionalProperties === 'object'
            ? current.additionalProperties
            : current.additionalProperties === true ? {} : null;
        const extraKeys = Object.keys(objectValue).filter(key => !Object.prototype.hasOwnProperty.call(properties, key));
        const addMapEntry = () => {
            const key = pendingKey.trim();
            if (!key || Object.prototype.hasOwnProperty.call(objectValue, key)) return;
            onChange(path, {...objectValue, [key]: defaultBodyValue(additionalSchema || {}, spec)});
            setPendingKey('');
        };
        return (
            <div className={fieldFrame}>
                {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-5 h-px w-5 bg-[var(--border)]/65" style={{insetInlineStart: '-20px'}}/>}
                <FieldHeader label={label} required={required} description={current.description} typeLabel={additionalSchema ? 'object / map' : 'object'} actions={actions}/>
                <GuideBranch>
                    <div className="space-y-0">
                        {Object.entries(properties).map(([key, childSchema]: [string, any]) => (
                            <Field key={key} schema={childSchema} spec={spec} value={objectValue[key]} label={key} required={Array.isArray(current.required) && current.required.includes(key)} path={[...path, key]} depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles}/>
                        ))}
                        {extraKeys.map(key => (
                            <Field
                                key={key}
                                schema={additionalSchema || {}}
                                spec={spec}
                                value={objectValue[key]}
                                label={key}
                                path={[...path, key]}
                                depth={depth + 1}
                                onChange={onChange}
                                setPatternToTest={setPatternToTest}
                                selectedFiles={selectedFiles}
                                setSelectedFiles={setSelectedFiles}
                                actions={<button type="button" onClick={() => {const next = {...objectValue}; delete next[key]; onChange(path, next);}} className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer" aria-label={`Remove ${key}`}><i className="ph ph-trash text-[12px]"/></button>}
                            />
                        ))}
                        {additionalSchema && (
                            <div className="flex gap-2 py-2">
                                <input type="text" value={pendingKey} onChange={event => setPendingKey(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); addMapEntry();}}} placeholder="Add map key" className={clsx(fieldClass, 'min-w-0 flex-1')}/>
                                <button type="button" onClick={addMapEntry} className="shrink-0 rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"><i className="ph ph-plus me-1"/>Add key</button>
                            </div>
                        )}
                        {Object.keys(properties).length === 0 && !additionalSchema && <p className={clsx('py-2 text-[10px] italic', mutedLineClass)}>No defined properties.</p>}
                    </div>
                </GuideBranch>
            </div>
        );
    }

    if (type === 'array') {
        const items = Array.isArray(value) ? value : [];
        const itemSchema = current.items || {};
        const maxItems = typeof current.maxItems === 'number' ? current.maxItems : Infinity;
        const itemActions = (index: number) => (
            <>
                <button type="button" disabled={index === 0} onClick={() => {const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(path, next);}} className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer" aria-label="Move item up"><i className="ph ph-arrow-up text-[12px]"/></button>
                <button type="button" disabled={index === items.length - 1} onClick={() => {const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(path, next);}} className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer" aria-label="Move item down"><i className="ph ph-arrow-down text-[12px]"/></button>
                <button type="button" onClick={() => onChange(path, removeAtPath(items, index))} className="flex size-6 items-center justify-center rounded-md text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer" aria-label="Remove item"><i className="ph ph-trash text-[12px]"/></button>
            </>
        );
        return (
            <div className={fieldFrame}>
                {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-5 h-px w-5 bg-[var(--border)]/65" style={{insetInlineStart: '-20px'}}/>}
                <FieldHeader label={label} required={required} description={current.description} typeLabel={`array${itemSchema.type ? `<${itemSchema.type}>` : ''}`} actions={actions}/>
                <GuideBranch>
                    <div className="space-y-0">
                        {items.length === 0 && <p className={clsx('py-2 text-[10px] italic', mutedLineClass)}>No items. Add one to begin.</p>}
                        {items.map((item, index) => (
                            <Field key={index} schema={itemSchema} spec={spec} value={item} label={`Item ${index + 1}`} path={[...path, index]} depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} actions={itemActions(index)}/>
                        ))}
                        <div className="py-2">
                            <button type="button" disabled={items.length >= maxItems} onClick={() => onChange(path, [...items, defaultBodyValue(itemSchema, spec)])} className="rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"><i className="ph ph-plus me-1"/>Add item</button>
                        </div>
                    </div>
                </GuideBranch>
            </div>
        );
    }

    const stringValue = value === null || value === undefined ? '' : String(value);
    const pattern = typeof current.pattern === 'string' ? current.pattern : '';
    const patternValid = !pattern || !stringValue || (() => { try { return new RegExp(pattern).test(stringValue); } catch { return true; } })();
    const inputType = type === 'integer' || type === 'number' ? 'number' : current.format === 'date' || current.format === 'date-time' ? 'datetime-local' : 'text';
    return (
        <div className={fieldFrame}>
            {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-5 h-px w-5 bg-[var(--border)]/65" style={{insetInlineStart: '-20px'}}/>}
            <FieldHeader label={label} required={required} description={current.description} typeLabel={current.format || type || 'any'} actions={actions}/>
            {enumValues
                ? <select value={stringValue} onChange={event => onChange(path, event.target.value)} className={clsx(fieldClass, 'mt-1')}><option value="">— Select —</option>{enumValues.map((item: any) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}</select>
                : type === 'boolean'
                    ? <select value={stringValue} onChange={event => onChange(path, event.target.value === '' ? '' : event.target.value === 'true')} className={clsx(fieldClass, 'mt-1')}><option value="">— Select —</option><option value="true">true</option><option value="false">false</option></select>
                    : <input type={inputType} value={stringValue} onChange={event => onChange(path, type === 'number' || type === 'integer' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} placeholder={current.example !== undefined ? String(current.example) : current.default !== undefined ? String(current.default) : type === 'object' ? 'JSON value' : ''} min={current.minimum} max={current.maximum} className={clsx(fieldClass, 'mt-1', !patternValid && 'border-[var(--method-delete)]')}/>
            }
            {pattern && <div className="flex min-w-0 items-center gap-2 py-1 text-[9px]"><code className="min-w-0 max-w-[min(100%,420px)] truncate text-[var(--method-put)]">/{pattern}/</code><button type="button" onClick={() => setPatternToTest(pattern)} className="shrink-0 rounded border border-[var(--primary)]/30 px-1.5 py-0.5 text-[var(--primary)] cursor-pointer">Test</button></div>}
            {nullable && <button type="button" onClick={() => onChange(path, null)} className="py-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--primary)] cursor-pointer">Set null</button>}
        </div>
    );
}

export default function RecursiveBodyForm({schema, spec, value, onChange, setPatternToTest, selectedFiles, setSelectedFiles}: RecursiveBodyFormProps) {
    const update = (path: PathPart[], nextValue: unknown) => onChange(setAtPath(value, path, nextValue));
    return (
        <div className="min-w-0 overflow-x-auto scrollbar-thin pb-2">
            <div className="min-w-[640px] space-y-0 animate-in fade-in">
                <Field schema={schema} spec={spec} value={value} label="Request body" path={[]} depth={0} onChange={update} setPatternToTest={setPatternToTest} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles}/>
            </div>
        </div>
    );
}
