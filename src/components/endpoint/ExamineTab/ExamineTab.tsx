import {useCallback, useEffect, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec, Operation} from '../../../types';
import {getMergedParameters, resolveRequestBody} from '../../../utils/openapi';
import {getMockSnippet} from '../../../utils/mockGenerator';
import CustomDropdown from '../../common/CustomDropdown';
import Markdown from '../../common/Markdown';
import PatternTesterModal from '../../modals/PatternTesterModal';
import ParameterInput from './ParameterInput';
import BodyEditor from './BodyEditor';
import ResponsePanel from './ResponsePanel';

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
}

export default function ExamineTab({
    spec, path, method, operation, activeAuth, selectedServer,
    parsableKey = '', themeMode = 'dark',
    initialResponse = null,
    onResponseChange, onClearResponse,
}: ExamineTabProps) {
    const storageKey = `api_inputs_${parsableKey ? `${parsableKey}_` : ''}${method.toLowerCase()}_${path}`;

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

    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [response, setResponse] = useState<ExamineResponse | null>(initialResponse);

    // When switching endpoints, adopt the parent-provided (persisted) response
    useEffect(() => {
        setResponse(initialResponse || null);
    }, [initialResponse, path, method]);

    // ------- Load/save inputs from localStorage (per endpoint) -------
    const loadInputs = useCallback(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                setParams(parsed.params || {});
                setHeaders(parsed.headers || {});
                setRequestBodyText(parsed.bodyText || '');
                setRequestBodyType(parsed.bodyType || 'application/json');
                if (parsed.bodyText) {
                    try {
                        const json = JSON.parse(parsed.bodyText);
                        const flatFields: Record<string, string> = {};
                        Object.entries(json).forEach(([k, v]) => {
                            flatFields[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
                        });
                        setBodyFields(flatFields);
                    } catch { /* body was not JSON */ }
                }
                return;
            }
        } catch (e) {
            console.error('Failed to load inputs', e);
        }
        resetToDefaults();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    useEffect(() => { loadInputs(); }, [loadInputs]);

    const handleSave = () => {
        const payload = { params, headers, bodyText: requestBodyText, bodyType: requestBodyType };
        localStorage.setItem(storageKey, JSON.stringify(payload));
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
            if (param.type === 'array' && param.items?.enum) {
                defaultParams[param.name] = [param.items.enum[0] || ''];
            } else {
                let val = '';
                if (param.schema?.example !== undefined) val = String(param.schema.example);
                else if (param.example !== undefined) val = String(param.example);
                defaultParams[param.name] = val;
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
                if (contentObj.example !== undefined) setRequestBodyText(JSON.stringify(contentObj.example, null, 2));
                else if (contentObj.schema) setRequestBodyText(getMockSnippet(contentObj.schema, spec));
                else setRequestBodyText('{\n \n}');
            }
        } else {
            setRequestBodyText('');
        }
        setBodyFields({});
    };

    // ------- Execute -------
    const executeRequest = async () => {
        setIsRunning(true);
        const queryParamsList: string[] = [];
        let processedPath = path;

        const pathItemObj = (spec.paths as any)[path] || {};
        const merged = getMergedParameters(pathItemObj, operation, spec);

        merged.forEach((param: any) => {
            const val = params[param.name];
            if (val === undefined || val === null) return;
            if (param.in === 'path') {
                processedPath = processedPath.replace(`{${param.name}}`, encodeURIComponent(String(val)));
            } else if (param.in === 'query') {
                if (Array.isArray(val)) {
                    val.forEach(item => { if (item) queryParamsList.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(item)}`); });
                } else if (val !== '') {
                    queryParamsList.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(String(val))}`);
                }
            }
        });

        if (activeAuth.activeScheme === 'apikey' && activeAuth.apiKeyValue && activeAuth.apiKeyIn === 'query') {
            queryParamsList.push(`${encodeURIComponent(activeAuth.apiKeyName || 'api_key')}=${encodeURIComponent(activeAuth.apiKeyValue)}`);
        }

        const queryString = queryParamsList.length > 0 ? `?${queryParamsList.join('&')}` : '';
        const cleanServer = selectedServer.endsWith('/') ? selectedServer.slice(0, -1) : selectedServer;
        const fullUrl = `${cleanServer}${processedPath}${queryString}`;

        const reqHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
        if (activeAuth.activeScheme === 'bearer' && activeAuth.bearerToken) reqHeaders['Authorization'] = `Bearer ${activeAuth.bearerToken}`;
        else if (activeAuth.activeScheme === 'apikey' && activeAuth.apiKeyValue && activeAuth.apiKeyIn === 'header') {
            reqHeaders[activeAuth.apiKeyName || 'X-API-KEY'] = activeAuth.apiKeyValue;
        } else if (activeAuth.activeScheme === 'basic' && activeAuth.basicUsername) {
            reqHeaders['Authorization'] = `Basic ${btoa(`${activeAuth.basicUsername}:${activeAuth.basicPassword}`)}`;
        }

        let reqBody: any = null;
        const needsBody = ['post', 'put', 'patch', 'delete'].includes(method.toLowerCase());

        if (needsBody) {
            let activeBody = requestBodyText;
            if (bodyEditorMode === 'form' && (requestBodyType === 'application/x-www-form-urlencoded' || requestBodyType === 'multipart/form-data')) {
                const payload: any = {};
                Object.entries(bodyFields).forEach(([k, v]) => {
                    try {
                        const str = typeof v === 'string' ? v : String(v || '');
                        payload[k] = (str.trim().startsWith('{') || str.trim().startsWith('[')) ? JSON.parse(str) : str;
                    } catch { payload[k] = v; }
                });
                activeBody = JSON.stringify(payload);
            }

            if (requestBodyType === 'multipart/form-data') {
                const fd = new FormData();
                if (selectedFile && !selectedFiles.file) fd.append('file', selectedFile);
                Object.entries(selectedFiles).forEach(([key, file]) => { if (file) fd.append(key, file); });
                try {
                    const parsed = JSON.parse(activeBody);
                    Object.entries(parsed).forEach(([k, v]: [string, any]) => { if (!selectedFiles[k]) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v); });
                } catch { /* */ }
                reqBody = fd;
            } else if (selectedFile && requestBodyType === 'application/octet-stream') {
                reqBody = selectedFile;
            } else if (requestBodyType === 'application/x-www-form-urlencoded') {
                reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
                try {
                    const parsed = JSON.parse(activeBody);
                    const usp = new URLSearchParams();
                    Object.entries(parsed).forEach(([k, v]: [string, any]) => usp.append(k, String(v)));
                    reqBody = usp.toString();
                } catch { reqBody = activeBody; }
            } else {
                reqHeaders['Content-Type'] = requestBodyType;
                reqBody = activeBody;
            }
        }

        try {
            const responseObj = await fetch(fullUrl, {
                method: method.toUpperCase(),
                headers: reqHeaders,
                body: reqBody,
                credentials: activeAuth.activeScheme === 'cookie' ? 'include' : 'same-origin',
            });
            const respHeaders: Record<string, string> = {};
            responseObj.headers.forEach((val, key) => { respHeaders[key] = val; });
            const bodyText = await responseObj.text();
            const isJson = !!responseObj.headers.get('Content-Type')?.includes('application/json');
            const next: ExamineResponse = {
                status: responseObj.status,
                headers: respHeaders,
                body: bodyText,
                isJson,
                timestamp: Date.now(),
            };
            setResponse(next);
            onResponseChange?.(next);
        } catch (e: any) {
            const next: ExamineResponse = {
                status: 0,
                headers: {},
                body: `Network Error or CORS Blocked:\n${e.message}\n\nTroubleshooting:\n1. If using cookies, serve the app on the same domain.\n2. Ensure the server allows CORS with "Access-Control-Allow-Origin".`,
                isJson: false,
                timestamp: Date.now(),
            };
            setResponse(next);
            onResponseChange?.(next);
        } finally {
            setIsRunning(false);
        }
    };

    // Ctrl/Cmd+Enter shortcut to send
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                const target = e.target as HTMLElement | null;
                if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
                    e.preventDefault();
                    if (!isRunning) executeRequest();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRunning]);

    // ------- Render -------
    const pathItemObj = (spec.paths as any)[path] || {};
    const mergedParams = getMergedParameters(pathItemObj, operation, spec);
    const resolvedRequestBody = resolveRequestBody(operation.requestBody, spec);
    const pathParams = mergedParams.filter((p: any) => p.in === 'path');
    const queryParams = mergedParams.filter((p: any) => p.in === 'query');
    const headerParams = mergedParams.filter((p: any) => p.in === 'header');

    const renderParamBlock = (title: string, list: any[]) => {
        if (list.length === 0) return null;
        return (
            <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</label>
                <div className="space-y-3 p-4 border rounded-xl bg-[var(--surface)] border-[var(--border)]">
                    {list.map((param: any) => (
                        <div key={param.name} className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 sm:items-center">
                            <span className="text-xs font-semibold text-[var(--text-heading)] sm:col-span-1">
                                {param.name} {param.required && <span className="text-[var(--method-delete)]">*</span>}
                                {param.description && (
                                    <span className="text-[10px] font-normal leading-normal mt-0.5 opacity-60 block text-[var(--text-muted)]">{param.description}</span>
                                )}
                            </span>
                            <div className="sm:col-span-3 space-y-1">
                                <ParameterInput param={param} value={params[param.name] ?? ''} onChange={(v) => setParams(prev => ({ ...prev, [param.name]: v }))} />
                                <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-mono opacity-65 select-none px-1">
                                    <span className="px-1 py-0.2 rounded bg-black/5 bg-[var(--text)]/5 font-semibold text-[var(--primary)]">
                                        {param.schema?.type || param.type || 'string'}
                                    </span>
                                    {(param.schema?.format || param.format) && (
                                        <span className="opacity-75">format: <span className="text-[var(--accent)] font-semibold">{param.schema?.format || param.format}</span></span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0">
            {/* Action header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 border-[var(--border)]">
                <div>
                    <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-heading)]">API Target Testing Room</h1>
                    <p className="text-[11px] text-[var(--text-muted)]">Execute requests, test responses, and verify session cookie states.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={handleClearFields} className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]">
                        Clear Fields
                    </button>
                    <button onClick={resetToDefaults} className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]">
                        Reset Examples
                    </button>
                    <button onClick={handleSave} className="px-4 py-1.5 text-xs font-bold text-[var(--method-get-contrast)] rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer select-none hover:brightness-110 active:scale-95 bg-[var(--method-get)]">
                        {saveSuccess ? <><i className="ph ph-check"></i> Saved</> : <><i className="ph ph-floppy-disk"></i> Save Inputs</>}
                    </button>
                </div>
            </div>

            {/* Header params: simple key/value editor */}
            {(headerParams.length > 0 || Object.keys(headers).length > 0) && (
                <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Headers</label>
                    <div className="space-y-2 p-4 border rounded-xl bg-[var(--surface)] border-[var(--border)]">
                        {headerParams.map((param: any) => (
                            <div key={param.name} className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 items-center">
                                <span className="text-xs font-semibold">{param.name}</span>
                                <input
                                    type="text"
                                    value={headers[param.name] || ''}
                                    onChange={(e) => setHeaders(prev => ({ ...prev, [param.name]: e.target.value }))}
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
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Request Payload Editor</label>
                        <div className="p-4 border rounded-xl space-y-4 bg-[var(--surface)] border-[var(--border)]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 text-xs border-b border-[var(--border)]">
                                <span className="font-semibold text-[var(--text-heading)]">Payload Format</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(requestBodyType === 'application/x-www-form-urlencoded' || requestBodyType === 'multipart/form-data' || requestBodyType.toLowerCase().includes('json')) && (
                                        <div className={clsx('flex border rounded-lg overflow-hidden p-0.5 border-[var(--border)]')}>
                                            <button type="button" onClick={() => setBodyEditorMode('form')}
                                                className={clsx('px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-all', bodyEditorMode === 'form' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>Form</button>
                                            <button type="button" onClick={() => setBodyEditorMode('raw')}
                                                className={clsx('px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-all', bodyEditorMode === 'raw' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                                {requestBodyType.toLowerCase().includes('json') ? 'Raw JSON' : 'Raw'}
                                            </button>
                                        </div>
                                    )}
                                    <CustomDropdown
                                        value={requestBodyType}
                                        onChange={(val) => { setRequestBodyType(val); setBodyEditorMode('form'); }}
                                        options={Object.keys(resolvedRequestBody.content || {}).map(mime => ({ value: mime, label: mime }))}
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
                onClear={() => { setResponse(null); onClearResponse?.(); }}
            />

            {patternToTest && <PatternTesterModal pattern={patternToTest} onClose={() => setPatternToTest(null)} />}
        </div>
    );
}
