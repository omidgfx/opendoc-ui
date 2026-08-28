import {expandAllOfBranches, mergeAnyOfBranchSchemas} from './combinators';
export type BranchSelectionMap = Record<string, number>;
/** Field path → focused allOf part index, or null for Combined (show every part). */
export type AllOfFocusMap = Record<string, number | null>;
/** Field path → selected anyOf branch indices (empty / missing = all branches). */
export type AnyOfSelectionMap = Record<string, number[]>;

const schemaBranchSelections = new Map<string, BranchSelectionMap>();
const schemaAllOfFocus = new Map<string, AllOfFocusMap>();
const schemaAnyOfSelections = new Map<string, AnyOfSelectionMap>();
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
                detail: {key, path, index, kind: 'oneOf', selections: next},
            }),
        );
    }
    return next;
};

export const readSchemaAllOfFocus = (key: string): AllOfFocusMap => ({
    ...(schemaAllOfFocus.get(key) || {}),
});

/**
 * Focus one allOf part under `path` (dim sibling fields), or pass `null` for
 * Combined. Index `-1` is accepted as Combined so menus can use a single
 * numeric activeIndex like oneOf.
 */
export const writeSchemaAllOfFocus = (key: string, path: string, index: number | null): AllOfFocusMap => {
    const normalized = index === null || index < 0 ? null : index;
    const next = {...(schemaAllOfFocus.get(key) || {}), [path]: normalized};
    schemaAllOfFocus.set(key, next);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent(SCHEMA_BRANCH_SELECTION_EVENT, {
                detail: {key, path, index: normalized, kind: 'allOf', allOfFocus: next},
            }),
        );
    }
    return next;
};

export const readSchemaAnyOfSelections = (key: string): AnyOfSelectionMap => ({
    ...(schemaAnyOfSelections.get(key) || {}),
});

/**
 * Replace the selected anyOf branches under `path`. Pass an empty array (or
 * every index) for "All". Index `-1` alone is treated as All.
 */
export const writeSchemaAnyOfSelection = (key: string, path: string, indices: number[]): AnyOfSelectionMap => {
    const cleaned = Array.from(
        new Set(
            indices
                .filter(index => typeof index === 'number' && Number.isFinite(index))
                .map(index => Math.trunc(index)),
        ),
    ).filter(index => index >= 0);
    const next = {...(schemaAnyOfSelections.get(key) || {}), [path]: cleaned};
    schemaAnyOfSelections.set(key, next);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent(SCHEMA_BRANCH_SELECTION_EVENT, {
                detail: {key, path, indices: cleaned, kind: 'anyOf', anyOfSelections: next},
            }),
        );
    }
    return next;
};

/** Toggle one anyOf branch under `path`. Returns the next index list. */
export const toggleSchemaAnyOfSelection = (key: string, path: string, index: number, branchCount: number): number[] => {
    const current = readSchemaAnyOfSelections(key)[path];
    // Missing / empty means All are selected.
    const selected =
        !current || current.length === 0 ? Array.from({length: Math.max(0, branchCount)}, (_, i) => i) : [...current];
    const at = selected.indexOf(index);
    if (at >= 0) selected.splice(at, 1);
    else selected.push(index);
    selected.sort((a, b) => a - b);
    // Selecting every branch collapses back to All (empty list).
    const next = branchCount > 0 && selected.length === branchCount ? [] : selected;
    writeSchemaAnyOfSelection(key, path, next);
    return next;
};

/**
 * Property names owned by the focused allOf part at `path` (resolved against
 * the live schema tree). Returns null when focus is Combined or the path is
 * not an allOf field.
 */
export const allOfFocusPropertyNames = (
    input: any,
    selectionKey: string,
    path: string,
    resolveReference: (item: any) => any,
): Set<string> | null => {
    const focus = readSchemaAllOfFocus(selectionKey)[path];
    if (focus === null || focus === undefined) return null;
    const schemaAtPath = schemaAtBranchPath(input, path, resolveReference);
    if (!schemaAtPath || !Array.isArray(schemaAtPath.allOf)) return null;
    const parts = expandAllOfBranches(schemaAtPath, resolveReference);
    const list = parts.length > 0 ? parts : schemaAtPath.allOf;
    if (!list[focus]) return null;
    return propertyNamesOfSchema(list[focus], resolveReference);
};

