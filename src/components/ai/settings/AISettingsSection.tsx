import React, {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {AIModelOption, AIProfile, AIProviderId, AISettings, AISkillPack} from '../../../types';
import type {GatewayModelPolicyInfo} from '../../../utils/ai/providers';
import {AI_PROVIDER_PRESETS, fetchProviderModelCatalog, getProviderPreset} from '../../../utils/ai/providers';
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
} from '../../../utils/ai/storage';
import {Tip} from '../../common/Tooltip';
import {useEscClose} from '../../../hooks/useEscClose';
import {useModalTransition} from '../../../hooks/useModalTransition';
import TemperatureSlider from './TemperatureSlider';
import ProfileNameModal from './ProfileNameModal';
import SettingsConfirmModal from './SettingsConfirmModal';
import ModelPickerModal from './ModelPickerModal';
import CustomDropdown from '../../common/CustomDropdown';

export interface AISettingsSectionProps {
    settings: AISettings;
    onSave: (settings: AISettings) => void;
}

type ConfirmAction =
    | {
          kind: 'save';
          profileId: string;
      }
    | {
          kind: 'delete';
          profileId: string;
      }
    | {
          kind: 'all';
      };
const SKILL_OPTIONS: Array<{
    id: AISkillPack;
    label: string;
    description: string;
}> = [
    {id: 'openapi', label: 'OpenAPI expert', description: 'Paths, operations, schemas, tags, servers, and references.'},
    {
        id: 'rest-debugging',
        label: 'REST debugging',
        description: 'HTTP status codes, headers, caching, retries, and CORS.',
    },
    {id: 'security', label: 'Security and auth', description: 'OAuth, API keys, cookies, scopes, and least privilege.'},
    {
        id: 'sdk-generation',
        label: 'SDK generation',
        description: 'Practical curl, Fetch, Axios, and client-model examples.',
    },
    {id: 'api-testing', label: 'API testing', description: 'Test cases, payloads, edge cases, and runner preparation.'},
];
const profileName = (index: number) => `Assistant profile ${index}`;
const cachedModelsForSettings = (settings: AISettings): AIModelOption[] =>
    settings.transport === 'gateway'
        ? readAIGatewayModelCatalog(settings.gatewayUrl, settings.provider)
        : readAIModelCatalogs()[settings.provider] || getProviderPreset(settings.provider).models;
