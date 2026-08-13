import {diagnostic, type ActiveAuth, type ExamineResponse, type OpenApiSpec, type Operation} from '../types';
import {resolveReference} from './openapi';
import {isJsonMediaType} from './openapi/serialization';
import {compileBrowserRequest, type ParameterValueState, type RunnerInputValue} from './requestPlan';
import {declaredContentIsBinary, declaredContentLength, responseHeadersIndicateBinary} from './runnerResponse';

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

const readResponseBody = async (
    response: Response,
): Promise<{
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
            truncated: encoded.byteLength > MAX_RESPONSE_BYTES,
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
            const remaining = MAX_RESPONSE_BYTES - bytes;
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

const operationDeclaresBinaryResponse = (operation: Operation, spec: OpenApiSpec, status: number): boolean => {
    const responses = operation.responses || {};
    const response =
        responses[String(status)] ||
        responses[`${String(status)[0]}XX`] ||
        responses[`${String(status)[0]}xx`] ||
        responses.default;
    if (!response) return false;
    const resolvedResponse = resolveReference(response, spec) || response;
    return Object.entries(resolvedResponse.content || {}).some(([mediaType, media]: [string, any]) => {
        const schema = media?.schema ? resolveReference(media.schema, spec) || media.schema : null;
        return declaredContentIsBinary(mediaType, schema);
    });
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
        const contentDisposition = response.headers.get('Content-Disposition') || '';
        const binary =
            responseHeadersIndicateBinary(contentType, contentDisposition) ||
            operationDeclaresBinaryResponse(input.operation, input.spec, response.status);
        if (binary) {
            const declaredBytes = declaredContentLength(response.headers.get('Content-Length'));
            if (response.body) {
                try {
                    await response.body.cancel();
                } catch {
                    // The browser may have already closed an empty response stream.
                }
            }
            const metadata = [
                '[Binary response omitted from preview]',
                `Content-Type: ${contentType || 'unknown'}`,
                ...(contentDisposition ? [`Content-Disposition: ${contentDisposition}`] : []),
                `Declared size: ${declaredBytes === undefined ? 'unknown' : `${declaredBytes.toLocaleString()} bytes`}`,
                'The response stream was cancelled after headers; no file was saved.',
            ];
            return {
                status: response.status,
                headers: responseHeaders,
                body: metadata.join('\n'),
                isJson: false,
                timestamp: Date.now(),
                requestUrl,
                durationMs: Date.now() - startedAt,
                bodyBytes: declaredBytes,
                truncated: false,
                isBinary: true,
                diagnostics: [
                    ...plan.diagnostics,
                    diagnostic(
                        'RUN_BINARY_RESPONSE_BODY_CANCELLED',
                        'Binary or attachment response detected from its headers or OpenAPI response definition. The body stream was cancelled and no file was saved.',
                        {severity: 'info', transport: 'browser'},
                    ),
                ],
            };
        }
        const body = await readResponseBody(response);
        return {
            status: response.status,
            headers: responseHeaders,
            body: body.text,
            isJson: isJsonMediaType(contentType),
            timestamp: Date.now(),
            requestUrl,
            durationMs: Date.now() - startedAt,
            bodyBytes: body.bytes,
            truncated: body.truncated,
            isBinary: false,
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
