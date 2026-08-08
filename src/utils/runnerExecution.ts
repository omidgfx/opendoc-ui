import type {ActiveAuth, ExamineResponse, OpenApiSpec, Operation} from '../types';
import {applyAuthToRequest} from './auth';
import {appendMultipartBody, parseStructuredBody, serializeUrlEncodedBody} from './bodyFormats';
import {
    isJsonMediaType,
    normalizeParameterValue,
    queryStringFromPairs,
    serializeOpenApiParameter
} from './openapi/serialization';
import {getMergedParameters, resolveRequestBody} from './openapi';

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface RunnerExecutionInput {
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    selectedServer: string;
    activeAuth: ActiveAuth;
    params?: Record<string, string | string[]>;
    headers?: Record<string, string>;
    body?: string;
    bodyType?: string;
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
const buildRequestBody = (body: string | undefined, bodyType: string, headers: Record<string, string>): BodyInit | null => {
    if (body === undefined || body === '')
        return null;
    const normalizedType = bodyType.toLowerCase().split(';', 1)[0];
    if (normalizedType === 'application/x-www-form-urlencoded') {
        try {
            headers['Content-Type'] = bodyType;
            return serializeUrlEncodedBody(parseStructuredBody(body, bodyType));
        } catch {
        }
    }
    if (normalizedType === 'multipart/form-data') {
        const form = new FormData();
        try {
            appendMultipartBody(form, parseStructuredBody(body, bodyType));
        } catch {
        }
        return form;
    }
    headers['Content-Type'] = bodyType;
    return body;
};
export const executeRunnerRequest = async (input: RunnerExecutionInput): Promise<ExamineResponse> => {
    const startedAt = Date.now();
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    input.signal?.addEventListener('abort', forwardAbort, {once: true});
    let timedOut = false;
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);
    let requestUrl = `${input.selectedServer}${input.path}`;
    try {
        const pathItem = (input.spec.paths as any)[input.path] || {};
        const mergedParameters = getMergedParameters(pathItem, input.operation, input.spec);
        let processedPath = input.path;
        const query: Array<{
            name: string;
            value: string;
            allowReserved?: boolean;
        }> = [];
        const cookies: Array<{
            name: string;
            value: string;
        }> = [];
        const parameterHeaders: Record<string, string> = {};
        const params = input.params || {};
        mergedParameters.forEach((parameter: any) => {
            const value = params[parameter.name];
            if (value === undefined || value === null || value === '' && !parameter.allowEmptyValue)
                return;
            const serialized = serializeOpenApiParameter(parameter, normalizeParameterValue(parameter, value));
            if (parameter.in === 'path' && serialized.pathValue !== undefined) {
                processedPath = processedPath.replace(`{${parameter.name}}`, serialized.pathValue);
            }
            query.push(...serialized.query);
            Object.assign(parameterHeaders, serialized.headers);
            cookies.push(...serialized.cookies);
        });
        const requestHeaders: Record<string, string> = {Accept: 'application/json', ...parameterHeaders, ...(input.headers || {})};
        const auth = applyAuthToRequest(input.spec, input.activeAuth, {
            headers: requestHeaders,
            query,
            cookies
        }, input.operation);
        const server = input.selectedServer.endsWith('/') ? input.selectedServer.slice(0, -1) : input.selectedServer;
        requestUrl = `${server}${processedPath}${queryStringFromPairs(auth.query)}`;
        const resolvedBody = resolveRequestBody(input.operation.requestBody, input.spec);
        const bodyType = input.bodyType || Object.keys(resolvedBody?.content || {})[0] || 'application/json';
        const requestBody = buildRequestBody(input.body, bodyType, auth.headers);
        const normalizedMethod = input.method.toUpperCase();
        const safeBody = requestBody !== null && !['GET', 'HEAD'].includes(normalizedMethod) ? requestBody : null;
        const response = await fetch(requestUrl, {
            method: normalizedMethod,
            headers: auth.headers,
            body: safeBody,
            credentials: auth.credentials,
            signal: controller.signal,
        });
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });
        const contentType = response.headers.get('Content-Type') || '';
        const binary = !isJsonMediaType(contentType) && !/^text\//i.test(contentType) && !/javascript|xml|event-stream|graphql/i.test(contentType);
        const body = await readResponseBody(response);
        return {
            status: response.status,
            headers: responseHeaders,
            body: binary ? `[Binary response omitted from preview]\nContent-Type: ${contentType || 'unknown'}\nBytes read: ${body.bytes}${body.truncated ? ' (truncated)' : ''}` : body.text,
            isJson: isJsonMediaType(contentType),
            timestamp: Date.now(),
            requestUrl,
            durationMs: Date.now() - startedAt,
            bodyBytes: body.bytes,
            truncated: body.truncated,
            isBinary: binary,
        };
    } catch (error: any) {
        const cancelled = input.signal?.aborted || controller.signal.aborted && !timedOut;
        const errorKind = cancelled ? 'cancelled' : timedOut ? 'timeout' : 'network';
        const errorMessage = cancelled ? 'Request cancelled by the user.' : error?.message || 'The request failed.';
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
        };
    } finally {
        window.clearTimeout(timeout);
        input.signal?.removeEventListener('abort', forwardAbort);
    }
};
