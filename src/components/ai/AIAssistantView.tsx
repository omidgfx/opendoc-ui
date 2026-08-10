import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, AIConversation, AISettings, AISourceRef, OpenApiSpec} from '../../types';
import Markdown from '../common/Markdown';
import MethodBadge from '../common/MethodBadge';
import {Tip} from '../common/Tooltip';
import PermissionSwitch from './assistant/PermissionSwitch';
import AssistantActions from './assistant/AssistantActions';
import AssistantCitations from './assistant/AssistantCitations';
import AIProfileRequiredState from './assistant/AIProfileRequiredState';
import MobileConversationsModal from './assistant/MobileConversationsModal';
import AssistantConfirmModals from './assistant/AssistantConfirmModals';
import ConversationSidebar from './assistant/ConversationSidebar';
import {useModalTransition} from '../../hooks/useModalTransition';
import {useBreakpoint} from '../../hooks/useBreakpoint';
import {buildAIContext, buildAISystemPrompt, citationsFromText, stripCitationTokens} from '../../utils/aiContext';
import {getOperation} from '../../utils/openapi';
import {streamAIResponse} from '../../utils/aiProviders';
import {
    createOpenDocUIActionId,
    formatOpenDocUIRunnerResult,
    OPENDOC_UI_RUNNER_RESULT_EVENT,
    type OpenDocUIAction,
    type OpenDocUIRunnerResult,
    stripOpenDocUIActionBlocks,
} from '../../utils/aiBridge';
import {
    newAIConversation,
    newAIMessage,
    readAIConversations,
    readAIConversationsAsync,
    writeAIConversations,
} from '../../utils/aiStorage';

interface AIAssistantViewProps {
    spec: OpenApiSpec;
    parsableKey: string;
    selectedEndpoints: Array<{
        path: string;
        method: string;
    }>;
    selectedServer: string;
    activeAuth: ActiveAuth;
    activeTab: string;
    searchQuery: string;
    settings: AISettings;
    hasAIProfile: boolean;
    isVisible: boolean;
    newConversationRequest?: {
        id: string;
        path: string;
        method: string;
    } | null;
    onNewConversationRequestHandled?: (id: string) => void;
    onOpenSettings: () => void;
    onClearEndpointContext: () => void;
    onRemoveEndpointContext: (path: string, method: string) => void;
    onOpenEndpoint: (path: string, method: string) => void;
    onOpenRunner: (path: string, method: string) => void;
    onBridgeAction: (action: OpenDocUIAction) => void;
    onResponseFinished: () => void;
}

