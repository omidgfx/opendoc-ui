import Markdown from '../../common/Markdown';
import MethodBadge from '../../common/MethodBadge';
import CodeViewer from '../../common/CodeViewer';
import type {OpenApiSpec} from '../../../types';
import {getPathItemOperations, getRefName, resolveReference, resolveRequestBody} from '../../../utils/openapi';
import {formatExample} from '../../../utils/endpoint/exampleFormatting';
import {getRequestBodyExample} from '../../../utils/endpoint/requestBodySource';
interface OperationCallbacksPanelProps {
    callbacks: Record<string, any>;
    spec: OpenApiSpec;
    onOpenSchema: (schemaName: string) => void;
}

const schemaLabel = (schema: any, spec: OpenApiSpec): {label: string; schemaName?: string} => {
    if (!schema) return {label: 'No schema'};
    if (typeof schema.$ref === 'string') {
        const schemaName = getRefName(schema.$ref);
        return {label: schemaName, schemaName};
    }
    const resolved = resolveReference(schema, spec) || schema;
    if (typeof resolved?.$ref === 'string') {
        const schemaName = getRefName(resolved.$ref);
        return {label: schemaName, schemaName};
    }
    if (resolved?.title) return {label: resolved.title};
    if (Array.isArray(resolved?.type)) return {label: resolved.type.join(' | ')};
    if (resolved?.type) return {label: resolved.type};
    return {label: 'Inline schema'};
};

const stringifyValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

