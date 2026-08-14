import type {Dispatch, SetStateAction} from 'react';
import type {OpenApiSpec, ParsableConfig, ThemeMode} from '@/src/types';
import type {LocalHistoryEntry} from '@/src/utils/localHistory';
import type {RemoteHistoryEntry} from '@/src/utils/remoteHistory';
import type {ViewTabKind} from '@/src/components/endpoint/EndpointTabs';

export interface SidebarProps {
    spec: OpenApiSpec | null;
    parsables?: ParsableConfig;
    selectedParsableKey?: string;
    onSelectParsable?: (key: string) => void;
    selectedServer: string;
    onSelectServer: (server: string) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onOpenSchemaExplorer: () => void;
    showSchemaExplorer: boolean;
    onOpenNotes: () => void;
    showNotes: boolean;
    showCompatibility: boolean;
    selectedMethods: string[];
    setSelectedMethods: Dispatch<SetStateAction<string[]>>;
    selectedTags: string[];
    setSelectedTags: Dispatch<SetStateAction<string[]>>;
    onlyProtected: boolean | null;
    setOnlyProtected: Dispatch<SetStateAction<boolean | null>>;
    searchQuery: string;
    selectedEndpoint: {
        path: string;
        method: string;
    } | null;
    onSelectEndpoint: (path: string, method: string) => void;
    getEndpointHref?: (path: string, method: string) => string;
    onMiddleClickEndpoint?: (path: string, method: string) => void;
    onOpenHome: () => void;
    onOpenAbout: () => void;
    scrollIntent: {
        type: 'endpoint' | 'view';
        id: string;
    } | null;
    setScrollIntent: (
        value: {
            type: 'endpoint' | 'view';
            id: string;
        } | null,
    ) => void;
    onOpenViewPermanent: (view: ViewTabKind) => void;
    onContextAction: (
        action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai',
        target:
            | {
                  type: 'endpoint';
                  path: string;
                  method: string;
              }
            | {
                  type: 'view';
                  view: ViewTabKind;
              },
    ) => void;
    showHome: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    assistantContextEndpoints: Array<{
        path: string;
        method: string;
    }>;
    hasAIProfile: boolean;
    themeMode: ThemeMode;
    resolvedThemeMode: 'light' | 'dark';
    onToggleThemeMode: () => void;
    selectedThemeName: string;
    onOpenThemeModal: () => void;
    onOpenAuthModal: () => void;
    activeAuth: any;
    onDownloadSpec: () => void;
    isLocalMode: boolean;
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    onDisplayRoutesChange?: (displayRoutes: boolean) => void;
    onReloadSpecification: (key: string) => void | Promise<void>;
    onResetSpecification: (key: string, options?: {clearNotes?: boolean}) => void | Promise<void>;
    onResetAllConfigurations: () => void;
    onRefreshSpec: () => void;
    isRefreshingSpec: boolean;
    localHistory: LocalHistoryEntry[];
    onSelectHistoryEntry: (entry: LocalHistoryEntry) => void;
    onRemoveHistoryEntry: (key: string) => void;
    onClearHistory: () => void;
    localOpenError: string | null;
    onDismissLocalError: () => void;
    remoteLoadingEnabled: boolean;
    downloaderConfigured: boolean;
    remoteHistory: RemoteHistoryEntry[];
    remoteOpenError: string | null;
    isLoadingRemoteSpec: boolean;
    remoteLoadStatus: string | null;
    onLoadRemoteUrl: (url: string) => Promise<unknown>;
    onSelectRemoteHistoryEntry: (entry: RemoteHistoryEntry) => Promise<unknown>;
    onRemoveRemoteHistoryEntry: (key: string) => Promise<void> | void;
    onClearRemoteHistory: () => Promise<void> | void;
    mobileOpen: boolean;
    onCloseMobile: () => void;
    onOpenMobile: () => void;
}
