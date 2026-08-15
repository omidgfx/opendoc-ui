import type {Diagnostic, OpenApiSpec, Operation, ServerDefinition} from '../../types';
import {diagnostic} from '../../types';
import {getSpecSourceUri} from './specSource';

export type ServerSource = 'operation' | 'path' | 'root' | 'default';

export interface ResolvedServer {
    source: ServerSource;
    definition: ServerDefinition;
    rawUrl: string;
    expandedUrl: string;
    url: string;
    variableValues: Record<string, string>;
    diagnostics: Diagnostic[];
}

export interface ResolveServerInput {
    spec: OpenApiSpec;
    pathItem?: any;
    operation?: Operation | any;
    selectedServer?: string;
    selectedVariables?: Record<string, string>;
    sourceUri?: string;
}

const chooseServerList = (input: ResolveServerInput): {source: ServerSource; servers: ServerDefinition[]} => {
    if (Array.isArray(input.operation?.servers) && input.operation.servers.length > 0)
        return {source: 'operation', servers: input.operation.servers};
    if (Array.isArray(input.pathItem?.servers) && input.pathItem.servers.length > 0)
        return {source: 'path', servers: input.pathItem.servers};
    if (Array.isArray(input.spec.servers) && input.spec.servers.length > 0)
        return {source: 'root', servers: input.spec.servers};
    return {source: 'default', servers: [{url: '/'}]};
};

const expandServer = (
    definition: ServerDefinition,
    selectedVariables: Record<string, string>,
): {expanded: string; values: Record<string, string>; diagnostics: Diagnostic[]} => {
    const diagnostics: Diagnostic[] = [];
    const values: Record<string, string> = {};
    const variables = definition.variables || {};
    const expanded = String(definition.url || '').replace(/\{([^{}]+)}/g, (placeholder, name: string) => {
        const variable = variables[name];
        const requested = selectedVariables[name];
        const value = requested !== undefined ? requested : variable?.default;
        if (value === undefined) {
            diagnostics.push(
                diagnostic(
                    'OAS_SERVER_VARIABLE_MISSING',
                    `Server variable '${name}' has no selected or default value.`,
                    {source: {pointer: `/servers/url`}},
                ),
            );
            return placeholder;
        }
        values[name] = String(value);
        if (Array.isArray(variable?.enum) && variable.enum.length > 0 && !variable.enum.includes(String(value))) {
            diagnostics.push(
                diagnostic(
                    'OAS_SERVER_VARIABLE_OUTSIDE_ENUM',
                    `Server variable '${name}' value '${value}' is outside its documented enum.`,
                ),
            );
        }
        return String(value);
    });
    return {expanded, values, diagnostics};
};

const resolveRelativeUrl = (
    expanded: string,
    sourceUri: string | undefined,
): {url: string; diagnostic?: Diagnostic} => {
    if (!expanded)
        return {
            url: expanded,
            diagnostic: diagnostic(
                'OAS_SERVER_URL_EMPTY',
                'The selected server URL is empty. Browser fetch will report the resulting error.',
            ),
        };
    // Preserve malformed and non-HTTP absolute-looking values so fetch can
    // produce the real browser/network error instead of turning OpenDoc into a validator.
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(expanded)) return {url: expanded};
    const browserBase = typeof window !== 'undefined' && window.location ? window.location.href : undefined;
    const base = sourceUri || browserBase;
    if (!base)
        return {
            url: expanded,
            diagnostic: diagnostic(
                'OAS_RELATIVE_SERVER_BASE_UNKNOWN',
                `Relative server '${expanded}' has no known document base.`,
            ),
        };
    try {
        return {
            url: new URL(expanded, base).href,
            diagnostic: sourceUri
                ? undefined
                : diagnostic(
                      'OAS_RELATIVE_SERVER_USING_APP_BASE',
                      `Relative server '${expanded}' came from a source without a URI, so it was resolved against the OpenDoc page.`,
                      {severity: 'info'},
                  ),
        };
    } catch {
        return {
            url: expanded,
            diagnostic: diagnostic('OAS_SERVER_URL_INVALID', `Server URL '${expanded}' could not be resolved.`),
        };
    }
};

export const resolveEffectiveServer = (input: ResolveServerInput): ResolvedServer => {
    const chosen = chooseServerList(input);
    const source = chosen.source;
    const selected = input.selectedServer || '';
    // OpenDoc exposes an editable/fallback target even when the document omits
    // servers. Preserve that explicit target instead of replacing it with `/`.
    const servers = source === 'default' && selected ? [{url: selected}] : chosen.servers;
    const candidates = servers.map(definition => ({
        definition,
        expansion: expandServer(definition, input.selectedVariables || {}),
    }));
    const matched = candidates.find(item => item.definition.url === selected || item.expansion.expanded === selected);
    const customRootSelection =
        !matched && source === 'root' && selected
            ? {definition: {url: selected}, expansion: expandServer({url: selected}, {})}
            : null;
    const candidate = matched ||
        customRootSelection ||
        candidates[0] || {definition: {url: '/'}, expansion: expandServer({url: '/'}, {})};
    const loadedSourceUri = input.sourceUri || getSpecSourceUri(input.spec);
    let sourceUri = loadedSourceUri;
    if (input.spec.$self) {
        try {
            sourceUri = loadedSourceUri ? new URL(input.spec.$self, loadedSourceUri).href : input.spec.$self;
        } catch {
            sourceUri = loadedSourceUri;
        }
    }
    const relative = resolveRelativeUrl(candidate.expansion.expanded, sourceUri);
    return {
        source,
        definition: candidate.definition,
        rawUrl: candidate.definition.url,
        expandedUrl: candidate.expansion.expanded,
        url: relative.url,
        variableValues: candidate.expansion.values,
        diagnostics: [...candidate.expansion.diagnostics, ...(relative.diagnostic ? [relative.diagnostic] : [])],
    };
};

export const effectiveServerDefinitions = (
    input: Omit<ResolveServerInput, 'selectedServer'>,
): Array<{
    source: ServerSource;
    definition: ServerDefinition;
    expandedUrl: string;
}> => {
    const {source, servers} = chooseServerList(input);
    return servers.map(definition => ({
        source,
        definition,
        expandedUrl: expandServer(definition, input.selectedVariables || {}).expanded,
    }));
};
