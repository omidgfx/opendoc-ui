import {useEffect, useMemo, useRef, useState} from 'react';
import type {ActiveAuth, AuthCredential, OpenApiSpec, Operation} from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import {Tip} from '../common/Tooltip';
import {useModalTransition} from '../../hooks/useModalTransition';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import {beginOAuthAuthorization, oauthAuthorizationFlow} from '../../utils/runner/oauthFlow';
import {
    createEmptyAuth,
    getAuthSchemeLabel,
    getSecurityRequirementOptions,
    normalizeActiveAuth,
} from '../../utils/runner/auth';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    spec: OpenApiSpec | null;
    specKey: string;
    operation?: Operation | null;
    activeAuth: ActiveAuth;
    onSave: (auth: ActiveAuth) => void;
}

const legacyOptions = [
    {id: 'none', label: 'No Authentication', schemeIds: []},
    {id: 'legacy:bearer', label: 'Bearer Token', schemeIds: ['legacy:bearer']},
    {id: 'legacy:basic', label: 'Basic Authentication', schemeIds: ['legacy:basic']},
    {id: 'legacy:apikey', label: 'API Key', schemeIds: ['legacy:apikey']},
    {id: 'legacy:cookie', label: 'Session Cookie', schemeIds: ['legacy:cookie']},
];
const fieldClass =
    'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--primary)]';
