import type {ActiveAuth, ExamineResponse, OpenApiSpec, Operation} from '../types';
import {isJsonMediaType} from './openapi/serialization';
import {
    compileBrowserRequest,
    type ParameterValueState,
    type RunnerInputValue,
} from './requestPlan';

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface RunnerExecutionInput {
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    selectedServer: string;
    serverVariables?: Record<string, string>;
    activeAuth: ActiveAuth;
    parameterValues?: ParameterValueState;
    params?: Record<string, RunnerInputValue>;
    headers?: Record<string, string>;
    body?: string;
    bodyType?: string;
    selectedFile?: File | Blob | null;
    selectedFiles?: Record<string, File | Blob | null>;
    signal?: AbortSignal;
}

const readResponseBody = async (response: Response): Promise<{
    text: string;
    bytes: number;
    truncated: boolean;
}> => {
    if (!response.body) {
        const text = await response.text();
        const encoded = new TextEncoder().encode(text);
        return {
            text: new TextDecoder().decode(encoded.slice(0, MAX_RESPONSE_BYTES)),
            bytes: encoded.byteLength,
            truncated: encoded.byteLength > MAX_RESPONSE_BYTES
        };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    try {
        while (true) {
            const {value, done} = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            const remaining = MAX_RESPONSE_BYTES - bytes;
            if (value.byteLength > remaining) {
                if (remaining > 0)
                    chunks.push(value.slice(0, remaining));
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

export const executeRunnerRequest = async (input: RunnerExecutionInput): Promise<ExamineResponse> => {
    const startedAt = Date.now();
    const plan = compileBrowserRequest(input);
    const blocking = plan.diagnostics.filter(item => item.blocking);
    if (blocking.length > 0) {
        const errorMessage = blocking.map(item => item.message).join('\n');
        return {
            status: 0,
            headers: {},
            body: errorMessage,
            isJson: false,
            timestamp: Date.now(),
            requestUrl: plan.url,
            durationMs: Date.now() - startedAt,
            errorKind: 'validation',
            errorMessage,
            diagnostics: plan.diagnostics,
        };
    }
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    input.signal?.addEventListener('abort', forwardAbort, {once: true});
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    let requestUrl = plan.url;
    try {
        const response = await fetch(plan.url, {
            method: plan.method,
            headers: plan.headers,
            body: plan.body,
            credentials: plan.fetchCredentials,
            signal: controller.signal,
        });
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });
        const contentType = response.headers.get('Content-Type') || '';
        const binary = !isJsonMediaType(contentType)
            && !/^text\//i.test(contentType)
            && !/javascript|xml|event-stream|graphql/i.test(contentType);
        const body = await readResponseBody(response);
        return {
            status: response.status,
            headers: responseHeaders,
            body: binary
                ? `[Binary response omitted from preview]\nContent-Type: ${contentType || 'unknown'}\nBytes read: ${body.bytes}${body.truncated ? ' (truncated)' : ''}`
                : body.text,
            isJson: isJsonMediaType(contentType),
            timestamp: Date.now(),
            requestUrl,
            durationMs: Date.now() - startedAt,
            bodyBytes: body.bytes,
            truncated: body.truncated,
            isBinary: binary,
            diagnostics: plan.diagnostics,
        };
    } catch (error: any) {
        const cancelled = Boolean(input.signal?.aborted || (controller.signal.aborted && !timedOut));
        const errorKind = cancelled ? 'cancelled' : timedOut ? 'timeout' : 'network';
        const errorMessage = cancelled
            ? 'Request cancelled by the user.'
            : timedOut
                ? 'Request timed out after 30 seconds.'
                : error?.message || 'The request failed.';
        return {
            status: 0,
            headers: {},
            body: errorMessage,
            isJson: false,
            timestamp: Date.now(),
            requestUrl,
            durationMs: Date.now() - startedAt,
            errorKind,
            errorMessage,
            diagnostics: plan.diagnostics,
        };
    } finally {
        globalThis.clearTimeout(timeout);
        input.signal?.removeEventListener('abort', forwardAbort);
    }
};
