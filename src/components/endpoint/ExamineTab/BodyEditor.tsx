import clsx from 'clsx';
import type { OpenApiSpec } from '../../../types';
import { getRefName, resolveReference, resolveRequestBody, resolveSchema } from '../../../utils/openapi';
import CustomDropdown from '../../common/CustomDropdown';
import Markdown from '../../common/Markdown';
import SchemaJsonEditor from '../../schema/SchemaJsonEditor';

interface BodyEditorProps {
    spec: OpenApiSpec;
    method: string;
    path: string;
    operation: any;
    requestBodyType: string;
    setRequestBodyType: (v: string) => void;
    bodyEditorMode: 'form' | 'raw';
    setBodyEditorMode: (v: 'form' | 'raw') => void;
    requestBodyText: string;
    setRequestBodyText: (v: string) => void;
    bodyFields: Record<string, string>;
    setBodyFields: (v: Record<string, string>) => void;
    selectedFile: File | null;
    setSelectedFile: (f: File | null) => void;
    selectedFiles: Record<string, File | null>;
    setSelectedFiles: (v: Record<string, File | null>) => void;
    setPatternToTest: (p: string | null) => void;
    themeMode: 'light' | 'dark';
}

function getPropertiesOfSchema(schema: any, spec: OpenApiSpec): Record<string, any> {
    if (!schema) return {};
    let props: Record<string, any> = {};
    if (schema.$ref) {
        const refName = getRefName(schema.$ref);
        const refSchema = resolveSchema(refName, spec);
        return getPropertiesOfSchema(refSchema, spec);
    }
    if (schema.allOf) schema.allOf.forEach((sub: any) => { props = { ...props, ...getPropertiesOfSchema(sub, spec) }; });
    if (schema.properties) props = { ...props, ...schema.properties };
    return props;
}

