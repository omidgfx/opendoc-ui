/**
 * One naming and ordering source for parameter groups, so the documentation
 * view and the Runner never call the same thing by two different names.
 */
export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

export interface ParameterGroupMeta {
    location: ParameterLocation;
    title: string;
    icon: string;
    description: string;
}

export const PARAMETER_GROUPS: ParameterGroupMeta[] = [
    {
        location: 'path',
        title: 'Path Parameters',
        icon: 'ph ph-signpost',
        description: 'Substituted into the request route before it is sent.',
    },
    {
        location: 'query',
        title: 'Query Parameters',
        icon: 'ph ph-funnel',
        description: 'Appended to the request route as the query string.',
    },
    {
        location: 'header',
        title: 'Header Parameters',
        icon: 'ph ph-list-dashes',
        description: 'Sent as request headers.',
    },
    {
        location: 'cookie',
        title: 'Cookie Parameters',
        icon: 'ph ph-cookie',
        description: 'Sent in the Cookie header, subject to browser cookie rules.',
    },
];

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
