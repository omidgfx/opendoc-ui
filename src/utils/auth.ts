import type {ActiveAuth, AuthCredential, OpenApiSpec, Operation, SecurityScheme} from '../types';
import type {SerializedPair} from './openapi/serialization';

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
    appliedSchemeIds: string[];
}

export const createEmptyAuth = (): ActiveAuth => ({
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
    ...createEmptyAuth(),
    ...(value || {}),
    activeScheme: typeof value?.activeScheme === 'string' && value.activeScheme ? value.activeScheme : 'none',
    selectedSchemes: Array.isArray(value?.selectedSchemes) ? value!.selectedSchemes.filter(item => typeof item === 'string') : [],
    schemeValues: value?.schemeValues && typeof value.schemeValues === 'object' ? value.schemeValues : {},
    cookieValues: value?.cookieValues && typeof value.cookieValues === 'object' ? value.cookieValues : {},
    apiKeyIn: value?.apiKeyIn === 'query' || value?.apiKeyIn === 'cookie' ? value.apiKeyIn : 'header',
});

/**
 * OpenAPI security inherits from the root to an operation. Path Item Objects
 * do not define a standard security field.
 *
 * `undefined` means the document declares no requirement and OpenDoc may use
 * an explicitly selected manual credential. `[]` explicitly disables auth.
 */
export const resolveEffectiveSecurity = (
    spec: OpenApiSpec | null,
    operation?: Operation | null,
): Array<Record<string, string[]>> | undefined => {
    if (operation && operation.security !== undefined)
        return operation.security;
    return spec?.security;
};

export const isOperationProtected = (spec: OpenApiSpec | null, operation?: Operation | null): boolean => {
    const requirements = resolveEffectiveSecurity(spec, operation);
    if (!requirements || requirements.length === 0)
        return false;
    // An empty requirement object is an anonymous alternative.
    return !requirements.some(requirement => Object.keys(requirement || {}).length === 0);
};

export const getSecurityRequirementOptions = (spec: OpenApiSpec | null, operation?: Operation | null): SecurityRequirementOption[] => {
    const schemes = spec?.components?.securitySchemes || {};
    const requirements = resolveEffectiveSecurity(spec, operation);
    if (requirements && requirements.length === 0) {
        return [{
            id: 'none',
            label: 'No authentication (public operation)',
            schemeIds: []
        }];
    }
    if (!requirements) {
        const ids = Object.keys(schemes);
        return ids.length > 0
            ? [{id: 'none', label: 'No authentication (manual)', schemeIds: []}, ...ids.map(id => ({
                id: `scheme:${id}`,
                label: getAuthSchemeLabel(id, schemes[id]),
                schemeIds: [id]
            }))]
            : [{id: 'none', label: 'No Authentication', schemeIds: []}];
    }
    return requirements.map((requirement, index) => {
        const ids = Object.keys(requirement || {});
        return ids.length === 0
            ? {id: `requirement:${index}`, label: 'No authentication (public alternative)', schemeIds: []}
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
    if (scheme.type === 'mutualTLS')
        return `${id} · Mutual TLS`;
    return id;
};

const configuredSchemeIds = (auth: ActiveAuth): string[] => {
    const normalized = normalizeActiveAuth(auth);
    if (normalized.selectedSchemes.length > 0)
        return Array.from(new Set(normalized.selectedSchemes));
    return normalized.activeScheme === 'none' ? [] : [normalized.activeScheme];
};

const sameIdSet = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length)
        return false;
    const rightSet = new Set(right);
    return left.every(id => rightSet.has(id));
};

interface SelectedSecurity {
    ids: string[];
    warnings: string[];
}