/** Top-level (and nested via flatten) property names contributed by a schema. */
export const propertyNamesOfSchema = (schema: any, resolveReference: (item: any) => any): Set<string> => {
    const names = new Set<string>();
    const visit = (input: any, depth: number, refs: Set<string>, objects: Set<object>) => {
        if (!input || typeof input !== 'object' || depth > 24) return;
        let current = input;
        if (typeof current.$ref === 'string') {
            if (refs.has(current.$ref)) return;
            refs = new Set(refs);
            refs.add(current.$ref);
            const resolved = resolveReference(current);
            if (!resolved || resolved === current) return;
            current = resolved;
        }
        if (!current || typeof current !== 'object' || objects.has(current)) return;
        objects = new Set(objects);
        objects.add(current);
        if (Array.isArray(current.allOf)) current.allOf.forEach((part: any) => visit(part, depth + 1, refs, objects));
        if (current.properties && typeof current.properties === 'object') {
            Object.keys(current.properties).forEach(name => names.add(name));
        }
    };
    visit(schema, 0, new Set(), new Set());
    return names;
};

const schemaAtBranchPath = (input: any, path: string, resolveReference: (item: any) => any): any => {
    if (!path) return input;
    const segments = path.split('.').filter(Boolean);
    let current = input;
    for (const segment of segments) {
        if (!current || typeof current !== 'object') return null;
        if (typeof current.$ref === 'string') {
            current = resolveReference(current) || current;
        }
        // Skip through allOf/anyOf wrappers that share this path.
        while (current && typeof current === 'object' && !current.properties && Array.isArray(current.allOf)) {
            // Prefer a part that holds the next segment.
            const hit = current.allOf.find((part: any) => {
                const resolved = resolveReference(part) || part;
                return resolved?.properties && segment in resolved.properties;
            });
            current = resolveReference(hit || current.allOf[0]) || hit || current.allOf[0];
        }
        if (segment === '*') {
            current = current?.items;
            continue;
        }
        if (segment === 'additionalProperties') {
            current = current?.additionalProperties;
            continue;
        }
        const bare = segment.replace(/\[[^\]]+\]/g, '');
        if (current?.properties && bare in current.properties) {
            current = current.properties[bare];
            continue;
        }
        return null;
    }
    if (current && typeof current.$ref === 'string') current = resolveReference(current) || current;
    return current;
};

/** True when following this branch would re-enter a schema already on the apply stack. */
const branchReentersCycle = (
    branch: any,
    resolveReference: (item: any) => any,
    ancestorRefs: Set<string>,
    ancestorObjects: Set<object>,
): boolean => {
    if (!branch || typeof branch !== 'object') return false;
    if (typeof branch.$ref === 'string' && ancestorRefs.has(branch.$ref)) return true;
    try {
        const resolved = typeof branch.$ref === 'string' ? resolveReference(branch) : branch;
        return !!(resolved && typeof resolved === 'object' && ancestorObjects.has(resolved));
    } catch {
        return typeof branch.$ref === 'string' && ancestorRefs.has(branch.$ref);
    }
};

/**
 * Absolute ceiling on apply recursion depth. Cycle sets are the primary guard;
 * this is a last-resort fuse against pathological specs or missed edges.
 */
const APPLY_MAX_DEPTH = 48;

