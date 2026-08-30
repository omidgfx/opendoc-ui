import {
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type KeyboardEvent,
    type MouseEvent,
    type RefObject,
    type SetStateAction,
} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec} from '../../types';
import ExamineTab from '../endpoint/ExamineTab/ExamineTab';
import ViewTab from '../endpoint/ViewTab/ViewTab';
import FocusPane from '../common/FocusPane';
import MethodBadge from '../common/MethodBadge';
import {Tip} from '../common/Tooltip';
import {getOperation} from '../../utils/openapi';
import ViewErrorBoundary from '../common/ViewErrorBoundary';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import EndpointNotesSidebar from '../notes/EndpointNotesSidebar';
import ScrollableRow from '../common/ScrollableRow';
import {useElementWidth} from '../../hooks/useElementWidth';
import {usePanelTransition} from '../../hooks/usePanelTransition';

export type EndpointViewMode = 'docs' | 'examine' | 'both';
export type ActiveSplitPane = 'docs' | 'examine';

interface EndpointWorkspaceProps {
    spec: OpenApiSpec;
    endpoint: {
        path: string;
        method: string;
    };
    parsableKey: string;
    selectedTab: EndpointViewMode;
    setSelectedTab: Dispatch<SetStateAction<EndpointViewMode>>;
    activeSplitPane: ActiveSplitPane;
    setActiveSplitPane: Dispatch<SetStateAction<ActiveSplitPane>>;
    splitContainerRef: RefObject<HTMLDivElement | null>;
    docsPaneWidth: number;
    isSplitDragging: boolean;
    onSplitResizeMouseDown: (event: MouseEvent) => void;
    onSplitResizeKeyDown: (event: KeyboardEvent) => void;
    splitSeparatorMin: number;
    splitSeparatorMax: number;
    splitSeparatorNow: number;
    isMobile: boolean;
    activeAuth: ActiveAuth;
    selectedServer: string;
    serverVariables?: Record<string, string>;
    resolvedThemeMode: 'light' | 'dark';
    activeResponseCode: string | null;
    setActiveResponseCode: Dispatch<SetStateAction<string | null>>;
    responseHistory: ExamineResponse[];
    onResponseChange: (response: ExamineResponse) => void;
    onDeleteResponse: (index: number) => void;
    onClearResponse: () => void | Promise<void>;
    onOpenSchema: (schemaName: string) => void;
    onGenerateCode: () => void;
    onAskAINewConversation: () => void;
}