export default function AISettingsSection({settings, onSave}: AISettingsSectionProps) {
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
    const [profileNameTargetId, setProfileNameTargetId] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [newProfileDialogOpen, setNewProfileDialogOpen] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const modelPickerTransition = useModalTransition(modelPickerOpen, () => setModelPickerOpen(false));
    const confirmTransition = useModalTransition(!!confirmAction, () => setConfirmAction(null));
    const newProfileTransition = useModalTransition(newProfileDialogOpen, () => setNewProfileDialogOpen(false));
    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const profileButtonRef = useRef<HTMLButtonElement | null>(null);
    useEscClose(modelPickerOpen, modelPickerTransition.requestClose, modelPickerOpen);
    useEscClose(!!confirmAction, confirmTransition.requestClose, !!confirmAction);
    useEscClose(newProfileDialogOpen, newProfileTransition.requestClose, newProfileDialogOpen);
    const preset = useMemo(() => getProviderPreset(draft.provider), [draft.provider]);
    const hasProfiles = profiles.length > 0;
    const activeProfile = profiles.find(profile => profile.id === activeProfileId) || null;
    const filteredModels = useMemo(() => {
        const query = modelSearch.trim().toLowerCase();
        return availableModels.filter(model => {
            const tierMatches =
                modelTierFilter === 'all' ||
                (modelTierFilter === 'free' ? model.tier === 'free' : model.tier !== 'free');
            const textMatches = !query || `${model.label} ${model.id} ${model.tier}`.toLowerCase().includes(query);
            return tierMatches && textMatches;
        });
    }, [availableModels, modelSearch, modelTierFilter]);
    useEffect(() => {
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
        setShowKey(false);
        setModelPickerOpen(false);
        setModelSearch('');
        setModelTierFilter('all');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!profileMenuOpen) return;
        const closeOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (profileMenuRef.current?.contains(target) || profileButtonRef.current?.contains(target)) return;
            setProfileMenuOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setProfileMenuOpen(false);
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
            if (models.length === 0)
                throw new Error('No models were returned. You can still enter a model ID manually.');
            setAvailableModels(models);
            setGatewayPolicy(gateway || null);
            const catalogProvider = gateway?.provider || draft.provider;
            if (draft.transport === 'gateway') writeAIGatewayModelCatalog(draft.gatewayUrl, catalogProvider, models);
            else writeAIModelCatalog(catalogProvider, models);
            setDraft(current => {
                const provider = gateway?.provider || current.provider;
                const model = gateway
                    ? gateway.clientModelSelection && models.some(item => item.id === current.model)
                        ? current.model
                        : gateway.model || models[0].id
                    : current.model.trim()
                      ? current.model
                      : models[0].id;
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
    const requestCreateProfile = () => {
        setProfileMenuOpen(false);
        setProfileNameTargetId(null);
        setNewProfileName(profileName(profiles.length + 1));
        setNewProfileDialogOpen(true);
    };
    const createProfile = () => {
        const name = newProfileName.trim();
        if (!name) return;
        if (profileNameTargetId) {
            commitRename(profileNameTargetId, name);
            newProfileTransition.requestClose();
            return;
        }
        const profile = newAIProfile(name, draft);
        const next = [profile, ...profiles];
        writeAIProfiles(next);
        writeActiveAIProfileId(profile.id);
        setProfiles(next);
        setActiveProfileId(profile.id);
        setDraft(profile.settings);
        onSave(profile.settings);
        newProfileTransition.requestClose();
    };
    const selectProfile = (profile: AIProfile) => {
        setActiveProfileId(profile.id);
        writeActiveAIProfileId(profile.id);
        setDraft(profile.settings);
        setAvailableModels(cachedModelsForSettings(profile.settings));
        setGatewayPolicy(null);
        setModelError('');
        setProfileMenuOpen(false);
        onSave(profile.settings);
    };
    const requestRename = (profile: AIProfile) => {
        setProfileMenuOpen(false);
        setProfileNameTargetId(profile.id);
        setNewProfileName(profile.name);
        setNewProfileDialogOpen(true);
    };
    const commitRename = (profileId: string, value: string) => {
        const name = value.trim() || profileName(profiles.length);
        const next = profiles.map(profile =>
            profile.id === profileId
                ? {
                      ...profile,
                      name,
                      updatedAt: Date.now(),
                  }
                : profile,
        );
        writeAIProfiles(next);
        setProfiles(next);
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
            confirmTransition.requestClose();
            return;
        }
        if (confirmAction.kind === 'save') {
            const next = profiles.map(profile =>
                profile.id === confirmAction.profileId ? {...profile, settings: draft, updatedAt: Date.now()} : profile,
            );
            writeAIProfiles(next);
            writeActiveAIProfileId(confirmAction.profileId);
            setProfiles(next);
            onSave(draft);
            confirmTransition.requestClose();
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
        confirmTransition.requestClose();
    };
    return (
        <div className="space-y-4">
            <section
                aria-labelledby="ai-settings-title"
                className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm"
            >
                <header className="flex flex-col items-stretch gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className="ph-fill ph-sparkle text-[19px]" />
                        </span>
                        <div className="min-w-0">
                            <h2 id="ai-settings-title" className="text-sm font-extrabold text-[var(--text-heading)]">
                                AI assistant settings
                            </h2>
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                Global profiles, provider keys, models, and skills.
                            </p>
                        </div>
                    </div>
                    <div className="flex w-full items-center gap-1.5 sm:w-auto">
                        {hasProfiles && (
                            <div className="relative min-w-0 flex-1 sm:flex-none" ref={profileMenuRef}>
                                <button
                                    ref={profileButtonRef}
                                    type="button"
                                    onClick={() => setProfileMenuOpen(open => !open)}
                                    className="flex h-9 w-full min-w-0 items-center sm:w-auto sm:max-w-[190px] gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 text-left text-[10px] font-bold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                    aria-expanded={profileMenuOpen}
                                >
                                    <i className="ph ph-user-circle text-[14px] text-[var(--primary)]" />
                                    <span className="min-w-0 flex-1 truncate">
                                        {activeProfile?.name || 'Select profile'}
                                    </span>
                                    <i className="ph ph-caret-down text-[10px] text-[var(--text-muted)]" />
                                </button>
                                {profileMenuOpen && (
                                    <div className="absolute end-0 top-[calc(100%+6px)] z-[20] w-[min(300px,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl animate-fade-in">
                                        <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                            Saved AI profiles
                                        </div>
                                        {profiles.map(profile => (
                                            <div
                                                key={profile.id}
                                                className={clsx(
                                                    'mb-1 flex items-center gap-1 rounded-lg px-2 py-1.5 last:mb-0',
                                                    profile.id === activeProfileId
                                                        ? 'bg-[var(--primary)]/10'
                                                        : 'hover:bg-[var(--surface-hover)]',
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => selectProfile(profile)}
                                                    className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold text-[var(--text)] cursor-pointer"
                                                >
                                                    {profile.name}
                                                    <span className="ms-1 text-[8px] text-[var(--text-muted)]">
                                                        {profile.settings.provider}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => requestRename(profile)}
                                                    className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                                >
                                                    <i className="ph ph-pencil-simple text-[11px]" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setConfirmAction({kind: 'delete', profileId: profile.id})
                                                    }
                                                    className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                                >
                                                    <i className="ph ph-trash text-[11px]" />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="my-1 border-t border-[var(--border)]" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                requestCreateProfile();
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                        >
                                            <i className="ph ph-plus text-[12px]" />
                                            New profile
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmAction({kind: 'all'})}
                                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-bold text-[var(--method-delete)] hover:bg-[var(--method-delete)]/10 cursor-pointer"
                                        >
                                            <i className="ph ph-trash text-[12px]" />
                                            Remove all profiles
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <Tip content="New profile">
                            <button
                                type="button"
                                onClick={requestCreateProfile}
                                className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                aria-label="Create new AI profile"
                            >
                                <i className="ph ph-plus text-[14px]" />
                            </button>
                        </Tip>
                    </div>
                </header>

                {!hasProfiles ? (
                    <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
                        <span className="flex size-16 items-center justify-center rounded-3xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className="ph-fill ph-sparkle text-[30px]" />
                        </span>
                        <h3 className="mt-4 text-base font-extrabold text-[var(--text-heading)]">
                            Create your first AI profile
                        </h3>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
                            Profiles keep provider keys, models, gateway settings, and skill choices together. They are
                            saved globally in this browser.
                        </p>
                        <button
                            type="button"
                            onClick={requestCreateProfile}
                            className="mt-5 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                        >
                            <i className="ph ph-plus me-1.5" />
                            Create first profile
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="modal-scroll-region min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label className="space-y-1.5">
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Transport
                                        </span>
                                        <CustomDropdown
                                            value={draft.transport}
                                            onChange={value => {
                                                setGatewayPolicy(null);
                                                setDraft({...draft, transport: value as AISettings['transport']});
                                            }}
                                            options={[
                                                {value: 'direct', label: 'Direct browser request'},
                                                {value: 'gateway', label: 'AI gateway / proxy'},
                                            ]}
                                            className="w-full"
                                        />
                                    </label>
                                    <label className="space-y-1.5">
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Provider
                                        </span>
                                        <CustomDropdown
                                            value={draft.provider}
                                            disabled={draft.transport === 'gateway'}
                                            onChange={value => updateProvider(value as AIProviderId)}
                                            options={AI_PROVIDER_PRESETS.map(item => ({
                                                value: item.id,
                                                label: item.label,
                                            }))}
                                            className="w-full"
                                        />
                                        <span className="block text-[10px] text-[var(--text-muted)]">
                                            {draft.transport === 'gateway'
                                                ? `Configured by the gateway${gatewayPolicy ? `: ${gatewayPolicy.provider}` : '; refresh models to synchronize'}.`
                                                : 'Selected by this browser profile.'}
                                        </span>
                                    </label>
                                </div>

                                {draft.transport === 'gateway' && (
                                    <label className="block space-y-1.5">
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Gateway URL and access token
                                        </span>
                                        <input
                                            value={draft.gatewayUrl}
                                            onChange={event =>
                                                setDraft({
                                                    ...draft,
                                                    gatewayUrl: event.target.value,
                                                })
                                            }
                                            placeholder="/api/ai or https://gateway.example.com"
                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"
                                        />
                                        <input
                                            type="password"
                                            value={draft.gatewayToken}
                                            onChange={event => setDraft({...draft, gatewayToken: event.target.value})}
                                            placeholder="Gateway access token"
                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"
                                        />
                                        <span className="block text-[10px] text-[var(--text-muted)]">
                                            Provider credentials remain on the gateway. Gateway authentication is
                                            required outside explicit development mode.
                                        </span>
                                    </label>
                                )}

                                <label className="block space-y-1.5">
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Model
                                    </span>
                                    <div className="flex gap-2">
                                        <input
                                            value={draft.model}
                                            disabled={
                                                draft.transport === 'gateway' &&
                                                gatewayPolicy?.clientModelSelection === false
                                            }
                                            onChange={event => setDraft({...draft, model: event.target.value})}
                                            placeholder={availableModels[0]?.id || 'model-id'}
                                            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                                        />
                                        <button
                                            type="button"
                                            disabled={
                                                draft.transport === 'gateway' &&
                                                gatewayPolicy?.clientModelSelection === false
                                            }
                                            onClick={() => {
                                                setModelSearch('');
                                                setModelTierFilter('all');
                                                setModelPickerOpen(true);
                                            }}
                                            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                        >
                                            <i className="ph ph-list me-1" />
                                            Browse
                                        </button>
                                    </div>
                                    <span className="block text-[10px] text-[var(--text-muted)]">
                                        {availableModels.length} catalog model{availableModels.length === 1 ? '' : 's'}{' '}
                                        · selected:{' '}
                                        <code className="font-mono text-[var(--text-heading)]">
                                            {draft.model || 'none'}
                                        </code>
                                    </span>
                                    {draft.transport === 'gateway' && (
                                        <span className="block text-[10px] text-[var(--text-muted)]">
                                            {gatewayPolicy
                                                ? gatewayPolicy.clientModelSelection
                                                    ? 'Gateway allowlist synchronized.'
                                                    : 'Gateway fixed model; model editing is locked.'
                                                : 'Refresh models to read the gateway policy.'}
                                        </span>
                                    )}
                                    {modelError && (
                                        <span className="mt-1 block text-[10px] text-[var(--method-put)]">
                                            {modelError}
                                        </span>
                                    )}
                                </label>

                                <ModelPickerModal
                                    visible={modelPickerTransition.shouldRender}
                                    backdropClassName={modelPickerTransition.backdropClassName}
                                    currentModel={draft.model}
                                    models={filteredModels}
                                    search={modelSearch}
                                    tier={modelTierFilter}
                                    refreshing={isRefreshingModels}
                                    onSearchChange={setModelSearch}
                                    onTierChange={setModelTierFilter}
                                    onRefresh={() => void refreshModels()}
                                    onSelect={model => {
                                        setDraft(current => ({...current, model: model.id}));
                                        modelPickerTransition.requestClose();
                                    }}
                                    onClose={modelPickerTransition.requestClose}
                                />

                                <label className="block space-y-1.5">
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Temperature · {draft.temperature.toFixed(1)}
                                    </span>
                                    <TemperatureSlider
                                        value={draft.temperature}
                                        onChange={temperature =>
                                            setDraft({
                                                ...draft,
                                                temperature,
                                            })
                                        }
                                    />
                                </label>

                                <label className="block space-y-1.5">
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Maximum output tokens
                                    </span>
                                    <input
                                        type="number"
                                        min="256"
                                        max="16384"
                                        step="128"
                                        value={draft.maxTokens || 2048}
                                        onChange={event =>
                                            setDraft({
                                                ...draft,
                                                maxTokens: Number(event.target.value),
                                            })
                                        }
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"
                                    />
                                    <span className="block text-[10px] text-[var(--text-muted)]">
                                        Bounds the response budget and helps prevent unexpectedly expensive requests.
                                    </span>
                                </label>

                                {draft.transport === 'direct' && (
                                    <label className="block space-y-1.5">
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Base URL
                                        </span>
                                        <input
                                            value={draft.baseUrl}
                                            onChange={event =>
                                                setDraft({
                                                    ...draft,
                                                    baseUrl: event.target.value,
                                                })
                                            }
                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)]"
                                        />
                                        <span className="block text-[10px] text-[var(--text-muted)]">
                                            {preset.description}
                                        </span>
                                    </label>
                                )}

                                {preset.requiresApiKey && draft.transport === 'direct' && (
                                    <label className="block space-y-1.5">
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            API key
                                        </span>
                                        <div className="relative">
                                            <input
                                                type={showKey ? 'text' : 'password'}
                                                value={draft.apiKey}
                                                onChange={event =>
                                                    setDraft({
                                                        ...draft,
                                                        apiKey: event.target.value,
                                                    })
                                                }
                                                placeholder="Stored in this profile when remembered"
                                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pe-10 font-mono text-xs outline-none focus:border-[var(--primary)]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKey(!showKey)}
                                                className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-heading)] cursor-pointer"
                                            >
                                                <i
                                                    className={clsx(
                                                        'ph text-[14px]',
                                                        showKey ? 'ph-eye-slash' : 'ph-eye',
                                                    )}
                                                />
                                            </button>
                                        </div>
                                        <span className="block text-[10px] text-[var(--method-put)]">
                                            Direct mode sends this key from the browser. Use gateway mode for
                                            server-side credentials.
                                        </span>
                                    </label>
                                )}

                                <label className="flex items-start gap-2 rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 p-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                    <input
                                        type="checkbox"
                                        checked={draft.rememberCredentials === true}
                                        onChange={event =>
                                            setDraft({...draft, rememberCredentials: event.target.checked})
                                        }
                                        className="mt-0.5 accent-[var(--primary)]"
                                    />
                                    <span>
                                        <strong className="text-[var(--text-heading)]">
                                            Remember provider/gateway secrets on this device
                                        </strong>
                                        <br />
                                        Off by default: secrets stay in session storage and are removed when the browser
                                        session ends. LocalStorage is not a secure vault.
                                    </span>
                                </label>

                                <div className="space-y-2">
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Skill packs
                                    </span>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {SKILL_OPTIONS.map(skill => {
                                            const active = draft.skillPacks.includes(skill.id);
                                            return (
                                                <button
                                                    key={skill.id}
                                                    type="button"
                                                    onClick={() => toggleSkill(skill.id)}
                                                    className={clsx(
                                                        'rounded-xl border p-3 text-left transition-colors cursor-pointer',
                                                        active
                                                            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                                                            : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface-hover)]',
                                                    )}
                                                >
                                                    <span className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-heading)]">
                                                        <span
                                                            className={clsx(
                                                                'flex size-4 items-center justify-center rounded border text-[10px]',
                                                                active
                                                                    ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-contrast)]'
                                                                    : 'border-[var(--border)] text-transparent',
                                                            )}
                                                        >
                                                            <i className="ph ph-check" />
                                                        </span>
                                                        {skill.label}
                                                    </span>
                                                    <span className="mt-1 block ps-6 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                                        {skill.description}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <label className="block space-y-1.5">
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Additional instructions
                                    </span>
                                    <textarea
                                        value={draft.customInstructions}
                                        onChange={event =>
                                            setDraft({
                                                ...draft,
                                                customInstructions: event.target.value,
                                            })
                                        }
                                        rows={3}
                                        placeholder="Optional instructions for the assistant…"
                                        className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--primary)]"
                                    />
                                </label>
                            </div>
                        </div>
                        <footer className="flex flex-col items-stretch gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <span className="text-[10px] text-[var(--text-muted)]">
                                Changes are saved to the selected profile only after confirmation.
                            </span>
                            <div className="flex shrink-0 justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={requestSave}
                                    className="whitespace-nowrap rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                                >
                                    Save profile
                                </button>
                            </div>
                        </footer>
                    </>
                )}
            </section>

            <ProfileNameModal
                visible={newProfileTransition.shouldRender}
                backdropClassName={newProfileTransition.backdropClassName}
                targetId={profileNameTargetId}
                name={newProfileName}
                onNameChange={setNewProfileName}
                onClose={newProfileTransition.requestClose}
                onSubmit={createProfile}
            />

            <SettingsConfirmModal
                visible={confirmTransition.shouldRender}
                backdropClassName={confirmTransition.backdropClassName}
                kind={confirmAction?.kind || null}
                onClose={confirmTransition.requestClose}
                onConfirm={confirmChanges}
            />
        </div>
    );
}
