import type {ExamineResponse} from '../types';
import {specStorage} from './storage';

export const MAX_ENDPOINT_RESPONSE_HISTORY = 10;
const MAX_PERSISTED_BODY_CHARS = 256 * 1024;

const storageName = (path: string, method: string) => `response_history:${method.toLowerCase()}:${path}`;
const isResponse = (value: any): value is ExamineResponse =>
    value &&
    typeof value === 'object' &&
    (typeof value.status === 'number' || value.status === null) &&
    value.headers &&
    typeof value.headers === 'object' &&
    !Array.isArray(value.headers) &&
    typeof value.body === 'string' &&
    typeof value.isJson === 'boolean' &&
    Number.isFinite(value.timestamp);

const persistableResponse = (response: ExamineResponse): ExamineResponse => {
    if (response.body.length <= MAX_PERSISTED_BODY_CHARS) return response;
    return {
        ...response,
        body: `${response.body.slice(0, MAX_PERSISTED_BODY_CHARS)}\n\n[Persisted history preview truncated at 256 KiB]`,
        truncated: true,
        bodyBytes: response.bodyBytes ?? new TextEncoder().encode(response.body).byteLength,
    };
};

export const readResponseHistory = (specKey: string, path: string, method: string): ExamineResponse[] =>
    specStorage
        .getJSON<ExamineResponse[]>(
            specKey,
            storageName(path, method),
            [],
            value => Array.isArray(value) && value.every(isResponse),
        )
        .slice(0, MAX_ENDPOINT_RESPONSE_HISTORY);

export const writeResponseHistory = (
    specKey: string,
    path: string,
    method: string,
    history: ExamineResponse[],
): ExamineResponse[] => {
    const bounded = history.slice(0, MAX_ENDPOINT_RESPONSE_HISTORY);
    specStorage.setJSON(specKey, storageName(path, method), bounded.map(persistableResponse));
    return bounded;
};

export const appendResponseHistory = (
    specKey: string,
    path: string,
    method: string,
    response: ExamineResponse,
    current?: ExamineResponse[],
): ExamineResponse[] =>
    writeResponseHistory(specKey, path, method, [response, ...(current || readResponseHistory(specKey, path, method))]);

export const removeResponseHistoryAt = (
    specKey: string,
    path: string,
    method: string,
    index: number,
    current: ExamineResponse[],
): ExamineResponse[] =>
    writeResponseHistory(
        specKey,
        path,
        method,
        current.filter((_, itemIndex) => itemIndex !== index),
    );

export const clearResponseHistory = async (specKey: string, path: string, method: string): Promise<void> => {
    await specStorage.remove(specKey, storageName(path, method));
};
