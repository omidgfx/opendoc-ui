export interface EndpointRef {
    path: string;
    method: string;
}

export interface ParsedRoute {
    parsableKey: string;
    showSchemaExplorer: boolean;
    showHome: boolean;
    showAbout: boolean;
    showAssistant: boolean;
    endpoint: EndpointRef | null;
    /** 'view' = docs only, 'examine' = runner only, 'both' = side-by-side split view */
    tab: 'view' | 'examine' | 'both';
    schemas: string[];
    responseCode: string | null;
    legacyOperationId: string | null;
    searchQuery: string;
    searchMethods: string[];
    searchTags: string[];
    searchSecured: boolean | null;
}