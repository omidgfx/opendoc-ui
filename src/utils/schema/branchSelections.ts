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
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): any => {
    if (!input || typeof input !== 'object' || input === true || input === false) return input;
    if (Array.isArray(input))
        return input.map((item, index) =>
            applySchemaBranchSelections(
                item,
                selectionKey,
                resolveReference,
                `${path}[${index}]`,
                new Set(ancestorRefs),
                new Set(ancestorObjects),
            ),
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
        return applySchemaBranchSelections(
            merged,
            selectionKey,
            resolveReference,
            path,
            new Set(ancestorRefs),
            new Set(ancestorObjects),
        );
    }
    if (typeof input.$ref === 'string') {
        const ref = input.$ref;
        if (ancestorRefs.has(ref)) return input;
        const resolved = resolveReference(input);
        if (!resolved || resolved === input) return input;
        const nextRefs = new Set(ancestorRefs);
        nextRefs.add(ref);
        const selectedResolved = applySchemaBranchSelections(
            resolved,
            selectionKey,
            resolveReference,
            path,
            nextRefs,
            new Set(ancestorObjects),
        );
        if (!selectedResolved || typeof selectedResolved !== 'object' || Array.isArray(selectedResolved))
            return selectedResolved;
        return {
            ...selectedResolved,
            ...(input.title !== undefined ? {title: input.title} : {}),
            ...(input.description !== undefined ? {description: input.description} : {}),
            ...(input.deprecated !== undefined ? {deprecated: input.deprecated} : {}),
            ...(input.readOnly !== undefined ? {readOnly: input.readOnly} : {}),
            ...(input.writeOnly !== undefined ? {writeOnly: input.writeOnly} : {}),
            ...(input.example !== undefined ? {example: input.example} : {}),
            ...(input.externalDocs !== undefined ? {externalDocs: input.externalDocs} : {}),
        };
    }
    if (ancestorObjects.has(input)) return input;
    const nextObjects = new Set(ancestorObjects);
    nextObjects.add(input);
    const output: any = {...input};
    if (input.properties && typeof input.properties === 'object') {
        output.properties = Object.fromEntries(
            Object.entries(input.properties).map(([name, value]) => {
                const childPath = path ? `${path}.${name}` : name;
                return [
                    name,
                    applySchemaBranchSelections(
                        value,
                        selectionKey,
                        resolveReference,
                        childPath,
                        new Set(ancestorRefs),
                        new Set(nextObjects),
                    ),
                ];
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
            new Set(ancestorRefs),
            new Set(nextObjects),
        );
    }
    if (input.items && typeof input.items === 'object') {
        const childPath = path ? `${path}.*` : '*';
        output.items = applySchemaBranchSelections(
            input.items,
            selectionKey,
            resolveReference,
            childPath,
            new Set(ancestorRefs),
            new Set(nextObjects),
        );
    }
    if (Array.isArray(input.prefixItems)) {
        output.prefixItems = input.prefixItems.map((item: any, index: number) =>
            applySchemaBranchSelections(
                item,
                selectionKey,
                resolveReference,
                `${path}[${index}]`,
                new Set(ancestorRefs),
                new Set(nextObjects),
            ),
        );
    }
    ['then', 'else', 'if', 'not', 'contains', 'contentSchema', 'unevaluatedItems', 'unevaluatedProperties'].forEach(
        key => {
            if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key]))
                output[key] = applySchemaBranchSelections(
                    input[key],
                    selectionKey,
                    resolveReference,
                    path ? `${path}.${key}` : key,
                    new Set(ancestorRefs),
                    new Set(nextObjects),
                );
        },
    );
    ['allOf', 'anyOf', 'oneOf'].forEach(key => {
        if (Array.isArray(input[key]))
            output[key] = input[key].map((item: any) =>
                applySchemaBranchSelections(
                    item,
                    selectionKey,
                    resolveReference,
                    path,
                    new Set(ancestorRefs),
                    new Set(nextObjects),
                ),
            );
    });
    return output;
};
