import type {Dispatch, KeyboardEvent, MouseEvent, RefObject, SetStateAction} from 'react';
import type {ActiveAuth, ExamineResponse, OpenApiSpec} from '../../types';
import SearchResultsView from '@/src/pages/search/SearchResultsPage';
import AboutView from '@/src/pages/about/AboutPage';
import HomeView from '@/src/pages/home/HomePage';
import NoSpecView from '@/src/pages/status/NoSpecPage';
import WelcomeView from '@/src/pages/status/WelcomePage';
import SchemaExplorer from '@/src/pages/schema/SchemaExplorerPage';
import RunnerCompatibilityPage from '@/src/pages/compatibility/RunnerCompatibilityPage';
import SettingsPage from '@/src/pages/settings/SettingsPage';
import type {SettingsSectionId} from '@/src/pages/settings/settingsSections';
import type {AppearanceSettingsProps} from '@/src/pages/settings/sections/AppearanceSettingsSection';
import type {AISettingsSectionProps} from '@/src/components/ai/settings/AISettingsSection';
import EndpointNotesPage from '@/src/pages/notes/EndpointNotesPage';
import ViewErrorBoundary from '../common/ViewErrorBoundary';
import EmptySearchState from './EmptySearchState';
import EndpointWorkspace, {type ActiveSplitPane, type EndpointViewMode} from './EndpointWorkspace';
import {getOperation} from '../../utils/openapi';
import {
    appendResponseHistory,
    clearResponseHistory,
    removeResponseHistoryAt,
} from '../../utils/storage/responseHistory';

interface WorkspaceContentProps {
    spec: OpenApiSpec | null;
    specKey: string;
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    onAddReferencedFiles?: () => void;
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
    serverVariables: Record<string, Record<string, string>>;
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
    showNotes: boolean;
    showCompatibility: boolean;
    showSettings: boolean;
    settingsSection: string | null;
    onSelectSettingsSection: (section: SettingsSectionId) => void;
    appearanceSettings: AppearanceSettingsProps;
    aiSettingsSection: AISettingsSectionProps;
    showHome: boolean;
    onOpenAbout: () => void;
    onOpenHome: () => void;
    onOpenCompatibility: () => void;
    onOpenSchema: (name: string) => void;
    onSearchChange: (query: string) => void;
    onSelectEndpoint: (path: string, method: string) => void;
    onSearchResult: (path: string, method: string) => void;
    onOpenEndpointPermanent: (path: string, method: string) => void;
    onOpenEndpointPreview: (path: string, method: string) => void;
    onGenerateCode: (endpoint: {path: string; method: string}) => void;
    onAskAINewConversation: (path: string, method: string) => void;
    onHidePageViews: () => void;
}

