import {useState} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '../../../types';
import {resolveReference} from '../../../utils/openapi';
import Markdown from '../../common/Markdown';

export type BodyValue = unknown;

type PathPart = string | number;

interface RecursiveBodyFormProps {
    schema: any;
    spec: OpenApiSpec;
    value: BodyValue;
    onChange: (value: BodyValue) => void;
    setPatternToTest: (pattern: string | null) => void;
}

const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]';

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

function Field({schema, spec, value, label, required, path, depth, onChange, setPatternToTest}: {
    schema: any;
    spec: OpenApiSpec;
    value: unknown;
    label: string;
    required?: boolean;
    path: PathPart[];
    depth: number;
    onChange: (path: PathPart[], value: unknown) => void;
    setPatternToTest: (pattern: string | null) => void;
}) {
    const current = resolved(schema, spec);
    const [variantIndex, setVariantIndex] = useState(0);
    const type = Array.isArray(current.type) ? current.type.find((item: string) => item !== 'null') : current.type;
    const nullable = current.nullable === true || Array.isArray(current.type) && current.type.includes('null');
    const enumValues = Array.isArray(current.enum) ? current.enum : null;

    if (current.oneOf?.length || current.anyOf?.length) {
        const variants = current.oneOf || current.anyOf;
        const selectedVariant = Math.min(variantIndex, variants.length - 1);
        return (
            <div className={clsx('space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3', depth > 0 && 'ms-3')}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[var(--text-heading)]">{label}{required && <b className="text-[var(--method-delete)]"> *</b>}</span><span className="text-[9px] font-mono text-[var(--text-muted)]">variant</span></div>
                <select value={selectedVariant} onChange={event => {const nextIndex = Number(event.target.value); setVariantIndex(nextIndex); onChange(path, defaultBodyValue(variants[nextIndex], spec));}} className={fieldClass}>
                    {variants.map((variant: any, index: number) => <option key={index} value={index}>{resolved(variant, spec).title || resolved(variant, spec).type || `Variant ${index + 1}`}</option>)}
                </select>
                <Field schema={variants[selectedVariant]} spec={spec} value={value} label="Value" path={path} depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest}/>
            </div>
        );
    }

    if (type === 'object' || current.properties) {
        const objectValue = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
        const properties = current.properties || {};
        return (
            <div className={clsx('space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3', depth > 0 && 'ms-3')}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[var(--text-heading)]">{label}{required && <b className="text-[var(--method-delete)]"> *</b>}</span><span className="text-[9px] font-mono text-[var(--text-muted)]">object</span></div>
                <div className="space-y-3">
                    {Object.entries(properties).map(([key, childSchema]: [string, any]) => <Field key={key} schema={childSchema} spec={spec} value={objectValue[key]} label={key} required={Array.isArray(current.required) && current.required.includes(key)} path={[...path, key]} depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest}/>) }
                    {Object.keys(properties).length === 0 && <p className="text-[10px] italic text-[var(--text-muted)]">No defined properties.</p>}
                </div>
            </div>
        );
    }

    if (type === 'array') {
        const items = Array.isArray(value) ? value : [];
        const itemSchema = current.items || {};
        const maxItems = typeof current.maxItems === 'number' ? current.maxItems : Infinity;
        return (
            <div className={clsx('space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3', depth > 0 && 'ms-3')}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[var(--text-heading)]">{label}{required && <b className="text-[var(--method-delete)]"> *</b>}</span><button type="button" disabled={items.length >= maxItems} onClick={() => onChange(path, [...items, defaultBodyValue(itemSchema, spec)])} className="rounded-lg border border-[var(--primary)]/30 px-2 py-1 text-[9px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"><i className="ph ph-plus me-1"/>Add item</button></div>
                {items.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-center text-[10px] text-[var(--text-muted)]">No items. Add one to begin.</p>}
                {items.map((item, index) => <div key={index} className="relative rounded-xl border border-[var(--border)] bg-[var(--background)] p-2.5"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Item {index + 1}</span><div className="flex items-center gap-1"><button type="button" disabled={index === 0} onClick={() => {const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(path, next);}} className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer"><i className="ph ph-arrow-up"/></button><button type="button" disabled={index === items.length - 1} onClick={() => {const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(path, next);}} className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer"><i className="ph ph-arrow-down"/></button><button type="button" onClick={() => onChange(path, removeAtPath(items, index))} className="flex size-6 items-center justify-center rounded-md text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"><i className="ph ph-trash"/></button></div></div><Field schema={itemSchema} spec={spec} value={item} label={`Item ${index + 1}`} path={[...path, index]} depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest}/></div>)}
            </div>
        );
    }

    const stringValue = value === null || value === undefined ? '' : String(value);
    const pattern = typeof current.pattern === 'string' ? current.pattern : '';
    const patternValid = !pattern || !stringValue || (() => { try { return new RegExp(pattern).test(stringValue); } catch { return true; } })();
    const inputType = type === 'integer' || type === 'number' ? 'number' : current.format === 'date' || current.format === 'date-time' ? 'datetime-local' : 'text';
    return (
        <div className={clsx('space-y-1', depth > 0 && 'ms-3')}>
            <div className="flex items-center justify-between gap-2"><label className="text-xs font-semibold text-[var(--text-heading)]">{label}{required && <b className="text-[var(--method-delete)]"> *</b>}</label><span className="font-mono text-[9px] text-[var(--text-muted)]">{current.format || type || 'any'}</span></div>
            {current.description && <Markdown text={current.description} className="text-[10px] text-[var(--text-muted)]"/>}
            {enumValues ? <select value={stringValue} onChange={event => onChange(path, event.target.value)} className={fieldClass}><option value="">— Select —</option>{enumValues.map((item: any) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}</select> : type === 'boolean' ? <select value={stringValue} onChange={event => onChange(path, event.target.value === '' ? '' : event.target.value === 'true')} className={fieldClass}><option value="">— Select —</option><option value="true">true</option><option value="false">false</option></select> : <input type={inputType} value={stringValue} onChange={event => onChange(path, type === 'number' || type === 'integer' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} placeholder={current.example !== undefined ? String(current.example) : current.default !== undefined ? String(current.default) : ''} min={current.minimum} max={current.maximum} className={clsx(fieldClass, !patternValid && 'border-[var(--method-delete)]')}/>} 
            {pattern && <div className="flex items-center justify-between gap-2 text-[9px]"><code className="truncate text-[var(--method-put)]">/{pattern}/</code><button type="button" onClick={() => setPatternToTest(pattern)} className="rounded border border-[var(--primary)]/30 px-1.5 py-0.5 text-[var(--primary)] cursor-pointer">Test</button></div>}
            {nullable && <button type="button" onClick={() => onChange(path, null)} className="text-[9px] text-[var(--text-muted)] hover:text-[var(--primary)] cursor-pointer">Set null</button>}
        </div>
    );
}

export default function RecursiveBodyForm({schema, spec, value, onChange, setPatternToTest}: RecursiveBodyFormProps) {
    const update = (path: PathPart[], nextValue: unknown) => onChange(setAtPath(value, path, nextValue));
    return <div className="space-y-3 animate-in fade-in"><Field schema={schema} spec={spec} value={value} label="Request body" path={[]} depth={0} onChange={update} setPatternToTest={setPatternToTest}/></div>;
}
