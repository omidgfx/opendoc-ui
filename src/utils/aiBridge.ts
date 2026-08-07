export const OPENDOC_UI_ACTION_EVENT = 'opendoc-ui:action';

export type OpenDocUIAction =
    | { action: 'open_endpoint'; path: string; method: string }
    | { action: 'open_runner'; path: string; method: string }
    | {
    action: 'set_runner_fields';
    path: string;
    method: string;
    params?: Record<string, string | string[]>;
    headers?: Record<string, string>;
    body?: string;
    bodyType?: string
}
    | {
    action: 'run_api';
    path: string;
    method: string;
    params?: Record<string, string | string[]>;
    headers?: Record<string, string>;
    body?: string;
    bodyType?: string
}
    | { action: 'open_schema'; schema: string }
    | { action: 'search_spec'; query: string }
    | { action: 'select_server'; url: string };

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']);
const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const isParams = (value: unknown): value is Record<string, string | string[]> =>
    isRecord(value) && Object.values(value).every(item => typeof item === 'string' || Array.isArray(item) && item.every(part => typeof part === 'string'));
const isHeaders = (value: unknown): value is Record<string, string> => isRecord(value) && Object.values(value).every(item => typeof item === 'string');

const normalizeEndpoint = (value: Record<string, any>): OpenDocUIAction | null => {
    if (typeof value.path !== 'string' || !value.path.startsWith('/') || typeof value.method !== 'string' || !METHODS.has(value.method.toLowerCase())) return null;
    const method = value.method.toLowerCase();
    if (value.action === 'open_endpoint' || value.action === 'open_runner') return {
        action: value.action,
        path: value.path,
        method
    };
    if (value.action === 'set_runner_fields' || value.action === 'run_api') {
        if (value.params !== undefined && !isParams(value.params)) return null;
        if (value.headers !== undefined && !isHeaders(value.headers)) return null;
        if (value.body !== undefined && typeof value.body !== 'string') return null;
        if (value.bodyType !== undefined && typeof value.bodyType !== 'string') return null;
        return {
            action: value.action,
            path: value.path,
            method, ...(value.params ? {params: value.params} : {}), ...(value.headers ? {headers: value.headers} : {}), ...(value.body !== undefined ? {body: value.body} : {}), ...(value.bodyType ? {bodyType: value.bodyType} : {})
        };
    }
    return null;
};

const validateAction = (value: unknown): OpenDocUIAction | null => {
    if (!isRecord(value) || typeof value.action !== 'string') return null;
    if (value.action === 'open_schema' && typeof value.schema === 'string' && value.schema.trim()) return {
        action: 'open_schema',
        schema: value.schema.trim()
    };
    if (value.action === 'search_spec' && typeof value.query === 'string') return {
        action: 'search_spec',
        query: value.query.slice(0, 300)
    };
    if (value.action === 'select_server' && typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) return {
        action: 'select_server',
        url: value.url
    };
    return normalizeEndpoint(value);
};

/** Parse only explicit action blocks; ordinary model prose is never executed. */
export const parseOpenDocUIActions = (text: string): OpenDocUIAction[] => {
    const actions: OpenDocUIAction[] = [];
    const blockRegex = /<opendoc-ui-action>\s*([\s\S]*?)\s*<\/opendoc-ui-action>|```(?:opendoc-ui-action|json)\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(text)) && actions.length < 8) {
        const raw = (match[1] || match[2] || '').trim();
        try {
            const action = validateAction(JSON.parse(raw));
            if (action) actions.push(action);
        } catch {
            // An action must be valid JSON in an explicit block to be offered.
        }
    }
    return actions;
};

export const stripOpenDocUIActionBlocks = (text: string): string => text
    .replace(/<opendoc-ui-action>[\s\S]*?<\/opendoc-ui-action>/gi, '')
    .replace(/```(?:opendoc-ui-action|json)\s*([\s\S]*?)```/gi, (whole, body: string) => {
        try {
            return validateAction(JSON.parse(body.trim())) ? '' : whole;
        } catch {
            return whole;
        }
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const actionLabel = (action: OpenDocUIAction): string => {
    if (action.action === 'open_endpoint') return `Open ${action.method.toUpperCase()} ${action.path}`;
    if (action.action === 'open_runner') return `Open Runner for ${action.method.toUpperCase()} ${action.path}`;
    if (action.action === 'set_runner_fields') return `Fill Runner fields for ${action.method.toUpperCase()} ${action.path}`;
    if (action.action === 'run_api') return `Fill and run ${action.method.toUpperCase()} ${action.path}`;
    if (action.action === 'open_schema') return `Open schema ${action.schema}`;
    if (action.action === 'search_spec') return `Search for “${action.query}”`;
    return `Use server ${action.url}`;
};

export const dispatchOpenDocUIAction = (action: OpenDocUIAction) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(OPENDOC_UI_ACTION_EVENT, {detail: action}));
};

export const OPENDOC_UI_BRIDGE_INSTRUCTIONS = `OpenDoc UI action bridge:
You may propose an action only in an explicit JSON block using this exact wrapper:
<opendoc-ui-action>{"action":"...", ...}</opendoc-ui-action>
The application shows the proposal as a button. It does not execute ordinary prose or arbitrary JSON.
Allowed action schemas:
- {"action":"open_endpoint","path":"/path","method":"get"}
- {"action":"open_runner","path":"/path","method":"post"}
- {"action":"set_runner_fields","path":"/path","method":"post","params":{},"headers":{},"body":"{...}","bodyType":"application/json"}
- {"action":"run_api","path":"/path","method":"post","params":{},"headers":{},"body":"{...}","bodyType":"application/json"}
- {"action":"open_schema","schema":"SchemaName"}
- {"action":"search_spec","query":"text"}
- {"action":"select_server","url":"https://server.example"}
Use exact paths, methods, schema names, and server URLs from retrieved context. A user click is required. Filling fields is not sending. Running an API is a consequential action and must be clearly described before the action block.`;
