import type { ActiveAuth, AuthCredential, OpenApiSpec, Operation, SecurityScheme } from '../types';
import type { SerializedPair } from './openapi/serialization';
export interface SecurityRequirementOption {
    id: string;
    label: string;
    schemeIds: string[];
}
export interface RequestAuthParts {
    headers: Record<string, string>;
    query: SerializedPair[];
    cookies: SerializedPair[];
    credentials: RequestCredentials;
    warnings: string[];
}
const emptyAuth = (): ActiveAuth => ({
    activeScheme: 'none',
    selectedSchemes: [],
    schemeValues: {},
    cookieValues: {},
    bearerToken: '',
    apiKeyName: 'X-API-KEY',
    apiKeyValue: '',
    apiKeyIn: 'header',
    basicUsername: '',
    basicPassword: '',
});
export const normalizeActiveAuth = (value: Partial<ActiveAuth> | null | undefined): ActiveAuth => ({
    ...emptyAuth(),
    ...(value || {}),
    activeScheme: typeof value?.activeScheme === 'string' && value.activeScheme ? value.activeScheme : 'none',
    selectedSchemes: Array.isArray(value?.selectedSchemes) ? value!.selectedSchemes.filter(item => typeof item === 'string') : [],
    schemeValues: value?.schemeValues && typeof value.schemeValues === 'object' ? value.schemeValues : {},
    cookieValues: value?.cookieValues && typeof value.cookieValues === 'object' ? value.cookieValues : {},
    apiKeyIn: value?.apiKeyIn === 'query' || value?.apiKeyIn === 'cookie' ? value.apiKeyIn : 'header',
});
const operationSecurity = (spec: OpenApiSpec | null, operation?: Operation | null): Array<Record<string, string[]>> | undefined => {
    if (operation && operation.security !== undefined)
        return operation.security;
    return spec?.security;
};
export const getSecurityRequirementOptions = (spec: OpenApiSpec | null, operation?: Operation | null): SecurityRequirementOption[] => {
    const schemes = spec?.components?.securitySchemes || {};
    const requirements = operationSecurity(spec, operation);
    if (requirements && requirements.length === 0)
        return [{
                id: 'none',
                label: 'No authentication (public operation)',
                schemeIds: []
            }];
    if (!requirements || requirements.length === 0) {
        const ids = Object.keys(schemes);
        return ids.length > 0
            ? [{ id: 'none', label: 'No authentication (manual)', schemeIds: [] }, ...ids.map(id => ({
                    id: `scheme:${id}`,
                    label: getAuthSchemeLabel(id, schemes[id]),
                    schemeIds: [id]
                }))]
            : [{ id: 'none', label: 'No Authentication', schemeIds: [] }];
    }
    return requirements.map((requirement, index) => {
        const ids = Object.keys(requirement || {});
        return ids.length === 0
            ? { id: `requirement:${index}`, label: 'No authentication (public alternative)', schemeIds: [] }
            : {
                id: `requirement:${index}`,
                label: ids.map(id => getAuthSchemeLabel(id, schemes[id])).join(' + '),
                schemeIds: ids
            };
    });
};
export const getAuthSchemeLabel = (id: string, scheme: SecurityScheme | any): string => {
    if (!scheme)
        return id;
    if (scheme.type === 'apiKey')
        return `${id} · API key${scheme.in ? ` in ${scheme.in}` : ''}`;
    if (scheme.type === 'http')
        return `${id} · ${scheme.scheme || 'HTTP'}`;
    if (scheme.type === 'oauth2')
        return `${id} · OAuth2`;
    if (scheme.type === 'openIdConnect')
        return `${id} · OpenID Connect`;
    return id;
};
const selectedSchemeIds = (auth: ActiveAuth, spec: OpenApiSpec | null): string[] => {
    const normalized = normalizeActiveAuth(auth);
    if (normalized.selectedSchemes.length > 0)
        return normalized.selectedSchemes;
    if (normalized.activeScheme !== 'none' && spec?.components?.securitySchemes?.[normalized.activeScheme])
        return [normalized.activeScheme];
    return normalized.activeScheme === 'none' ? [] : [normalized.activeScheme];
};
const credentialFor = (auth: ActiveAuth, id: string, scheme: any): AuthCredential => {
    const explicit = normalizeActiveAuth(auth).schemeValues[id];
    if (explicit)
        return explicit;
    const legacyType = id === 'bearer' || id === 'legacy:bearer' ? 'bearer' : id === 'basic' || id === 'legacy:basic' ? 'basic' : id === 'apikey' || id === 'legacy:apikey' ? 'apiKey' : id === 'cookie' || id === 'legacy:cookie' ? 'cookie' : '';
    const type = legacyType || (scheme?.type === 'apiKey' ? 'apiKey' : scheme?.type === 'oauth2' ? 'oauth2' : scheme?.type === 'openIdConnect' ? 'openIdConnect' : scheme?.scheme === 'basic' ? 'basic' : scheme?.scheme === 'bearer' ? 'bearer' : scheme?.type || 'unknown');
    if (type === 'apiKey')
        return {
            schemeId: id,
            type: 'apiKey',
            name: scheme?.name || auth.apiKeyName,
            in: scheme?.in || auth.apiKeyIn,
            value: auth.apiKeyValue
        };
    if (type === 'basic')
        return {
            schemeId: id,
            type: 'basic',
            username: auth.basicUsername,
            password: auth.basicPassword
        };
    if (type === 'bearer' || type === 'oauth2' || type === 'openIdConnect')
        return {
            schemeId: id,
            type,
            value: auth.bearerToken
        };
    if (type === 'cookie')
        return {
            schemeId: id,
            type: 'cookie',
            name: auth.apiKeyName,
            value: auth.cookieValues[auth.apiKeyName] || ''
        };
    return { schemeId: id, type: 'unknown' };
};
const basicEncode = (username: string, password: string): string => {
    const raw = `${username}:${password}`;
    try {
        return btoa(raw);
    }
    catch {
        try {
            return btoa(unescape(encodeURIComponent(raw)));
        }
        catch {
            return raw;
        }
    }
};
export const applyAuthToRequest = (spec: OpenApiSpec | null, auth: ActiveAuth, request: {
    headers?: Record<string, string>;
    query?: SerializedPair[];
    cookies?: SerializedPair[];
}, operation?: Operation | null): RequestAuthParts => {
    const headers = { ...(request.headers || {}) };
    const query = [...(request.query || [])];
    const cookies = [...(request.cookies || [])];
    const warnings: string[] = [];
    let credentials: RequestCredentials = 'same-origin';
    const schemes = spec?.components?.securitySchemes || {};
    const ids = selectedSchemeIds(auth, spec);
    ids.forEach(id => {
        const scheme: any = schemes[id] || {};
        const credential = credentialFor(auth, id, scheme);
        if (scheme.type === 'apiKey' || credential.type === 'apiKey') {
            const location = scheme.in || credential.in || 'header';
            const name = scheme.name || credential.name || auth.apiKeyName || 'X-API-KEY';
            const value = credential.value || '';
            if (!value && location !== 'cookie')
                warnings.push(`No value is configured for API-key scheme '${id}'.`);
            if (location === 'query' && value)
                query.push({ name, value, allowReserved: false });
            else if (location === 'header' && value)
                headers[name] = value;
            else if (location === 'cookie') {
                credentials = 'include';
                if (value)
                    cookies.push({ name, value });
                warnings.push(`Browser fetch cannot set a Cookie header for '${id}'; credentials: include only sends an existing same-site cookie. Use the gateway/local agent to inject a value.`);
            }
            return;
        }
        const schemeName = String(scheme.scheme || credential.scheme || credential.type || '').toLowerCase();
        if (scheme.type === 'http' && schemeName === 'basic' || credential.type === 'basic') {
            if (credential.username)
                headers.Authorization = `Basic ${basicEncode(credential.username, credential.password || '')}`;
            else
                warnings.push(`No username is configured for HTTP basic scheme '${id}'.`);
            return;
        }
        if (scheme.type === 'http' && schemeName === 'bearer' || ['bearer', 'oauth2', 'openIdConnect'].includes(credential.type) || ['oauth2', 'openIdConnect'].includes(scheme.type)) {
            if (credential.value)
                headers.Authorization = `Bearer ${credential.value}`;
            else
                warnings.push(`No access token is configured for scheme '${id}'. OAuth authorization-code/PKCE is not performed in the browser runner.`);
            return;
        }
        if (scheme.type === 'apiKey' && scheme.in === 'cookie')
            credentials = 'include';
    });
    if (cookies.length > 0)
        credentials = 'include';
    if (operationSecurity(spec, operation)?.length && ids.length === 0 && operationSecurity(spec, operation)?.some(item => Object.keys(item).length > 0)) {
        warnings.push('This operation declares authentication, but no security requirement is selected.');
    }
    return { headers, query, cookies, credentials, warnings };
};
export const authDisplayName = (auth: ActiveAuth, spec: OpenApiSpec | null): string => {
    const ids = selectedSchemeIds(auth, spec);
    if (ids.length === 0)
        return 'none';
    return ids.join(' + ');
};
