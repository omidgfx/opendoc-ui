import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, AIConversation, AISettings, AISourceRef, OpenApiSpec} from '../../types';
import Markdown from '../common/Markdown';
import MethodBadge from '../common/MethodBadge';
import {Tip} from '../common/Tooltip';
import {buildAIContext, buildAISystemPrompt, citationsFromText, stripCitationTokens,} from '../../utils/aiContext';
import {streamAIResponse} from '../../utils/aiProviders';
import {
    actionLabel,
    type OpenDocUIAction,
    parseOpenDocUIActions,
    stripOpenDocUIActionBlocks
} from '../../utils/aiBridge';
import {
    newAIConversation,
    newAIMessage,
    readAIConversations,
    readAIConversationsAsync,
    writeAIConversations
} from '../../utils/aiStorage';

interface AIAssistantViewProps {
    spec: OpenApiSpec;
    parsableKey: string;
    selectedEndpoints: Array<{ path: string; method: string }>;
    selectedServer: string;
    activeAuth: ActiveAuth;
    activeTab: string;
    searchQuery: string;
    settings: AISettings;
    isVisible: boolean;
    onOpenSettings: () => void;
    onClearEndpointContext: () => void;
    onRemoveEndpointContext: (path: string, method: string) => void;
    onOpenEndpoint: (path: string, method: string) => void;
    onOpenRunner: (path: string, method: string) => void;
    onBridgeAction: (action: OpenDocUIAction) => void;
    onResponseFinished: () => void;
}

const sourceFallback = (sources: AISourceRef[], selectedEndpoints: Array<{
    path: string;
    method: string
}>): AISourceRef[] => {
    if (selectedEndpoints.length > 0) {
        const selectedIds = new Set(selectedEndpoints.map(endpoint => `path:${endpoint.method.toUpperCase()}:${endpoint.path}`));
        const exact = sources.filter(source => selectedIds.has(source.id));
        if (exact.length > 0) return exact;
    }
    // Do not invent a source list when the model did not cite one. Unrelated
    // fallback sources are worse than a response with no Sources section.
    return [];
};

const conversationTitle = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || 'New conversation';
};

