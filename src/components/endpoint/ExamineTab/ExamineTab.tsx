import {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec, Operation} from '../../../types';
import {getMergedParameters, resolveReference, resolveRequestBody} from '../../../utils/openapi';
import {groupParameters, type ParameterGroupMeta} from '../../../utils/endpoint/parameterGroups';
import ParameterLocationTag from '../../common/ParameterLocationTag';
import SerializationTag from '../../common/SerializationTag';
import SerializerPlaygroundModal from '../../modals/SerializerPlaygroundModal';
import {describeParameterSerialization} from '../../../utils/endpoint/parameterSerialization';
import {getRequestBodyExample, resolveRequestBodyMediaType} from '../../../utils/endpoint/requestBodySource';
import {bodyEditorModeForMediaType, bodyTypeSupportsForm} from '../../../utils/runner/bodyFormats';
import {convertBodyText} from '../../../utils/runner/bodyConverters';
import {executeRunnerRequest} from '../../../utils/runner/runnerExecution';
import {parameterStateKey} from '../../../utils/runner/requestPlan';
import {dispatchOpenDocUIRunnerResult, OPENDOC_UI_ACTION_EVENT, type OpenDocUIAction} from '../../../utils/ai/bridge';
import {getMockSnippet} from '../../../utils/runner/mockGenerator';
import CustomDropdown from '../../common/CustomDropdown';
import PatternPreview from '../../common/PatternPreview';
import PatternTesterModal from '../../modals/PatternTesterModal';
import ParameterInput from './ParameterInput';
import BodyEditor from './BodyEditor';
import ResponsePanel from './ResponsePanel';
import RunnerFieldFrame from './RunnerFieldFrame';
import FieldHeader from './recursive/FieldHeader';
import {specStorage} from '../../../utils/storage/index';
import {schemaDeclaresBinary} from '../../../utils/runner/runnerResponse';
import {operationUsesCookieAuthentication} from '../../../utils/runner/auth';

interface ExamineTabProps {
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    activeAuth: ActiveAuth;
    selectedServer: string;
    serverVariables?: Record<string, string>;
    parsableKey?: string;
    themeMode?: 'light' | 'dark';
    responseHistory?: ExamineResponse[];
    onResponseChange?: (resp: ExamineResponse) => void;
    onDeleteResponse?: (index: number) => void;
    onClearResponse?: () => void | Promise<void>;
    onOpenSchema: (schemaName: string) => void;
    isActive?: boolean;
}

