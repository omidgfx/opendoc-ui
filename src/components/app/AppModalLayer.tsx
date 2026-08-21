import type {Dispatch, SetStateAction} from 'react';
import type {ActiveAuth, AISettings, OpenApiSpec, Operation} from '../../types';
import type {TabItem} from '../endpoint/EndpointTabs';
import ModalsStack from '../modals/ModalsStack/ModalsStack';
import CodeGeneratorModal from '../modals/CodeGeneratorModal';
import ServerVariablesModal from '../modals/ServerVariablesModal';
import AuthModal from '../modals/AuthModal';
import ShareModal from '../modals/ShareModal';
import TabSwitcherOverlay from './TabSwitcherOverlay';
import {getOperation} from '../../utils/openapi';
import ViewErrorBoundary from '../common/ViewErrorBoundary';

interface ShareTarget {
    url: string;
    title: string;
    description?: string;
}

interface AppModalLayerProps {
    spec: OpenApiSpec | null;
    specKey: string;
    selectedServer: string;
    serverVariables: Record<string, Record<string, string>>;
    onChangeServerVariables: (url: string, values: Record<string, string>) => void;
    serverVariablesOpen: boolean;
    setServerVariablesOpen: Dispatch<SetStateAction<boolean>>;
    schemaStack: string[];
    setSchemaStack: Dispatch<SetStateAction<string[]>>;
    onPopSchema: () => void;
    onPushSchema: (name: string) => void;
    codeEndpoint: {
        path: string;
        method: string;
    } | null;
    setCodeEndpoint: Dispatch<
        SetStateAction<{
            path: string;
            method: string;
        } | null>
    >;
    activeAuth: ActiveAuth;
    authOperation?: Operation | null;
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
    aiSettings: AISettings;
    onSaveAISettings: (settings: AISettings) => void;
}

export default function AppModalLayer({
    spec,
    specKey,
    selectedServer,
    serverVariables,
    onChangeServerVariables,
    serverVariablesOpen,
    setServerVariablesOpen,
    schemaStack,
    setSchemaStack,
    onPopSchema,
    onPushSchema,
    codeEndpoint,
    setCodeEndpoint,
    activeAuth,
    authOperation,
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
    aiSettings,
    onSaveAISettings,
}: AppModalLayerProps) {
    const variablesServer = serverVariablesOpen
        ? (spec?.servers || []).find(entry => entry.url === selectedServer) || null
        : null;
    return (
        <>
            {spec?.components?.schemas && (
                <ViewErrorBoundary
                    resetKey={`schema-modal:${specKey}:${schemaStack.join(',')}`}
                    title="Schema inspection could not be rendered"
                >
                    <ModalsStack
                        spec={spec}
                        modals={schemaStack
                            .map(name => ({
                                schemaName: name,
                                schema: spec.components!.schemas![name] ?? {},
                            }))
                            .filter(item => item.schema !== undefined && item.schema !== null)}
                        onPopSchema={onPopSchema}
                        onPushSchema={onPushSchema}
                        onCloseAll={() => setSchemaStack([])}
                        componentsSchemas={spec.components.schemas}
                        parsableKey={specKey}
                    />
                </ViewErrorBoundary>
            )}
            {codeEndpoint && spec && (
                <CodeGeneratorModal
                    isOpen
                    onClose={() => setCodeEndpoint(null)}
                    spec={spec}
                    specKey={specKey}
                    path={codeEndpoint.path}
                    method={codeEndpoint.method}
                    operation={getOperation(spec, codeEndpoint.path, codeEndpoint.method) || {}}
                    selectedServer={selectedServer}
                    serverVariables={serverVariables[selectedServer] ?? {}}
                    activeAuth={activeAuth}
                />
            )}
            {variablesServer && (
                <ServerVariablesModal
                    server={variablesServer}
                    initialValues={serverVariables[variablesServer.url] ?? {}}
                    onApply={values => onChangeServerVariables(variablesServer.url, values)}
                    onClose={() => setServerVariablesOpen(false)}
                />
            )}
            <AuthModal
                isOpen={authOpen}
                onClose={() => setAuthOpen(false)}
                spec={spec}
                specKey={specKey}
                operation={authOperation}
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
        </>
    );
}