export default function WorkspaceContent(props: WorkspaceContentProps) {
    const {
        spec,
        specKey,
        canOpenLocal,
        onOpenLocalFile,
        onAddReferencedFiles,
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
        serverVariables,
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
        showNotes,
        showCompatibility,
        showSettings,
        settingsSection,
        onSelectSettingsSection,
        appearanceSettings,
        aiSettingsSection,
        showHome,
        onOpenAbout,
        onOpenHome,
        onOpenCompatibility,
        onOpenSchema,
        onSearchChange,
        onSelectEndpoint,
        onSearchResult,
        onOpenEndpointPermanent,
        onOpenEndpointPreview,
        onGenerateCode,
        onAskAINewConversation,
        onHidePageViews,
    } = props;
    if (!spec) {
        if (showSettings) {
            return (
                <ViewErrorBoundary resetKey={`settings:${specKey}`} title="Settings could not be rendered">
                    <SettingsPage
                        section={settingsSection}
                        onSelectSection={onSelectSettingsSection}
                        appearance={appearanceSettings}
                        navigation={{specKey}}
                        ai={aiSettingsSection}
                    />
                </ViewErrorBoundary>
            );
        }
        if (showAbout) return <AboutView />;
        return <NoSpecView canOpenLocal={canOpenLocal} onOpenLocalFile={onOpenLocalFile} onOpenAbout={onOpenAbout} />;
    }
    if (showWelcome && !assistantActive) {
        return (
            <WelcomeView
                spec={spec}
                specTitle={spec.info?.title || specKey}
                specKey={specKey}
                onSearchSubmit={onSearchChange}
                onOpenHome={onOpenHome}
                onOpenLocalFile={onOpenLocalFile}
                canOpenLocal={canOpenLocal}
            />
        );
    }
    const hasFilters = selectedMethods.length || selectedTags.length || onlyProtected !== null;
    if (activeTabId === 'view:search') {
        if (resultsQuery.trim().length || hasFilters) {
            return (
                <SearchResultsView
                    spec={spec}
                    activeAuth={activeAuth}
                    searchQuery={resultsQuery}
                    onSelectEndpoint={onSearchResult}
                    onMiddleClickEndpoint={onOpenEndpointPermanent}
                    selectedServer={selectedServer}
                    selectedMethods={selectedMethods}
                    setSelectedMethods={setSelectedMethods}
                    selectedTags={selectedTags}
                    setSelectedTags={setSelectedTags}
                    onlyProtected={onlyProtected}
                    setOnlyProtected={setOnlyProtected}
                    displayRoutes={displayRoutes}
                    parsableKey={specKey}
                />
            );
        }
        return <EmptySearchState />;
    }
    if (selectedEndpoint) {
        const operation = getOperation(spec, selectedEndpoint.path, selectedEndpoint.method);
        if (operation) {
            const key = `${selectedEndpoint.method.toLowerCase()}:${selectedEndpoint.path}`;
            return (
                <EndpointWorkspace
                    spec={spec}
                    endpoint={selectedEndpoint}
                    parsableKey={specKey}
                    selectedTab={selectedViewMode}
                    setSelectedTab={setSelectedViewMode}
                    activeSplitPane={activeSplitPane}
                    setActiveSplitPane={setActiveSplitPane}
                    splitContainerRef={splitContainerRef}
                    docsPaneWidth={docsPaneWidth}
                    isSplitDragging={isSplitDragging}
                    onSplitResizeMouseDown={onSplitResizeMouseDown}
                    onSplitResizeKeyDown={onSplitResizeKeyDown}
                    splitSeparatorMin={splitSeparatorMin}
                    splitSeparatorMax={splitSeparatorMax}
                    splitSeparatorNow={splitSeparatorNow}
                    isMobile={isMobile}
                    activeAuth={activeAuth}
                    selectedServer={selectedServer}
                    serverVariables={serverVariables[selectedServer] ?? {}}
                    resolvedThemeMode={resolvedThemeMode}
                    activeResponseCode={activeResponseCode}
                    setActiveResponseCode={setActiveResponseCode}
                    responseHistory={examineResponses[key] || []}
                    onResponseChange={response =>
                        setExamineResponses(current => ({
                            ...current,
                            [key]: appendResponseHistory(
                                specKey,
                                selectedEndpoint.path,
                                selectedEndpoint.method,
                                response,
                                current[key] || [],
                            ),
                        }))
                    }
                    onDeleteResponse={index =>
                        setExamineResponses(current => ({
                            ...current,
                            [key]: removeResponseHistoryAt(
                                specKey,
                                selectedEndpoint.path,
                                selectedEndpoint.method,
                                index,
                                current[key] || [],
                            ),
                        }))
                    }
                    onClearResponse={async () => {
                        await clearResponseHistory(specKey, selectedEndpoint.path, selectedEndpoint.method);
                        setExamineResponses(current => ({...current, [key]: []}));
                    }}
                    onOpenSchema={onOpenSchema}
                    onGenerateCode={() => onGenerateCode(selectedEndpoint)}
                    onAskAINewConversation={() =>
                        onAskAINewConversation(selectedEndpoint.path, selectedEndpoint.method)
                    }
                />
            );
        }
    }
    if (showSchemaExplorer) {
        return (
            <ViewErrorBoundary resetKey={`schemas:${specKey}`} title="Schema Explorer could not be rendered">
                <SchemaExplorer
                    schemas={spec.components?.schemas}
                    onSelectSchema={onOpenSchema}
                    parsableKey={specKey}
                />
            </ViewErrorBoundary>
        );
    }
    if (showNotes) {
        return (
            <ViewErrorBoundary resetKey={`notes:${specKey}`} title="Local notes could not be rendered">
                <EndpointNotesPage spec={spec} onSelectEndpoint={onOpenEndpointPermanent} />
            </ViewErrorBoundary>
        );
    }
    if (showCompatibility) {
        return (
            <ViewErrorBoundary resetKey={`compatibility:${specKey}`} title="Compatibility report could not be rendered">
                <RunnerCompatibilityPage
                    spec={spec}
                    specKey={specKey}
                    onSelectEndpoint={onOpenEndpointPermanent}
                    onAddReferencedFiles={onAddReferencedFiles}
                />
            </ViewErrorBoundary>
        );
    }
    if (showSettings) {
        return (
            <ViewErrorBoundary resetKey={`settings:${specKey}`} title="Settings could not be rendered">
                <SettingsPage
                    section={settingsSection}
                    onSelectSection={onSelectSettingsSection}
                    appearance={appearanceSettings}
                    navigation={{specKey}}
                    ai={aiSettingsSection}
                />
            </ViewErrorBoundary>
        );
    }
    if (showAbout) return <AboutView />;
    if (showHome) {
        return (
            <HomeView
                spec={spec}
                specKey={specKey}
                selectedEndpoint={selectedEndpoint}
                onSelectEndpoint={onSelectEndpoint}
                onOpenCompatibility={onOpenCompatibility}
                selectedServer={selectedServer}
                onSelectServer={setSelectedServer}
                activeAuth={activeAuth}
                onDeepLinkResponse={(path, method, code) => {
                    onOpenEndpointPreview(path, method);
                    onHidePageViews();
                    setSelectedViewMode('docs');
                    setActiveResponseCode(code);
                }}
            />
        );
    }
    return (
        <WelcomeView
            spec={spec}
            specTitle={spec.info?.title || specKey}
            specKey={specKey}
            onSearchSubmit={onSearchChange}
            onOpenHome={onOpenHome}
            onOpenLocalFile={onOpenLocalFile}
            canOpenLocal={canOpenLocal}
        />
    );
}
