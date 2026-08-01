import { useEffect, useState } from 'react';
import type { ActiveAuth, OpenApiSpec } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import { Tip } from '../common/Tooltip';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    spec: OpenApiSpec | null;
    activeAuth: ActiveAuth;
    onSave: (auth: ActiveAuth) => void;
}

export default function AuthModal({ isOpen, onClose, spec, activeAuth, onSave }: AuthModalProps) {
    const [authScheme, setAuthScheme] = useState(activeAuth.activeScheme);
    const [bearerToken, setBearerToken] = useState(activeAuth.bearerToken);
    const [apiKeyName, setApiKeyName] = useState(activeAuth.apiKeyName);
    const [apiKeyValue, setApiKeyValue] = useState(activeAuth.apiKeyValue);
    const [apiKeyIn, setApiKeyIn] = useState<'header' | 'query'>(activeAuth.apiKeyIn);
    const [basicUser, setBasicUser] = useState(activeAuth.basicUsername);
    const [basicPass, setBasicPass] = useState(activeAuth.basicPassword);

    useEffect(() => {
        if (isOpen) {
            setAuthScheme(activeAuth.activeScheme);
            setBearerToken(activeAuth.bearerToken);
            setApiKeyName(activeAuth.apiKeyName);
            setApiKeyValue(activeAuth.apiKeyValue);
            setApiKeyIn(activeAuth.apiKeyIn);
            setBasicUser(activeAuth.basicUsername);
            setBasicPass(activeAuth.basicPassword);
        }
    }, [isOpen, activeAuth]);

    useEffect(() => {
        if (!isOpen) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [isOpen, onClose]);

    const getSchemes = () => {
        const defaults = [
            { id: 'none', name: 'No Authentication' },
            { id: 'cookie', name: 'Cookie Session (access_token)' },
            { id: 'bearer', name: 'Bearer Token (Header Authorization)' },
            { id: 'basic', name: 'Basic Authentication' },
            { id: 'apikey', name: 'Query/Header API Key' },
        ];
        if (!spec?.components?.securitySchemes) return defaults;
        const out: Array<{ id: string; name: string; apiKeyName?: string; apiKeyIn?: 'header' | 'query' }> = [{ id: 'none', name: 'No Authentication' }];
        Object.entries(spec.components.securitySchemes).forEach(([key, s]) => {
            const scheme = s as any;
            if (scheme.type === 'apiKey') {
                if (scheme.in === 'cookie') {
                    out.push({ id: 'cookie', name: `Cookie API Key - ${key} (${scheme.name || 'access_token'})`, apiKeyName: scheme.name || 'access_token' });
                } else {
                    out.push({ id: 'apikey', name: `API Key - ${key} (${scheme.name || 'api_key'} in ${scheme.in || 'header'})`, apiKeyName: scheme.name || 'X-API-KEY', apiKeyIn: scheme.in === 'query' ? 'query' : 'header' });
                }
            } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
                out.push({ id: 'bearer', name: `Bearer Token - ${key}` });
            } else if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
                out.push({ id: 'bearer', name: `OAuth2 Access Token - ${key}` });
            } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
                out.push({ id: 'basic', name: `Basic Authentication - ${key}` });
            } else {
                out.push({ id: 'cookie', name: `Session Cookie - ${key}` });
            }
        });
        return out;
    };

    const schemes = getSchemes();

    const save = () => {
        onSave({
            activeScheme: authScheme,
            cookieValues: { access_token: 'active_session_cookie' },
            bearerToken,
            apiKeyName,
            apiKeyValue,
            apiKeyIn,
            basicUsername: basicUser,
            basicPassword: basicPass,
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-[1500] animate-in fade-in duration-100 backdrop-blur-[2px]"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-md border shadow-xl overflow-hidden animate-in zoom-in-95 duration-100 max-h-[90vh] flex flex-col bg-[var(--surface)] border-[var(--border)] text-[var(--text)] rounded-2xl">
                <div className="px-4 sm:px-5 py-2.5 sm:py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)] shrink-0 modal-header-mobile-pad">
                    <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                        <span className="size-9 shrink-0 rounded-xl flex items-center justify-center bg-[var(--primary)]/10 text-[var(--primary)] hidden sm:flex">
                            <i className="ph-fill ph-lock-key text-[18px]"></i>
                        </span>
                        <div className="min-w-0">
                            <h3 className="font-bold text-sm tracking-tight text-[var(--text-heading)] truncate">Configure Authentication</h3>
                            <p className="text-[10px] mt-0.5 text-[var(--text-muted)] truncate">Set keys per the specification's security definitions.</p>
                        </div>
                    </div>
                    <Tip content="Close">
                        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-muted)] shrink-0">
                            <i className="ph ph-x text-lg"></i>
                        </button>
                    </Tip>
                </div>

                <div className="px-5 py-5 space-y-4 overflow-y-auto scrollbar-thin">
                    <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2 text-[var(--text-muted)]">Auth Mechanism</label>
                        <CustomDropdown value={authScheme}
                            onChange={(val) => {
                                setAuthScheme(val);
                                if (val === 'none') { setBearerToken(''); setApiKeyValue(''); setBasicUser(''); setBasicPass(''); }
                                const match = schemes.find(s => s.id === val) as any;
                                if (match?.apiKeyName) setApiKeyName(match.apiKeyName);
                                if (match?.apiKeyIn) setApiKeyIn(match.apiKeyIn);
                            }}
                            options={schemes.map(s => ({ value: s.id, label: s.name }))}
                            icon="ph ph-shield text-[16px]"
                            className="w-full" />
                    </div>

                    {authScheme === 'cookie' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div className="border p-3 rounded-lg text-xs leading-relaxed bg-[var(--background)] border-[var(--border)]">
                                <p className="font-semibold mb-1 text-[var(--text-heading)]">Cookie integration</p>
                                <p>When this app and the target API share a domain, the browser sends cookies automatically.</p>
                            </div>
                            <div>
                                <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Cookie name</label>
                                <input type="text" placeholder="access_token" value={apiKeyName} onChange={e => setApiKeyName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg text-xs outline-none bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)] focus:border-[var(--primary)]" />
                            </div>
                        </div>
                    )}

                    {authScheme === 'bearer' && (
                        <div className="animate-in fade-in">
                            <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Bearer Token</label>
                            <input type="text" placeholder="eyJ..." value={bearerToken} onChange={e => setBearerToken(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-xs outline-none bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)] focus:border-[var(--primary)]" />
                        </div>
                    )}

                    {authScheme === 'basic' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div>
                                <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Username</label>
                                <input type="text" placeholder="admin" value={basicUser} onChange={e => setBasicUser(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg text-xs outline-none bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)] focus:border-[var(--primary)]" />
                            </div>
                            <div>
                                <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Password</label>
                                <input type="password" placeholder="••••••••" value={basicPass} onChange={e => setBasicPass(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg text-xs outline-none bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)] focus:border-[var(--primary)]" />
                            </div>
                        </div>
                    )}

                    {authScheme === 'apikey' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div>
                                <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Key Name</label>
                                <input type="text" placeholder="X-API-KEY" value={apiKeyName} onChange={e => setApiKeyName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg text-xs outline-none bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)] focus:border-[var(--primary)]" />
                            </div>
                            <div>
                                <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Key Value</label>
                                <input type="text" placeholder="MY_SECRET_KEY" value={apiKeyValue} onChange={e => setApiKeyValue(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg text-xs outline-none bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)] focus:border-[var(--primary)]" />
                            </div>
                            <div>
                                <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">Send In</label>
                                <CustomDropdown value={apiKeyIn} onChange={v => setApiKeyIn(v as any)}
                                    options={[{ value: 'header', label: 'Header' }, { value: 'query', label: 'Query parameter' }]}
                                    icon="ph ph-arrow-elbow-down-right" className="w-full" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-5 py-3 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] shrink-0">
                    <button onClick={onClose} className="px-4 py-2 border rounded-lg text-xs font-semibold cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">Cancel</button>
                    <button onClick={save} className="px-4 py-2 text-[var(--primary-contrast)] bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-95 text-xs font-semibold rounded-lg cursor-pointer">Apply</button>
                </div>
            </div>
        </div>
    );
}