export default function EndpointWorkspace({
    spec,
    endpoint,
    parsableKey,
    selectedTab,
    setSelectedTab,
    activeSplitPane,
    setActiveSplitPane,
    splitContainerRef,
    docsPaneWidth,
    isSplitDragging,
    onSplitResizeMouseDown,
    onSplitResizeKeyDown,
    splitSeparatorMin,
    splitSeparatorMax,
    splitSeparatorNow,
    isMobile,
    activeAuth,
    selectedServer,
    serverVariables,
    resolvedThemeMode,
    activeResponseCode,
    setActiveResponseCode,
    responseHistory,
    onResponseChange,
    onDeleteResponse,
    onClearResponse,
    onOpenSchema,
    onGenerateCode,
    onAskAINewConversation,
}: EndpointWorkspaceProps) {
    const {noteCountForEndpoint, openEndpointNotes} = useEndpointNotes();
    const [notesSidebarOpen, setNotesSidebarOpen] = useState(false);
    const notesTransition = usePanelTransition(notesSidebarOpen);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const workspaceWidth = useElementWidth(workspaceRef);
    // Side by side needs real room. The decision follows the pane, not the
    // viewport, so a narrowed split or an open notes sidebar counts too.
    const canSplit = workspaceWidth === 0 || workspaceWidth >= 720;
    useEffect(() => {
        if (!canSplit && selectedTab === 'both') setSelectedTab(activeSplitPane === 'examine' ? 'examine' : 'docs');
    }, [canSplit, selectedTab, activeSplitPane, setSelectedTab]);
    useEffect(() => {
        if (selectedTab === 'both') setNotesSidebarOpen(false);
    }, [selectedTab]);
    const operation = getOperation(spec, endpoint.path, endpoint.method);
    if (!operation) return null;
    const docsActive = selectedTab !== 'both' || activeSplitPane === 'docs';
    const runnerActive = selectedTab !== 'both' || activeSplitPane === 'examine';
    const endpointKey = `${endpoint.method.toLowerCase()}:${endpoint.path}`;
    const endpointNoteCount = noteCountForEndpoint(endpoint.path, endpoint.method);
    const handleOpenEndpointNotes = () => {
        if (selectedTab === 'both') {
            openEndpointNotes(endpoint.path, endpoint.method);
            return;
        }
        setNotesSidebarOpen(current => !current);
    };
    const docs = (
        <ViewErrorBoundary resetKey={`docs:${endpointKey}`} title="Endpoint documentation could not be rendered">
            <ViewTab
                key={`${endpoint.path}-${endpoint.method}`}
                spec={spec}
                path={endpoint.path}
                method={endpoint.method}
                operation={operation}
                onOpenSchemaModal={onOpenSchema}
                activeAuth={activeAuth}
                selectedServer={selectedServer}
                serverVariables={serverVariables}
                activeResponseCode={activeResponseCode}
                onSelectResponseCode={setActiveResponseCode}
                parsableKey={parsableKey}
                isActive={docsActive}
            />
        </ViewErrorBoundary>
    );
    const runner = (
        <ViewErrorBoundary resetKey={`runner:${endpointKey}`} title="API Runner form could not be rendered">
            <ExamineTab
                spec={spec}
                path={endpoint.path}
                method={endpoint.method}
                operation={operation}
                activeAuth={activeAuth}
                selectedServer={selectedServer}
                serverVariables={serverVariables}
                parsableKey={parsableKey}
                themeMode={resolvedThemeMode}
                responseHistory={responseHistory}
                isActive={runnerActive}
                onResponseChange={onResponseChange}
                onDeleteResponse={onDeleteResponse}
                onClearResponse={onClearResponse}
                onOpenSchema={onOpenSchema}
            />
        </ViewErrorBoundary>
    );
    return (
        <div ref={workspaceRef} className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            <div className="@container shrink-0 border-b bg-[var(--surface)] border-[var(--border)]">
                <div className="h-auto min-h-0 px-2.5 sm:px-4 py-1 flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-1.5 select-none">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[10.5px]">
                        <span className="uppercase opacity-40 font-black text-[9px] tracking-widest text-[var(--text-heading)] hidden @4xl:inline">
                            Endpoint:
                        </span>
                        <MethodBadge method={endpoint.method} size="xs" className="rounded-full shrink-0 w-9" />
                        <ScrollableRow className="font-mono font-bold select-all">{endpoint.path}</ScrollableRow>
                    </div>
                    <div className="flex shrink-0 flex-nowrap items-center gap-2">
                        <div className="flex p-0.5 gap-1 rounded-lg border text-xs border-[var(--border)] bg-[var(--background)]">
                            <Tip content="View Documentation">
                                <button
                                    onClick={() => setSelectedTab('docs')}
                                    aria-pressed={selectedTab === 'docs'}
                                    className={clsx(
                                        'px-2 sm:px-2.5 py-1 gap-1 flex items-center rounded-md font-semibold transition-all cursor-pointer text-[11px]',
                                        selectedTab === 'docs'
                                            ? 'bg-[var(--method-get)] shadow-sm text-[var(--method-get-contrast)]'
                                            : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    <i className="ph ph-book-open-text text-[14px]" />
                                    <span className="hidden @4xl:inline">View Documentation</span>
                                    <span className="@4xl:hidden">Docs</span>
                                </button>
                            </Tip>
                            <Tip content="API Runner">
                                <button
                                    onClick={() => setSelectedTab('examine')}
                                    aria-pressed={selectedTab === 'examine'}
                                    className={clsx(
                                        'px-2 sm:px-2.5 py-1 gap-1 flex items-center rounded-md font-semibold transition-all cursor-pointer text-[11px]',
                                        selectedTab === 'examine'
                                            ? 'bg-[var(--method-delete)] shadow-sm text-[var(--method-delete-contrast)]'
                                            : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    <i className="ph ph-flask text-[14px]" />
                                    <span className="hidden @4xl:inline">API Runner</span>
                                    <span className="@4xl:hidden">Run</span>
                                </button>
                            </Tip>
                            {canSplit && (
                                <Tip content="Split View (Side-by-Side)">
                                    <button
                                        onClick={() => setSelectedTab('both')}
                                        aria-pressed={selectedTab === 'both'}
                                        className={clsx(
                                            'px-2 sm:px-2.5 py-1 gap-1 flex items-center rounded-md font-semibold transition-all cursor-pointer text-[11px]',
                                            selectedTab === 'both'
                                                ? 'bg-[var(--primary)] shadow-sm text-[var(--primary-contrast)]'
                                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                        )}
                                    >
                                        <i className="ph ph-split-horizontal text-[14px]" />
                                        <span className="hidden @4xl:inline">Split View</span>
                                        <span className="@4xl:hidden">Split</span>
                                    </button>
                                </Tip>
                            )}
                        </div>
                        <div className="h-5 w-px bg-[var(--border)] hidden @2xl:block" />
                        <Tip
                            content={
                                selectedTab === 'both'
                                    ? 'Open endpoint notes in a modal'
                                    : notesSidebarOpen
                                      ? 'Close endpoint notes sidebar'
                                      : 'Open endpoint notes sidebar'
                            }
                        >
                            <button
                                type="button"
                                data-endpoint-notes-button
                                onClick={handleOpenEndpointNotes}
                                aria-label={`Open endpoint notes (${endpointNoteCount})`}
                                aria-expanded={selectedTab === 'both' ? undefined : notesSidebarOpen}
                                aria-haspopup={selectedTab === 'both' ? 'dialog' : undefined}
                                className="group inline-flex h-8.5 w-[60px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2 text-xs font-bold text-[var(--text-heading)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                <i className="ph-fill ph-note text-[15px] text-[#f59e0b] transition-colors group-hover:text-[var(--primary)] group-active:text-[var(--primary)]" />
                                <span data-endpoint-note-count>{endpointNoteCount}</span>
                            </button>
                        </Tip>
                        <Tip content="Generate Fetch/Axios snippets and TypeScript models">
                            <button
                                onClick={onGenerateCode}
                                aria-label="Generate request code"
                                className="size-8.5 border hover:bg-[var(--surface-hover)] rounded-lg text-xs font-bold flex justify-center items-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] shrink-0"
                            >
                                <i className="ph ph-code text-[14px]" />
                            </button>
                        </Tip>
                        <Tip content="Ask AI about this endpoint in a new conversation">
                            <button
                                type="button"
                                onClick={onAskAINewConversation}
                                aria-label="Ask AI in a new conversation"
                                className="size-8.5 border hover:bg-[var(--surface-hover)] rounded-lg text-xs font-bold flex justify-center items-center transition-colors cursor-pointer border-[var(--border)] text-[var(--primary)] shrink-0"
                            >
                                <i className="ph-fill ph-sparkle text-[15px]" />
                            </button>
                        </Tip>
                    </div>
                </div>
            </div>
            {/* A layer of its own: the pinned response navigator, the code
                gutter and the notes panel must never climb over the app
                chrome, the mobile sidebar included. */}
            <div className="flex-1 overflow-hidden h-full min-h-0 isolate">
                {selectedTab === 'both' ? (
                    isMobile ? (
                        <div
                            ref={splitContainerRef}
                            className="flex flex-col h-full w-full min-h-0 min-w-0 gap-1.5 p-1.5 overflow-y-auto scrollbar-thin"
                        >
                            <div className="shrink-0" style={{height: '70vh'}}>
                                <FocusPane
                                    active={activeSplitPane === 'docs'}
                                    onActivate={() => setActiveSplitPane('docs')}
                                    fillHeight={false}
                                    className="h-full"
                                >
                                    {docs}
                                </FocusPane>
                            </div>
                            <div className="shrink-0" style={{height: '70vh'}}>
                                <FocusPane
                                    active={activeSplitPane === 'examine'}
                                    onActivate={() => setActiveSplitPane('examine')}
                                    fillHeight={false}
                                    className="h-full"
                                >
                                    {runner}
                                </FocusPane>
                            </div>
                        </div>
                    ) : (
                        <div ref={splitContainerRef} className="flex h-full w-full min-h-0 min-w-0 gap-0.5 p-1.5">
                            <div
                                className="h-full min-w-0 overflow-hidden"
                                style={{
                                    width: docsPaneWidth >= 0 ? docsPaneWidth : '50%',
                                    flex: docsPaneWidth >= 0 ? '0 0 auto' : '1 1 0%',
                                }}
                            >
                                <FocusPane
                                    active={activeSplitPane === 'docs'}
                                    onActivate={() => setActiveSplitPane('docs')}
                                >
                                    {docs}
                                </FocusPane>
                            </div>
                            <div
                                role="separator"
                                aria-label="Resize documentation and API Runner panes"
                                aria-orientation="vertical"
                                aria-valuemin={splitSeparatorMin}
                                aria-valuemax={splitSeparatorMax}
                                aria-valuenow={splitSeparatorNow}
                                tabIndex={0}
                                onMouseDown={onSplitResizeMouseDown}
                                onKeyDown={onSplitResizeKeyDown}
                                className={clsx(
                                    'w-1.5 shrink-0 h-full rounded-full cursor-col-resize transition-colors select-none outline-none focus:bg-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30',
                                    isSplitDragging
                                        ? 'bg-[var(--primary)]'
                                        : 'bg-transparent hover:bg-[var(--primary)]/60',
                                )}
                            />
                            <div className="h-full min-w-0 flex-1 overflow-hidden">
                                <FocusPane
                                    active={activeSplitPane === 'examine'}
                                    onActivate={() => setActiveSplitPane('examine')}
                                >
                                    {runner}
                                </FocusPane>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="relative flex h-full min-h-0 min-w-0">
                        <div className="min-w-0 flex-1 overflow-hidden">{selectedTab === 'docs' ? docs : runner}</div>
                        {notesTransition.shouldRender && (
                            <EndpointNotesSidebar
                                open={notesTransition.entered}
                                spec={spec}
                                specKey={parsableKey}
                                path={endpoint.path}
                                method={endpoint.method}
                                // A narrow pane cannot spare room for a docked
                                // panel either, split view included.
                                overlay={isMobile || !canSplit}
                                onClose={() => setNotesSidebarOpen(false)}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