export default function ExamineTab({
    spec,
    path,
    method,
    operation,
    activeAuth,
    selectedServer,
    serverVariables,
    parsableKey = '',
    themeMode = 'dark',
    responseHistory = [],
    onResponseChange,
    onDeleteResponse,
    onClearResponse,
    onOpenSchema,
    isActive = true,
}: ExamineTabProps) {
    const storageKey = specStorage.key(parsableKey || 'default', `inputs:${method.toLowerCase()}:${path}`);
    const [params, setParams] = useState<Record<string, string | string[]>>({});
    const [headers, setHeaders] = useState<Record<string, string>>({});
    const [requestBodyText, setRequestBodyText] = useState('');
    const [requestBodyType, setRequestBodyType] = useState('');
    const [patternToTest, setPatternToTest] = useState<{pattern: string; parameterKey: string} | null>(null);
    const [serializerParameter, setSerializerParameter] = useState<any | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
    const [bodyFields, setBodyFields] = useState<Record<string, string>>({});
    const [bodyEditorMode, setBodyEditorMode] = useState<'form' | 'raw'>('form');
    const [bridgeActionRevision, setBridgeActionRevision] = useState(0);
    const bridgeRunPendingRef = useRef(false);
    const bridgeRunActionIdRef = useRef<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [response, setResponse] = useState<ExamineResponse | null>(responseHistory[0] || null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const resolvedRequestBody = resolveRequestBody(operation.requestBody, spec);
    // Documentation, Runner and generators resolve the media type with one
    // shared rule, so the schema, the example and the sent body never diverge.
    const effectiveRequestBodyType =
        resolveRequestBodyMediaType(resolvedRequestBody, requestBodyType) || requestBodyType || 'application/json';
    const selectedRequestMedia = resolvedRequestBody?.content?.[effectiveRequestBodyType];
    const selectedRequestSchema = selectedRequestMedia?.schema
        ? resolveReference(selectedRequestMedia.schema, spec) || selectedRequestMedia.schema
        : null;
    const requestBodySupportsForm = bodyTypeSupportsForm(effectiveRequestBodyType, selectedRequestSchema);
    const rawEditorLabel = (() => {
        const normalized = effectiveRequestBodyType.toLowerCase();
        if (normalized.includes('json')) return 'Raw JSON';
        if (normalized.includes('xml')) return 'Raw XML';
        if (normalized.includes('yaml')) return 'Raw YAML';
        if (normalized === 'application/x-www-form-urlencoded') return 'Raw Form';
        return 'Raw';
    })();
    const changeRequestBodyType = (nextMediaType: string) => {
        if (nextMediaType === effectiveRequestBodyType) return;
        const mediaSchema = resolvedRequestBody?.content?.[nextMediaType]?.schema;
        const nextSchema = mediaSchema ? resolveReference(mediaSchema, spec) || mediaSchema : null;
        setRequestBodyText(text => convertBodyText(text, effectiveRequestBodyType, nextMediaType, nextSchema));
        setRequestBodyType(nextMediaType);
        setBodyEditorMode(current => bodyEditorModeForMediaType(current, nextMediaType, nextSchema));
    };
    const canonicalizeInputs = useCallback(
        (incomingParams: Record<string, string | string[]> = {}, incomingHeaders: Record<string, string> = {}) => {
            const pathItem = (spec.paths as any)[path] || {};
            const parameters = getMergedParameters(pathItem, operation, spec);
            const values: Record<string, string | string[]> = {};
            const customHeaders = {...incomingHeaders};
            Object.entries(incomingParams).forEach(([key, value]) => {
                if (key.includes(':')) values[key] = value;
            });
            parameters.forEach((parameter: any) => {
                const key = parameterStateKey(parameter.in, parameter.name);
                if (Object.prototype.hasOwnProperty.call(incomingParams, key)) values[key] = incomingParams[key];
                else if (Object.prototype.hasOwnProperty.call(incomingParams, parameter.name))
                    values[key] = incomingParams[parameter.name];
                if (parameter.in === 'header') {
                    const headerName = Object.keys(customHeaders).find(
                        name => name.toLowerCase() === String(parameter.name).toLowerCase(),
                    );
                    if (headerName) {
                        values[key] = customHeaders[headerName];
                        delete customHeaders[headerName];
                    }
                }
            });
            return {values, customHeaders};
        },
        [spec, path, operation],
    );
    useEffect(() => {
        setResponse(responseHistory[0] || null);
    }, [responseHistory, path, method]);
    const loadInputs = useCallback(() => {
        const parsed = specStorage.getJSON<any>(
            parsableKey || 'default',
            `inputs:${method.toLowerCase()}:${path}`,
            null,
            v => !!v && typeof v === 'object',
        );
        if (parsed) {
            const migrated = canonicalizeInputs(parsed.params || {}, parsed.headers || {});
            setParams(migrated.values);
            setHeaders(migrated.customHeaders);
            setRequestBodyText(parsed.bodyText || '');
            setRequestBodyType(parsed.bodyType || '');
            if (parsed.bodyEditorMode === 'raw' || parsed.bodyEditorMode === 'form')
                setBodyEditorMode(parsed.bodyEditorMode);
            if (parsed.bodyText) {
                try {
                    const json = JSON.parse(parsed.bodyText);
                    const flatFields: Record<string, string> = {};
                    Object.entries(json).forEach(([k, v]) => {
                        flatFields[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    });
                    setBodyFields(flatFields);
                } catch {}
            }
            return;
        }
        resetToDefaults();
    }, [storageKey, parsableKey, method, path, canonicalizeInputs]);
    useEffect(() => {
        loadInputs();
    }, [loadInputs]);
    useEffect(() => {
        if (!requestBodySupportsForm) setBodyEditorMode('raw');
    }, [requestBodySupportsForm, setBodyEditorMode]);
    useEffect(() => {
        const resolved = resolveRequestBody(operation.requestBody, spec);
        const nextMediaType = resolveRequestBodyMediaType(resolved, requestBodyType);
        if (nextMediaType && nextMediaType !== requestBodyType) changeRequestBodyType(nextMediaType);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [operation.requestBody, spec]);
    useEffect(
        () => () => {
            abortControllerRef.current?.abort();
        },
        [],
    );
    const handleSave = () => {
        const payload = {
            params,
            headers,
            bodyText: requestBodyText,
            bodyType: effectiveRequestBodyType,
            bodyEditorMode,
        };
        specStorage.setJSON(parsableKey || 'default', `inputs:${method.toLowerCase()}:${path}`, payload);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 1500);
    };
    const handleClearFields = () => {
        setParams({});
        setHeaders({});
        setRequestBodyText('');
        setBodyFields({});
        setSelectedFile(null);
        setSelectedFiles({});
    };
    const resetToDefaults = () => {
        const pathItemObj = (spec.paths as any)[path] || {};
        const merged = getMergedParameters(pathItemObj, operation, spec);
        const defaultParams: Record<string, string | string[]> = {};
        merged.forEach((param: any) => {
            const schema = param.schema ?? param;
            const isArray = schema?.type === 'array' || param.type === 'array';
            if (isArray && (schema.items?.enum || param.items?.enum)) {
                const values = schema.items?.enum || param.items?.enum;
                defaultParams[parameterStateKey(param.in, param.name)] = [String(values[0] ?? '')];
                return;
            }
            const firstNamedExample = Object.values(param.examples || {})[0] as any;
            const example =
                param.example ??
                firstNamedExample?.dataValue ??
                firstNamedExample?.value ??
                firstNamedExample?.serializedValue ??
                schema?.example ??
                schema?.default;
            if (example === undefined) {
                defaultParams[parameterStateKey(param.in, param.name)] = '';
            } else if (typeof example === 'object') {
                defaultParams[parameterStateKey(param.in, param.name)] = JSON.stringify(example);
            } else {
                defaultParams[parameterStateKey(param.in, param.name)] = String(example);
            }
        });
        setParams(defaultParams);
        setHeaders({});
        const resolvedBody = resolveRequestBody(operation.requestBody, spec);
        if (resolvedBody?.content) {
            const seedType = resolveRequestBodyMediaType(resolvedBody, requestBodyType) || 'application/json';
            setRequestBodyType(seedType);
            const contentObj = resolvedBody.content[seedType];
            if (contentObj) {
                const example = getRequestBodyExample(contentObj);
                const resolvedSchema = contentObj.schema
                    ? resolveReference(contentObj.schema, spec) || contentObj.schema
                    : null;
                if (example !== undefined) {
                    const raw = typeof example === 'string' ? example : JSON.stringify(example, null, 2);
                    setRequestBodyText(
                        typeof example === 'string'
                            ? raw
                            : convertBodyText(raw, 'application/json', seedType, resolvedSchema),
                    );
                } else if (contentObj.schema) {
                    const schema = resolveReference(contentObj.schema, spec) || contentObj.schema;
                    const mock = schemaDeclaresBinary(schema) ? '' : getMockSnippet(contentObj.schema, spec, 'request');
                    setRequestBodyText(mock ? convertBodyText(mock, 'application/json', seedType, schema) : '');
                } else setRequestBodyText('{\n \n}');
            }
        } else {
            setRequestBodyText('');
        }
        setBodyFields({});
        setSelectedFile(null);
        setSelectedFiles({});
    };
    const publishBridgeResult = (result: ExamineResponse) => {
        const actionId = bridgeRunActionIdRef.current;
        if (!actionId) return;
        bridgeRunActionIdRef.current = null;
        dispatchOpenDocUIRunnerResult({actionId, specKey: parsableKey, path, method, result});
    };
    const executeRequest = async () => {
        if (isRunning) return;
        setIsRunning(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        try {
            const result = await executeRunnerRequest({
                spec,
                path,
                method,
                operation,
                selectedServer,
                serverVariables,
                activeAuth,
                parameterValues: params,
                headers,
                body: requestBodyText,
                bodyType: effectiveRequestBodyType,
                selectedFile,
                selectedFiles,
                signal: controller.signal,
            });
            setResponse(result);
            onResponseChange?.(result);
            publishBridgeResult(result);
        } finally {
            abortControllerRef.current = null;
            setIsRunning(false);
        }
    };
    const handleSaveRef = useRef(handleSave);
    handleSaveRef.current = handleSave;
    const executeRef = useRef(executeRequest);
    executeRef.current = executeRequest;
    useEffect(() => {
        const handleBridgeAction = (event: Event) => {
            const action = (event as CustomEvent<OpenDocUIAction>).detail;
            if (!action || (action.action !== 'set_runner_fields' && action.action !== 'run_api')) return;
            if (action.path !== path || action.method.toLowerCase() !== method.toLowerCase()) return;
            const migrated = canonicalizeInputs(action.params || {}, action.headers || {});
            if (action.clearExisting !== false) {
                setParams(migrated.values);
                setHeaders(migrated.customHeaders);
                setRequestBodyText(action.body || '');
                setBodyFields({});
                setSelectedFile(null);
                setSelectedFiles({});
            } else {
                if (action.params || action.headers) setParams(current => ({...current, ...migrated.values}));
                if (action.headers) setHeaders(current => ({...current, ...migrated.customHeaders}));
                if (action.body !== undefined) setRequestBodyText(action.body);
            }
            if (action.bodyType) setRequestBodyType(action.bodyType);
            if (action.action === 'run_api') {
                bridgeRunPendingRef.current = true;
                bridgeRunActionIdRef.current = action.id || null;
            }
            setBridgeActionRevision(value => value + 1);
        };
        window.addEventListener(OPENDOC_UI_ACTION_EVENT, handleBridgeAction);
        return () => window.removeEventListener(OPENDOC_UI_ACTION_EVENT, handleBridgeAction);
    }, [method, path, canonicalizeInputs]);
    useEffect(() => {
        if (bridgeActionRevision > 0 && bridgeRunPendingRef.current) {
            bridgeRunPendingRef.current = false;
            executeRef.current();
        }
    }, [bridgeActionRevision]);
    useEffect(() => {
        if (!isActive) return;
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isRunning) executeRef.current();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveRef.current();
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [isRunning, isActive]);
    const pathItemObj = (spec.paths as any)[path] || {};
    const mergedParams = getMergedParameters(pathItemObj, operation, spec);
    const parameterGroups = groupParameters(mergedParams);
    const usesCookieAuthentication = operationUsesCookieAuthentication(spec, operation);
    const parameterTypeLabel = (param: any) => {
        const value = param.schema?.type ?? param.type ?? 'string';
        return Array.isArray(value) ? value.join(' | ') : String(value);
    };
    const renderParamBlock = (title: string, list: any[], group?: ParameterGroupMeta) => {
        if (list.length === 0) return null;
        return (
            <div className="space-y-2">
                <label className="flex items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {group ? <ParameterLocationTag group={group} variant="heading" /> : title}
                </label>
                <div className="space-y-3 p-4 border rounded-xl bg-[var(--surface)] border-[var(--border)]">
                    {list.map((param: any) => {
                        const parameterSchema = param.schema ?? param;
                        const resolvedParameterSchema = resolveReference(parameterSchema, spec) || parameterSchema;
                        return (
                            <RunnerFieldFrame
                                key={`${param.in}:${param.name}`}
                                ariaLabel={`${param.name} parameter field`}
                                className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-4 sm:items-center sm:gap-4"
                            >
                                <div className="min-w-0 sm:col-span-1">
                                    <FieldHeader
                                        label={param.name}
                                        required={param.required}
                                        description={param.description}
                                        schema={parameterSchema}
                                        resolvedSchema={resolvedParameterSchema}
                                        spec={spec}
                                        onOpenSchema={onOpenSchema}
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-3">
                                    <ParameterInput
                                        param={param}
                                        spec={spec}
                                        value={params[parameterStateKey(param.in, param.name)] ?? ''}
                                        onChange={v =>
                                            setParams(prev => ({
                                                ...prev,
                                                [parameterStateKey(param.in, param.name)]: v,
                                            }))
                                        }
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5 px-1 text-[9.5px] font-mono opacity-65 select-none">
                                        <span className="rounded bg-[var(--text)]/5 px-1 py-0.2 font-semibold text-[var(--primary)]">
                                            {parameterTypeLabel(param)}
                                        </span>
                                        {(param.schema?.format || param.format) && (
                                            <span className="opacity-75">
                                                format:{' '}
                                                <span className="font-semibold text-[var(--accent)]">
                                                    {param.schema?.format || param.format}
                                                </span>
                                            </span>
                                        )}
                                        <SerializationTag
                                            descriptor={describeParameterSerialization(param)}
                                            onOpenPlayground={() => setSerializerParameter(param)}
                                        />
                                    </div>
                                    {(param.pattern || param.schema?.pattern) && (
                                        <PatternPreview
                                            pattern={param.pattern || param.schema.pattern}
                                            onTest={() =>
                                                setPatternToTest({
                                                    pattern: param.pattern || param.schema.pattern,
                                                    parameterKey: parameterStateKey(param.in, param.name),
                                                })
                                            }
                                            className="px-1"
                                        />
                                    )}
                                </div>
                            </RunnerFieldFrame>
                        );
                    })}
                </div>
            </div>
        );
    };
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isRunning) executeRequest();
    };
    const bodySupportsForm = requestBodySupportsForm;
    return (
        <form
            onSubmit={handleFormSubmit}
            noValidate
            className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0"
        >
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />

            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 border-[var(--border)]">
                <div>
                    <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-heading)]">
                        API Target Testing Room
                    </h1>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Execute requests, test responses, and verify session cookie states.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleClearFields}
                        className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]"
                    >
                        Clear Fields
                    </button>
                    <button
                        type="button"
                        onClick={resetToDefaults}
                        className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]"
                    >
                        Reset Examples
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-4 py-1.5 text-xs font-bold text-[var(--method-get-contrast)] rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer select-none hover:brightness-110 active:scale-95 bg-[var(--method-get)]"
                    >
                        {saveSuccess ? (
                            <>
                                <i className="ph ph-check"></i> Saved
                            </>
                        ) : (
                            <>
                                <i className="ph ph-floppy-disk"></i> Save Inputs
                            </>
                        )}
                    </button>
                </div>
            </div>

            {usesCookieAuthentication && (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2 text-[10px] text-[var(--text-muted)]">
                    <i className="ph ph-cookie text-[15px] text-[var(--primary)]" />
                    This endpoint uses browser-managed cookies for authorization. Requests include available cookies.
                </div>
            )}

            <div className="space-y-6 w-full">
                {parameterGroups.map(group => (
                    <Fragment key={group.location}>{renderParamBlock(group.title, group.parameters, group)}</Fragment>
                ))}
                {Object.keys(headers).length > 0 && (
                    <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Additional Headers
                        </label>
                        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                            {Object.entries(headers).map(([name, value]) => (
                                <RunnerFieldFrame
                                    key={name}
                                    ariaLabel={`${name} additional header field`}
                                    className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-4 sm:items-center sm:gap-4"
                                >
                                    <span className="font-mono text-xs font-semibold text-[var(--text-heading)]">
                                        {name}
                                    </span>
                                    <input
                                        type="text"
                                        aria-label={`${name} header value`}
                                        value={value}
                                        onChange={event =>
                                            setHeaders(current => ({...current, [name]: event.target.value}))
                                        }
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-heading)] outline-none focus:border-[var(--primary)] sm:col-span-3"
                                    />
                                </RunnerFieldFrame>
                            ))}
                        </div>
                    </div>
                )}

                {resolvedRequestBody?.content && (
                    <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Request Payload Editor
                        </label>
                        <div className="p-4 border rounded-xl space-y-4 bg-[var(--surface)] border-[var(--border)]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 text-xs border-b border-[var(--border)]">
                                <span className="font-semibold text-[var(--text-heading)]">Payload Format</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {bodySupportsForm && (
                                        <div
                                            className={clsx(
                                                'flex border rounded-lg overflow-hidden p-0.5 border-[var(--border)]',
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setBodyEditorMode('form')}
                                                className={clsx(
                                                    'px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-all',
                                                    bodyEditorMode === 'form'
                                                        ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                                )}
                                            >
                                                Form
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setBodyEditorMode('raw')}
                                                className={clsx(
                                                    'px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-all',
                                                    bodyEditorMode === 'raw'
                                                        ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                                )}
                                            >
                                                {rawEditorLabel}
                                            </button>
                                        </div>
                                    )}
                                    <CustomDropdown
                                        value={effectiveRequestBodyType}
                                        onChange={changeRequestBodyType}
                                        options={Object.keys(resolvedRequestBody.content || {}).map(mime => ({
                                            value: mime,
                                            label: mime,
                                        }))}
                                        className="min-w-[170px] w-full sm:w-auto"
                                    />
                                </div>
                            </div>
                            <BodyEditor
                                spec={spec}
                                method={method}
                                path={path}
                                operation={operation}
                                requestBodyType={effectiveRequestBodyType}
                                setRequestBodyType={setRequestBodyType}
                                bodyEditorMode={bodyEditorMode}
                                setBodyEditorMode={setBodyEditorMode}
                                requestBodyText={requestBodyText}
                                setRequestBodyText={setRequestBodyText}
                                bodyFields={bodyFields}
                                setBodyFields={setBodyFields}
                                selectedFile={selectedFile}
                                setSelectedFile={setSelectedFile}
                                selectedFiles={selectedFiles}
                                setSelectedFiles={setSelectedFiles}
                                setPatternToTest={pattern =>
                                    setPatternToTest(pattern ? {pattern, parameterKey: ''} : null)
                                }
                                themeMode={themeMode}
                                onExecute={executeRequest}
                                onOpenSchema={onOpenSchema}
                            />
                        </div>
                    </div>
                )}
            </div>

            <ResponsePanel
                method={method}
                selectedServer={selectedServer}
                serverVariables={serverVariables}
                path={path}
                isRunning={isRunning}
                response={response}
                responseHistory={responseHistory}
                onSelectResponse={setResponse}
                onDeleteResponse={index => {
                    const remaining = responseHistory.filter((_, itemIndex) => itemIndex !== index);
                    if (response === responseHistory[index]) setResponse(remaining[0] || null);
                    onDeleteResponse?.(index);
                }}
                onExecute={executeRequest}
                onCancel={() => {
                    abortControllerRef.current?.abort();
                }}
                onClear={() => {
                    setResponse(null);
                    onClearResponse?.();
                }}
            />

            {patternToTest && (
                <PatternTesterModal
                    pattern={patternToTest.pattern}
                    initialValue={
                        patternToTest.parameterKey ? String(params[patternToTest.parameterKey] ?? '') : undefined
                    }
                    onUseValue={
                        patternToTest.parameterKey
                            ? value => setParams(previous => ({...previous, [patternToTest.parameterKey]: value}))
                            : undefined
                    }
                    onClose={() => setPatternToTest(null)}
                />
            )}
            {serializerParameter && (
                <SerializerPlaygroundModal
                    parameter={serializerParameter}
                    initialValue={String(
                        params[parameterStateKey(serializerParameter.in, serializerParameter.name)] ?? '',
                    )}
                    onUseValue={value =>
                        setParams(previous => ({
                            ...previous,
                            [parameterStateKey(serializerParameter.in, serializerParameter.name)]: value,
                        }))
                    }
                    onClose={() => setSerializerParameter(null)}
                />
            )}
        </form>
    );
}
