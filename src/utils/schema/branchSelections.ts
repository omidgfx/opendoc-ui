export type BranchSelectionMap = Record<string, number>;

const schemaBranchSelections = new Map<string, BranchSelectionMap>();
export const SCHEMA_BRANCH_SELECTION_EVENT = 'opendoc:schema-branch-selection-changed';

export const readSchemaBranchSelections = (key: string): BranchSelectionMap => ({
    ...(schemaBranchSelections.get(key) || {}),
});

export const writeSchemaBranchSelection = (key: string, path: string, index: number): BranchSelectionMap => {
    const next = {...(schemaBranchSelections.get(key) || {}), [path]: index};
    schemaBranchSelections.set(key, next);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent(SCHEMA_BRANCH_SELECTION_EVENT, {
                detail: {key, path, index, selections: next},
            }),
        );
    }
    return next;
};

export const applySchemaBranchSelections = (
    input: any,
    selectionKey: string,
    resolveReference: (item: any) => any,
    path = '',
): any => {
    if (!input || typeof input !== 'object' || input === true || input === false) return input;
    if (Array.isArray(input))
        return input.map((item, index) =>
            applySchemaBranchSelections(item, selectionKey, resolveReference, `${path}[${index}]`),
        );
    const selections = schemaBranchSelections.get(selectionKey) || {};
    if (path && Array.isArray(input.oneOf) && input.oneOf.length > 0) {
        const index = Math.max(0, Math.min(input.oneOf.length - 1, selections[path] ?? 0));
        const picked = input.oneOf[index];
        const merged = {
            ...picked,
            ...(picked?.title === undefined && input.title ? {title: input.title} : {}),
            ...(picked?.description === undefined && input.description ? {description: input.description} : {}),
            ...(picked?.deprecated === undefined && input.deprecated !== undefined
                ? {deprecated: input.deprecated}
                : {}),
            ...(picked?.readOnly === undefined && input.readOnly !== undefined ? {readOnly: input.readOnly} : {}),
            ...(picked?.writeOnly === undefined && input.writeOnly !== undefined ? {writeOnly: input.writeOnly} : {}),
        };
        return applySchemaBranchSelections(merged, selectionKey, resolveReference, path);
    }
    const output: any = Array.isArray(input) ? [] : {...input};
    if (input.properties && typeof input.properties === 'object') {
        output.properties = Object.fromEntries(
            Object.entries(input.properties).map(([name, value]) => {
                const childPath = path ? `${path}.${name}` : name;
                return [name, applySchemaBranchSelections(value, selectionKey, resolveReference, childPath)];
            }),
        );
    }
    if (input.additionalProperties && typeof input.additionalProperties === 'object') {
        const childPath = path ? `${path}.additionalProperties` : 'additionalProperties';
        output.additionalProperties = applySchemaBranchSelections(
            input.additionalProperties,
            selectionKey,
            resolveReference,
            childPath,
        );
    }
    if (input.items && typeof input.items === 'object') {
        const childPath = path ? `${path}.*` : '*';
        output.items = applySchemaBranchSelections(input.items, selectionKey, resolveReference, childPath);
    }
    if (Array.isArray(input.prefixItems)) {
        output.prefixItems = input.prefixItems.map((item: any, index: number) =>
            applySchemaBranchSelections(item, selectionKey, resolveReference, `${path}[${index}]`),
        );
    }
    [
        'allOf',
        'anyOf',
        'then',
        'else',
        'if',
        'not',
        'contains',
        'contentSchema',
        'unevaluatedItems',
        'unevaluatedProperties',
    ].forEach(key => {
        if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key]))
            output[key] = applySchemaBranchSelections(
                input[key],
                selectionKey,
                resolveReference,
                path ? `${path}.${key}` : key,
            );
    });
    ['allOf', 'anyOf'].forEach(key => {
        if (Array.isArray(input[key]))
            output[key] = input[key].map((item: any, index: number) =>
                applySchemaBranchSelections(item, selectionKey, resolveReference, `${path}.${key}[${index}]`),
            );
    });
    return output;
};
