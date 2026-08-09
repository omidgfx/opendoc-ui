import type {Dispatch, KeyboardEvent, MouseEvent, RefObject, SetStateAction} from 'react';
import type {ActiveAuth, ExamineResponse, OpenApiSpec} from '../../types';
import SearchResultsView from '@/src/pages/search/SearchResultsPage';
import AboutView from '@/src/pages/about/AboutPage';
import HomeView from '@/src/pages/home/HomePage';
import NoSpecView from '@/src/pages/status/NoSpecPage';
import WelcomeView from '@/src/pages/status/WelcomePage';
import SchemaExplorer from '@/src/pages/schema/SchemaExplorerPage';
import EmptySearchState from './EmptySearchState';
import EndpointWorkspace, {type ActiveSplitPane, type EndpointViewMode} from './EndpointWorkspace';

interface WorkspaceContentProps {
    spec: OpenApiSpec | null;
    specKey: string;
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    showAbout: boolean;
    showWelcome: boolean;
    assistantActive: boolean;
    activeTabId: string | null;
    resultsQuery: string;
    selectedMethods: string[];
    setSelectedMethods: Dispatch<SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: Dispatch<SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: Dispatch<SetStateAction<boolean | null>>;
    selectedServer: string;
    setSelectedServer: Dispatch<SetStateAction<string>>;
    displayRoutes: boolean;
    selectedEndpoint: {
        path: string;
        method: string;
    } | null;
    selectedViewMode: EndpointViewMode;
    setSelectedViewMode: Dispatch<SetStateAction<EndpointViewMode>>;
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
    resolvedThemeMode: 'light' | 'dark';
    activeResponseCode: string | null;
    setActiveResponseCode: Dispatch<SetStateAction<string | null>>;
    examineResponses: Record<string, ExamineResponse[]>;
    setExamineResponses: Dispatch<SetStateAction<Record<string, ExamineResponse[]>>>;
    showSchemaExplorer: boolean;
    showHome: boolean;
    onOpenAbout: () => void;
    onOpenHome: () => void;
    onOpenSchema: (name: string) => void;
    onSearchChange: (query: string) => void;
    onSelectEndpoint: (path: string, method: string) => void;
    onSearchResult: (path: string, method: string) => void;
    onOpenEndpointPermanent: (path: string, method: string) => void;
    onOpenEndpointPreview: (path: string, method: string) => void;
    onGenerateCode: (endpoint: {
        path: string;
        method: string;
    }) => void;
    onHidePageViews: () => void;
}

