export interface EndpointRef {
    path: string;
    method: string;
}

export interface ParsedRoute {
    parsableKey: string;
    showSchemaExplorer: boolean;
    showNotes: boolean;
    showCompatibility: boolean;
    showHome: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    endpoint: EndpointRef | null;
    tab: 'view' | 'examine' | 'both';
    schemas: string[];
    responseCode: string | null;
    legacyOperationId: string | null;
    searchQuery: string;
    searchMethods: string[];
    searchTags: string[];
    searchSecured: boolean | null;
}
