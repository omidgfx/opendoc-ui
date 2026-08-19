/**
 * One naming and ordering source for parameter groups, so the documentation
 * view and the Runner never call the same thing by two different names.
 */
export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

export interface ParameterGroupMeta {
    location: ParameterLocation;
    title: string;
    /** Short name used by inline tags, e.g. the location column. */
    shortTitle: string;
    icon: string;
    /** Theme token, so each location keeps its own hue in every palette. */
    color: string;
    description: string;
}

export const PARAMETER_GROUPS: ParameterGroupMeta[] = [
    {
        location: 'path',
        title: 'Path Parameters',
        shortTitle: 'Path',
        icon: 'ph-fill ph-signpost',
        color: 'var(--method-get)',
        description: 'Substituted into the request route before it is sent.',
    },
    {
        location: 'query',
        title: 'Query Parameters',
        shortTitle: 'Query',
        icon: 'ph-fill ph-funnel',
        color: 'var(--primary)',
        description: 'Appended to the request route as the query string.',
    },
    {
        location: 'header',
        title: 'Header Parameters',
        shortTitle: 'Header',
        icon: 'ph-fill ph-tag',
        color: 'var(--method-put)',
        description: 'Sent as request headers.',
    },
    {
        location: 'cookie',
        title: 'Cookie Parameters',
        shortTitle: 'Cookie',
        icon: 'ph-fill ph-cookie',
        color: 'var(--accent)',
        description: 'Sent in the Cookie header, subject to browser cookie rules.',
    },
];

export const parameterGroupMetaOf = (parameter: any): ParameterGroupMeta | null => {
    const location = parameterLocationOf(parameter);
    return PARAMETER_GROUPS.find(group => group.location === location) || null;
};

/** Swagger 2 and OAS 3.2 spell the query location in more than one way. */
export const parameterLocationOf = (parameter: any): ParameterLocation | null => {
    const location = String(parameter?.in || '').toLowerCase();
    if (location === 'path') return 'path';
    if (location === 'query' || location === 'querystring') return 'query';
    if (location === 'header') return 'header';
    if (location === 'cookie') return 'cookie';
    return null;
};

export interface ParameterGroup extends ParameterGroupMeta {
    parameters: any[];
}

/** Parameters split by location, in the shared order, empty groups dropped. */
export const groupParameters = (parameters: any[]): ParameterGroup[] =>
    PARAMETER_GROUPS.map(group => ({
        ...group,
        parameters: parameters.filter(parameter => parameterLocationOf(parameter) === group.location),
    })).filter(group => group.parameters.length > 0);