export default function AuthModal({isOpen, onClose, spec, specKey, operation, activeAuth, onSave}: AuthModalProps) {
    const options = useMemo(
        () => (spec?.components?.securitySchemes ? getSecurityRequirementOptions(spec, operation) : legacyOptions),
        [spec, operation],
    );
    const [selectedRequirement, setSelectedRequirement] = useState('none');
    const [credentials, setCredentials] = useState<Record<string, AuthCredential>>({});
    const [oauthError, setOauthError] = useState<string | null>(null);
    const credentialsRef = useRef<Record<string, AuthCredential>>({});
    const {shouldRender, requestClose, backdropClassName} = useModalTransition(isOpen, onClose);
    useModalShortcuts({isOpen, onClose: requestClose, onSubmit: () => save()});
    const currentOption = options.find(option => option.id === selectedRequirement) || options[0] || legacyOptions[0];
    const schemeIds = currentOption.schemeIds;
    const schemes = spec?.components?.securitySchemes || {};
    useEffect(() => {
        if (!isOpen) return;
        const normalized = normalizeActiveAuth(activeAuth);
        const selected =
            normalized.selectedSchemes.length > 0
                ? normalized.selectedSchemes
                : normalized.activeScheme !== 'none'
                  ? [normalized.activeScheme]
                  : [];
        const requirement =
            options.find(
                option =>
                    option.schemeIds.length === selected.length && option.schemeIds.every(id => selected.includes(id)),
            ) ||
            options.find(option => option.id === `requirement:${normalized.requirementIndex ?? -1}`) ||
            options[0];
        setSelectedRequirement(requirement?.id || 'none');
        setOauthError(null);
        credentialsRef.current = {...normalized.schemeValues};
        setCredentials(credentialsRef.current);
    }, [isOpen, activeAuth, options]);
    const updateCredential = (id: string, patch: Partial<AuthCredential>) => {
        setCredentials(current => {
            const base = current[id] || credentialFor(id);
            const next = {...current, [id]: {...base, ...patch, schemeId: id}};
            credentialsRef.current = next;
            return next;
        });
    };
    const credentialTypeLabel = (type: string): string => {
        switch (type) {
            case 'bearer':
                return 'Bearer token';
            case 'basic':
                return 'Basic auth';
            case 'apiKey':
                return 'API key';
            case 'cookie':
                return 'Cookie';
            case 'oauth2':
                return 'OAuth2';
            case 'openIdConnect':
                return 'OpenID Connect';
            case 'mutualTLS':
                return 'Client certificate';
            default:
                return 'Unknown';
        }
    };
    function credentialFor(id: string): AuthCredential {
        const scheme: any = schemes[id];
        const existing = credentialsRef.current[id] || credentials[id];
        if (existing) return existing;
        if (id === 'legacy:bearer') return {schemeId: id, type: 'bearer', value: activeAuth.bearerToken};
        if (id === 'legacy:basic')
            return {
                schemeId: id,
                type: 'basic',
                username: activeAuth.basicUsername,
                password: activeAuth.basicPassword,
            };
        if (id === 'legacy:apikey')
            return {
                schemeId: id,
                type: 'apiKey',
                name: activeAuth.apiKeyName,
                in: activeAuth.apiKeyIn,
                value: activeAuth.apiKeyValue,
            };
        if (id === 'legacy:cookie')
            return {
                schemeId: id,
                type: 'cookie',
                name: activeAuth.apiKeyName,
                value: activeAuth.cookieValues[activeAuth.apiKeyName] || '',
            };
        if (scheme?.type === 'apiKey')
            return {
                schemeId: id,
                type: 'apiKey',
                name: scheme.name,
                in: scheme.in,
                value: '',
            };
        if (scheme?.type === 'http' && scheme.scheme === 'basic') return {schemeId: id, type: 'basic'};
        if (scheme?.type === 'http' && scheme.scheme === 'bearer') return {schemeId: id, type: 'bearer'};
        if (scheme?.type === 'oauth2') return {schemeId: id, type: 'oauth2'};
        if (scheme?.type === 'openIdConnect') return {schemeId: id, type: 'openIdConnect'};
        if (scheme?.type === 'mutualTLS') return {schemeId: id, type: 'mutualTLS'};
        return {schemeId: id, type: 'unknown'};
    }
    const save = () => {
        const selected = schemeIds;
        const first = selected[0] ? credentialFor(selected[0]) : null;
        const legacyType = first?.type;
        const apiKey = first?.type === 'apiKey' ? first : null;
        const next: ActiveAuth = {
            activeScheme: selected[0] || 'none',
            selectedSchemes: selected,
            schemeValues: Object.fromEntries(selected.map(id => [id, credentialFor(id)])),
            requirementIndex: selectedRequirement.startsWith('requirement:')
                ? Number(selectedRequirement.slice('requirement:'.length))
                : undefined,
            cookieValues: Object.fromEntries(
                selected
                    .filter(id => credentialFor(id).in === 'cookie')
                    .map(id => [credentialFor(id).name || 'cookie', credentialFor(id).value || '']),
            ),
            bearerToken: ['bearer', 'oauth2', 'openIdConnect'].includes(legacyType || '')
                ? first?.value || ''
                : activeAuth.bearerToken,
            apiKeyName: apiKey?.name || activeAuth.apiKeyName || 'X-API-KEY',
            apiKeyValue: apiKey?.value || '',
            apiKeyIn: apiKey?.in === 'cookie' ? 'cookie' : apiKey?.in === 'query' ? 'query' : 'header',
            basicUsername: first?.type === 'basic' ? first.username || '' : activeAuth.basicUsername,
            basicPassword: first?.type === 'basic' ? first.password || '' : activeAuth.basicPassword,
        };
        onSave(next);
        requestClose();
    };
    if (!shouldRender) return null;
    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[1500] bg-black/45 backdrop-blur-[2px]`}
            style={{backgroundColor: 'rgba(0,0,0,.45)'}}
            onMouseDown={event => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <div className="modal-surface flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xl">
                <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] sm:flex">
                            <i className="ph-fill ph-lock-key text-[18px]" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-[var(--text-heading)]">
                                Configure Authentication
                            </h3>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                                Security scheme IDs and composed requirements are preserved.
                            </p>
                        </div>
                    </div>
                    <Tip content="Close">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            <i className="ph ph-x text-lg" />
                        </button>
                    </Tip>
                </header>

                <div className="modal-scroll-region min-h-0 space-y-4 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 scrollbar-thin">
                    <div>
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Security requirement
                        </label>
                        <CustomDropdown
                            value={selectedRequirement}
                            onChange={setSelectedRequirement}
                            options={options.map(option => ({value: option.id, label: option.label}))}
                            icon="ph ph-shield"
                            className="w-full"
                        />
                        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
                            OpenAPI alternatives are shown as separate choices. A requirement containing several schemes
                            sends all of them together.
                        </p>
                    </div>

                    {oauthError && (
                        <div
                            role="alert"
                            className="rounded-lg border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 p-2 text-[10px] text-[var(--method-delete)]"
                        >
                            {oauthError}
                        </div>
                    )}

                    {schemeIds.length === 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-xs leading-relaxed text-[var(--text-muted)]">
                            No credentials will be added to runner requests.
                        </div>
                    )}
                    {schemeIds.map(id => {
                        const scheme: any = schemes[id];
                        const credential = credentialFor(id);
                        const isCookie =
                            credential.in === 'cookie' ||
                            (scheme?.type === 'apiKey' && scheme?.in === 'cookie') ||
                            credential.type === 'cookie';
                        return (
                            <div
                                key={id}
                                className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="text-xs font-bold text-[var(--text-heading)]">
                                            {scheme ? getAuthSchemeLabel(id, scheme) : credential.type}
                                        </div>
                                        <div className="mt-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                                            scheme id: {id}
                                        </div>
                                    </div>
                                    <span className="rounded bg-[var(--primary)]/10 px-2 py-1 text-[9px] font-bold uppercase text-[var(--primary)]">
                                        {credentialTypeLabel(credential.type)}
                                    </span>
                                </div>
                                {(credential.type === 'apiKey' || credential.type === 'cookie') && (
                                    <>
                                        <label className="block space-y-1">
                                            <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                {isCookie ? 'Cookie name' : 'Key name'}
                                            </span>
                                            <input
                                                className={fieldClass}
                                                value={credential.name || scheme?.name || ''}
                                                onChange={event =>
                                                    updateCredential(id, {
                                                        name: event.target.value,
                                                        in: credential.in || scheme?.in,
                                                    })
                                                }
                                                readOnly={Boolean(scheme?.name)}
                                            />
                                        </label>
                                        {!isCookie && (
                                            <label className="block space-y-1">
                                                <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                    Key value
                                                </span>
                                                <input
                                                    type="password"
                                                    className={fieldClass}
                                                    value={credential.value || ''}
                                                    onChange={event =>
                                                        updateCredential(id, {value: event.target.value})
                                                    }
                                                    placeholder="Secret value"
                                                />
                                            </label>
                                        )}
                                        {isCookie && (
                                            <p className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                                This scheme uses cookies managed by the browser. Available cookies are
                                                included automatically with Runner requests.
                                            </p>
                                        )}
                                    </>
                                )}
                                {(credential.type === 'bearer' ||
                                    credential.type === 'oauth2' ||
                                    credential.type === 'openIdConnect') && (
                                    <div className="space-y-3">
                                        <label className="block space-y-1">
                                            <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                Access token
                                            </span>
                                            <input
                                                type="password"
                                                className={fieldClass}
                                                value={credential.value || ''}
                                                onChange={event => updateCredential(id, {value: event.target.value})}
                                                placeholder="Bearer access token"
                                            />
                                        </label>
                                        {credential.type === 'oauth2' && oauthAuthorizationFlow(scheme) && (
                                            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                                                <label className="block space-y-1">
                                                    <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                        Public OAuth client ID
                                                    </span>
                                                    <input
                                                        className={fieldClass}
                                                        value={credential.clientId || ''}
                                                        onChange={event =>
                                                            updateCredential(id, {clientId: event.target.value})
                                                        }
                                                        placeholder="Client ID registered for this documentation origin"
                                                    />
                                                </label>
                                                <label className="block space-y-1">
                                                    <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                        Scopes
                                                    </span>
                                                    <input
                                                        className={fieldClass}
                                                        value={(credential.scopes || []).join(' ')}
                                                        onChange={event =>
                                                            updateCredential(id, {
                                                                scopes: event.target.value.split(/\s+/).filter(Boolean),
                                                            })
                                                        }
                                                        placeholder={Object.keys(
                                                            oauthAuthorizationFlow(scheme)?.scopes || {},
                                                        ).join(' ')}
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setOauthError(null);
                                                        void beginOAuthAuthorization({
                                                            schemeId: id,
                                                            specKey,
                                                            scheme,
                                                            credential: credentialFor(id),
                                                        }).catch(error =>
                                                            setOauthError(
                                                                error instanceof Error
                                                                    ? error.message
                                                                    : 'OAuth authorization could not start.',
                                                            ),
                                                        );
                                                    }}
                                                    className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer"
                                                >
                                                    <i className="ph ph-browser me-1.5" /> Authorize with OAuth + PKCE
                                                </button>
                                                <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
                                                    The provider must allow this origin and token-endpoint CORS. No
                                                    client secret is stored or sent.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {credential.type === 'basic' && (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="space-y-1">
                                            <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                Username
                                            </span>
                                            <input
                                                className={fieldClass}
                                                value={credential.username || ''}
                                                onChange={event => updateCredential(id, {username: event.target.value})}
                                            />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="block text-[10px] font-semibold text-[var(--text-muted)]">
                                                Password
                                            </span>
                                            <input
                                                type="password"
                                                className={fieldClass}
                                                value={credential.password || ''}
                                                onChange={event => updateCredential(id, {password: event.target.value})}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--background)] px-5 py-3">
                    <button
                        type="button"
                        disabled={activeAuth.activeScheme === 'none' && activeAuth.selectedSchemes.length === 0}
                        onClick={() => {
                            onSave(createEmptyAuth());
                            requestClose();
                        }}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                    >
                        <i className="ph ph-sign-out me-1.5" />
                        Log out
                    </button>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)] cursor-pointer"
                        >
                            Apply
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
