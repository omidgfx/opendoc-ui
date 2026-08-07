import React, {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {AIModelOption, AIProfile, AIProviderId, AISettings, AISkillPack} from '../../types';
import {AI_PROVIDER_PRESETS, fetchProviderModelCatalog, getProviderPreset} from '../../utils/aiProviders';
import type {GatewayModelPolicyInfo} from '../../utils/aiProviders';
import {
    DEFAULT_AI_SETTINGS,
    newAIProfile,
    readActiveAIProfileId,
    readAIGatewayModelCatalog,
    readAIModelCatalogs,
    readAIProfiles,
    writeActiveAIProfileId,
    writeAIGatewayModelCatalog,
    writeAIModelCatalog,
    writeAIProfiles,
} from '../../utils/aiStorage';
import {Tip} from '../common/Tooltip';

interface AISettingsModalProps {
    isOpen: boolean;
    settings: AISettings;
    onSave: (settings: AISettings) => void;
    onClose: () => void;
}

type ConfirmAction =
    | { kind: 'save'; profileId: string }
    | { kind: 'delete'; profileId: string }
    | { kind: 'all' };

const SKILL_OPTIONS: Array<{ id: AISkillPack; label: string; description: string }> = [
    {id: 'openapi', label: 'OpenAPI expert', description: 'Paths, operations, schemas, tags, servers, and references.'},
    {
        id: 'rest-debugging',
        label: 'REST debugging',
        description: 'HTTP status codes, headers, caching, retries, and CORS.'
    },
    {id: 'security', label: 'Security and auth', description: 'OAuth, API keys, cookies, scopes, and least privilege.'},
    {
        id: 'sdk-generation',
        label: 'SDK generation',
        description: 'Practical curl, Fetch, Axios, and client-model examples.'
    },
    {id: 'api-testing', label: 'API testing', description: 'Test cases, payloads, edge cases, and runner preparation.'},
];

const profileName = (index: number) => `Assistant profile ${index}`;
const cachedModelsForSettings = (settings: AISettings): AIModelOption[] => settings.transport === 'gateway'
    ? readAIGatewayModelCatalog(settings.gatewayUrl, settings.provider)
    : (readAIModelCatalogs()[settings.provider] || getProviderPreset(settings.provider).models);

function ModelSearchHighlight({text, query}: { text: string; query: string }) {
    const terms = query.trim().split(/\s+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) return <>{text}</>;
    const splitMatcher = new RegExp(`(${terms.join('|')})`, 'giu');
    const matcher = new RegExp(`(${terms.join('|')})`, 'iu');
    return <>{text.split(splitMatcher).map((part, index) => matcher.test(part)
        ? <mark key={`${part}-${index}`} className="rounded bg-[var(--highlight)] text-inherit">{part}</mark>
        : <span key={`${part}-${index}`}>{part}</span>)}</>;
}

function TemperatureSlider({value, onChange}: { value: number; onChange: (value: number) => void }) {
    const setFromClientX = (clientX: number, element: HTMLDivElement) => {
        const rect = element.getBoundingClientRect();
        const next = Math.max(0, Math.min(2, ((clientX - rect.left) / rect.width) * 2));
        onChange(Math.round(next * 10) / 10);
    };
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-3">
            <div
                role="slider"
                aria-label="Temperature"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={value}
                tabIndex={0}
                className="relative h-7 cursor-pointer touch-none select-none"
                onPointerDown={event => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setFromClientX(event.clientX, event.currentTarget);
                }}
                onPointerMove={event => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromClientX(event.clientX, event.currentTarget);
                }}
                onKeyDown={event => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        onChange(Math.max(0, Math.round((value - 0.1) * 10) / 10));
                    }
                    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        onChange(Math.min(2, Math.round((value + 0.1) * 10) / 10));
                    }
                    if (event.key === 'Home') {
                        event.preventDefault();
                        onChange(0);
                    }
                    if (event.key === 'End') {
                        event.preventDefault();
                        onChange(2);
                    }
                }}
            >
                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--border)]/70"/>
                <div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--primary)]"
                     style={{width: `${(value / 2) * 100}%`}}/>
                <div
                    className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--primary)] bg-[var(--surface)] shadow-md"
                    style={{left: `${(value / 2) * 100}%`}}/>
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-[var(--text-muted)]">
                <span>Deterministic</span><span>Creative</span></div>
        </div>
    );
}