export default function BodyEditor(props: BodyEditorProps) {
    const {
        spec, method, path, operation,
        requestBodyType, setRequestBodyType,
        bodyEditorMode, setBodyEditorMode,
        requestBodyText, setRequestBodyText,
        bodyFields, setBodyFields,
        selectedFile, setSelectedFile,
        selectedFiles, setSelectedFiles,
        setPatternToTest, themeMode,
    } = props;

    const resolvedBody = resolveRequestBody(operation.requestBody, spec);
    const contentSchema = resolvedBody?.content?.[requestBodyType]?.schema;
    const resolvedSchema = resolveReference(contentSchema, spec);

    const handleBodyFieldChange = (pName: string, val: string) => {
        const updated = { ...bodyFields, [pName]: val };
        setBodyFields(updated);
        const compiled: any = {};
        Object.entries(updated).forEach(([k, v]) => {
            try {
                const strValue = typeof v === 'string' ? v : String(v || '');
                compiled[k] = strValue.trim().startsWith('{') || strValue.trim().startsWith('[') ? JSON.parse(strValue) : strValue;
            } catch {
                compiled[k] = v;
            }
        });
        setRequestBodyText(JSON.stringify(compiled, null, 2));
    };

    if (!resolvedSchema) {
        return <p className="text-xs italic text-[var(--text-muted)] py-2">No body schema defined for this media type.</p>;
    }

    if (bodyEditorMode === 'form') {
        const propsList = getPropertiesOfSchema(resolvedSchema, spec);
        const isPrimitiveBinary = resolvedSchema.type === 'string' && resolvedSchema.format === 'binary';

        if (isPrimitiveBinary) {
            return (
                <div className="space-y-4 animate-in fade-in">
                    <div className="border border-dashed rounded-xl p-6 text-center border-[var(--border)]">
                        <input
                            type="file"
                            id="examine-file-uploader"
                            onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setSelectedFile(file);
                                setSelectedFiles({ ...selectedFiles, file });
                            }}
                            className="hidden"
                        />
                        <label htmlFor="examine-file-uploader" className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer select-none">
                            {selectedFile ? `Selected: ${selectedFile.name}` : 'Click to select upload file'}
                        </label>
                        <p className="text-[10px] mt-1 text-[var(--text-muted)]">
                            {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : 'Supports drag & drop or manual upload'}
                        </p>
                    </div>
                </div>
            );
        }

        if (Object.keys(propsList).length > 0) {
            return (
                <div className="space-y-4 animate-in fade-in">
                    <div className="space-y-3.5 pt-1">
                        {Object.entries(propsList).map(([pName, pSchema]: [string, any]) => {
                            const resolvedP = resolveReference(pSchema, spec);
                            const isRequired = resolvedSchema.required?.includes(pName) || false;
                            const enumValues = resolvedP.enum || null;
                            const isFileInput = resolvedP.type === 'file' || (resolvedP.type === 'string' && ['binary', 'base64'].includes(resolvedP.format));
                            const isBoolean = resolvedP.type === 'boolean';
                            const isNumber = resolvedP.type === 'number' || resolvedP.type === 'integer';
                            const pattern = resolvedP.pattern;
                            const currentValue = bodyFields[pName] || '';
                            const isPatternValid = !pattern || !currentValue || new RegExp(pattern).test(currentValue);

                            const renderControl = () => {
                                if (isFileInput) {
                                    const sel = selectedFiles[pName];
                                    const inputId = `examine-file-${method}-${path}-${pName}`.replace(/[^a-zA-Z0-9_-]/g, '-');
                                    return (
                                        <div className="border border-dashed rounded-xl p-4 text-center border-[var(--border)] bg-[var(--background)]">
                                            <input
                                                type="file"
                                                id={inputId}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] || null;
                                                    setSelectedFiles({ ...selectedFiles, [pName]: file });
                                                    if (pName === 'file') setSelectedFile(file);
                                                }}
                                                className="hidden"
                                            />
                                            <label htmlFor={inputId} className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer select-none">
                                                {sel ? `Selected: ${sel.name}` : 'Click to select upload file'}
                                            </label>
                                            <p className="text-[10px] mt-1 text-[var(--text-muted)]">
                                                {sel ? `${Math.round(sel.size / 1024)} KB` : `${resolvedP.format || 'binary'} file field`}
                                            </p>
                                        </div>
                                    );
                                }
                                if (enumValues) {
                                    return (
                                        <select
                                            value={bodyFields[pName] || ''}
                                            onChange={(e) => handleBodyFieldChange(pName, e.target.value)}
                                            className="w-full px-3 py-1.5 pr-8 border rounded-lg text-xs outline-none appearance-none cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"
                                        >
                                            <option value="">-- Select option --</option>
                                            {enumValues.map((val: any) => <option key={val} value={val}>{val}</option>)}
                                        </select>
                                    );
                                }
                                if (isBoolean) {
                                    return (
                                        <select
                                            value={bodyFields[pName] || ''}
                                            onChange={(e) => handleBodyFieldChange(pName, e.target.value)}
                                            className="w-full px-3 py-1.5 pr-8 border rounded-lg text-xs outline-none appearance-none cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"
                                        >
                                            <option value="">-- Select option --</option>
                                            <option value="true">True</option>
                                            <option value="false">False</option>
                                        </select>
                                    );
                                }
                                if (isNumber) {
                                    return (
                                        <input
                                            type="number"
                                            value={bodyFields[pName] || ''}
                                            onChange={(e) => handleBodyFieldChange(pName, e.target.value)}
                                            className={clsx(
                                                'w-full px-3 py-1.5 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] text-[var(--text-heading)]',
                                                isPatternValid ? 'border-[var(--border)]' : 'border-[var(--method-delete)]'
                                            )}
                                            placeholder={resolvedP.example !== undefined ? String(resolvedP.example) : '0'}
                                            min={resolvedP.minimum}
                                            max={resolvedP.maximum}
                                        />
                                    );
                                }
                                return (
                                    <input
                                        type="text"
                                        value={bodyFields[pName] || ''}
                                        onChange={(e) => handleBodyFieldChange(pName, e.target.value)}
                                        className={clsx(
                                            'w-full px-3 py-1.5 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] text-[var(--text-heading)]',
                                            isPatternValid ? 'border-[var(--border)]' : 'border-[var(--method-delete)]'
                                        )}
                                        placeholder={String(resolvedP.example || '') || 'value'}
                                    />
                                );
                            };

                            return (
                                <div key={pName} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-baseline">
                                    <span className="text-xs font-semibold truncate sm:col-span-2 md:col-span-1" title={pName}>
                                        {pName} {isRequired && <span className="text-[var(--method-delete)]">*</span>}
                                    </span>
                                    <div className="sm:col-span-4 md:col-span-5 space-y-1.5 mb-4">
                                        {resolvedP.description && <Markdown text={resolvedP.description} className="mb-2" />}
                                        <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px] font-mono select-none px-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <div className="px-1 py-0.2 rounded bg-black/5 bg-[var(--text)]/5 font-semibold text-[var(--primary)]">
                                                    {Array.isArray(resolvedP.type) ? resolvedP.type.join(' | ') : resolvedP.type || 'any'}
                                                </div>
                                                {resolvedP.format && (
                                                    <div>format: <span className="text-[var(--accent)] font-semibold">{resolvedP.format}</span></div>
                                                )}
                                                {pattern && (
                                                    <div className="flex items-center gap-1 max-w-full">
                                                        pattern: <code className="text-[var(--method-put)] font-semibold truncate">/{pattern}/</code>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPatternToTest(pattern)}
                                                            className="px-1 py-0.2 text-[8px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20 rounded inline-flex items-center gap-0.5 cursor-pointer shrink-0"
                                                        >
                                                            <i className="ph ph-vial text-[7px]"></i> Test
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {pattern && !isPatternValid && (
                                                <span className="text-[var(--method-delete)] font-bold animate-pulse shrink-0">
                                                    <i className="ph ph-warning"></i> invalid
                                                </span>
                                            )}
                                        </div>
                                        {renderControl()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        return <p className="text-xs italic text-[var(--text-muted)] py-2">No properties defined under this schema.</p>;
    }

    if (requestBodyType.toLowerCase().includes('json') || bodyEditorMode === 'raw') {
        return (
            <div className="animate-in fade-in">
                <SchemaJsonEditor
                    value={requestBodyText}
                    onChange={setRequestBodyText}
                    schema={contentSchema || {}}
                    componentsSchemas={spec.components?.schemas}
                    themeMode={themeMode}
                />
            </div>
        );
    }

    return (
        <textarea
            rows={10}
            value={requestBodyText}
            onChange={(e) => setRequestBodyText(e.target.value)}
            className="w-full p-3 rounded-xl border font-mono text-xs outline-none focus:border-[var(--primary)] transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text)]"
            placeholder={requestBodyType === 'application/xml' ? '<?xml version="1.0" encoding="UTF-8"?>...' : '{\n "key": "value"\n}'}
        />
    );
}