const sourceFallback = (
    sources: AISourceRef[],
    selectedEndpoints: Array<{
        path: string;
        method: string;
    }>,
): AISourceRef[] => {
    if (selectedEndpoints.length > 0) {
        const selectedIds = new Set(
            selectedEndpoints.map(endpoint => `path:${endpoint.method.toUpperCase()}:${endpoint.path}`),
        );
        const exact = sources.filter(source => selectedIds.has(source.id));
        if (exact.length > 0) return exact;
    }
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
    hasAIProfile,
    isVisible,
    newConversationRequest,
    onNewConversationRequestHandled,
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
    const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
    const isCompactLayout = useBreakpoint() !== 'desktop';
    const mobileConversationsTransition = useModalTransition(mobileConversationsOpen, () =>
        setMobileConversationsOpen(false),
    );
    const [chatChromeCompact, setChatChromeCompact] = useState(false);
    const chatChromeCompactRef = useRef(false);
    const chromeAdjustingRef = useRef(false);
    const chromeAdjustTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const chatScrollRef = useRef<HTMLDivElement | null>(null);
    const contextScrollRef = useRef<HTMLDivElement | null>(null);
    const previousScrollTopRef = useRef(0);
    const handledNewConversationRequestRef = useRef('');
    const [deleteConfirmation, setDeleteConfirmation] = useState<AIConversation | null>(null);
    const [runnerConfirmation, setRunnerConfirmation] = useState<{
        path: string;
        method: string;
    } | null>(null);
    const [permissionsOpen, setPermissionsOpen] = useState(false);
    const permissionsTransition = useModalTransition(permissionsOpen, () => setPermissionsOpen(false));
    const deleteTransition = useModalTransition(!!deleteConfirmation, () => setDeleteConfirmation(null));
    const runnerTransition = useModalTransition(!!runnerConfirmation, () => setRunnerConfirmation(null));
    const abortRef = useRef<AbortController | null>(null);
    const streamContentRef = useRef('');
    const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const renderedSpecKeyRef = useRef(parsableKey);
    renderedSpecKeyRef.current = parsableKey;
    const latestPersistenceRef = useRef({
        specKey: parsableKey,
        conversations,
        ready: conversationsLoaded && loadedConversationSpecKey === parsableKey,
    });
    latestPersistenceRef.current = {
        specKey: parsableKey,
        conversations,
        ready: conversationsLoaded && loadedConversationSpecKey === parsableKey,
    };
    const pendingBridgeConversationsRef = useRef(new Map<string, string>());
    const completedBridgeActionsRef = useRef(new Set<string>());
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
            setActiveConversationId(current =>
                initial.some(item => item.id === current) ? current : initial[0]?.id || '',
            );
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
        persistTimerRef.current = setTimeout(() => {
            writeAIConversations(parsableKey, conversations);
            persistTimerRef.current = null;
        }, 250);
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
            if (renderedSpecKeyRef.current !== parsableKey) {
                writeAIConversations(parsableKey, conversations);
            }
        };
    }, [parsableKey, conversations, conversationsLoaded, loadedConversationSpecKey]);
    useEffect(() => {
        const flushLatest = () => {
            const latest = latestPersistenceRef.current;
            if (latest.ready) writeAIConversations(latest.specKey, latest.conversations);
        };
        window.addEventListener('pagehide', flushLatest);
        return () => {
            window.removeEventListener('pagehide', flushLatest);
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
            flushLatest();
        };
    }, []);
    const activeConversation = useMemo(
        () => conversations.find(conversation => conversation.id === activeConversationId) || conversations[0] || null,
        [conversations, activeConversationId],
    );
    useLayoutEffect(() => {
        const element = chatScrollRef.current;
        if (!element || !activeConversation) return;
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
        previousScrollTopRef.current = event.currentTarget.scrollTop;
    };
    useEffect(() => {
        if (!isVisible) return;
        const top = chatScrollRef.current?.scrollTop || 0;
        previousScrollTopRef.current = top;
        if (top <= 10) setChatChromeMode(false);
    }, [isVisible]);
    useEffect(
        () => () => {
            if (chromeAdjustTimerRef.current) clearTimeout(chromeAdjustTimerRef.current);
            if (streamFlushTimerRef.current) clearTimeout(streamFlushTimerRef.current);
            abortRef.current?.abort();
        },
        [],
    );
    const updateConversation = (id: string, updater: (conversation: AIConversation) => AIConversation) => {
        setConversations(current =>
            current.map(conversation => (conversation.id === id ? updater(conversation) : conversation)),
        );
    };
    useEffect(() => {
        const handleRunnerResult = (event: Event) => {
            const payload = (event as CustomEvent<OpenDocUIRunnerResult>).detail;
            if (!payload?.actionId || !payload.result || (payload.specKey && payload.specKey !== parsableKey)) return;
            if (completedBridgeActionsRef.current.has(payload.actionId)) return;
            const conversationId = pendingBridgeConversationsRef.current.get(payload.actionId);
            if (!conversationId) return;
            pendingBridgeConversationsRef.current.delete(payload.actionId);
            completedBridgeActionsRef.current.add(payload.actionId);
            if (completedBridgeActionsRef.current.size > 256) {
                const oldest = completedBridgeActionsRef.current.values().next().value;
                if (oldest) completedBridgeActionsRef.current.delete(oldest);
            }
            const content = formatOpenDocUIRunnerResult(payload);
            updateConversation(conversationId, conversation => ({
                ...conversation,
                messages: [
                    ...conversation.messages,
                    newAIMessage('assistant', content, Boolean(payload.result.errorKind)),
                ],
                updatedAt: Date.now(),
            }));
        };
        window.addEventListener(OPENDOC_UI_RUNNER_RESULT_EVENT, handleRunnerResult);
        return () => window.removeEventListener(OPENDOC_UI_RUNNER_RESULT_EVENT, handleRunnerResult);
    }, [parsableKey]);
    const flushStreamContent = (conversationId: string, messageId: string) => {
        if (!streamContentRef.current) return;
        const content = streamContentRef.current;
        streamContentRef.current = '';
        updateConversation(conversationId, current => ({
            ...current,
            messages: current.messages.map(message =>
                message.id === messageId
                    ? {
                          ...message,
                          content: `${message.content}${content}`,
                      }
                    : message,
            ),
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
    useEffect(() => {
        if (
            !newConversationRequest ||
            !isVisible ||
            !conversationsLoaded ||
            loadedConversationSpecKey !== parsableKey ||
            handledNewConversationRequestRef.current === newConversationRequest.id
        ) {
            return;
        }
        handledNewConversationRequestRef.current = newConversationRequest.id;
        const next = newAIConversation(parsableKey);
        setConversations(current => [next, ...current]);
        setActiveConversationId(next.id);
        setInput('');
        onNewConversationRequestHandled?.(newConversationRequest.id);
    }, [
        conversationsLoaded,
        isVisible,
        loadedConversationSpecKey,
        newConversationRequest,
        onNewConversationRequestHandled,
        parsableKey,
    ]);
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
        if (!hasAIProfile) {
            onOpenSettings();
            return;
        }
        const question = text.trim();
        if (!question || isSending) return;
        const conversation = activeConversation || newAIConversation(parsableKey);
        if (!activeConversation) {
            setConversations(current =>
                current.some(item => item.id === conversation.id) ? current : [conversation, ...current],
            );
            setActiveConversationId(conversation.id);
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
                messages: current.messages.map(message =>
                    message.id === assistantMessage.id
                        ? {...message, content: full || 'The provider returned an empty response.', citations: fallback}
                        : message,
                ),
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
                    messages: current.messages.map(message =>
                        message.id === assistantMessage.id
                            ? {
                                  ...message,
                                  content: error instanceof Error ? error.message : 'The AI request failed.',
                                  isError: true,
                              }
                            : message,
                    ),
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
    if (!hasAIProfile) return <AIProfileRequiredState onOpenSettings={onOpenSettings} />;
    const configured =
        settings.transport === 'gateway'
            ? Boolean(settings.gatewayUrl.trim() && settings.model.trim())
            : Boolean(
                  settings.model.trim() &&
                  (settings.provider === 'ollama' || settings.provider === 'custom' || settings.apiKey.trim()),
              );
    const primaryEndpoint = selectedEndpoints[0] || null;
    const currentOperation = primaryEndpoint ? getOperation(spec, primaryEndpoint.path, primaryEndpoint.method) : null;
    const suggestions = primaryEndpoint
        ? [
              'Explain this endpoint',
              'List its parameters and examples',
              'What responses and errors can it return?',
              'Prepare a request for the API Runner',
          ]
        : [
              'Give me a tour of this API',
              'How does authentication work?',
              'Find the main resources and workflows',
              'What common errors should I handle?',
          ];
    const executeBridgeAction = (action: OpenDocUIAction) => {
        const actionId = action.id || createOpenDocUIActionId();
        const prepared = {...action, id: actionId} as OpenDocUIAction;
        if (activeConversation?.id) pendingBridgeConversationsRef.current.set(actionId, activeConversation.id);
        onBridgeAction(prepared);
    };
    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-[var(--surface)]">
            <MobileConversationsModal
                visible={mobileConversationsTransition.shouldRender}
                backdropClassName={mobileConversationsTransition.backdropClassName}
                conversations={conversations}
                activeId={activeConversation?.id}
                onClose={mobileConversationsTransition.requestClose}
                onCreate={() => {
                    createConversation();
                    mobileConversationsTransition.requestClose();
                }}
                onSelect={id => {
                    setActiveConversationId(id);
                    mobileConversationsTransition.requestClose();
                }}
                onDelete={setDeleteConfirmation}
            />
            <ConversationSidebar
                open={conversationsOpen}
                conversations={conversations}
                activeId={activeConversation?.id}
                settings={settings}
                onCreate={createConversation}
                onSelect={setActiveConversationId}
                onDelete={setDeleteConfirmation}
                onOpenSettings={onOpenSettings}
            />

            <section className="flex min-w-0 flex-1 flex-col">
                <header
                    className={clsx(
                        'flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-[var(--border)] bg-[var(--background)] px-3 transition-all duration-300 sm:px-5',
                        chatChromeCompact ? 'h-0 border-b-0 py-0 opacity-0 pointer-events-none' : 'h-14 opacity-100',
                    )}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                isCompactLayout ? setMobileConversationsOpen(true) : setConversationsOpen(open => !open)
                            }
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] md:flex"
                            aria-label={conversationsOpen ? 'Collapse conversations' : 'Expand conversations'}
                        >
                            <i
                                className={clsx(
                                    'ph text-[15px] transition-transform',
                                    isCompactLayout
                                        ? 'ph-chats-circle'
                                        : conversationsOpen
                                          ? 'ph-sidebar-simple'
                                          : 'ph-list',
                                )}
                            />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <i className="ph-fill ph-sparkle text-[17px] text-[var(--primary)]" />
                                <h1 className="truncate text-sm font-extrabold text-[var(--text-heading)]">
                                    OpenDoc UI
                                </h1>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                                {activeConversation?.title || 'Ask about this API'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {activeConversation && activeConversation.messages.length > 0 && (
                            <Tip content="Export conversation as Markdown">
                                <button
                                    type="button"
                                    onClick={exportConversation}
                                    className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                                >
                                    <i className="ph ph-download-simple text-[14px]" />
                                </button>
                            </Tip>
                        )}
                        <Tip content="AI settings">
                            <button
                                type="button"
                                onClick={onOpenSettings}
                                className={clsx(
                                    'flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer',
                                    conversationsOpen ? 'md:hidden' : 'md:flex',
                                )}
                            >
                                <i className="ph ph-gear-six text-[14px]" />
                            </button>
                        </Tip>
                        <Tip content="New conversation">
                            <button
                                type="button"
                                onClick={createConversation}
                                className={clsx(
                                    'flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer',
                                    conversationsOpen ? 'md:hidden' : 'md:flex',
                                )}
                            >
                                <i className="ph ph-plus text-[14px]" />
                            </button>
                        </Tip>
                    </div>
                </header>

                <div
                    className={clsx(
                        'flex shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-[var(--border)] px-3 transition-all duration-300 sm:px-5',
                        chatChromeCompact ? 'h-10 py-1' : 'h-[62px] py-2',
                    )}
                >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <i className="ph ph-crosshair shrink-0 text-[14px] text-[var(--primary)]" />
                        <div className="min-w-0 flex-1">
                            <div
                                className={clsx(
                                    'text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] transition-opacity duration-200',
                                    chatChromeCompact ? 'hidden' : 'block',
                                )}
                            >
                                Conversation context
                            </div>
                            {selectedEndpoints.length > 0 ? (
                                <div
                                    ref={contextScrollRef}
                                    onWheel={handleContextWheel}
                                    className={clsx(
                                        'flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto whitespace-nowrap overscroll-x-contain scrollbar-thin touch-pan-x',
                                        chatChromeCompact ? 'mt-0' : 'mt-1',
                                    )}
                                >
                                    {selectedEndpoints.map(endpoint => (
                                        <span
                                            key={`${endpoint.method}:${endpoint.path}`}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-1.5 py-1"
                                        >
                                            <MethodBadge method={endpoint.method} size="xs" className="shrink-0" />
                                            <code className="max-w-[220px] truncate font-mono text-[9px] text-[var(--text-heading)]">
                                                {endpoint.path}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={() => onRemoveEndpointContext(endpoint.path, endpoint.method)}
                                                className="flex size-3.5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer"
                                                aria-label={`Remove ${endpoint.method.toUpperCase()} ${endpoint.path} from context`}
                                            >
                                                <i className="ph ph-x text-[9px]" />
                                            </button>
                                        </span>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={onClearEndpointContext}
                                        className="shrink-0 rounded-md px-1.5 py-1 text-[9px] font-bold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--method-delete)] cursor-pointer"
                                    >
                                        Clear all
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className={clsx(
                                        'truncate text-[10px] font-semibold text-[var(--text-heading)]',
                                        chatChromeCompact ? 'mt-0' : 'mt-1',
                                    )}
                                >
                                    Entire API specification
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="ms-auto flex shrink-0 items-center gap-1.5">
                        {activeConversation && (
                            <button
                                type="button"
                                onClick={() => setPermissionsOpen(true)}
                                className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-1.5 text-[9px] font-bold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer sm:px-2"
                            >
                                <i className="ph ph-shield-check text-[13px]" />
                                <span className="hidden sm:inline">Permissions</span>
                                <span
                                    className={clsx(
                                        'flex size-6 items-center justify-center rounded-md border sm:h-auto sm:w-auto sm:px-1.5 sm:py-0.5',
                                        activeConversation.includeAuthValues
                                            ? 'border-[var(--method-delete)]/30 bg-[var(--method-delete)]/10 text-[var(--method-delete)]'
                                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
                                    )}
                                    title={
                                        activeConversation.includeAuthValues
                                            ? 'Authentication values visible'
                                            : 'Authentication values protected'
                                    }
                                >
                                    <i
                                        className={
                                            activeConversation.includeAuthValues
                                                ? 'ph ph-lock-key-open sm:hidden'
                                                : 'ph ph-lock-key sm:hidden'
                                        }
                                    />
                                    <span className="hidden sm:inline">
                                        {activeConversation.includeAuthValues ? 'Auth visible' : 'Protected'}
                                    </span>
                                </span>
                                <span
                                    className={clsx(
                                        'flex size-6 items-center justify-center rounded-md border sm:h-auto sm:w-auto sm:px-1.5 sm:py-0.5',
                                        activeConversation.trustedRunner
                                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                                            : 'border-sky-500/30 bg-sky-500/10 text-sky-500',
                                    )}
                                    title={
                                        activeConversation.trustedRunner
                                            ? 'Runner preparation trusted'
                                            : 'Runner preparation requires review'
                                    }
                                >
                                    <i
                                        className={
                                            activeConversation.trustedRunner
                                                ? 'ph ph-check-circle sm:hidden'
                                                : 'ph ph-eye sm:hidden'
                                        }
                                    />
                                    <span className="hidden sm:inline">
                                        {activeConversation.trustedRunner ? 'Trusted' : 'Review'}
                                    </span>
                                </span>
                            </button>
                        )}
                        <Tip content={chatChromeCompact ? 'Expand chat headers' : 'Compact chat headers'}>
                            <button
                                type="button"
                                onClick={() => setChatChromeMode(!chatChromeCompact)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                                aria-label={chatChromeCompact ? 'Expand chat headers' : 'Compact chat headers'}
                            >
                                <i className={chatChromeCompact ? 'ph ph-caret-down' : 'ph ph-caret-up'} />
                            </button>
                        </Tip>
                    </div>
                </div>
                <div
                    ref={chatScrollRef}
                    onScroll={handleChatScroll}
                    className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-8 scrollbar-thin"
                >
                    {!activeConversation || activeConversation.messages.length === 0 ? (
                        <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center text-center">
                            <span className="flex size-16 items-center justify-center rounded-3xl border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]">
                                <i className="ph-fill ph-sparkle text-[30px]" />
                            </span>
                            <h2 className="mt-5 text-xl font-extrabold text-[var(--text-heading)]">
                                {primaryEndpoint
                                    ? `Ask about ${primaryEndpoint.method.toUpperCase()} ${primaryEndpoint.path}`
                                    : 'Ask anything about this API'}
                            </h2>
                            <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">
                                {primaryEndpoint
                                    ? `I’m focused on ${currentOperation?.summary || primaryEndpoint.path}. Ask about its parameters, responses, auth, examples, or how to call it.`
                                    : 'I can explain endpoints, schemas, auth flows, errors, workflows, and request examples using retrieved current specification context. Answers include OpenAPI source references.'}
                            </p>
                            {!configured && (
                                <button
                                    type="button"
                                    onClick={onOpenSettings}
                                    className="mt-4 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-2 text-[11px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/15 cursor-pointer"
                                >
                                    <i className="ph ph-sliders-horizontal me-1" />
                                    Configure a provider
                                </button>
                            )}
                            <div className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                                {suggestions.map(suggestion => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => sendMessage(suggestion)}
                                        className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--text)] hover:border-[var(--primary)]/40 hover:bg-[var(--surface-hover)] cursor-pointer"
                                    >
                                        <i className="ph ph-arrow-up-right me-1.5 text-[var(--primary)]" />
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                            {primaryEndpoint && (
                                <button
                                    type="button"
                                    onClick={() => requestRunner(primaryEndpoint.path, primaryEndpoint.method)}
                                    className="mt-3 rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 px-3 py-2 text-[11px] font-bold text-[var(--method-put)] hover:bg-[var(--method-put)]/10 cursor-pointer"
                                >
                                    <i className="ph ph-flask me-1.5" />
                                    Prepare {primaryEndpoint.method.toUpperCase()} {primaryEndpoint.path} in API Runner
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="mx-auto max-w-3xl space-y-5">
                            {activeConversation.messages.map(message => (
                                <div
                                    key={message.id}
                                    className={clsx(
                                        'flex gap-3',
                                        message.role === 'user' ? 'justify-end' : 'justify-start',
                                    )}
                                >
                                    {message.role === 'assistant' && (
                                        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                                            <i className="ph-fill ph-sparkle text-[14px]" />
                                        </span>
                                    )}
                                    <div
                                        className={clsx(
                                            'max-w-[min(88%,760px)] rounded-2xl border px-4 py-3',
                                            message.role === 'user'
                                                ? 'border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--text-heading)]'
                                                : message.isError
                                                  ? 'border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5'
                                                  : 'border-[var(--border)] bg-[var(--background)]',
                                        )}
                                    >
                                        {message.role === 'assistant' ? (
                                            message.content ? (
                                                <Markdown
                                                    text={stripOpenDocUIActionBlocks(
                                                        stripCitationTokens(message.content),
                                                    )}
                                                    className="text-[12px] leading-relaxed"
                                                />
                                            ) : isSending ? (
                                                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                                                    <i className="ph ph-spinner animate-spin text-[var(--primary)]" />
                                                    Thinking from the specification…
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-[var(--text-muted)]">
                                                    No response content.
                                                </span>
                                            )
                                        ) : (
                                            <p className="whitespace-pre-wrap text-xs leading-relaxed">
                                                {message.content}
                                            </p>
                                        )}
                                        {message.role === 'assistant' && (
                                            <AssistantCitations
                                                citations={message.citations}
                                                onOpenEndpoint={onOpenEndpoint}
                                            />
                                        )}
                                        {message.role === 'assistant' && (
                                            <AssistantActions text={message.content} onExecute={executeBridgeAction} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <footer className="h-[76px] min-h-[76px] box-border flex items-center border-t border-[var(--border)] bg-[var(--background)] px-3 py-3 sm:px-5">
                    <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 focus-within:border-[var(--primary)]/60">
                        <textarea
                            value={input}
                            onChange={event => setInput(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void sendMessage();
                                }
                            }}
                            rows={2}
                            placeholder="Ask about endpoints, schemas, auth, errors, or API workflows…"
                            className="min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1.5 text-xs outline-none"
                            disabled={isSending}
                        />
                        {isSending ? (
                            <button
                                type="button"
                                onClick={stopMessage}
                                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--method-delete)] text-[var(--method-delete-contrast)] hover:brightness-110 cursor-pointer"
                            >
                                <i className="ph ph-stop text-[15px]" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void sendMessage()}
                                disabled={!input.trim()}
                                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                            >
                                <i className="ph ph-paper-plane-tilt text-[15px]" />
                            </button>
                        )}
                    </div>
                </footer>
            </section>

            {permissionsTransition.shouldRender && activeConversation && (
                <div
                    className={`${permissionsTransition.backdropClassName} fixed inset-0 z-[6000] bg-black/55 backdrop-blur-[2px]`}
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) permissionsTransition.requestClose();
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="assistant-permissions-title"
                        className="modal-surface w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
                    >
                        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4">
                            <div className="flex items-center gap-3">
                                <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                    <i className="ph ph-shield-check text-[18px]" />
                                </span>
                                <div>
                                    <h2
                                        id="assistant-permissions-title"
                                        className="text-sm font-extrabold text-[var(--text-heading)]"
                                    >
                                        Assistant permissions
                                    </h2>
                                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                        Controls for sensitive context and Runner preparation.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={permissionsTransition.requestClose}
                                className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                <i className="ph ph-x" />
                            </button>
                        </header>
                        <div className="space-y-3 p-5">
                            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                                <span
                                    className={clsx(
                                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                                        activeConversation.includeAuthValues
                                            ? 'bg-[var(--method-delete)]/10 text-[var(--method-delete)]'
                                            : 'bg-emerald-500/10 text-emerald-500',
                                    )}
                                >
                                    <i className="ph ph-lock-key" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--text-heading)]">
                                        Authentication values{' '}
                                        <span
                                            className={clsx(
                                                'rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider',
                                                activeConversation.includeAuthValues
                                                    ? 'border-[var(--method-delete)]/30 bg-[var(--method-delete)]/10 text-[var(--method-delete)]'
                                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
                                            )}
                                        >
                                            {activeConversation.includeAuthValues ? 'Auth visible' : 'Protected'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                        Protected keeps tokens, cookies, passwords, and API keys out of the Assistant
                                        context. Enabling Auth visible sends current authentication values to the
                                        selected provider and should only be used when you understand the risk.
                                    </p>
                                </div>
                                <PermissionSwitch
                                    checked={activeConversation.includeAuthValues}
                                    onChange={toggleAuthValues}
                                    label="Allow authentication values in Assistant context"
                                    checkedClass="border-[var(--method-delete)] bg-[var(--method-delete)]"
                                    uncheckedClass="border-emerald-500/40 bg-emerald-500/15"
                                />
                            </div>
                            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                                <span
                                    className={clsx(
                                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                                        activeConversation.trustedRunner
                                            ? 'bg-amber-500/10 text-amber-500'
                                            : 'bg-sky-500/10 text-sky-500',
                                    )}
                                >
                                    <i className="ph ph-flask" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--text-heading)]">
                                        Runner preparation{' '}
                                        <span
                                            className={clsx(
                                                'rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider',
                                                activeConversation.trustedRunner
                                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                                                    : 'border-sky-500/30 bg-sky-500/10 text-sky-500',
                                            )}
                                        >
                                            {activeConversation.trustedRunner ? 'Trusted' : 'Review'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                        Review asks for confirmation before opening the Runner from a suggestion.
                                        Trusted skips that extra preparation prompt. Manual Runner sends are always
                                        controlled by the Runner; an AI Run action still requires your click.
                                    </p>
                                </div>
                                <PermissionSwitch
                                    checked={activeConversation.trustedRunner}
                                    onChange={toggleTrustedRunner}
                                    label="Trust Assistant Runner preparation"
                                    checkedClass="border-amber-500 bg-amber-500"
                                    uncheckedClass="border-sky-500/40 bg-sky-500/15"
                                />
                            </div>
                            <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                <i className="ph ph-info me-1 text-[var(--primary)]" />
                                The API Runner remains usable without a profile or Assistant. These permissions belong
                                only to this conversation.
                            </div>
                        </div>
                        <footer className="flex justify-end border-t border-[var(--border)] bg-[var(--background)] px-5 py-3">
                            <button
                                type="button"
                                onClick={permissionsTransition.requestClose}
                                className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                            >
                                Done
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            <AssistantConfirmModals
                deleteConversationTarget={deleteConfirmation}
                deleteVisible={deleteTransition.shouldRender}
                deleteBackdropClassName={deleteTransition.backdropClassName}
                onCancelDelete={deleteTransition.requestClose}
                onDelete={deleteConversation}
                runnerTarget={runnerConfirmation}
                runnerVisible={runnerTransition.shouldRender}
                runnerBackdropClassName={runnerTransition.backdropClassName}
                onCancelRunner={runnerTransition.requestClose}
                onOpenRunner={onOpenRunner}
            />
        </div>
    );
}