export const applySchemaBranchSelections = (
    input: any,
    selectionKey: string,
    resolveReference: (item: any) => any,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
    depth = 0,
): any => {
    if (!input || typeof input !== 'object' || input === true || input === false) return input;
    if (depth > APPLY_MAX_DEPTH) return input;
    if (Array.isArray(input)) {
        return input.map((item, index) =>
            applySchemaBranchSelections(
                item,
                selectionKey,
                resolveReference,
                `${path}[${index}]`,
                new Set(ancestorRefs),
                new Set(ancestorObjects),
                depth + 1,
            ),
        );
    }

    const selections = schemaBranchSelections.get(selectionKey) || {};

    if (path && Array.isArray(input.oneOf) && input.oneOf.length > 0) {
        const index = Math.max(0, Math.min(input.oneOf.length - 1, selections[path] ?? 0));
        const picked = input.oneOf[index];
        // Recursive oneOf branch: keep the $ref leaf — do not re-expand the same component.
        if (branchReentersCycle(picked, resolveReference, ancestorRefs, ancestorObjects)) {
            return picked;
        }
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
            depth + 1,
        );
    }

    if (path && Array.isArray(input.anyOf) && input.anyOf.length > 0) {
        const anyOfMap = schemaAnyOfSelections.get(selectionKey) || {};
        const selected = anyOfMap[path];
        // Empty / missing = All branches (body-level anyOf default).
        const indices =
            !selected || selected.length === 0
                ? input.anyOf.map((_: any, index: number) => index)
                : selected.filter(index => index >= 0 && index < input.anyOf.length);

        // Split cyclic vs safe branches. Expanding a $ref already on the stack
        // (e.g. TreeNode.parent anyOf → TreeNode) re-enters forever via merge.
        const safeIndices: number[] = [];
        let cyclicBranch: any = null;
        indices.forEach(index => {
            const branch = input.anyOf[index];
            if (branchReentersCycle(branch, resolveReference, ancestorRefs, ancestorObjects)) {
                if (!cyclicBranch) cyclicBranch = branch;
                return;
            }
            safeIndices.push(index);
        });

        // Only cyclic branch(es) remain: return the $ref leaf so mocks/tables stub.
        if (safeIndices.length === 0) {
            return cyclicBranch ?? input.anyOf[indices[0]] ?? input;
        }

        // Merge only non-cyclic branches. Recursive $refs stay unexpanded.
        const merged = mergeAnyOfBranchSchemas(input.anyOf, safeIndices, resolveReference, {
            title: input.title,
            description: input.description,
        });
        const withMeta = {
            ...merged,
            ...(merged?.deprecated === undefined && input.deprecated !== undefined
                ? {deprecated: input.deprecated}
                : {}),
            ...(merged?.readOnly === undefined && input.readOnly !== undefined ? {readOnly: input.readOnly} : {}),
            ...(merged?.writeOnly === undefined && input.writeOnly !== undefined ? {writeOnly: input.writeOnly} : {}),
        };
        return applySchemaBranchSelections(
            withMeta,
            selectionKey,
            resolveReference,
            path,
            new Set(ancestorRefs),
            new Set(ancestorObjects),
            depth + 1,
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
            depth + 1,
        );
        if (!selectedResolved || typeof selectedResolved !== 'object' || Array.isArray(selectedResolved)) {
            return selectedResolved;
        }
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
                        depth + 1,
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
            depth + 1,
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
            depth + 1,
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
                depth + 1,
            ),
        );
    }
    ['then', 'else', 'if', 'not', 'contains', 'contentSchema', 'unevaluatedItems', 'unevaluatedProperties'].forEach(
        key => {
            if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
                output[key] = applySchemaBranchSelections(
                    input[key],
                    selectionKey,
                    resolveReference,
                    path ? `${path}.${key}` : key,
                    new Set(ancestorRefs),
                    new Set(nextObjects),
                    depth + 1,
                );
            }
        },
    );
    // Root-level (path === '') oneOf/anyOf/allOf stay on the body rail — still walk
    // children so nested field menus inside each branch are applied. Field-level
    // oneOf/anyOf were already collapsed above and never reach here with those keys.
    ['allOf', 'anyOf', 'oneOf'].forEach(key => {
        if (Array.isArray(input[key])) {
            output[key] = input[key].map((item: any) =>
                applySchemaBranchSelections(
                    item,
                    selectionKey,
                    resolveReference,
                    path,
                    new Set(ancestorRefs),
                    new Set(nextObjects),
                    depth + 1,
                ),
            );
        }
    });
    return output;
};