export default function WorkspaceContent(props: WorkspaceContentProps) {
    const {
        spec,
        specKey,
        canOpenLocal,
        onOpenLocalFile,
        showAbout,
        showWelcome,
        assistantActive,
        activeTabId,
        resultsQuery,
        selectedMethods,
        setSelectedMethods,
        selectedTags,
        setSelectedTags,
        onlyProtected,
        setOnlyProtected,
        selectedServer,
        setSelectedServer,
        displayRoutes,
        selectedEndpoint,
        selectedViewMode,
        setSelectedViewMode,
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
        resolvedThemeMode,
        activeResponseCode,
        setActiveResponseCode,
        examineResponses,
        setExamineResponses,
        showSchemaExplorer,
        showHome,
        onOpenAbout,
        onOpenHome,
        onOpenSchema,
        onSearchChange,
        onSelectEndpoint,
        onSearchResult,
        onOpenEndpointPermanent,
        onOpenEndpointPreview,
        onGenerateCode,
        onHidePageViews,
    } = props;
    if (!spec) {
        if (showAbout)
            return <AboutView specTitle={undefined} parsableKey={specKey} spec={spec}/>;
        return <NoSpecView canOpenLocal={canOpenLocal} onOpenLocalFile={onOpenLocalFile} onOpenAbout={onOpenAbout}/>;
    }
    if (showWelcome && !assistantActive) {
        return (<WelcomeView specTitle={spec.info?.title || specKey} specKey={specKey} onSearchSubmit={onSearchChange}
                             onOpenAbout={onOpenAbout} onOpenHome={onOpenHome} onOpenLocalFile={onOpenLocalFile}
                             canOpenLocal={canOpenLocal}/>);
    }
    const hasFilters = selectedMethods.length || selectedTags.length || onlyProtected !== null;
    if (activeTabId === 'view:search') {
        if (resultsQuery.trim().length || hasFilters) {
            return (<SearchResultsView spec={spec} searchQuery={resultsQuery} onSelectEndpoint={onSearchResult}
                                       onMiddleClickEndpoint={onOpenEndpointPermanent} selectedServer={selectedServer}
                                       selectedMethods={selectedMethods} setSelectedMethods={setSelectedMethods}
                                       selectedTags={selectedTags} setSelectedTags={setSelectedTags}
                                       onlyProtected={onlyProtected} setOnlyProtected={setOnlyProtected}
                                       displayRoutes={displayRoutes} parsableKey={specKey}/>);
        }
        return <EmptySearchState/>;
    }
    if (selectedEndpoint) {
        const operation = (spec.paths[selectedEndpoint.path] as any)?.[selectedEndpoint.method];
        if (operation) {
            const key = `${selectedEndpoint.method.toLowerCase()}:${selectedEndpoint.path}`;
            return (<EndpointWorkspace spec={spec} endpoint={selectedEndpoint} parsableKey={specKey}
                                       selectedTab={selectedViewMode} setSelectedTab={setSelectedViewMode}
                                       activeSplitPane={activeSplitPane} setActiveSplitPane={setActiveSplitPane}
                                       splitContainerRef={splitContainerRef} docsPaneWidth={docsPaneWidth}
                                       isSplitDragging={isSplitDragging} onSplitResizeMouseDown={onSplitResizeMouseDown}
                                       onSplitResizeKeyDown={onSplitResizeKeyDown}
                                       splitSeparatorMin={splitSeparatorMin} splitSeparatorMax={splitSeparatorMax}
                                       splitSeparatorNow={splitSeparatorNow} isMobile={isMobile} activeAuth={activeAuth} selectedServer={selectedServer}
                                       resolvedThemeMode={resolvedThemeMode} activeResponseCode={activeResponseCode}
                                       setActiveResponseCode={setActiveResponseCode}
                                       responseHistory={examineResponses[key] || []}
                                       onResponseChange={response => setExamineResponses(current => ({
                                           ...current,
                                           [key]: [response, ...(current[key] || [])].slice(0, 10)
                                       }))} onClearResponse={() => setExamineResponses(current => {
                const next = {...current};
                delete next[key];
                return next;
            })} onOpenSchema={onOpenSchema} onGenerateCode={() => onGenerateCode(selectedEndpoint)}/>);
        }
    }
    if (showSchemaExplorer) {
        return <SchemaExplorer schemas={spec.components?.schemas} onSelectSchema={onOpenSchema} parsableKey={specKey}/>;
    }
    if (showAbout)
        return <AboutView specTitle={spec.info?.title} parsableKey={specKey} spec={spec}/>;
    if (showHome) {
        return (<HomeView spec={spec} selectedEndpoint={selectedEndpoint} onSelectEndpoint={onSelectEndpoint}
                          selectedServer={selectedServer} onSelectServer={setSelectedServer} activeAuth={activeAuth}
                          onDeepLinkResponse={(path, method, code) => {
                              onOpenEndpointPreview(path, method);
                              onHidePageViews();
                              setSelectedViewMode('docs');
                              setActiveResponseCode(code);
                          }}/>);
    }
    return (<WelcomeView specTitle={spec.info?.title || specKey} specKey={specKey} onSearchSubmit={onSearchChange}
                         onOpenAbout={onOpenAbout} onOpenHome={onOpenHome} onOpenLocalFile={onOpenLocalFile}
                         canOpenLocal={canOpenLocal}/>);
}
