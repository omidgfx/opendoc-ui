import {lazy, Suspense, useEffect, useState} from 'react';
import type {OpenApiSpec} from '../../../types';
import {resolveReference, resolveRequestBody} from '../../../utils/openapi';
import {formatBodyText, parseStructuredBody} from '../../../utils/runner/bodyFormats';
import {schemaDeclaresBinary} from '../../../utils/runner/runnerResponse';
import RecursiveBodyForm, {type BodyValue, defaultBodyValue} from './RecursiveBodyForm';
import RunnerFieldFrame from './RunnerFieldFrame';

const SchemaJsonEditor = lazy(() => import('../../schema/SchemaJsonEditor'));

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
    onExecute: () => void;
    onOpenSchema: (schemaName: string) => void;
}

const topLevelFields = (value: BodyValue): Record<string, string> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, typeof item === 'string' ? item : JSON.stringify(item)]),
    );
};
const getBodyFormatForForm = (jsonText: string, mediaType: string): string => {
    const formatted = formatBodyText(jsonText, mediaType);
    return formatted.error ? jsonText : formatted.text;
};
export default function BodyEditor(props: BodyEditorProps) {
    const {
        spec,
        method,
        path,
        operation,
        requestBodyType,
        bodyEditorMode,
        requestBodyText,
        setRequestBodyText,
        setBodyFields,
        selectedFile,
        setSelectedFile,
        selectedFiles,
        setSelectedFiles,
        setPatternToTest,
        themeMode,
        onExecute,
        onOpenSchema,
    } = props;
    const resolvedBody = resolveRequestBody(operation.requestBody, spec);
    const contentSchema = resolvedBody?.content?.[requestBodyType]?.schema;
    const resolvedSchema =
        contentSchema !== undefined ? (resolveReference(contentSchema, spec) ?? contentSchema) : null;
    const [formValue, setFormValue] = useState<BodyValue>(() => {
        try {
            return (
                parseStructuredBody(requestBodyText, requestBodyType) ??
                (resolvedSchema !== null ? defaultBodyValue(resolvedSchema, spec) : {})
            );
        } catch {
            return resolvedSchema !== null ? defaultBodyValue(resolvedSchema, spec) : {};
        }
    });
    useEffect(() => {
        if (bodyEditorMode !== 'form') return;
        try {
            const parsed = parseStructuredBody(requestBodyText, requestBodyType);
            setFormValue(parsed ?? (resolvedSchema !== null ? defaultBodyValue(resolvedSchema, spec) : {}));
        } catch {
            setFormValue(resolvedSchema !== null ? defaultBodyValue(resolvedSchema, spec) : {});
        }
    }, [bodyEditorMode, requestBodyType, resolvedSchema, spec, requestBodyText]);
    const handleFormChange = (value: BodyValue) => {
        setFormValue(value);
        setBodyFields(topLevelFields(value));
        const jsonText = JSON.stringify(value, null, 2);
        setRequestBodyText(getBodyFormatForForm(jsonText, requestBodyType));
    };
    const isTopLevelBinary = schemaDeclaresBinary(resolvedSchema);
    if (bodyEditorMode === 'form' && resolvedSchema === null) {
        return (
            <p className="py-2 text-xs italic text-[var(--text-muted)]">
                No body schema defined for this media type. Switch to Raw to edit the payload directly.
            </p>
        );
    }
    if (bodyEditorMode === 'form' && isTopLevelBinary) {
        return (
            <RunnerFieldFrame className="space-y-4 p-1 animate-in fade-in" ariaLabel="Request body file field">
                <div
                    className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center transition-colors hover:border-[var(--primary)]"
                    onDragOver={event => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={event => {
                        event.preventDefault();
                        const file = event.dataTransfer.files?.[0] || null;
                        if (file) {
                            setSelectedFile(file);
                            setSelectedFiles({...selectedFiles, file});
                        }
                    }}
                >
                    <input
                        type="file"
                        id="examine-file-uploader"
                        onChange={event => {
                            const file = event.target.files?.[0] || null;
                            setSelectedFile(file);
                            setSelectedFiles({...selectedFiles, file});
                        }}
                        className="hidden"
                    />
                    <label
                        htmlFor="examine-file-uploader"
                        className="cursor-pointer select-none text-xs font-semibold text-[var(--primary)] hover:underline"
                    >
                        {selectedFile ? `Selected: ${selectedFile.name}` : 'Click to select upload file'}
                    </label>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                        {selectedFile
                            ? `${Math.round(selectedFile.size / 1024)} KB`
                            : 'Supports drag & drop or manual upload'}
                    </p>
                </div>
            </RunnerFieldFrame>
        );
    }
    if (bodyEditorMode === 'form') {
        return (
            <RecursiveBodyForm
                schema={resolvedSchema}
                spec={spec}
                value={formValue}
                onChange={handleFormChange}
                setPatternToTest={setPatternToTest}
                selectedFiles={selectedFiles}
                setSelectedFiles={setSelectedFiles}
                onOpenSchema={onOpenSchema}
            />
        );
    }
    return (
        <div className="animate-in fade-in">
            <Suspense
                fallback={
                    <div className="flex min-h-48 items-center justify-center text-xs text-[var(--text-muted)]">
                        <i className="ph ph-spinner animate-spin me-2" />
                        Loading editor…
                    </div>
                }
            >
                <SchemaJsonEditor
                    value={requestBodyText}
                    onChange={setRequestBodyText}
                    schema={contentSchema ?? {}}
                    componentsSchemas={spec.components?.schemas}
                    mediaType={requestBodyType}
                    themeMode={themeMode}
                    onCtrlEnter={onExecute}
                />
            </Suspense>
        </div>
    );
}