export default function OperationCallbacksPanel({callbacks, spec, onOpenSchema}: OperationCallbacksPanelProps) {
    const callbackEntries = Object.entries(callbacks || {})
        .map(([name, raw]) => [name, resolveReference(raw, spec) || raw] as const)
        .filter(([, callbackObject]) => !!callbackObject && typeof callbackObject === 'object');
    if (callbackEntries.length === 0) return null;
    return (
        <div className="min-w-0">
            <div className="space-y-3 font-sans min-w-0">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--method-put)]/20 bg-[var(--method-put)]/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--method-put)]">
                            <i className="ph ph-broadcast text-[11px]" />
                            Callbacks
                        </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                        Callback operations initiated by the API provider after this request. OpenDoc documents them in
                        full, but the outbound Runner does not emit them.
                    </p>
                </div>
                <div className="space-y-4">
                    {callbackEntries.map(([callbackName, callbackObject]) => {
                        const expressions = Object.entries(callbackObject || {}).map(([expression, pathItem]) => ({
                            expression,
                            pathItem: resolveReference(pathItem, spec) || pathItem,
                        }));
                        return (
                            <section
                                key={callbackName}
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-sm"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                                        {callbackName}
                                    </span>
                                    <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[9px] font-mono text-[var(--text-muted)]">
                                        {expressions.length} destination{expressions.length === 1 ? '' : 's'}
                                    </span>
                                    <span className="rounded-full border border-[var(--method-put)]/20 bg-[var(--method-put)]/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--method-put)]">
                                        inbound only
                                    </span>
                                </div>
                                <div className="mt-4 space-y-4">
                                    {expressions.map(({expression, pathItem}, expressionIndex) => {
                                        const operations = getPathItemOperations(pathItem as any);
                                        return (
                                            <div
                                                key={`${callbackName}:${expression}:${expressionIndex}`}
                                                className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 sm:p-4"
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <i className="ph ph-function text-[12px] text-[var(--primary)]" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                            Callback expression
                                                        </span>
                                                    </div>
                                                    <code className="break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 font-mono text-[10px] text-[var(--primary)]">
                                                        {expression}
                                                    </code>
                                                </div>
                                                <div className="mt-4 space-y-4">
                                                    {operations.map(({method, operation}) => {
                                                        const resolvedBody = resolveRequestBody(
                                                            (operation as any).requestBody,
                                                            spec,
                                                        );
                                                        const requestEntries = Object.entries(
                                                            resolvedBody?.content || {},
                                                        ) as Array<[string, any]>;
                                                        return (
                                                            <div
                                                                key={`${callbackName}:${expression}:${method}`}
                                                                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <MethodBadge method={method} size="xs" />
                                                                    <span className="text-xs font-bold text-[var(--text-heading)]">
                                                                        {operation.summary ||
                                                                            operation.operationId ||
                                                                            'Callback operation'}
                                                                    </span>
                                                                </div>
                                                                {operation.description && (
                                                                    <div className="mt-2 text-xs leading-relaxed text-[var(--text)]">
                                                                        <Markdown text={operation.description} />
                                                                    </div>
                                                                )}
                                                                {requestEntries.length > 0 && (
                                                                    <div className="mt-3 space-y-2">
                                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                                            Request body
                                                                        </h4>
                                                                        {requestEntries.map(([contentType, media]) => {
                                                                            const label = schemaLabel(
                                                                                media?.schema,
                                                                                spec,
                                                                            );
                                                                            const example = getRequestBodyExample(
                                                                                media,
                                                                                spec,
                                                                            );
                                                                            return (
                                                                                <div
                                                                                    key={contentType}
                                                                                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
                                                                                >
                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                        <code className="rounded bg-[var(--surface)] px-1.5 py-1 font-mono text-[10px] text-[var(--text-heading)]">
                                                                                            {contentType}
                                                                                        </code>
                                                                                        <span className="text-[10px] text-[var(--text-muted)]">
                                                                                            {label.label}
                                                                                        </span>
                                                                                        {label.schemaName && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() =>
                                                                                                    onOpenSchema(
                                                                                                        label.schemaName!,
                                                                                                    )
                                                                                                }
                                                                                                className="rounded border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-2 py-1 text-[10px] font-bold text-[var(--primary)] cursor-pointer"
                                                                                            >
                                                                                                Open schema
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                    {example !== undefined && (
                                                                                        <div className="mt-2">
                                                                                            <CodeViewer
                                                                                                code={formatExample(
                                                                                                    example,
                                                                                                    contentType,
                                                                                                    label.schemaName ||
                                                                                                        label.label ||
                                                                                                        'callback',
                                                                                                )}
                                                                                                language={
                                                                                                    contentType.includes(
                                                                                                        'json',
                                                                                                    )
                                                                                                        ? 'json'
                                                                                                        : 'text'
                                                                                                }
                                                                                                maxHeight="220px"
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                                <div className="mt-3 space-y-2">
                                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                                        Responses
                                                                    </h4>
                                                                    <div className="space-y-2">
                                                                        {Object.entries(operation.responses || {}).map(
                                                                            ([code, response]) => {
                                                                                const resolvedResponse =
                                                                                    resolveReference(response, spec) ||
                                                                                    response;
                                                                                const responseContent = Object.entries(
                                                                                    resolvedResponse?.content || {},
                                                                                ) as Array<[string, any]>;
                                                                                return (
                                                                                    <div
                                                                                        key={code}
                                                                                        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                                                                                    >
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-heading)]">
                                                                                                {code}
                                                                                            </span>
                                                                                            <span className="text-[10px] text-[var(--text)]">
                                                                                                {resolvedResponse?.description ||
                                                                                                    'Response'}
                                                                                            </span>
                                                                                        </div>
                                                                                        {responseContent.length > 0 && (
                                                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                                                {responseContent.map(
                                                                                                    ([
                                                                                                        contentType,
                                                                                                        media,
                                                                                                    ]) => {
                                                                                                        const label =
                                                                                                            schemaLabel(
                                                                                                                media?.schema,
                                                                                                                spec,
                                                                                                            );
                                                                                                        return (
                                                                                                            <div
                                                                                                                key={`${code}:${contentType}`}
                                                                                                                className="flex flex-wrap items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px]"
                                                                                                            >
                                                                                                                <code className="font-mono text-[var(--text-heading)]">
                                                                                                                    {
                                                                                                                        contentType
                                                                                                                    }
                                                                                                                </code>
                                                                                                                <span className="text-[var(--text-muted)]">
                                                                                                                    {
                                                                                                                        label.label
                                                                                                                    }
                                                                                                                </span>
                                                                                                                {label.schemaName && (
                                                                                                                    <button
                                                                                                                        type="button"
                                                                                                                        onClick={() =>
                                                                                                                            onOpenSchema(
                                                                                                                                label.schemaName!,
                                                                                                                            )
                                                                                                                        }
                                                                                                                        className="font-bold text-[var(--primary)] cursor-pointer"
                                                                                                                    >
                                                                                                                        Open
                                                                                                                    </button>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        );
                                                                                                    },
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                        {resolvedResponse?.links && (
                                                                                            <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                                                                                                Link names:{' '}
                                                                                                <code className="font-mono text-[var(--text-heading)]">
                                                                                                    {Object.keys(
                                                                                                        resolvedResponse.links,
                                                                                                    ).join(', ')}
                                                                                                </code>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            },
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {operations.length === 0 && (
                                                        <div className="rounded-lg border border-[var(--method-put)]/25 bg-[var(--method-put)]/5 px-3 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                                            This callback destination does not resolve to runnable HTTP
                                                            operations.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
