import type {OpenApiSpec} from '../../types';
import {getDocumentOperations, getMergedParameters, resolveReference, resolveRequestBody} from '../openapi';

const plain = (value: unknown): string =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

export const createLlmsText = (spec: OpenApiSpec): string => {
    const lines: string[] = [
        `# ${spec.info?.title || 'API Documentation'}`,
        '',
        `Version: ${spec.info?.version || 'unspecified'}`,
    ];
    if (spec.info?.description) lines.push('', plain(spec.info.description));
    if (spec.servers?.length) {
        lines.push('', '## Servers', '');
        spec.servers.forEach(server =>
            lines.push(`- ${server.url}${server.description ? ` — ${plain(server.description)}` : ''}`),
        );
    }
    lines.push('', '## Operations');
    getDocumentOperations(spec).forEach(({path, method, operation}) => {
        const pathItem = (spec.paths as any)?.[path] || {};
        lines.push('', `### ${method.toUpperCase()} ${path}`, '');
        if (operation.summary) lines.push(plain(operation.summary), '');
        if (operation.description) lines.push(plain(operation.description), '');
        const parameters = getMergedParameters(pathItem, operation, spec);
        if (parameters.length > 0) {
            lines.push('Parameters:');
            parameters.forEach((parameter: any) => {
                const schema = parameter.schema || parameter;
                const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type || 'any';
                lines.push(
                    `- ${parameter.in || 'unknown'}:${parameter.name || 'unnamed'} — ${type}${parameter.required ? ' — required' : ''}${parameter.description ? ` — ${plain(parameter.description)}` : ''}`,
                );
            });
            lines.push('');
        }
        const body = resolveRequestBody(operation.requestBody, spec);
        const requestTypes = Object.keys(body?.content || {});
        if (requestTypes.length) lines.push(`Request content: ${requestTypes.join(', ')}`, '');
        lines.push('Responses:');
        Object.entries(operation.responses || {}).forEach(([code, response]: [string, any]) => {
            const resolved = resolveReference(response, spec) || response;
            const media = Object.keys(resolved?.content || {});
            lines.push(
                `- ${code} — ${plain(resolved?.description || '')}${media.length ? ` — ${media.join(', ')}` : ''}`,
            );
        });
    });
    const schemas = spec.components?.schemas || {};
    if (Object.keys(schemas).length > 0) {
        lines.push('', '## Schemas');
        Object.entries(schemas).forEach(([name, schema]: [string, any]) => {
            const resolved = resolveReference(schema, spec) || schema;
            lines.push('', `### ${name}`, '');
            if (resolved?.description) lines.push(plain(resolved.description), '');
            if (resolved?.properties) {
                Object.entries(resolved.properties).forEach(([property, value]: [string, any]) => {
                    const type = Array.isArray(value?.type)
                        ? value.type.join(' | ')
                        : value?.type || value?.$ref || 'any';
                    lines.push(`- ${property}: ${type}${value?.description ? ` — ${plain(value.description)}` : ''}`);
                });
            } else if (resolved?.$ref) lines.push(`Unresolved reference: ${resolved.$ref}`);
        });
    }
    return `${lines.join('\n').trim()}\n`;
};
