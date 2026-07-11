export interface EndpointRef {
    path: string;
    method: string;
}

export interface ParsedRoute {
    parsableKey: string;
    showSchemaExplorer: boolean;
    showHome: boolean;
    showAbout: boolean;
    endpoint: EndpointRef | null;
    tab: 'view' | 'examine';
    schemas: string[];
    responseCode: string | null;
    legacyOperationId: string | null;
    searchQuery: string;
}
