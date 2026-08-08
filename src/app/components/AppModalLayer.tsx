import type {Dispatch, SetStateAction} from 'react';
import type {ActiveAuth, AISettings, OpenApiSpec, ThemeMode} from '../../types';
import type {TabItem} from '../../components/endpoint/EndpointTabs';
import ModalsStack from '../../components/modals/ModalsStack/ModalsStack';
import CodeGeneratorModal from '../../components/modals/CodeGeneratorModal';
import AuthModal from '../../components/modals/AuthModal';
import ShareModal from '../../components/modals/ShareModal';
import ThemeSelectorModal from '../../components/modals/ThemeSelectorModal';
import AISettingsModal from '../../components/ai/AISettingsModal';
import TabSwitcherOverlay from './TabSwitcherOverlay';

interface ShareTarget {
    url: string;
    title: string;
    description?: string;
}

interface AppModalLayerProps {
    spec: OpenApiSpec | null;
    specKey: string;
    schemaStack: string[];
    setSchemaStack: Dispatch<SetStateAction<string[]>>;
    onPopSchema: () => void;
    onPushSchema: (name: string) => void;
    codeEndpoint: { path: string; method: string } | null;
    setCodeEndpoint: Dispatch<SetStateAction<{ path: string; method: string } | null>>;
    activeAuth: ActiveAuth;
    setActiveAuth: Dispatch<SetStateAction<ActiveAuth>>;
    authOpen: boolean;
    setAuthOpen: Dispatch<SetStateAction<boolean>>;
    switcherOpen: boolean;
    tabs: TabItem[];
    activeTabId: string | null;
    switcherIndex: number;
    onCancelSwitcher: () => void;
    onSelectSwitcherTab: (id: string) => void;
    shareTarget: ShareTarget | null;
    setShareTarget: Dispatch<SetStateAction<ShareTarget | null>>;
    themeOpen: boolean;
    setThemeOpen: Dispatch<SetStateAction<boolean>>;
    selectedThemeName: string;
    setSelectedThemeName: Dispatch<SetStateAction<string>>;
    currentThemeMode: ThemeMode;
    setCurrentThemeMode: Dispatch<SetStateAction<ThemeMode>>;
    resolvedThemeMode: 'light' | 'dark';
    toggleThemeMode: () => void;
    aiSettingsOpen: boolean;
    setAISettingsOpen: Dispatch<SetStateAction<boolean>>;
    aiSettings: AISettings;
    onSaveAISettings: (settings: AISettings) => void;
}

export default function AppModalLayer({
                                          spec,
                                          specKey,
                                          schemaStack,
                                          setSchemaStack,
                                          onPopSchema,
                                          onPushSchema,
                                          codeEndpoint,
                                          setCodeEndpoint,
                                          activeAuth,
                                          setActiveAuth,
                                          authOpen,
                                          setAuthOpen,
                                          switcherOpen,
                                          tabs,
                                          activeTabId,
                                          switcherIndex,
                                          onCancelSwitcher,
                                          onSelectSwitcherTab,
                                          shareTarget,
                                          setShareTarget,
                                          themeOpen,
                                          setThemeOpen,
                                          selectedThemeName,
                                          setSelectedThemeName,
                                          currentThemeMode,
                                          setCurrentThemeMode,
                                          resolvedThemeMode,
                                          toggleThemeMode,
                                          aiSettingsOpen,
                                          setAISettingsOpen,
                                          aiSettings,
                                          onSaveAISettings,
                                      }: AppModalLayerProps) {
    return (
        <>
            {spec?.components?.schemas && (
                <ModalsStack
                    modals={schemaStack.map(name => ({
                        schemaName: name,
                        schema: spec.components!.schemas![name] || {},
                    })).filter(item => item.schema)}
                    onPopSchema={onPopSchema}
                    onPushSchema={onPushSchema}
                    onCloseAll={() => setSchemaStack([])}
                    componentsSchemas={spec.components.schemas}
                    parsableKey={specKey}
                />
            )}
            {codeEndpoint && spec && (
                <CodeGeneratorModal
                    isOpen
                    onClose={() => setCodeEndpoint(null)}
                    spec={spec}
                    path={codeEndpoint.path}
                    method={codeEndpoint.method}
                    operation={(spec.paths[codeEndpoint.path] as any)?.[codeEndpoint.method] || {}}
                    activeAuth={activeAuth}
                />
            )}
            <AuthModal
                isOpen={authOpen}
                onClose={() => setAuthOpen(false)}
                spec={spec}
                activeAuth={activeAuth}
                onSave={setActiveAuth}
            />
            <TabSwitcherOverlay
                open={switcherOpen}
                tabs={tabs}
                activeTabId={activeTabId}
                selectedIndex={switcherIndex}
                onCancel={onCancelSwitcher}
                onSelect={onSelectSwitcherTab}
            />
            {shareTarget && (
                <ShareModal
                    isOpen
                    onClose={() => setShareTarget(null)}
                    url={shareTarget.url}
                    title={shareTarget.title}
                    description={shareTarget.description}
                />
            )}
            <ThemeSelectorModal
                isOpen={themeOpen}
                selectedThemeName={selectedThemeName}
                currentThemeMode={currentThemeMode}
                resolvedThemeMode={resolvedThemeMode}
                onSelectTheme={setSelectedThemeName}
                onToggleThemeMode={toggleThemeMode}
                onSetThemeMode={setCurrentThemeMode}
                onClose={() => setThemeOpen(false)}
            />
            <AISettingsModal
                isOpen={aiSettingsOpen}
                settings={aiSettings}
                onSave={onSaveAISettings}
                onClose={() => setAISettingsOpen(false)}
            />
        </>
    );
}