/** Select exactly one effective OR alternative. Extra configured schemes are never attached. */
export const resolveSelectedSecurity = (
    spec: OpenApiSpec | null,
    auth: ActiveAuth,
    operation?: Operation | null,
): SelectedSecurity => {
    const warnings: string[] = [];
    const configured = configuredSchemeIds(auth);
    const requirements = resolveEffectiveSecurity(spec, operation);
    const schemes = spec?.components?.securitySchemes || {};

    if (requirements && requirements.length === 0)
        return {ids: [], warnings};

    if (requirements === undefined) {
        const ids = configured.filter(id => {
            const declared = Boolean(schemes[id]);
            const legacy = id.startsWith('legacy:');
            if (!declared && !legacy)
                warnings.push(`Configured security scheme '${id}' does not exist in this specification and was not applied.`);
            return declared || legacy;
        });
        return {ids, warnings};
    }

    if (configured.length === 0) {
        if (requirements.some(requirement => Object.keys(requirement || {}).length === 0))
            return {ids: [], warnings};
        warnings.push('Authentication is required, but no matching security method is selected.');
        return {ids: [], warnings};
    }

    let selectedRequirement: Record<string, string[]> | undefined;
    const preferredIndex = normalizeActiveAuth(auth).requirementIndex;
    if (preferredIndex !== undefined && requirements[preferredIndex]) {
        const candidate = requirements[preferredIndex];
        if (sameIdSet(Object.keys(candidate || {}), configured))
            selectedRequirement = candidate;
    }
    selectedRequirement ||= requirements.find(requirement => sameIdSet(Object.keys(requirement || {}), configured));

    if (!selectedRequirement) {
        warnings.push(`Configured schemes (${configured.join(' + ')}) do not match any effective security alternative for this operation and were not applied.`);
        return {ids: [], warnings};
    }

    const ids = Object.keys(selectedRequirement).filter(id => {
        if (!schemes[id]) {
            warnings.push(`Effective security requirement references missing scheme '${id}'; it was not applied.`);
            return false;
        }
        return true;
    });
    return {ids, warnings};
};

const credentialFor = (auth: ActiveAuth, id: string, scheme: any): AuthCredential => {
    const explicit = normalizeActiveAuth(auth).schemeValues[id];
    if (explicit)
        return explicit;
    const legacyType = id === 'bearer' || id === 'legacy:bearer' ? 'bearer'
        : id === 'basic' || id === 'legacy:basic' ? 'basic'
            : id === 'apikey' || id === 'legacy:apikey' ? 'apiKey'
                : id === 'cookie' || id === 'legacy:cookie' ? 'cookie'
                    : '';
    const type = legacyType || (scheme?.type === 'apiKey' ? 'apiKey'
        : scheme?.type === 'oauth2' ? 'oauth2'
            : scheme?.type === 'openIdConnect' ? 'openIdConnect'
                : scheme?.scheme === 'basic' ? 'basic'
                    : scheme?.scheme === 'bearer' ? 'bearer'
                        : scheme?.type || 'unknown');
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
    return {schemeId: id, type: 'unknown'};
};

const basicEncode = (username: string, password: string): string => {
    const raw = `${username}:${password}`;
    try {
        const bytes = new TextEncoder().encode(raw);
        let binary = '';
        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary);
    } catch {
        return btoa(raw);
    }
};

const findHeaderName = (headers: Record<string, string>, requestedName: string): string | undefined => Object.keys(headers)
    .find(name => name.toLowerCase() === requestedName.toLowerCase());

const setAuthHeader = (
    headers: Record<string, string>,
    name: string,
    value: string,
    schemeId: string,
    warnings: string[],
    owners: Record<string, string>,
) => {
    const existingName = findHeaderName(headers, name);
    const ownerKey = name.toLowerCase();
    if (existingName && headers[existingName] !== value) {
        if (owners[ownerKey])
            warnings.push(`Security schemes '${owners[ownerKey]}' and '${schemeId}' both target '${existingName}'. Browser HTTP can carry only one value here; '${schemeId}' is used.`);
        else
            warnings.push(`Security scheme '${schemeId}' replaced the explicitly configured '${existingName}' header.`);
        delete headers[existingName];
    }
    headers[name] = value;
    owners[ownerKey] = schemeId;
};

