import type {Dispatch, MouseEvent, RefObject, SetStateAction} from 'react';
import clsx from 'clsx';
import type {ActiveAuth, ExamineResponse, OpenApiSpec} from '../../types';
import ExamineTab from '../../components/endpoint/ExamineTab/ExamineTab';
import ViewTab from '../../components/endpoint/ViewTab/ViewTab';
import FocusPane from '../../components/common/FocusPane';
import MethodBadge from '../../components/common/MethodBadge';
import {Tip} from '../../components/common/Tooltip';

export type EndpointViewMode = 'docs' | 'examine' | 'both';
export type ActiveSplitPane = 'docs' | 'examine';

interface EndpointWorkspaceProps {
    spec: OpenApiSpec;
    endpoint: {path: string; method: string};
    parsableKey: string;
    selectedTab: EndpointViewMode;
    setSelectedTab: Dispatch<SetStateAction<EndpointViewMode>>;
    activeSplitPane: ActiveSplitPane;
    setActiveSplitPane: Dispatch<SetStateAction<ActiveSplitPane>>;
    splitContainerRef: RefObject<HTMLDivElement | null>;
    docsPaneWidth: number;
    isSplitDragging: boolean;
    onSplitResizeMouseDown: (event: MouseEvent) => void;
    isMobile: boolean;
    activeAuth: ActiveAuth;
    selectedServer: string;
    resolvedThemeMode: 'light' | 'dark';
    activeResponseCode: string | null;
    setActiveResponseCode: Dispatch<SetStateAction<string | null>>;
    currentResponse: ExamineResponse | null;
    onResponseChange: (response: ExamineResponse) => void;
    onClearResponse: () => void;
    onOpenSchema: (schemaName: string) => void;
    onGenerateCode: () => void;
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
    isMobile,
    activeAuth,
    selectedServer,
    resolvedThemeMode,
    activeResponseCode,
    setActiveResponseCode,
    currentResponse,
    onResponseChange,
    onClearResponse,
    onOpenSchema,
    onGenerateCode,
}: EndpointWorkspaceProps) {
    const pathItem = spec.paths[endpoint.path];
    const operation = pathItem && (pathItem as any)[endpoint.method];
    if (!operation) return null;

    const docsActive = selectedTab !== 'both' || activeSplitPane === 'docs';
    const runnerActive = selectedTab !== 'both' || activeSplitPane === 'examine';
    const docs = (
        <ViewTab
            key={`${endpoint.path}-${endpoint.method}`}
            spec={spec}
            path={endpoint.path}
            method={endpoint.method}
            operation={operation}
            onOpenSchemaModal={onOpenSchema}
            activeAuth={activeAuth}
            activeResponseCode={activeResponseCode}
            onSelectResponseCode={setActiveResponseCode}
            parsableKey={parsableKey}
            isActive={docsActive}
        />
    );
    const runner = (
        <ExamineTab
            spec={spec}
            path={endpoint.path}
            method={endpoint.method}
            operation={operation}
            activeAuth={activeAuth}
            selectedServer={selectedServer}
            parsableKey={parsableKey}
            themeMode={resolvedThemeMode}
            initialResponse={currentResponse}
            isActive={runnerActive}
            onResponseChange={onResponseChange}
            onClearResponse={onClearResponse}
        />
    );

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            <div className="h-auto min-h-[3.5rem] border-b px-3 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 select-none bg-[var(--surface)] border-[var(--border)]">
                <div className="flex items-center gap-1.5 text-[10.5px] min-w-0 overflow-hidden">
                    <span className="uppercase opacity-40 font-black text-[9px] tracking-widest text-[var(--text-heading)] hidden sm:inline">Endpoint:</span>
                    <MethodBadge method={endpoint.method} size="xs" className="rounded-full shrink-0 w-9"/>
                    <span className="font-mono font-bold select-all truncate">{endpoint.path}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex p-0.5 gap-1 rounded-lg border text-xs border-[var(--border)] bg-[var(--background)]">
                        <Tip content="View Documentation">
                            <button onClick={() => setSelectedTab('docs')} aria-pressed={selectedTab === 'docs'}
                                    className={clsx(
                                        'px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                        selectedTab === 'docs' ? 'bg-[var(--method-get)] shadow-sm text-[var(--method-get-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                    )}>
                                <i className="ph ph-book-open-text text-[16px]"/>
                                <span className="hidden sm:inline">View Documentation</span><span className="sm:hidden">Docs</span>
                            </button>
                        </Tip>
                        <Tip content="API Runner">
                            <button onClick={() => setSelectedTab('examine')} aria-pressed={selectedTab === 'examine'}
                                    className={clsx(
                                        'px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                        selectedTab === 'examine' ? 'bg-[var(--method-delete)] shadow-sm text-[var(--method-delete-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                    )}>
                                <i className="ph ph-flask text-[16px]"/>
                                <span className="hidden sm:inline">API Runner</span><span className="sm:hidden">Run</span>
                            </button>
                        </Tip>
                        <Tip content="Split View (Side-by-Side)">
                            <button onClick={() => setSelectedTab('both')} aria-pressed={selectedTab === 'both'}
                                    className={clsx(
                                        'px-2.5 sm:px-3 py-1.5 gap-1.5 flex items-center rounded-md font-semibold transition-all cursor-pointer text-xs',
                                        selectedTab === 'both' ? 'bg-[var(--primary)] shadow-sm text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                    )}>
                                <i className="ph ph-split-horizontal text-[16px]"/>
                                <span className="hidden sm:inline">Split View</span><span className="sm:hidden">Split</span>
                            </button>
                        </Tip>
                    </div>
                    <div className="h-5 w-px bg-[var(--border)] hidden sm:block"/>
                    <Tip content="Generate Fetch/Axios snippets and TypeScript models">
                        <button onClick={onGenerateCode}
                                className="size-8.5 border hover:bg-[var(--surface-hover)] rounded-lg text-xs font-bold flex justify-center items-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] shrink-0">
                            <i className="ph ph-code text-[16px]"/>
                        </button>
                    </Tip>
                </div>
            </div>
            <div className="flex-1 overflow-hidden h-full min-h-0">
                {selectedTab === 'both' ? (
                    isMobile ? (
                        <div ref={splitContainerRef} className="flex flex-col h-full w-full min-h-0 min-w-0 gap-1.5 p-1.5 overflow-y-auto scrollbar-thin">
                            <div className="shrink-0" style={{height: '70vh'}}>
                                <FocusPane active={activeSplitPane === 'docs'} onActivate={() => setActiveSplitPane('docs')} fillHeight={false} className="h-full">
                                    {docs}
                                </FocusPane>
                            </div>
                            <div className="shrink-0" style={{height: '70vh'}}>
                                <FocusPane active={activeSplitPane === 'examine'} onActivate={() => setActiveSplitPane('examine')} fillHeight={false} className="h-full">
                                    {runner}
                                </FocusPane>
                            </div>
                        </div>
                    ) : (
                        <div ref={splitContainerRef} className="flex h-full w-full min-h-0 min-w-0 gap-0.5 p-1.5">
                            <div className="h-full min-w-0 overflow-hidden" style={{
                                width: docsPaneWidth >= 0 ? docsPaneWidth : '50%',
                                flex: docsPaneWidth >= 0 ? '0 0 auto' : '1 1 0%',
                            }}>
                                <FocusPane active={activeSplitPane === 'docs'} onActivate={() => setActiveSplitPane('docs')}>
                                    {docs}
                                </FocusPane>
                            </div>
                            <div onMouseDown={onSplitResizeMouseDown}
                                 className={clsx(
                                     'w-1.5 shrink-0 h-full rounded-full cursor-col-resize transition-colors select-none',
                                     isSplitDragging ? 'bg-[var(--primary)]' : 'bg-transparent hover:bg-[var(--primary)]/60',
                                 )}/>
                            <div className="h-full min-w-0 flex-1 overflow-hidden">
                                <FocusPane active={activeSplitPane === 'examine'} onActivate={() => setActiveSplitPane('examine')}>
                                    {runner}
                                </FocusPane>
                            </div>
                        </div>
                    )
                ) : selectedTab === 'docs' ? docs : runner}
            </div>
        </div>
    );
}
