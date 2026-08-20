import type {AuthCredential} from '../../types';
import {getRouteBasePath} from '../routing';

const PENDING_KEY = 'opendoc:oauth:pending';
const RESULT_KEY = 'opendoc:oauth:result';

interface PendingOAuth {
    state: string;
    verifier?: string;
    schemeId: string;
    specKey: string;
    clientId: string;
    tokenUrl?: string;
    redirectUri: string;
    returnUrl: string;
}

export interface OAuthResult {
    schemeId: string;
    specKey: string;
    accessToken: string;
    scopes: string[];
}

const randomValue = (bytes = 32): string => {
    const value = new Uint8Array(bytes);
    crypto.getRandomValues(value);
    return btoa(String.fromCharCode(...value))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

const challenge = async (verifier: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

export const oauthAuthorizationFlow = (scheme: any) => {
    const flows = scheme?.flows || {};
    if (flows.authorizationCode?.authorizationUrl)
        return {kind: 'authorizationCode' as const, ...flows.authorizationCode};
    if (flows.implicit?.authorizationUrl) return {kind: 'implicit' as const, ...flows.implicit};
    return null;
};

export const supportsInteractiveAuthorization = (scheme: any): boolean =>
    !!oauthAuthorizationFlow(scheme) ||
    (scheme?.type === 'openIdConnect' && typeof scheme?.openIdConnectUrl === 'string');

const openIdScopes = (credential: AuthCredential): string[] => {
    const scopes = credential.scopes?.length ? credential.scopes : ['openid'];
    return scopes.includes('openid') ? scopes : ['openid', ...scopes];
};

const openIdDiscoveryFlow = async (scheme: any) => {
    if (!scheme?.openIdConnectUrl) throw new Error('OpenID Connect discovery URL is missing.');
    const response = await fetch(String(scheme.openIdConnectUrl), {
        headers: {Accept: 'application/json'},
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`OpenID Connect discovery returned HTTP ${response.status}.`);
    const discovery = await response.json();
    if (!discovery?.authorization_endpoint)
        throw new Error('OpenID Connect discovery did not provide an authorization endpoint.');
    return {
        kind: 'authorizationCode' as const,
        authorizationUrl: String(discovery.authorization_endpoint),
        tokenUrl: discovery.token_endpoint ? String(discovery.token_endpoint) : undefined,
        scopes: Array.isArray(discovery.scopes_supported)
            ? Object.fromEntries(discovery.scopes_supported.map((scope: string) => [scope, scope]))
            : {openid: 'OpenID Connect'},
    };
};

const resolveInteractiveAuthorizationFlow = async (scheme: any) => {
    const oauthFlow = oauthAuthorizationFlow(scheme);
    if (oauthFlow) return oauthFlow;
    if (scheme?.type === 'openIdConnect') return openIdDiscoveryFlow(scheme);
    return null;
};

export const beginOAuthAuthorization = async (options: {
    schemeId: string;
    specKey: string;
    scheme: any;
    credential: AuthCredential;
}) => {
    const flow = await resolveInteractiveAuthorizationFlow(options.scheme);
    if (!flow) throw new Error('This OAuth or OpenID Connect scheme has no browser authorization flow.');
    if (!options.credential.clientId?.trim()) throw new Error('OAuth client ID is required.');
    const state = randomValue();
    const verifier = flow.kind === 'authorizationCode' ? randomValue(48) : undefined;
    const redirectUri = `${window.location.origin}${getRouteBasePath()}oauth/callback`;
    const scopes =
        options.scheme?.type === 'openIdConnect'
            ? openIdScopes(options.credential)
            : options.credential.scopes?.length
              ? options.credential.scopes
              : Object.keys(flow.scopes || {});
    const pending: PendingOAuth = {
        state,
        verifier,
        schemeId: options.schemeId,
        specKey: options.specKey,
        clientId: options.credential.clientId!,
        tokenUrl: flow.tokenUrl,
        redirectUri,
        returnUrl: window.location.href,
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    const url = new URL(flow.authorizationUrl, window.location.href);
    url.searchParams.set('client_id', options.credential.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scopes.join(' '));
    if (flow.kind === 'authorizationCode') {
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('code_challenge', await challenge(verifier!));
        url.searchParams.set('code_challenge_method', 'S256');
    } else {
        url.searchParams.set('response_type', 'token');
    }
    window.location.assign(url.href);
};

export const handleOAuthCallback = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.location.pathname.endsWith('/oauth/callback')) return false;
    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    if (!pendingRaw) return false;
    const pending = JSON.parse(pendingRaw) as PendingOAuth;
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const state = query.get('state') || fragment.get('state');
    if (!state || state !== pending.state) throw new Error('OAuth state validation failed.');
    let accessToken = fragment.get('access_token') || '';
    let scopes = (fragment.get('scope') || '').split(/\s+/).filter(Boolean);
    const code = query.get('code');
    if (!accessToken && code) {
        if (!pending.tokenUrl || !pending.verifier)
            throw new Error('OAuth token endpoint or PKCE verifier is missing.');
        const response = await fetch(pending.tokenUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: pending.clientId,
                code,
                redirect_uri: pending.redirectUri,
                code_verifier: pending.verifier,
            }),
        });
        if (!response.ok) throw new Error(`OAuth token exchange returned HTTP ${response.status}.`);
        const body = await response.json();
        accessToken = String(body.access_token || '');
        scopes = String(body.scope || '')
            .split(/\s+/)
            .filter(Boolean);
    }
    if (!accessToken) throw new Error('OAuth provider did not return an access token.');
    const result: OAuthResult = {
        schemeId: pending.schemeId,
        specKey: pending.specKey,
        accessToken,
        scopes,
    };
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
    sessionStorage.removeItem(PENDING_KEY);
    window.history.replaceState(null, '', pending.returnUrl);
    return true;
};

export const recoverFromOAuthCallbackError = () => {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return;
    try {
        const pending = JSON.parse(raw) as PendingOAuth;
        window.history.replaceState(null, '', pending.returnUrl);
    } catch {}
};

export const consumeOAuthResult = (): OAuthResult | null => {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESULT_KEY);
    try {
        return JSON.parse(raw) as OAuthResult;
    } catch {
        return null;
    }
};