export const applyAuthToRequest = (spec: OpenApiSpec | null, auth: ActiveAuth, request: {
    headers?: Record<string, string>;
    query?: SerializedPair[];
    cookies?: SerializedPair[];
}, operation?: Operation | null): RequestAuthParts => {
    const headers = {...(request.headers || {})};
    const query = [...(request.query || [])];
    const cookies = [...(request.cookies || [])];
    const selected = resolveSelectedSecurity(spec, auth, operation);
    const warnings = [...selected.warnings];
    const authHeaderOwners: Record<string, string> = {};
    let credentials: RequestCredentials = 'same-origin';
    const schemes = spec?.components?.securitySchemes || {};

    selected.ids.forEach(id => {
        const scheme: any = schemes[id] || {};
        const credential = credentialFor(auth, id, scheme);
        if (scheme.type === 'mutualTLS') {
            warnings.push(`Mutual TLS scheme '${id}' is controlled by the browser/operating system and cannot be configured by OpenDoc.`);
            return;
        }
        if (scheme.type === 'apiKey' || credential.type === 'apiKey') {
            const location = scheme.in || credential.in || 'header';
            const name = scheme.name || credential.name || auth.apiKeyName || 'X-API-KEY';
            const value = credential.value || '';
            if (!value && location !== 'cookie')
                warnings.push(`API-key scheme '${id}' has no value.`);
            if (location === 'query' && value)
                query.push({name, value, allowReserved: false});
            else if (location === 'header' && value)
                setAuthHeader(headers, name, value, id, warnings, authHeaderOwners);
            else if (location === 'cookie') {
                credentials = 'include';
                if (value)
                    cookies.push({name, value});
                warnings.push(`Browser fetch cannot set a Cookie header for '${id}'. The configured manual value is not transmitted; credentials: include can only send cookies already accepted by the browser.`);
            }
            return;
        }
        const schemeName = String(scheme.scheme || credential.scheme || credential.type || '').toLowerCase();
        if ((scheme.type === 'http' && schemeName === 'basic') || credential.type === 'basic') {
            if (credential.username)
                setAuthHeader(headers, 'Authorization', `Basic ${basicEncode(credential.username, credential.password || '')}`, id, warnings, authHeaderOwners);
            else
                warnings.push(`HTTP basic scheme '${id}' has no username.`);
            return;
        }
        if ((scheme.type === 'http' && schemeName === 'bearer')
            || ['bearer', 'oauth2', 'openIdConnect'].includes(credential.type)
            || ['oauth2', 'openIdConnect'].includes(scheme.type)) {
            if (credential.value)
                setAuthHeader(headers, 'Authorization', `Bearer ${credential.value}`, id, warnings, authHeaderOwners);
            else
                warnings.push(`Security scheme '${id}' has no access token.`);
            return;
        }
        warnings.push(`Security scheme '${id}' has unsupported type '${scheme.type || credential.type}'.`);
    });

    if (cookies.length > 0)
        credentials = 'include';
    return {headers, query, cookies, credentials, warnings, appliedSchemeIds: selected.ids};
};

export const isOperationAuthenticated = (
    spec: OpenApiSpec | null,
    auth: ActiveAuth,
    operation?: Operation | null,
): boolean => {
    if (!isOperationProtected(spec, operation))
        return false;
    const selected = resolveSelectedSecurity(spec, auth, operation);
    if (selected.ids.length === 0)
        return false;
    const schemes = spec?.components?.securitySchemes || {};
    return selected.ids.every(id => {
        const scheme: any = schemes[id] || {};
        const credential = credentialFor(auth, id, scheme);
        if (scheme.type === 'apiKey' || credential.type === 'apiKey' || credential.type === 'cookie')
            return Boolean(credential.value);
        const schemeName = String(scheme.scheme || credential.scheme || credential.type || '').toLowerCase();
        if ((scheme.type === 'http' && schemeName === 'basic') || credential.type === 'basic')
            return Boolean(credential.username);
        if ((scheme.type === 'http' && schemeName === 'bearer')
            || ['bearer', 'oauth2', 'openIdConnect'].includes(credential.type)
            || ['oauth2', 'openIdConnect'].includes(scheme.type))
            return Boolean(credential.value);
        return false;
    });
};

export const authDisplayName = (auth: ActiveAuth, spec: OpenApiSpec | null, operation?: Operation | null): string => {
    const selected = resolveSelectedSecurity(spec, auth, operation);
    return selected.ids.length === 0 ? 'none' : selected.ids.join(' + ');
};