export default function AIAssistantView({
                                            spec,
                                            parsableKey,
                                            selectedEndpoints,
                                            selectedServer,
                                            activeAuth,
                                            activeTab,
                                            searchQuery,
                                            settings,
                                            isVisible,
                                            onOpenSettings,
                                            onClearEndpointContext,
                                            onRemoveEndpointContext,
                                            onOpenEndpoint,
                                            onOpenRunner,
                                            onBridgeAction,
                                            onResponseFinished,
                                        }: AIAssistantViewProps) {
    const [conversations, setConversations] = useState<AIConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState('');
    const [conversationsLoaded, setConversationsLoaded] = useState(false);
    const [loadedConversationSpecKey, setLoadedConversationSpecKey] = useState('');
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [conversationsOpen, setConversationsOpen] = useState(true);
    const [chatChromeCompact, setChatChromeCompact] = useState(false);
    const chatChromeCompactRef = useRef(false);
    const chromeAdjustingRef = useRef(false);
    const chromeAdjustTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const chatScrollRef = useRef<HTMLDivElement | null>(null);
    const contextScrollRef = useRef<HTMLDivElement | null>(null);
    const previousScrollTopRef = useRef(0);
    const [deleteConfirmation, setDeleteConfirmation] = useState<AIConversation | null>(null);
    const [runnerConfirmation, setRunnerConfirmation] = useState<{ path: string; method: string } | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const streamContentRef = useRef('');
    const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        setConversationsLoaded(false);
        setLoadedConversationSpecKey('');
        const fallback = readAIConversations(parsableKey);
        setConversations(fallback);
        setActiveConversationId(fallback[0]?.id || '');
        setInput('');
        setIsSending(false);
        void readAIConversationsAsync(parsableKey).then(initial => {
            if (cancelled) return;
            setConversations(initial);
            setActiveConversationId(current => initial.some(item => item.id === current) ? current : initial[0]?.id || '');
            setLoadedConversationSpecKey(parsableKey);
            setConversationsLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, [parsableKey]);

    useEffect(() => {
        if (!conversationsLoaded || loadedConversationSpecKey !== parsableKey) return;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        // Conversation writes are checkpointed, not performed for every token.
        persistTimerRef.current = setTimeout(() => {
            writeAIConversations(parsableKey, conversations);
            persistTimerRef.current = null;
        }, 250);
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        };
    }, [parsableKey, conversations, conversationsLoaded, loadedConversationSpecKey]);

    const activeConversation = useMemo(
        () => conversations.find(conversation => conversation.id === activeConversationId) || conversations[0] || null,
        [conversations, activeConversationId],
    );

    useLayoutEffect(() => {
        const element = chatScrollRef.current;
        if (!element || !activeConversation) return;
        // A newly selected/restored conversation opens at its newest message,
        // not at the beginning of a potentially long history.
        element.scrollTop = element.scrollHeight;
    }, [activeConversation?.id]);

    useEffect(() => {
        const element = chatScrollRef.current;
        if (!element || !activeConversation) return;
        element.scrollTo({top: element.scrollHeight, behavior: isSending ? 'smooth' : 'auto'});
    }, [activeConversation?.messages.length, activeConversation?.id, isSending]);

    const setChatChromeMode = (compact: boolean) => {
        if (chatChromeCompactRef.current === compact) return;
        chatChromeCompactRef.current = compact;
        chromeAdjustingRef.current = true;
        setChatChromeCompact(compact);
        if (chromeAdjustTimerRef.current) clearTimeout(chromeAdjustTimerRef.current);
        chromeAdjustTimerRef.current = setTimeout(() => {
            previousScrollTopRef.current = chatScrollRef.current?.scrollTop || 0;
            chromeAdjustingRef.current = false;
            chromeAdjustTimerRef.current = null;
        }, 360);
    };

    const handleContextWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const element = contextScrollRef.current;
        if (!element || element.scrollWidth <= element.clientWidth) return;
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            element.scrollLeft += event.deltaY;
        }
    };

    const handleChatScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const top = event.currentTarget.scrollTop;
        if (chromeAdjustingRef.current) {
            previousScrollTopRef.current = top;
            return;
        }
        const previous = previousScrollTopRef.current;
        const delta = top - previous;
        // React to even a small intentional direction change. The old 2px/24px
        // thresholds made a short upward scroll appear to do nothing, especially
        // after the header height changed at the bottom of the list.
        if (top <= 10 || delta < -0.25) setChatChromeMode(false);
        else if (delta > 0.25 && top > 12) setChatChromeMode(true);
        previousScrollTopRef.current = top;
    };

    useEffect(() => {
        if (!isVisible) return;
        const top = chatScrollRef.current?.scrollTop || 0;
        previousScrollTopRef.current = top;
        if (top <= 10) setChatChromeMode(false);
    }, [isVisible]);

    useEffect(() => () => {
        if (chromeAdjustTimerRef.current) clearTimeout(chromeAdjustTimerRef.current);
        if (streamFlushTimerRef.current) clearTimeout(streamFlushTimerRef.current);
        abortRef.current?.abort();
    }, []);

    const updateConversation = (id: string, updater: (conversation: AIConversation) => AIConversation) => {
        setConversations(current => current.map(conversation => conversation.id === id ? updater(conversation) : conversation));
    };

    const flushStreamContent = (conversationId: string, messageId: string) => {
        if (!streamContentRef.current) return;
        const content = streamContentRef.current;
        streamContentRef.current = '';
        updateConversation(conversationId, current => ({
            ...current,
            messages: current.messages.map(message => message.id === messageId ? {
                ...message,
                content: `${message.content}${content}`
            } : message),
            updatedAt: Date.now(),
        }));
    };

    const queueStreamToken = (conversationId: string, messageId: string, token: string) => {
        streamContentRef.current += token;
        if (streamFlushTimerRef.current) return;
        streamFlushTimerRef.current = setTimeout(() => {
            streamFlushTimerRef.current = null;
            flushStreamContent(conversationId, messageId);
        }, 80);
    };

    const createConversation = () => {
        const next = newAIConversation(parsableKey);
        setConversations(current => [next, ...current]);
        setActiveConversationId(next.id);
        setInput('');
    };

    const deleteConversation = (id: string) => {
        if (id === activeConversationId) {
            abortRef.current?.abort();
            abortRef.current = null;
            setIsSending(false);
        }
        setConversations(current => current.filter(conversation => conversation.id !== id));
        if (id === activeConversationId) setActiveConversationId('');
    };

    const exportConversation = () => {
        if (!activeConversation) return;
        const lines = [
            `# ${activeConversation.title}`,
            '',
            `- Specification: ${spec.info?.title || parsableKey}`,
            `- Context: ${selectedEndpoints.length > 0 ? selectedEndpoints.map(endpoint => `${endpoint.method.toUpperCase()} ${endpoint.path}`).join(', ') : 'Entire API specification'}`,
            '',
        ];
        activeConversation.messages.forEach(message => {
            lines.push(`## ${message.role === 'user' ? 'You' : 'OpenDoc UI'}`);
            lines.push('');
            lines.push(stripCitationTokens(message.content));
            if (message.citations && message.citations.length > 0) {
                lines.push('', '**Sources**', ...message.citations.map(source => `- ${source.label} (${source.id})`));
            }
            lines.push('', '---', '');
        });
        const blob = new Blob([lines.join('\\n')], {type: 'text/markdown;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${activeConversation.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'opendoc-ui-chat'}.md`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const toggleAuthValues = () => {
        if (!activeConversation) return;
        updateConversation(activeConversation.id, conversation => ({
            ...conversation,
            includeAuthValues: !conversation.includeAuthValues,
            updatedAt: Date.now(),
        }));
    };

    const toggleTrustedRunner = () => {
        if (!activeConversation) return;
        updateConversation(activeConversation.id, conversation => ({
            ...conversation,
            trustedRunner: !conversation.trustedRunner,
            updatedAt: Date.now(),
        }));
    };

    const requestRunner = (path: string, method: string) => {
        if (activeConversation?.trustedRunner) onOpenRunner(path, method);
        else setRunnerConfirmation({path, method});
    };

    const sendMessage = async (text = input) => {
        const question = text.trim();
        if (!question || isSending) return;
        const conversation = activeConversation || newAIConversation(parsableKey);
        if (!activeConversation) {
            setConversations(current => current.some(item => item.id === conversation.id) ? current : [conversation, ...current]);
            setActiveConversationId(conversation.id);
        }
        if (!settings.enabled) {
            updateConversation(conversation.id, current => ({
                ...current,
                messages: [...current.messages, newAIMessage('assistant', 'The AI assistant is disabled. Open AI settings to enable it.', true)],
                updatedAt: Date.now(),
            }));
            return;
        }

        const userMessage = newAIMessage('user', question);
        const assistantMessage = newAIMessage('assistant', '');
        const history = [...conversation.messages, userMessage];
        updateConversation(conversation.id, current => ({
            ...current,
            title: current.messages.length === 0 ? conversationTitle(question) : current.title,
            messages: [...current.messages, userMessage, assistantMessage],
            updatedAt: Date.now(),
        }));
        setInput('');
        setIsSending(true);
        const controller = new AbortController();
        abortRef.current = controller;
        streamContentRef.current = '';
        if (streamFlushTimerRef.current) {
            clearTimeout(streamFlushTimerRef.current);
            streamFlushTimerRef.current = null;
        }

        const context = buildAIContext({
            spec,
            specKey: parsableKey,
            selectedEndpoints,
            selectedServer,
            activeTab,
            searchQuery,
            activeAuthScheme: activeAuth.activeScheme,
            includeAuthValues: conversation.includeAuthValues,
            auth: activeAuth,
        });
        const system = buildAISystemPrompt(settings, context);
        const requestMessages = [
            {role: 'system' as const, content: system},
            ...history.slice(-20).map(message => ({role: message.role, content: message.content})),
        ];

        try {
            const full = await streamAIResponse(settings, requestMessages, {
                signal: controller.signal,
                onToken: token => queueStreamToken(conversation.id, assistantMessage.id, token),
            });
            if (streamFlushTimerRef.current) {
                clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
            }
            flushStreamContent(conversation.id, assistantMessage.id);
            const citations = citationsFromText(full, context.sources);
            const fallback = citations.length > 0 ? citations : sourceFallback(context.sources, selectedEndpoints);
            updateConversation(conversation.id, current => ({
                ...current,
                messages: current.messages.map(message => message.id === assistantMessage.id
                    ? {...message, content: full || 'The provider returned an empty response.', citations: fallback}
                    : message),
                updatedAt: Date.now(),
            }));
        } catch (error) {
            if (streamFlushTimerRef.current) {
                clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
            }
            flushStreamContent(conversation.id, assistantMessage.id);
            if ((error as Error)?.name !== 'AbortError') {
                updateConversation(conversation.id, current => ({
                    ...current,
                    messages: current.messages.map(message => message.id === assistantMessage.id
                        ? {
                            ...message,
                            content: error instanceof Error ? error.message : 'The AI request failed.',
                            isError: true
                        }
                        : message),
                    updatedAt: Date.now(),
                }));
            }
        } finally {
            abortRef.current = null;
            setIsSending(false);
            onResponseFinished();
        }
    };

    const stopMessage = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsSending(false);
    };

    const configured = settings.transport === 'gateway'
        ? Boolean(settings.gatewayUrl.trim() && settings.model.trim())
        : Boolean(settings.model.trim() && (settings.provider === 'ollama' || settings.provider === 'custom' || settings.apiKey.trim()));
    const primaryEndpoint = selectedEndpoints[0] || null;
    const currentOperation = primaryEndpoint
        ? (spec.paths[primaryEndpoint.path] as any)?.[primaryEndpoint.method]
        : null;
    const suggestions = primaryEndpoint
        ? ['Explain this endpoint', 'List its parameters and examples', 'What responses and errors can it return?', 'Prepare a request for the API Runner']
        : ['Give me a tour of this API', 'How does authentication work?', 'Find the main resources and workflows', 'What common errors should I handle?'];

    const renderActions = (text: string) => {
        const actions = parseOpenDocUIActions(text);
        if (actions.length === 0) return null;
        return (
            <div className="mt-3 space-y-2 border-t border-[var(--border)]/70 pt-2.5">
                <div
                    className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                    <i className="ph ph-lightning text-[12px] text-[var(--primary)]"/>OpenDoc UI actions
                </div>
                {actions.map((action, index) => (
                    <button key={`${action.action}-${index}`} type="button" onClick={() => onBridgeAction(action)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-3 py-2 text-left text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer">
                        <span className="min-w-0 truncate">{actionLabel(action)}</span><i
                        className="ph ph-arrow-up-right shrink-0 text-[13px]"/>
                    </button>
                ))}
                <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">Actions are proposals. Clicking one
                    is required; filling Runner fields does not send a request unless you explicitly choose a Run
                    action.</p>
            </div>
        );
    };

    const renderCitations = (citations?: AISourceRef[]) => {
        if (!citations || citations.length === 0) return null;
        return (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border)]/70 pt-2.5">
                <span
                    className="me-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]"><i
                    className="ph ph-quotes text-[12px]"/>Sources</span>
                {citations.map(source => (
                    <button key={source.id} type="button"
                            onClick={() => source.kind === 'endpoint' && source.path && source.method && onOpenEndpoint(source.path, source.method.toLowerCase())}
                            className={clsx('rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)] transition-colors', source.kind === 'endpoint' ? 'cursor-pointer hover:border-[var(--primary)]/50 hover:text-[var(--primary)]' : 'cursor-default')}>
                        {source.label}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-[var(--surface)]">
            <aside
                className={clsx('hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--background)] transition-all duration-300 md:flex', conversationsOpen ? 'w-64 opacity-100' : 'w-0 overflow-hidden border-r-0 opacity-0')}>
                <div
                    className="flex h-14 min-h-14 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
                    <span
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]"><i
                        className="ph-fill ph-chats-circle text-[15px] text-[var(--primary)]"/>Conversations</span>
                    <Tip content="New conversation">
                        <button type="button" onClick={createConversation}
                                className="flex size-7 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer">
                            <i className="ph ph-plus text-[14px]"/></button>
                    </Tip>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
                    {conversations.length === 0 &&
                        <p className="px-2 py-4 text-[10px] leading-relaxed text-[var(--text-muted)]">No saved
                            conversations. Use the plus button or start typing below.</p>}
                    {conversations.map(conversation => (
                        <button key={conversation.id} type="button"
                                onClick={() => setActiveConversationId(conversation.id)}
                                className={clsx('group mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer', conversation.id === activeConversation?.id ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]')}>
                            <i className="ph ph-chat-teardrop-text shrink-0 text-[14px]"/>
                            <span
                                className="min-w-0 flex-1 truncate text-[11px] font-semibold">{conversation.title}</span>
                            <span role="button" tabIndex={0} aria-label={`Remove ${conversation.title}`}
                                  onClick={event => {
                                      event.stopPropagation();
                                      setDeleteConfirmation(conversation);
                                  }} onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDeleteConfirmation(conversation);
                                }
                            }}
                                  className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"><i
                                className="ph ph-x text-[10px]"/></span>
                        </button>
                    ))}
                </div>
                <div
                    className="h-[76px] min-h-[76px] box-border flex flex-col justify-center gap-1 border-t border-[var(--border)] bg-[var(--surface)] px-3">
                    <div className="flex h-6 min-h-6 items-center justify-between gap-2 leading-[12px]">
                        <span
                            className="truncate text-[9px] font-black uppercase leading-[12px] tracking-wider text-[var(--text-muted)]">Assistant
                            profile</span>
                        <Tip content="AI settings">
                            <button type="button" onClick={onOpenSettings}
                                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer">
                                <i className="ph ph-gear-six text-[12px]"/></button>
                        </Tip>
                    </div>
                    <div
                        className="h-[14px] min-h-[14px] truncate text-[10px] font-bold leading-[14px] text-[var(--text-heading)]">{settings.provider}</div>
                    <div
                        className="h-[13px] min-h-[13px] truncate font-mono text-[9px] leading-[13px] text-[var(--text-muted)]"
                        title={settings.model || 'No model selected'}>{settings.model || 'No model selected'}</div>
                </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
                <header
                    className={clsx('flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-[var(--border)] bg-[var(--background)] px-3 transition-all duration-300 sm:px-5', chatChromeCompact ? 'h-0 border-b-0 py-0 opacity-0 pointer-events-none' : 'h-14 opacity-100')}>
                    <div className="flex min-w-0 items-center gap-2">
                        <button type="button" onClick={() => setConversationsOpen(open => !open)}
                                className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] md:flex"
                                aria-label={conversationsOpen ? 'Collapse conversations' : 'Expand conversations'}>
                            <i className={clsx('ph text-[15px] transition-transform', conversationsOpen ? 'ph-sidebar-simple' : 'ph-list')}/>
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2"><i
                                className="ph-fill ph-sparkle text-[17px] text-[var(--primary)]"/><h1
                                className="truncate text-sm font-extrabold text-[var(--text-heading)]">OpenDoc UI</h1>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{activeConversation?.title || 'Ask about this API'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {activeConversation && activeConversation.messages.length > 0 &&
                            <Tip content="Export conversation as Markdown">
                                <button type="button" onClick={exportConversation}
                                        className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer">
                                    <i className="ph ph-download-simple text-[14px]"/></button>
                            </Tip>}
                        <Tip content="AI settings">
                            <button type="button" onClick={onOpenSettings}
                                    className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer md:hidden">
                                <i className="ph ph-gear-six text-[14px]"/></button>
                        </Tip>
                        <Tip content="New conversation">
                            <button type="button" onClick={createConversation}
                                    className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer">
                                <i className="ph ph-plus text-[14px]"/></button>
                        </Tip>
                    </div>
                </header>

                <div
                    className={clsx('flex shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-[var(--border)] px-3 transition-all duration-300 sm:px-5', chatChromeCompact ? 'h-10 py-1' : 'h-[62px] py-2')}>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <i className="ph ph-crosshair shrink-0 text-[14px] text-[var(--primary)]"/>
                        <div className="min-w-0 flex-1">
                            <div
                                className={clsx('text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] transition-opacity duration-200', chatChromeCompact ? 'hidden' : 'block')}>Conversation
                                context
                            </div>
                            {selectedEndpoints.length > 0 ? (
                                <div ref={contextScrollRef} onWheel={handleContextWheel}
                                     className={clsx('flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto whitespace-nowrap overscroll-x-contain scrollbar-thin touch-pan-x', chatChromeCompact ? 'mt-0' : 'mt-1')}>
                                    {selectedEndpoints.map(endpoint => (
                                        <span key={`${endpoint.method}:${endpoint.path}`}
                                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-1.5 py-1">
                                            <MethodBadge method={endpoint.method} size="xs" className="shrink-0"/>
                                            <code
                                                className="max-w-[220px] truncate font-mono text-[9px] text-[var(--text-heading)]">{endpoint.path}</code>
                                            <button type="button"
                                                    onClick={() => onRemoveEndpointContext(endpoint.path, endpoint.method)}
                                                    className="flex size-3.5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                                    aria-label={`Remove ${endpoint.method.toUpperCase()} ${endpoint.path} from context`}>
                                                <i className="ph ph-x text-[9px]"/></button>
                                        </span>
                                    ))}
                                    <button type="button" onClick={onClearEndpointContext}
                                            className="shrink-0 rounded-md px-1.5 py-1 text-[9px] font-bold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--method-delete)] cursor-pointer">Clear
                                        all
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className={clsx('truncate text-[10px] font-semibold text-[var(--text-heading)]', chatChromeCompact ? 'mt-0' : 'mt-1')}>Entire
                                    API specification</div>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {activeConversation && <>
                            <button type="button" onClick={toggleAuthValues}
                                    className={clsx('rounded-lg border px-2 py-1 text-[9px] font-bold cursor-pointer', activeConversation.includeAuthValues ? 'border-[var(--method-delete)]/40 bg-[var(--method-delete)]/10 text-[var(--method-delete)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                <i className="ph ph-lock-key me-1"/>{activeConversation.includeAuthValues ? 'Auth enabled' : 'Auth redacted'}
                            </button>
                            <button type="button" onClick={toggleTrustedRunner}
                                    className={clsx('rounded-lg border px-2 py-1 text-[9px] font-bold cursor-pointer', activeConversation.trustedRunner ? 'border-[var(--method-put)]/40 bg-[var(--method-put)]/10 text-[var(--method-put)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                                <i className="ph ph-flask me-1"/>{activeConversation.trustedRunner ? 'Trusted' : 'Confirm'}
                            </button>
                        </>}
                    </div>
                </div>
                <div ref={chatScrollRef} onScroll={handleChatScroll}
                     className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-8 scrollbar-thin">
                    {!activeConversation || activeConversation.messages.length === 0 ? (
                        <div
                            className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center text-center">
                            <span
                                className="flex size-16 items-center justify-center rounded-3xl border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]"><i
                                className="ph-fill ph-sparkle text-[30px]"/></span>
                            <h2 className="mt-5 text-xl font-extrabold text-[var(--text-heading)]">{primaryEndpoint ? `Ask about ${primaryEndpoint.method.toUpperCase()} ${primaryEndpoint.path}` : 'Ask anything about this API'}</h2>
                            <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">{primaryEndpoint ? `I’m focused on ${currentOperation?.summary || primaryEndpoint.path}. Ask about its parameters, responses, auth, examples, or how to call it.` : 'I can explain endpoints, schemas, auth flows, errors, workflows, and request examples using retrieved current specification context. Answers include OpenAPI source references.'}</p>
                            {!configured && <button type="button" onClick={onOpenSettings}
                                                    className="mt-4 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-2 text-[11px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/15 cursor-pointer">
                                <i className="ph ph-sliders-horizontal me-1"/>Configure a provider</button>}
                            <div className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                                {suggestions.map(suggestion => <button key={suggestion} type="button"
                                                                       onClick={() => sendMessage(suggestion)}
                                                                       className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--text)] hover:border-[var(--primary)]/40 hover:bg-[var(--surface-hover)] cursor-pointer">
                                    <i className="ph ph-arrow-up-right me-1.5 text-[var(--primary)]"/>{suggestion}
                                </button>)}
                            </div>
                            {primaryEndpoint && <button type="button"
                                                        onClick={() => requestRunner(primaryEndpoint.path, primaryEndpoint.method)}
                                                        className="mt-3 rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 px-3 py-2 text-[11px] font-bold text-[var(--method-put)] hover:bg-[var(--method-put)]/10 cursor-pointer">
                                <i className="ph ph-flask me-1.5"/>Prepare {primaryEndpoint.method.toUpperCase()} {primaryEndpoint.path} in
                                API Runner</button>}
                        </div>
                    ) : (
                        <div className="mx-auto max-w-3xl space-y-5">
                            {activeConversation.messages.map(message => (
                                <div key={message.id}
                                     className={clsx('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                                    {message.role === 'assistant' && <span
                                        className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]"><i
                                        className="ph-fill ph-sparkle text-[14px]"/></span>}
                                    <div
                                        className={clsx('max-w-[min(88%,760px)] rounded-2xl border px-4 py-3', message.role === 'user' ? 'border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--text-heading)]' : message.isError ? 'border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5' : 'border-[var(--border)] bg-[var(--background)]')}>
                                        {message.role === 'assistant'
                                            ? message.content
                                                ? <Markdown
                                                    text={stripOpenDocUIActionBlocks(stripCitationTokens(message.content))}
                                                    className="text-[12px] leading-relaxed"/>
                                                : isSending
                                                    ? <div
                                                        className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                                                        <i className="ph ph-spinner animate-spin text-[var(--primary)]"/>Thinking
                                                        from the specification…</div>
                                                    : <span className="text-[11px] text-[var(--text-muted)]">No response
                                                        content.</span>
                                            :
                                            <p className="whitespace-pre-wrap text-xs leading-relaxed">{message.content}</p>}
                                        {message.role === 'assistant' && renderCitations(message.citations)}
                                        {message.role === 'assistant' && renderActions(message.content)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <footer
                    className="h-[76px] min-h-[76px] box-border flex items-center border-t border-[var(--border)] bg-[var(--background)] px-3 py-3 sm:px-5">
                    <div
                        className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 focus-within:border-[var(--primary)]/60">
                        <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                void sendMessage();
                            }
                        }} rows={2} placeholder="Ask about endpoints, schemas, auth, errors, or API workflows…"
                                  className="min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1.5 text-xs outline-none"
                                  disabled={isSending}/>
                        {isSending ? <button type="button" onClick={stopMessage}
                                             className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--method-delete)] text-[var(--method-delete-contrast)] hover:brightness-110 cursor-pointer">
                                <i className="ph ph-stop text-[15px]"/></button> :
                            <button type="button" onClick={() => void sendMessage()} disabled={!input.trim()}
                                    className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                <i className="ph ph-paper-plane-tilt text-[15px]"/></button>}
                    </div>
                </footer>
            </section>

            {deleteConfirmation && (
                <div
                    className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) setDeleteConfirmation(null);
                    }}>
                    <div
                        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
                        <div className="flex gap-3"><span
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-delete)]/10 text-[var(--method-delete)]"><i
                            className="ph ph-trash text-[18px]"/></span>
                            <div><h3 className="text-sm font-extrabold text-[var(--text-heading)]">Delete
                                conversation?</h3><p
                                className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">“{deleteConfirmation.title}”
                                and all of its saved messages will be removed from this specification.</p></div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" onClick={() => setDeleteConfirmation(null)}
                                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--surface-hover)] cursor-pointer">Cancel
                            </button>
                            <button type="button" onClick={() => {
                                deleteConversation(deleteConfirmation.id);
                                setDeleteConfirmation(null);
                            }}
                                    className="rounded-xl bg-[var(--method-delete)] px-3 py-2 text-[11px] font-bold text-[var(--method-delete-contrast)] hover:brightness-110 cursor-pointer">Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {runnerConfirmation && (
                <div
                    className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) setRunnerConfirmation(null);
                    }}>
                    <div
                        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
                        <div className="flex gap-3"><span
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-put)]/10 text-[var(--method-put)]"><i
                            className="ph ph-flask text-[18px]"/></span>
                            <div><h3 className="text-sm font-extrabold text-[var(--text-heading)]">Prepare API
                                Runner?</h3><p
                                className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">This opens the
                                existing Runner
                                for <strong>{runnerConfirmation.method.toUpperCase()} {runnerConfirmation.path}</strong>.
                                No request will be sent until you press Run.</p></div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" onClick={() => setRunnerConfirmation(null)}
                                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--surface-hover)] cursor-pointer">Cancel
                            </button>
                            <button type="button" onClick={() => {
                                onOpenRunner(runnerConfirmation.path, runnerConfirmation.method);
                                setRunnerConfirmation(null);
                            }}
                                    className="rounded-xl bg-[var(--primary)] px-3 py-2 text-[11px] font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer">Open
                                Runner
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