export default function AISettingsModal({isOpen, settings, onSave, onClose}: AISettingsModalProps) {
    const [profiles, setProfiles] = useState<AIProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState('');
    const [draft, setDraft] = useState(settings);
    const [availableModels, setAvailableModels] = useState<AIModelOption[]>([]);
    const [gatewayPolicy, setGatewayPolicy] = useState<GatewayModelPolicyInfo | null>(null);
    const [isRefreshingModels, setIsRefreshingModels] = useState(false);
    const [modelError, setModelError] = useState('');
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [modelTierFilter, setModelTierFilter] = useState<'all' | 'free' | 'premium'>('all');
    const [showKey, setShowKey] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [profileNameDraft, setProfileNameDraft] = useState('');
    const [renamingProfileId, setRenamingProfileId] = useState('');
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const profileButtonRef = useRef<HTMLButtonElement | null>(null);

    const preset = useMemo(() => getProviderPreset(draft.provider), [draft.provider]);
    const hasProfiles = profiles.length > 0;
    const activeProfile = profiles.find(profile => profile.id === activeProfileId) || null;
    const filteredModels = useMemo(() => {
        const query = modelSearch.trim().toLowerCase();
        return availableModels.filter(model => {
            const tierMatches = modelTierFilter === 'all' || (modelTierFilter === 'free' ? model.tier === 'free' : model.tier !== 'free');
            const textMatches = !query || `${model.label} ${model.id} ${model.tier}`.toLowerCase().includes(query);
            return tierMatches && textMatches;
        });
    }, [availableModels, modelSearch, modelTierFilter]);

    useEffect(() => {
        if (!isOpen) return;
        const loadedProfiles = readAIProfiles();
        const savedActiveId = readActiveAIProfileId();
        const selected = loadedProfiles.find(profile => profile.id === savedActiveId) || loadedProfiles[0] || null;
        setProfiles(loadedProfiles);
        setActiveProfileId(selected?.id || '');
        setDraft(selected?.settings || settings);
        if (selected) onSave(selected.settings);
        setAvailableModels(cachedModelsForSettings(selected?.settings || settings));
        setGatewayPolicy(null);
        setModelError('');
        setProfileMenuOpen(false);
        setRenamingProfileId('');
        setShowKey(false);
        setModelPickerOpen(false);
        setModelSearch('');
        setModelTierFilter('all');
    }, [isOpen]);

    useEffect(() => {
        if (!profileMenuOpen) return;
        const closeOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (profileMenuRef.current?.contains(target) || profileButtonRef.current?.contains(target)) return;
            setProfileMenuOpen(false);
            setRenamingProfileId('');
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setProfileMenuOpen(false);
                setRenamingProfileId('');
            }
        };
        document.addEventListener('mousedown', closeOutside);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', closeOutside);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [profileMenuOpen]);

    const updateProvider = (provider: AIProviderId) => {
        const next = getProviderPreset(provider);
        const catalog = readAIModelCatalogs()[provider] || next.models;
        setAvailableModels(catalog);
        setModelError('');
        setDraft(current => ({
            ...current,
            provider,
            baseUrl: next.defaultBaseUrl,
            model: catalog[0]?.id || '',
        }));
    };

    const refreshModels = async () => {
        setIsRefreshingModels(true);
        setModelError('');
        try {
            const catalog = await fetchProviderModelCatalog(draft);
            const {models, gateway} = catalog;
            if (models.length === 0) throw new Error('No models were returned. You can still enter a model ID manually.');
            setAvailableModels(models);
            setGatewayPolicy(gateway || null);
            const catalogProvider = gateway?.provider || draft.provider;
            if (draft.transport === 'gateway') writeAIGatewayModelCatalog(draft.gatewayUrl, catalogProvider, models);
            else writeAIModelCatalog(catalogProvider, models);
            setDraft(current => {
                const provider = gateway?.provider || current.provider;
                const model = gateway
                    ? (gateway.clientModelSelection && models.some(item => item.id === current.model)
                        ? current.model
                        : gateway.model || models[0].id)
                    : (current.model.trim() ? current.model : models[0].id);
                return {...current, provider, model};
            });
        } catch (error) {
            setModelError(error instanceof Error ? error.message : 'Unable to refresh this provider catalog.');
        } finally {
            setIsRefreshingModels(false);
        }
    };

    const toggleSkill = (skill: AISkillPack) => {
        setDraft(current => ({
            ...current,
            skillPacks: current.skillPacks.includes(skill)
                ? current.skillPacks.filter(item => item !== skill)
                : [...current.skillPacks, skill],
        }));
    };

    const createProfile = () => {
        const profile = newAIProfile(profileName(profiles.length + 1), draft);
        const next = [profile, ...profiles];
        writeAIProfiles(next);
        writeActiveAIProfileId(profile.id);
        setProfiles(next);
        setActiveProfileId(profile.id);
        setDraft(profile.settings);
        onSave(profile.settings);
        setProfileMenuOpen(false);
    };

    const selectProfile = (profile: AIProfile) => {
        setActiveProfileId(profile.id);
        writeActiveAIProfileId(profile.id);
        setDraft(profile.settings);
        setAvailableModels(cachedModelsForSettings(profile.settings));
        setGatewayPolicy(null);
        setModelError('');
        setProfileMenuOpen(false);
        setRenamingProfileId('');
        onSave(profile.settings);
    };

    const requestRename = (profile: AIProfile) => {
        setRenamingProfileId(profile.id);
        setProfileNameDraft(profile.name);
    };

    const commitRename = (profileId: string, value: string) => {
        const name = value.trim() || profileName(profiles.length);
        const next = profiles.map(profile => profile.id === profileId ? {
            ...profile,
            name,
            updatedAt: Date.now()
        } : profile);
        writeAIProfiles(next);
        setProfiles(next);
        setRenamingProfileId('');
        setProfileMenuOpen(false);
    };

    const requestSave = () => {
        if (!activeProfile) return;
        setConfirmAction({kind: 'save', profileId: activeProfile.id});
    };

    const confirmChanges = () => {
        if (!confirmAction) return;
        if (confirmAction.kind === 'all') {
            writeAIProfiles([]);
            writeActiveAIProfileId('');
            setProfiles([]);
            setActiveProfileId('');
            setDraft(DEFAULT_AI_SETTINGS);
            setAvailableModels(getProviderPreset(DEFAULT_AI_SETTINGS.provider).models);
            onSave(DEFAULT_AI_SETTINGS);
            setConfirmAction(null);
            return;
        }
        if (confirmAction.kind === 'save') {
            const next = profiles.map(profile => profile.id === confirmAction.profileId
                ? {...profile, settings: draft, updatedAt: Date.now()}
                : profile);
            writeAIProfiles(next);
            writeActiveAIProfileId(confirmAction.profileId);
            setProfiles(next);
            onSave(draft);
            setConfirmAction(null);
            onClose();
            return;
        }
        const remaining = profiles.filter(profile => profile.id !== confirmAction.profileId);
        writeAIProfiles(remaining);
        if (remaining.length > 0) {
            const nextProfile = remaining[0];
            writeActiveAIProfileId(nextProfile.id);
            setActiveProfileId(nextProfile.id);
            setDraft(nextProfile.settings);
            setAvailableModels(cachedModelsForSettings(nextProfile.settings));
            onSave(nextProfile.settings);
        } else {
            writeActiveAIProfileId('');
            setActiveProfileId('');
            setDraft(DEFAULT_AI_SETTINGS);
            setAvailableModels(getProviderPreset(DEFAULT_AI_SETTINGS.provider).models);
            onSave(DEFAULT_AI_SETTINGS);
        }
        setProfiles(remaining);
        setProfileMenuOpen(false);
        setConfirmAction(null);
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in"
            onMouseDown={event => {
                if (event.target === event.currentTarget && !confirmAction) onClose();
            }}>
            <section role="dialog" aria-modal="true" aria-labelledby="ai-settings-title"
                     className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl animate-zoom-in">
                <header
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]"><i
                            className="ph-fill ph-sparkle text-[19px]"/></span>
                        <div className="min-w-0">
                            <h2 id="ai-settings-title" className="text-sm font-extrabold text-[var(--text-heading)]">AI
                                assistant settings</h2>
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Global profiles, provider keys,
                                models, and skills.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {hasProfiles && <div className="relative" ref={profileMenuRef}>
                            <button ref={profileButtonRef} type="button"
                                    onClick={() => setProfileMenuOpen(open => !open)}
                                    className="flex h-9 max-w-[190px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 text-left text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                    aria-expanded={profileMenuOpen}>
                                <i className="ph ph-user-circle text-[14px] text-[var(--primary)]"/><span
                                className="min-w-0 flex-1 truncate">{activeProfile?.name || 'Select profile'}</span><i
                                className="ph ph-caret-down text-[10px] text-[var(--text-muted)]"/>
                            </button>
                            {profileMenuOpen && <div
                                className="absolute end-0 top-[calc(100%+6px)] z-[20] w-[300px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl animate-fade-in">
                                <div
                                    className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Saved
                                    AI profiles
                                </div>
                                {profiles.map(profile => <div key={profile.id}
                                                              className={clsx('flex items-center gap-1 rounded-lg px-2 py-1.5', profile.id === activeProfileId ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--surface-hover)]')}>
                                    {renamingProfileId === profile.id ? <input autoFocus value={profileNameDraft}
                                                                               onChange={event => setProfileNameDraft(event.target.value)}
                                                                               onKeyDown={event => {
                                                                                   if (event.key === 'Enter') commitRename(profile.id, profileNameDraft);
                                                                               }}
                                                                               className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] outline-none focus:border-[var(--primary)]"/> :
                                        <button type="button" onClick={() => selectProfile(profile)}
                                                className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold text-[var(--text)] cursor-pointer">{profile.name}<span
                                            className="ms-1 text-[8px] text-[var(--text-muted)]">{profile.settings.provider}</span>
                                        </button>}
                                    {renamingProfileId === profile.id ?
                                        <button type="button" onClick={() => commitRename(profile.id, profileNameDraft)}
                                                className="flex size-6 items-center justify-center rounded text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer">
                                            <i className="ph ph-check text-[11px]"/></button> :
                                        <button type="button" onClick={() => requestRename(profile)}
                                                className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer">
                                            <i className="ph ph-pencil-simple text-[11px]"/></button>}
                                    <button type="button"
                                            onClick={() => setConfirmAction({kind: 'delete', profileId: profile.id})}
                                            className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer">
                                        <i className="ph ph-trash text-[11px]"/></button>
                                </div>)}
                                <div className="my-1 border-t border-[var(--border)]"/>
                                <button type="button" onClick={() => {
                                    setProfileMenuOpen(false);
                                    createProfile();
                                }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer">
                                    <i className="ph ph-plus text-[12px]"/>New profile
                                </button>
                                <button type="button" onClick={() => setConfirmAction({kind: 'all'})}
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer">
                                    <i className="ph ph-trash text-[12px]"/>Remove all profiles
                                </button>
                            </div>}
                        </div>}
                        <Tip content="New profile">
                            <button type="button" onClick={createProfile}
                                    className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                    aria-label="Create new AI profile"><i className="ph ph-plus text-[14px]"/></button>
                        </Tip>
                        <button type="button" onClick={onClose}
                                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                aria-label="Close AI settings"><i className="ph ph-x"/></button>
                    </div>
                </header>

                {!hasProfiles ?
                    <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
                        <span
                            className="flex size-16 items-center justify-center rounded-3xl bg-[var(--primary)]/10 text-[var(--primary)]"><i
                            className="ph-fill ph-sparkle text-[30px]"/></span>
                        <h3 className="mt-4 text-base font-extrabold text-[var(--text-heading)]">Create your first AI
                            profile</h3>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">Profiles keep
                            provider keys, models, gateway settings, and skill choices together. They are saved globally
                            in this browser.</p>
                        <button type="button" onClick={createProfile}
                                className="mt-5 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer">
                            <i className="ph ph-plus me-1.5"/>Create first profile
                        </button>
                    </div> : <>
                        <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label className="space-y-1.5"><span
                                        className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Transport</span><select
                                        value={draft.transport} onChange={event => {setGatewayPolicy(null); setDraft({...draft, transport: event.target.value as AISettings['transport']});}}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--primary)]">
                                        <option value="direct">Direct browser request</option>
                                        <option value="gateway">AI gateway / proxy</option>
                                    </select></label>
                                    <label className="space-y-1.5"><span
                                        className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Provider</span><select
                                        value={draft.provider}
                                        disabled={draft.transport === 'gateway'}
                                        onChange={event => updateProvider(event.target.value as AIProviderId)}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60">{AI_PROVIDER_PRESETS.map(item =>
                                        <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="block text-[10px] text-[var(--text-muted)]">{draft.transport === 'gateway' ? `Configured by the gateway${gatewayPolicy ? `: ${gatewayPolicy.provider}` : '; refresh models to synchronize'}.` : 'Selected by this browser profile.'}</span></label>
                                </div>

                                {draft.transport === 'gateway' && <label className="block space-y-1.5"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Gateway
                                    URL and access token</span><input value={draft.gatewayUrl}
                                                                      onChange={event => setDraft({
                                                                          ...draft,
                                                                          gatewayUrl: event.target.value
                                                                      })}
                                                                      placeholder="/api/ai or https://gateway.example.com"
                                                                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"/><input
                                    type="password" value={draft.gatewayToken}
                                    onChange={event => setDraft({...draft, gatewayToken: event.target.value})}
                                    placeholder="Gateway access token"
                                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"/><span
                                    className="block text-[10px] text-[var(--text-muted)]">Provider credentials remain
                                    on the gateway. Gateway authentication is required outside explicit development
                                    mode.</span></label>}

                                <label className="block space-y-1.5"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Model</span>
                                    <div className="flex gap-2">
                                        <input value={draft.model}
                                               disabled={draft.transport === 'gateway' && gatewayPolicy?.clientModelSelection === false}
                                               onChange={event => setDraft({...draft, model: event.target.value})}
                                               placeholder={availableModels[0]?.id || 'model-id'}
                                               className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"/>
                                        <button type="button" disabled={draft.transport === 'gateway' && gatewayPolicy?.clientModelSelection === false} onClick={() => {
                                            setModelSearch('');
                                            setModelTierFilter('all');
                                            setModelPickerOpen(true);
                                        }}
                                                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
                                            <i className="ph ph-list me-1"/>Browse
                                        </button>
                                    </div>
                                    <span
                                        className="block text-[10px] text-[var(--text-muted)]">{availableModels.length} catalog
                                        model{availableModels.length === 1 ? '' : 's'} · selected: <code
                                            className="font-mono text-[var(--text-heading)]">{draft.model || 'none'}</code></span>
                                    {draft.transport === 'gateway' && <span className="block text-[10px] text-[var(--text-muted)]">{gatewayPolicy ? (gatewayPolicy.clientModelSelection ? 'Gateway allowlist synchronized.' : 'Gateway fixed model; model editing is locked.') : 'Refresh models to read the gateway policy.'}</span>}
                                    {modelError && <span
                                        className="mt-1 block text-[10px] text-[var(--method-put)]">{modelError}</span>}
                                </label>

                                {modelPickerOpen &&
                                    <div className="fixed inset-0 z-[6100] flex items-center justify-center p-4"
                                         style={{backgroundColor: 'rgba(8, 10, 16, 0.48)'}} onMouseDown={event => {
                                        if (event.target === event.currentTarget) setModelPickerOpen(false);
                                    }}>
                                        <div role="dialog" aria-modal="true" aria-labelledby="ai-model-picker-title"
                                             className="flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                                            <header
                                                className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                                                <div className="min-w-0"><h3 id="ai-model-picker-title"
                                                                             className="text-sm font-extrabold text-[var(--text-heading)]">Choose
                                                    a model</h3><p
                                                    className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">Search
                                                    by model name, slug, or tier. Current: {draft.model || 'none'}</p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <button type="button" onClick={() => {
                                                        void refreshModels();
                                                    }} disabled={isRefreshingModels}
                                                            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-50 cursor-pointer">
                                                        <i className={clsx('ph ph-arrows-clockwise text-[13px]', isRefreshingModels && 'animate-spin')}/>{isRefreshingModels ? 'Refreshing…' : 'Refresh models'}
                                                    </button>
                                                    <button type="button" onClick={() => setModelPickerOpen(false)}
                                                            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer">
                                                        <i className="ph ph-x"/></button>
                                                </div>
                                            </header>
                                            <div className="space-y-2 border-b border-[var(--border)] p-3">
                                                <div className="relative"><i
                                                    className="ph ph-magnifying-glass pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)]"/><input
                                                    autoFocus value={modelSearch}
                                                    onChange={event => setModelSearch(event.target.value)}
                                                    placeholder="Filter models by name or slug…"
                                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-2.5 ps-9 pe-3 text-xs outline-none focus:border-[var(--primary)]"/>
                                                </div>
                                                <div
                                                    className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--background)] p-1">
                                                    <span
                                                        className="px-2 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Tier</span>{(['free', 'premium', 'all'] as const).map(filter =>
                                                    <button key={filter} type="button"
                                                            onClick={() => setModelTierFilter(filter)}
                                                            className={clsx('flex-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer', modelTierFilter === filter ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>{filter}</button>)}
                                                </div>
                                            </div>
                                            <div
                                                className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">{filteredModels.length === 0 ?
                                                <p className="px-3 py-10 text-center text-xs text-[var(--text-muted)]">No
                                                    models match this filter.</p> : filteredModels.map(model => {
                                                    const selected = model.id === draft.model;
                                                    return <button key={model.id} type="button" onClick={() => {
                                                        setDraft(current => ({...current, model: model.id}));
                                                        setModelPickerOpen(false);
                                                    }}
                                                                   className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer', selected ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-hover)]')}>
                                                        <span
                                                            className={clsx('flex size-7 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'bg-[var(--background)] text-[var(--text-muted)]')}><i
                                                            className={selected ? 'ph ph-check text-[13px]' : 'ph ph-cpu text-[13px]'}/></span><span
                                                        className="min-w-0 flex-1"><span
                                                        className="block truncate text-[11px] font-bold text-[var(--text-heading)]"><ModelSearchHighlight
                                                        text={model.label} query={modelSearch}/></span><span
                                                        className="mt-0.5 block truncate font-mono text-[10px] text-[var(--text-muted)]"><ModelSearchHighlight
                                                        text={model.id} query={modelSearch}/></span></span><span
                                                        className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">{model.tier}</span>
                                                    </button>;
                                                })}</div>
                                        </div>
                                    </div>}

                                <label className="block space-y-1.5"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Temperature
                                    · {draft.temperature.toFixed(1)}</span><TemperatureSlider value={draft.temperature}
                                                                                              onChange={temperature => setDraft({
                                                                                                  ...draft,
                                                                                                  temperature
                                                                                              })}/></label>

                                <label className="block space-y-1.5"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Maximum
                                    output tokens</span><input type="number" min="256" max="16384" step="128"
                                                               value={draft.maxTokens || 2048}
                                                               onChange={event => setDraft({
                                                                   ...draft,
                                                                   maxTokens: Number(event.target.value)
                                                               })}
                                                               className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"/><span
                                    className="block text-[10px] text-[var(--text-muted)]">Bounds the response budget
                                    and helps prevent unexpectedly expensive requests.</span></label>

                                {draft.transport === 'direct' && <label className="block space-y-1.5"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Base
                                    URL</span><input value={draft.baseUrl} onChange={event => setDraft({
                                    ...draft,
                                    baseUrl: event.target.value
                                })}
                                                     className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"/><span
                                    className="block text-[10px] text-[var(--text-muted)]">{preset.description}</span></label>}

                                {preset.requiresApiKey && draft.transport === 'direct' &&
                                    <label className="block space-y-1.5"><span
                                        className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">API
                                        key</span>
                                        <div className="relative"><input type={showKey ? 'text' : 'password'}
                                                                         value={draft.apiKey}
                                                                         onChange={event => setDraft({
                                                                             ...draft,
                                                                             apiKey: event.target.value
                                                                         })}
                                                                         placeholder="Stored in this profile when remembered"
                                                                         className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pe-10 font-mono text-xs outline-none focus:border-[var(--primary)]"/>
                                            <button type="button" onClick={() => setShowKey(!showKey)}
                                                    className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-heading)] cursor-pointer">
                                                <i className={clsx('ph text-[14px]', showKey ? 'ph-eye-slash' : 'ph-eye')}/>
                                            </button>
                                        </div>
                                        <span className="block text-[10px] text-[var(--method-put)]">Direct mode sends
                                            this key from the browser. Use gateway mode for server-side
                                            credentials.</span></label>}

                                <label
                                    className="flex items-start gap-2 rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 p-3 text-[10px] leading-relaxed text-[var(--text-muted)]"><input
                                    type="checkbox" checked={draft.rememberCredentials === true}
                                    onChange={event => setDraft({...draft, rememberCredentials: event.target.checked})}
                                    className="mt-0.5 accent-[var(--primary)]"/><span><strong
                                    className="text-[var(--text-heading)]">Remember provider/gateway secrets on this
                                    device</strong><br/>Off by default: secrets stay in session storage and are removed
                                    when the browser session ends. LocalStorage is not a secure vault.</span></label>

                                <div className="space-y-2"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Skill
                                    packs</span>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{SKILL_OPTIONS.map(skill => {
                                        const active = draft.skillPacks.includes(skill.id);
                                        return <button key={skill.id} type="button"
                                                       onClick={() => toggleSkill(skill.id)}
                                                       className={clsx('rounded-xl border p-3 text-left transition-colors cursor-pointer', active ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface-hover)]')}>
                                            <span
                                                className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-heading)]"><span
                                                className={clsx('flex size-4 items-center justify-center rounded border text-[10px]', active ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-contrast)]' : 'border-[var(--border)] text-transparent')}><i
                                                className="ph ph-check"/></span>{skill.label}</span><span
                                            className="mt-1 block ps-6 text-[10px] leading-relaxed text-[var(--text-muted)]">{skill.description}</span>
                                        </button>;
                                    })}</div>
                                </div>

                                <label className="block space-y-1.5"><span
                                    className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Additional
                                    instructions</span><textarea value={draft.customInstructions}
                                                                 onChange={event => setDraft({
                                                                     ...draft,
                                                                     customInstructions: event.target.value
                                                                 })} rows={3}
                                                                 placeholder="Optional instructions for the assistant…"
                                                                 className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--primary)]"/></label>
                            </div>
                        </div>
                        <footer
                            className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--background)] px-5 py-3">
                            <span className="text-[10px] text-[var(--text-muted)]">Changes are saved to the selected
                                profile only after confirmation.</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={onClose}
                                        className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer">Close
                                </button>
                                <button type="button" onClick={requestSave}
                                        className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer">Save
                                    profile
                                </button>
                            </div>
                        </footer>
                    </>}
            </section>

            {confirmAction && <div
                className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
                onMouseDown={event => {
                    if (event.target === event.currentTarget) setConfirmAction(null);
                }}>
                <div
                    className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
                    <div className="flex gap-3"><span
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-put)]/10 text-[var(--method-put)]"><i
                        className="ph ph-warning text-[18px]"/></span>
                        <div><h3
                            className="text-sm font-extrabold text-[var(--text-heading)]">{confirmAction.kind === 'save' ? 'Save profile changes?' : confirmAction.kind === 'delete' ? 'Delete profile?' : 'Remove all profiles?'}</h3>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{confirmAction.kind === 'save' ? 'The current provider, model, key, gateway, and skill settings will replace the saved profile.' : confirmAction.kind === 'delete' ? 'This profile and its saved credentials will be removed.' : 'All global AI profiles and saved credentials will be removed.'}</p>
                        </div>
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" onClick={() => setConfirmAction(null)}
                                className="rounded-xl border border-[var(--border)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--surface-hover)] cursor-pointer">Cancel
                        </button>
                        <button type="button" onClick={confirmChanges}
                                className="rounded-xl bg-[var(--method-delete)] px-3 py-2 text-[11px] font-bold text-[var(--method-delete-contrast)] hover:brightness-110 cursor-pointer">Confirm
                        </button>
                    </div>
                </div>
            </div>}
        </div>
    );
}
