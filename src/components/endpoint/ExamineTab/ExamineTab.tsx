import {useCallback, useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec, Operation} from '../../../types';
import {getMergedParameters, resolveRequestBody} from '../../../utils/openapi';
import {
    isJsonMediaType,
    normalizeParameterValue,
    queryStringFromPairs,
    serializeOpenApiParameter
} from '../../../utils/openapi/serialization';
import {applyAuthToRequest} from '../../../utils/auth';
import {appendMultipartBody, bodyEditorModeForMediaType, bodyTypeSupportsForm, parseStructuredBody, serializeUrlEncodedBody} from '../../../utils/bodyFormats';
import {dispatchOpenDocUIRunnerResult, OPENDOC_UI_ACTION_EVENT, type OpenDocUIAction} from '../../../utils/aiBridge';
import {getMockSnippet} from '../../../utils/mockGenerator';
import CustomDropdown from '../../common/CustomDropdown';
import PatternPreview from '../../common/PatternPreview';
import PatternTesterModal from '../../modals/PatternTesterModal';
import ParameterInput from './ParameterInput';
import BodyEditor from './BodyEditor';
import ResponsePanel from './ResponsePanel';
import {specStorage} from '../../../utils/storage';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const readResponseBody = async (response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<{
    text: string;
    bytes: number;
    truncated: boolean
}> => {
    if (!response.body) {
        const text = await response.text();
        const encoded = new TextEncoder().encode(text);
        return {
            text: new TextDecoder().decode(encoded.slice(0, maxBytes)),
            bytes: encoded.byteLength,
            truncated: encoded.byteLength > maxBytes
        };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    try {
        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            if (!value) continue;
            const remaining = maxBytes - bytes;
            if (value.byteLength > remaining) {
                if (remaining > 0) chunks.push(value.slice(0, remaining));
                bytes += Math.max(0, remaining);
                truncated = true;
                await reader.cancel();
                break;
            }
            chunks.push(value);
            bytes += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    const merged = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    chunks.forEach(chunk => {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return {text: new TextDecoder().decode(merged), bytes, truncated};
};

const authWarningText = 'Troubleshooting: verify the server URL, CORS policy, authentication requirement, and whether browser cookie restrictions apply.';

interface ExamineTabProps {
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    activeAuth: ActiveAuth;
    selectedServer: string;
    parsableKey?: string;
    themeMode?: 'light' | 'dark';
    initialResponse?: ExamineResponse | null;
    onResponseChange?: (resp: ExamineResponse) => void;
    onClearResponse?: () => void;
    /** Whether this pane is the one that should currently receive keyboard shortcuts
     *  (always true outside of side-by-side mode; only true for the focused pane when split). */
    isActive?: boolean;
}

export default function ExamineTab({
                                       spec, path, method, operation, activeAuth, selectedServer,
                                       parsableKey = '', themeMode = 'dark',
                                       initialResponse = null,
                                       onResponseChange, onClearResponse,
                                       isActive = true,
                                   }: ExamineTabProps) {
    const storageKey = specStorage.key(parsableKey || 'default', `inputs:${method.toLowerCase()}:${path}`);

    // ------- Input state -------
    const [params, setParams] = useState<Record<string, string | string[]>>({});
    const [headers, setHeaders] = useState<Record<string, string>>({});
    const [requestBodyText, setRequestBodyText] = useState('');
    const [requestBodyType, setRequestBodyType] = useState('application/json');
    const [patternToTest, setPatternToTest] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
    const [bodyFields, setBodyFields] = useState<Record<string, string>>({});
    const [bodyEditorMode, setBodyEditorMode] = useState<'form' | 'raw'>('form');
    const [bridgeActionRevision, setBridgeActionRevision] = useState(0);
    const bridgeRunPendingRef = useRef(false);
    const bridgeRunActionIdRef = useRef<string | null>(null);

    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [response, setResponse] = useState<ExamineResponse | null>(initialResponse);
    const abortControllerRef = useRef<AbortController | null>(null);
    const requestStartedAtRef = useRef(0);
    const requestUrlRef = useRef(`${selectedServer}${path}`);
    const timedOutRef = useRef(false);

    // When switching endpoints, adopt the parent-provided (persisted) response
    useEffect(() => {
        setResponse(initialResponse || null);
    }, [initialResponse, path, method]);

    // ------- Load/save inputs from localStorage (per endpoint) -------
    const loadInputs = useCallback(() => {
        const parsed = specStorage.getJSON<any>(parsableKey || 'default', `inputs:${method.toLowerCase()}:${path}`, null, (v) => !!v && typeof v === 'object');
        if (parsed) {
            setParams(parsed.params || {});
            setHeaders(parsed.headers || {});
            setRequestBodyText(parsed.bodyText || '');
            setRequestBodyType(parsed.bodyType || 'application/json');
            if (parsed.bodyEditorMode === 'raw' || parsed.bodyEditorMode === 'form') setBodyEditorMode(parsed.bodyEditorMode);
            if (parsed.bodyText) {
                try {
                    const json = JSON.parse(parsed.bodyText);
                    const flatFields: Record<string, string> = {};
                    Object.entries(json).forEach(([k, v]) => {
                        flatFields[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    });
                    setBodyFields(flatFields);
                } catch { /* body was not JSON */
                }
            }
            return;
        }
        resetToDefaults();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, parsableKey, method, path]);

    useEffect(() => {
        loadInputs();
    }, [loadInputs]);
    useEffect(() => {
        if (!bodyTypeSupportsForm(requestBodyType)) setBodyEditorMode('raw');
    }, [requestBodyType, setBodyEditorMode]);
    useEffect(() => {
        const content = resolveRequestBody(operation.requestBody, spec)?.content || {};
        const mediaTypes = Object.keys(content);
        if (mediaTypes.length > 0 && !mediaTypes.includes(requestBodyType)) {
            setRequestBodyType(mediaTypes[0]);
            setBodyEditorMode(current => bodyEditorModeForMediaType(current, mediaTypes[0]));
        }
    }, [operation.requestBody, requestBodyType, spec]);
    useEffect(() => () => {
        abortControllerRef.current?.abort();
    }, []);

    const handleSave = () => {
        const payload = {params, headers, bodyText: requestBodyText, bodyType: requestBodyType, bodyEditorMode};
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
            const schema = param.schema || param;
            const isArray = schema.type === 'array' || param.type === 'array';
            if (isArray && (schema.items?.enum || param.items?.enum)) {
                const values = schema.items?.enum || param.items?.enum;
                defaultParams[param.name] = [String(values[0] ?? '')];
                return;
            }
            const example = param.example ?? schema.example ?? schema.default;
            if (example === undefined) {
                defaultParams[param.name] = '';
            } else if (typeof example === 'object') {
                defaultParams[param.name] = JSON.stringify(example);
            } else {
                defaultParams[param.name] = String(example);
            }
        });
        setParams(defaultParams);
        setHeaders({});

        const resolvedBody = resolveRequestBody(operation.requestBody, spec);
        if (resolvedBody?.content) {
            const firstType = Object.keys(resolvedBody.content)[0];
            setRequestBodyType(firstType || 'application/json');
            const contentObj = resolvedBody.content[firstType];
            if (contentObj) {
                const firstExample = Object.values(contentObj.examples || {})[0] as any;
                const example = contentObj.example ?? firstExample?.value ?? firstExample?.dataValue;
                if (example !== undefined) setRequestBodyText(typeof example === 'string' ? example : JSON.stringify(example, null, 2));
                else if (contentObj.schema) setRequestBodyText(getMockSnippet(contentObj.schema, spec));
                else setRequestBodyText('{\n \n}');
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

    // ------- Execute -------
    const executeRequest = async () => {
        if (isRunning) return;
        setIsRunning(true);
        requestStartedAtRef.current = Date.now();
        timedOutRef.current = false;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const timeout = window.setTimeout(() => {
            timedOutRef.current = true;
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        const queryParams: Array<{ name: string; value: string; allowReserved?: boolean }> = [];
        const cookieParams: Array<{ name: string; value: string }> = [];
        let processedPath = path;

        try {
            const pathItemObj = (spec.paths as any)[path] || {};
            const merged = getMergedParameters(pathItemObj, operation, spec);
            const parameterHeaders: Record<string, string> = {};
            merged.forEach((param: any) => {
                const rawValue = params[param.name];
                if (rawValue === undefined || rawValue === null || rawValue === '' && !param.allowEmptyValue) return;
                const serialized = serializeOpenApiParameter(param, normalizeParameterValue(param, rawValue));
                if (param.in === 'path' && serialized.pathValue !== undefined) {
                    processedPath = processedPath.replace(`{${param.name}}`, serialized.pathValue);
                }
                queryParams.push(...serialized.query);
                Object.assign(parameterHeaders, serialized.headers);
                cookieParams.push(...serialized.cookies);
            });

            const initialHeaders: Record<string, string> = {Accept: 'application/json', ...parameterHeaders, ...headers};
            const auth = applyAuthToRequest(spec, activeAuth, {
                headers: initialHeaders,
                query: queryParams,
                cookies: cookieParams
            }, operation);
            const queryString = queryStringFromPairs(auth.query);
            const cleanServer = selectedServer.endsWith('/') ? selectedServer.slice(0, -1) : selectedServer;
            const fullUrl = `${cleanServer}${processedPath}${queryString}`;
            requestUrlRef.current = fullUrl;
            const reqHeaders = auth.headers;

            let reqBody: any = null;
            const normalizedMethod = method.toLowerCase();
            const hasDescribedBody = !!resolveRequestBody(operation.requestBody, spec)?.content;
            // Browser fetch forbids bodies on GET/HEAD. For every other method,
            // honor the requestBody object when the description provides one.
            const needsBody = hasDescribedBody && !['get', 'head'].includes(normalizedMethod);
            if (needsBody) {
                let activeBody = requestBodyText;
                if (bodyEditorMode === 'form' && (requestBodyType === 'application/x-www-form-urlencoded' || requestBodyType === 'multipart/form-data')) {
                    const parsedBase = parseStructuredBody(requestBodyText, requestBodyType);
                    const payload: Record<string, unknown> = parsedBase && typeof parsedBase === 'object' && !Array.isArray(parsedBase)
                        ? {...parsedBase as Record<string, unknown>}
                        : {};
                    // Start from the complete form value, then overlay the
                    // fields changed through the recursive editor. This keeps
                    // untouched required fields in the outgoing request.
                    Object.entries(bodyFields).forEach(([key, value]) => {
                        try {
                            const text = typeof value === 'string' ? value : String(value || '');
                            payload[key] = (text.trim().startsWith('{') || text.trim().startsWith('[')) ? JSON.parse(text) : text;
                        } catch {
                            payload[key] = value;
                        }
                    });
                    activeBody = JSON.stringify(payload);
                }
                const normalizedBodyType = requestBodyType.toLowerCase().split(';', 1)[0];
                if (normalizedBodyType === 'multipart/form-data') {
                    const form = new FormData();
                    const selected = {...selectedFiles};
                    if (selectedFile && !selected.file) selected.file = selectedFile;
                    try {
                        appendMultipartBody(form, parseStructuredBody(activeBody, requestBodyType), selected);
                    } catch {
                        // Preserve the selected files even when raw multipart text
                        // is not a JSON/YAML object.
                        Object.entries(selected).forEach(([key, file]) => { if (file) form.append(key, file); });
                    }
                    reqBody = form;
                } else if (selectedFile && normalizedBodyType === 'application/octet-stream') {
                    reqBody = selectedFile;
                } else if (normalizedBodyType === 'application/x-www-form-urlencoded') {
                    reqHeaders['Content-Type'] = requestBodyType;
                    try {
                        reqBody = serializeUrlEncodedBody(parseStructuredBody(activeBody, requestBodyType));
                    } catch {
                        reqBody = activeBody;
                    }
                } else {
                    reqHeaders['Content-Type'] = requestBodyType;
                    reqBody = activeBody;
                }
            }

            const responseObj = await fetch(fullUrl, {
                method: method.toUpperCase(),
                headers: reqHeaders,
                body: reqBody,
                credentials: auth.credentials,
                signal: controller.signal,
            });
            const respHeaders: Record<string, string> = {};
            responseObj.headers.forEach((value, key) => {
                respHeaders[key] = value;
            });
            const contentType = responseObj.headers.get('Content-Type') || '';
            const binary = !isJsonMediaType(contentType) && !/^text\//i.test(contentType) && !/javascript|xml|event-stream|graphql/i.test(contentType);
            const body = await readResponseBody(responseObj);
            const next: ExamineResponse = {
                status: responseObj.status,
                headers: respHeaders,
                body: binary ? `[Binary response omitted from preview]\nContent-Type: ${contentType || 'unknown'}\nBytes read: ${body.bytes}${body.truncated ? ' (truncated)' : ''}` : body.text,
                isJson: isJsonMediaType(contentType),
                timestamp: Date.now(),
                requestUrl: fullUrl,
                durationMs: Date.now() - requestStartedAtRef.current,
                bodyBytes: body.bytes,
                truncated: body.truncated,
                isBinary: binary,
            };
            setResponse(next);
            onResponseChange?.(next);
            publishBridgeResult(next);
        } catch (error: any) {
            if (controller.signal.aborted && !timedOutRef.current) {
                publishBridgeResult({
                    status: 0,
                    headers: {},
                    body: 'Request cancelled by the user.',
                    isJson: false,
                    timestamp: Date.now(),
                    requestUrl: requestUrlRef.current,
                    durationMs: Date.now() - requestStartedAtRef.current,
                    errorKind: 'cancelled',
                    errorMessage: 'Request cancelled by the user.',
                });
                return;
            }
            const errorKind = timedOutRef.current ? 'timeout' : 'network';
            const errorMessage = error?.message || 'The request failed.';
            const next: ExamineResponse = {
                status: 0,
                headers: {},
                body: `${timedOutRef.current ? 'Request timed out after 30 seconds.' : 'Network Error or CORS Blocked:'}\n${errorMessage}\n\n${authWarningText}`,
                isJson: false,
                timestamp: Date.now(),
                requestUrl: requestUrlRef.current,
                durationMs: Date.now() - requestStartedAtRef.current,
                errorKind,
                errorMessage,
            };
            setResponse(next);
            onResponseChange?.(next);
            publishBridgeResult(next);
        } finally {
            window.clearTimeout(timeout);
            abortControllerRef.current = null;
            setIsRunning(false);
        }
    };

    // Ctrl/Cmd+Enter shortcut to send — active whenever this Examine/Runner pane
    // is the currently focused pane (in side-by-side mode only one pane is active
    // at a time; outside of split mode this is always true).
    // Latest handlers, kept in refs so the keydown listener never calls a stale
    // closure (it would save empty inputs).
    const handleSaveRef = useRef(handleSave);
    handleSaveRef.current = handleSave;
    const executeRef = useRef(executeRequest);
    executeRef.current = executeRequest;

    useEffect(() => {
        const handleBridgeAction = (event: Event) => {
            const action = (event as CustomEvent<OpenDocUIAction>).detail;
            if (!action || (action.action !== 'set_runner_fields' && action.action !== 'run_api')) return;
            if (action.path !== path || action.method.toLowerCase() !== method.toLowerCase()) return;
            if (action.clearExisting !== false) {
                setParams(action.params || {});
                setHeaders(action.headers || {});
                setRequestBodyText(action.body || '');
                setBodyFields({});
                setSelectedFile(null);
                setSelectedFiles({});
            } else {
                if (action.params) setParams(action.params);
                if (action.headers) setHeaders(action.headers);
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
    }, [method, path]);

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
            // Ctrl/Cmd+S saves the current inputs (same as the Save button).
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveRef.current();
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRunning, isActive]);

    // ------- Render -------
    const pathItemObj = (spec.paths as any)[path] || {};
    const mergedParams = getMergedParameters(pathItemObj, operation, spec);
    const resolvedRequestBody = resolveRequestBody(operation.requestBody, spec);
    const pathParams = mergedParams.filter((p: any) => p.in === 'path');
    const queryParams = mergedParams.filter((p: any) => p.in === 'query' || p.in === 'querystring');
    const headerParams = mergedParams.filter((p: any) => p.in === 'header');

    const renderParamBlock = (title: string, list: any[]) => {
        if (list.length === 0) return null;
        return (
            <div className="space-y-2">
                <label
                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</label>
                <div className="space-y-3 p-4 border rounded-xl bg-[var(--surface)] border-[var(--border)]">
                    {list.map((param: any) => (
                        <div key={param.name}
                             className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 sm:items-center">
                            <span className="text-xs font-semibold text-[var(--text-heading)] sm:col-span-1">
                                {param.name} {param.required && <span className="text-[var(--method-delete)]">*</span>}
                                {param.description && (
                                    <span
                                        className="text-[10px] font-normal leading-normal mt-0.5 opacity-60 block text-[var(--text-muted)]">{param.description}</span>
                                )}
                            </span>
                            <div className="sm:col-span-3 space-y-1">
                                <ParameterInput param={param} value={params[param.name] ?? ''}
                                                onChange={(v) => setParams(prev => ({...prev, [param.name]: v}))}/>
                                <div
                                    className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-mono opacity-65 select-none px-1">
                                    <span
                                        className="px-1 py-0.2 rounded bg-black/5 bg-[var(--text)]/5 font-semibold text-[var(--primary)]">
                                        {param.schema?.type || param.type || 'string'}
                                    </span>
                                    {(param.schema?.format || param.format) && (
                                        <span className="opacity-75">format: <span
                                            className="text-[var(--accent)] font-semibold">{param.schema?.format || param.format}</span></span>
                                    )}
                                </div>
                                {(param.pattern || param.schema?.pattern) && <PatternPreview pattern={param.pattern || param.schema.pattern} onTest={() => setPatternToTest(param.pattern || param.schema.pattern)} className="px-1"/>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isRunning) executeRequest();
    };
    const bodySupportsForm = bodyTypeSupportsForm(requestBodyType);

    return (
        <form
            onSubmit={handleFormSubmit}
            className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0"
        >
            {/* Hidden submit button so Enter inside any input runs the request. */}
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1}/>
            {/* Action header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 border-[var(--border)]">
                <div>
                    <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-heading)]">API
                        Target Testing Room</h1>
                    <p className="text-[11px] text-[var(--text-muted)]">Execute requests, test responses, and verify
                        session cookie states.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={handleClearFields}
                            className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]">
                        Clear Fields
                    </button>
                    <button type="button" onClick={resetToDefaults}
                            className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]">
                        Reset Examples
                    </button>
                    <button type="button" onClick={handleSave}
                            className="px-4 py-1.5 text-xs font-bold text-[var(--method-get-contrast)] rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer select-none hover:brightness-110 active:scale-95 bg-[var(--method-get)]">
                        {saveSuccess ? <><i className="ph ph-check"></i> Saved</> : <><i
                            className="ph ph-floppy-disk"></i> Save Inputs</>}
                    </button>
                </div>
            </div>

            {/* Header params: simple key/value editor */}
            {(headerParams.length > 0 || Object.keys(headers).length > 0) && (
                <div className="space-y-2">
                    <label
                        className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Headers</label>
                    <div className="space-y-2 p-4 border rounded-xl bg-[var(--surface)] border-[var(--border)]">
                        {headerParams.map((param: any) => (
                            <div key={param.name}
                                 className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 items-center">
                                <span className="text-xs font-semibold">{param.name}</span>
                                <input
                                    type="text"
                                    value={headers[param.name] || ''}
                                    onChange={(e) => setHeaders(prev => ({...prev, [param.name]: e.target.value}))}
                                    placeholder={param.description || ''}
                                    className="sm:col-span-3 w-full px-3 py-2 border rounded-lg text-xs outline-none focus:border-[var(--primary)] bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-6 w-full">
                {renderParamBlock('Path Parameters', pathParams)}
                {renderParamBlock('Query Parameters', queryParams)}

                {resolvedRequestBody?.content && (
                    <div className="space-y-2">
                        <label
                            className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Request
                            Payload Editor</label>
                        <div className="p-4 border rounded-xl space-y-4 bg-[var(--surface)] border-[var(--border)]">
                            <div
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 text-xs border-b border-[var(--border)]">
                                <span className="font-semibold text-[var(--text-heading)]">Payload Format</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {bodySupportsForm && (
                                        <div
                                            className={clsx('flex border rounded-lg overflow-hidden p-0.5 border-[var(--border)]')}>
                                            <button type="button" onClick={() => setBodyEditorMode('form')}
                                                    className={clsx('px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-all', bodyEditorMode === 'form' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>Form
                                            </button>
                                            <button type="button" onClick={() => setBodyEditorMode('raw')}
                                                    className={clsx('px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-all', bodyEditorMode === 'raw' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                {requestBodyType.toLowerCase().includes('json') ? 'Raw JSON' : 'Raw'}
                                            </button>
                                        </div>
                                    )}
                                    <CustomDropdown
                                        value={requestBodyType}
                                        onChange={(val) => {
                                            setRequestBodyType(val);
                                            setBodyEditorMode(current => bodyEditorModeForMediaType(current, val));
                                        }}
                                        options={Object.keys(resolvedRequestBody.content || {}).map(mime => ({
                                            value: mime,
                                            label: mime
                                        }))}
                                        className="min-w-[170px] w-full sm:w-auto"
                                    />
                                </div>
                            </div>
                            <BodyEditor
                                spec={spec} method={method} path={path} operation={operation}
                                requestBodyType={requestBodyType} setRequestBodyType={setRequestBodyType}
                                bodyEditorMode={bodyEditorMode} setBodyEditorMode={setBodyEditorMode}
                                requestBodyText={requestBodyText} setRequestBodyText={setRequestBodyText}
                                bodyFields={bodyFields} setBodyFields={setBodyFields}
                                selectedFile={selectedFile} setSelectedFile={setSelectedFile}
                                selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles}
                                setPatternToTest={setPatternToTest}
                                themeMode={themeMode}
                                onExecute={executeRequest}
                            />
                        </div>
                    </div>
                )}
            </div>

            <ResponsePanel
                method={method}
                selectedServer={selectedServer}
                path={path}
                isRunning={isRunning}
                response={response}
                onExecute={executeRequest}
                onCancel={() => {
                    timedOutRef.current = false;
                    abortControllerRef.current?.abort();
                }}
                onClear={() => {
                    setResponse(null);
                    onClearResponse?.();
                }}
            />

            {patternToTest && <PatternTesterModal pattern={patternToTest} onClose={() => setPatternToTest(null)}/>}
        </form>
    );
}