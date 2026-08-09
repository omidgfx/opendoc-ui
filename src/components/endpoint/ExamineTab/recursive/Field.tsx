import {useState} from 'react';
import clsx from 'clsx';
import PatternPreview from '../../../common/PatternPreview';
import FieldHeader from './FieldHeader';
import GuideBranch from './GuideBranch';
import CustomDropdown from '../../../common/CustomDropdown';
import type {FieldProps} from '@/src/types/recursiveBody';
import {defaultBodyValue, removeAtPath, resolved} from '@/src/utils/runner/recursiveBody';

const fieldClass = 'w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)]';
const mutedLineClass = 'text-[var(--text-muted)]';
export default function Field({
                                  schema,
                                  spec,
                                  value,
                                  label,
                                  required,
                                  path,
                                  depth,
                                  onChange,
                                  setPatternToTest,
                                  selectedFiles,
                                  setSelectedFiles,
                                  focusedPath,
                                  setFocusedPath,
                                  actions
                              }: FieldProps) {
    const current = resolved(schema, spec);
    const [variantIndex, setVariantIndex] = useState(0);
    const [pendingKey, setPendingKey] = useState('');
    const type = Array.isArray(current.type) ? current.type.find((item: string) => item !== 'null') : current.type;
    const nullable = current.nullable === true || Array.isArray(current.type) && current.type.includes('null');
    const enumValues = Array.isArray(current.enum) ? current.enum : null;
    const fileKey = path.map(part => String(part)).join('.');
    const fieldFrame = 'relative min-w-0 py-2';
    if (current['x-opendoc-boolean-schema'] === false) {
        return <div className={fieldFrame}>
            <FieldHeader label={label} required={required} description={current.description} typeLabel="never" actions={actions}/>
            <p className="mt-1 rounded-lg border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 p-2 text-[10px] text-[var(--text-muted)]">
                No value satisfies this schema. Switch to Raw if you still want to send a body and inspect the server response.
            </p>
        </div>;
    }
    if (current.oneOf?.length || current.anyOf?.length) {
        const variants = current.oneOf || current.anyOf;
        const selectedVariant = Math.min(variantIndex, variants.length - 1);
        return (<div className={fieldFrame}>
            <FieldHeader label={label} required={required} description={current.description} typeLabel="variant"
                         actions={actions}/>
            <CustomDropdown value={String(selectedVariant)} onChange={selected => {
                const nextIndex = Number(selected);
                setFocusedPath(path);
                setVariantIndex(nextIndex);
                onChange(path, defaultBodyValue(variants[nextIndex], spec));
            }} options={variants.map((variant: any, index: number) => ({
                value: String(index),
                label: resolved(variant, spec).title || resolved(variant, spec).type || `Variant ${index + 1}`,
            }))} className="mt-1 w-full"/>
            <GuideBranch focusedPath={focusedPath}>
                <Field schema={variants[selectedVariant]} spec={spec} value={value} label="Value" path={path}
                       depth={depth + 1} onChange={onChange} setPatternToTest={setPatternToTest}
                       selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} focusedPath={focusedPath}
                       setFocusedPath={setFocusedPath}/>
            </GuideBranch>
        </div>);
    }
    const isBinary = current.format === 'binary' || current.contentEncoding === 'binary';
    if (isBinary) {
        const selectedFile = selectedFiles[fileKey] || null;
        return (<div className={fieldFrame}>
            <FieldHeader label={label} required={required} description={current.description} typeLabel="file"
                         actions={actions}/>
            <label
                onDragOver={event => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={event => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0] || null;
                    if (file)
                        setSelectedFiles({...selectedFiles, [fileKey]: file});
                }}
                className="mt-1 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs hover:border-[var(--primary)]">
                <span
                    className="min-w-0 truncate text-[var(--text-heading)]">{selectedFile ? selectedFile.name : 'Choose a file'}</span>
                <span className="shrink-0 text-[10px] font-bold text-[var(--primary)]">Browse</span>
                <input type="file" className="hidden" onFocus={() => setFocusedPath(path)}
                       onChange={event => setSelectedFiles({
                           ...selectedFiles,
                           [fileKey]: event.target.files?.[0] || null
                       })}/>
            </label>
            {selectedFile && <span
                className={clsx('mt-1 block text-[9px]', mutedLineClass)}>{Math.max(1, Math.round(selectedFile.size / 1024))} KB</span>}
        </div>);
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
            if (!key || Object.prototype.hasOwnProperty.call(objectValue, key))
                return;
            onChange(path, {...objectValue, [key]: defaultBodyValue(additionalSchema || {}, spec)});
            setPendingKey('');
        };
        return (<div className={fieldFrame}>
            <FieldHeader label={label} required={required} description={current.description}
                         typeLabel={additionalSchema ? 'object / map' : 'object'} actions={actions}/>
            {Array.isArray(current['x-opendoc-allOf-conflicts']) && current['x-opendoc-allOf-conflicts'].length > 0 && <p
                className="mt-1 rounded-lg border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 p-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
                This allOf composition contains conflicting constraints ({current['x-opendoc-allOf-conflicts'].join(', ')}). The form shows a conservative merged view; Raw mode can send any test payload to the server.
            </p>}
            <GuideBranch focusedPath={focusedPath}>

                {Object.entries(properties).filter(([, childSchema]: [string, any]) => childSchema?.readOnly !== true).map(([key, childSchema]: [
                    string,
                    any
                ]) => (<Field key={key} schema={childSchema} spec={spec} value={objectValue[key]} label={key}
                              required={Array.isArray(current.required) && current.required.includes(key)}
                              path={[...path, key]} depth={depth + 1} onChange={onChange}
                              setPatternToTest={setPatternToTest} selectedFiles={selectedFiles}
                              setSelectedFiles={setSelectedFiles} focusedPath={focusedPath}
                              setFocusedPath={setFocusedPath}/>))}
                {extraKeys.map(key => (
                    <Field key={key} schema={additionalSchema || {}} spec={spec} value={objectValue[key]} label={key}
                           path={[...path, key]} depth={depth + 1} onChange={onChange}
                           setPatternToTest={setPatternToTest} selectedFiles={selectedFiles}
                           setSelectedFiles={setSelectedFiles} focusedPath={focusedPath} setFocusedPath={setFocusedPath}
                           actions={<button type="button" onClick={() => {
                               const next = {...objectValue};
                               delete next[key];
                               onChange(path, next);
                           }}
                                            className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                            aria-label={`Remove ${key}`}><i className="ph ph-trash text-[12px]"/>
                           </button>}/>))}
                {additionalSchema && (<div className="flex gap-2 py-2">
                    <input type="text" value={pendingKey} onFocus={() => setFocusedPath(path)}
                           onChange={event => setPendingKey(event.target.value)} onKeyDown={event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            addMapEntry();
                        }
                    }} placeholder="Add map key" className={clsx(fieldClass, 'min-w-0 flex-1')}/>
                    <button type="button" onClick={addMapEntry}
                            className="shrink-0 rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer">
                        <i className="ph ph-plus me-1"/>Add key
                    </button>
                </div>)}
                {Object.keys(properties).length === 0 && !additionalSchema &&
                    <p className={clsx('py-2 text-[10px] italic', mutedLineClass)}>No defined properties.</p>}
            </GuideBranch>
        </div>);
    }
    if (type === 'array') {
        const items = Array.isArray(value) ? value : [];
        const itemSchema = current.items || {};
        const maxItems = typeof current.maxItems === 'number' ? current.maxItems : Infinity;
        const itemActions = (index: number) => (<>
            <button type="button" disabled={index === 0} onClick={() => {
                const next = [...items];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(path, next);
            }}
                    className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer"
                    aria-label="Move item up"><i className="ph ph-arrow-up text-[12px]"/></button>
            <button type="button" disabled={index === items.length - 1} onClick={() => {
                const next = [...items];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onChange(path, next);
            }}
                    className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer"
                    aria-label="Move item down"><i className="ph ph-arrow-down text-[12px]"/></button>
            <button type="button" onClick={() => onChange(path, removeAtPath(items, index))}
                    className="flex size-6 items-center justify-center rounded-md text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                    aria-label="Remove item"><i className="ph ph-trash text-[12px]"/></button>
        </>);
        return (<div className={fieldFrame}>
            <FieldHeader label={label} required={required} description={current.description}
                         typeLabel={`array${itemSchema.type ? `<${itemSchema.type}>` : ''}`} actions={actions}/>
            <GuideBranch focusedPath={focusedPath}>

                {items.length === 0 &&
                    <p className={clsx('py-2 text-[10px] italic', mutedLineClass)}>No items. Add one to begin.</p>}
                {items.map((item, index) => (
                    <Field key={index} schema={itemSchema} spec={spec} value={item} label={`Item ${index + 1}`}
                           path={[...path, index]} depth={depth + 1} onChange={onChange}
                           setPatternToTest={setPatternToTest} selectedFiles={selectedFiles}
                           setSelectedFiles={setSelectedFiles} focusedPath={focusedPath} setFocusedPath={setFocusedPath}
                           actions={itemActions(index)}/>))}
                <div className="py-2">
                    <button type="button" disabled={items.length >= maxItems}
                            onClick={() => onChange(path, [...items, defaultBodyValue(itemSchema, spec)])}
                            className="rounded-lg border border-[var(--primary)]/30 px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                        <i className="ph ph-plus me-1"/>Add item
                    </button>
                </div>
            </GuideBranch>
        </div>);
    }
    const stringValue = value === null || value === undefined ? '' : String(value);
    const pattern = typeof current.pattern === 'string' ? current.pattern : '';
    const patternValid = !pattern || !stringValue || (() => {
        try {
            return new RegExp(pattern).test(stringValue);
        } catch {
            return true;
        }
    })();
    const inputType = type === 'integer' || type === 'number' ? 'number' : current.format === 'date' || current.format === 'date-time' ? 'datetime-local' : 'text';
    return (<div className={fieldFrame}>
        <FieldHeader label={label} required={required} description={current.description}
                     typeLabel={current.format || type || 'any'} actions={actions}/>
        {enumValues
            ? <CustomDropdown value={String(Math.max(-1, enumValues.findIndex((item: any) => Object.is(item, value))))}
                              onChange={selected => {
                                  setFocusedPath(path);
                                  const index = Number(selected);
                                  onChange(path, index >= 0 ? enumValues[index] : '');
                              }} options={[
                                  {value: '-1', label: '— Select —'},
                                  ...enumValues.map((item: any, index: number) => ({value: String(index), label: String(item)})),
                              ]} className="mt-1 w-full"/>
            : type === 'boolean'
                ? <CustomDropdown value={stringValue} onChange={selected => {
                    setFocusedPath(path);
                    onChange(path, selected === '' ? '' : selected === 'true');
                }} options={[
                    {value: '', label: '— Select —'},
                    {value: 'true', label: 'true'},
                    {value: 'false', label: 'false'},
                ]} className="mt-1 w-full"/>
                : <input type={inputType} value={stringValue} onFocus={() => setFocusedPath(path)}
                         onChange={event => onChange(path, type === 'number' || type === 'integer' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)}
                         placeholder={current.example !== undefined ? String(current.example) : current.default !== undefined ? String(current.default) : type === 'object' ? 'JSON value' : ''}
                         min={current.minimum} max={current.maximum}
                         className={clsx(fieldClass, 'mt-1', !patternValid && 'border-[var(--method-delete)]')}/>}
        {pattern && <PatternPreview pattern={pattern} onTest={() => setPatternToTest(pattern)}/>}
        {nullable && <button type="button" onClick={() => onChange(path, null)}
                             className="py-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--primary)] cursor-pointer">Set
            null</button>}
    </div>);
}
