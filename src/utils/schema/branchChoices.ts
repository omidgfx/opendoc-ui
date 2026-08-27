import {schemaVariantLabel, type SchemaReferenceResolver} from '../schemaProperties';

export type SchemaBranchKind = 'oneOf' | 'allOf';

export interface SchemaBranchChoiceOption {
    index: number;
    label: string;
    description?: string;
}

export interface SchemaBranchChoice {
    path: string;
    title: string;
    kind: SchemaBranchKind;
    options: SchemaBranchChoiceOption[];
}

/** @deprecated Prefer SchemaBranchChoice — kept for older call sites. */
export type SchemaOneOfChoice = SchemaBranchChoice;
/** @deprecated Prefer SchemaBranchChoiceOption. */
export type SchemaOneOfChoiceOption = SchemaBranchChoiceOption;

const optionOf = (
    variant: any,
    index: number,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
): SchemaBranchChoiceOption => ({
    index,
    label: schemaVariantLabel(variant, resolveReference, getRefName, index),
    description: (resolveReference(variant) || variant)?.description || '',
});

/**
 * Walk a schema tree and collect every field-level oneOf (exclusive pick) and
 * allOf (focus a composed part) the reader can act on. Root-level combinators
 * (empty path) are intentionally skipped — the body rail owns those.
 *
 * allOf is never collapsed to a single branch here: composition still applies
 * fully to mocks/tables; the choice only drives focus/dimming (see
 * `readSchemaAllOfFocus` / SchemaViewer allOf chips).
 */
export const collectSchemaBranchChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): SchemaBranchChoice[] => {
    if (!input || typeof input !== 'object') return [];

    let schema = input;
    const refs = new Set(ancestorRefs);
    if (typeof schema.$ref === 'string') {
        const ref = schema.$ref;
        if (refs.has(ref)) return [];
        refs.add(ref);
        const resolved = resolveReference(schema);
        if (!resolved || resolved === schema) return [];
        schema = resolved;
    }
    if (!schema || typeof schema !== 'object') return [];
    if (ancestorObjects.has(schema)) return [];
    const objects = new Set(ancestorObjects);
    objects.add(schema);

    const choices: SchemaBranchChoice[] = [];
    // Field-level only (`path` non-empty). Top-level oneOf/allOf stay on the rail.
    if (path && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
        choices.push({
            path,
            title: path,
            kind: 'oneOf',
            options: schema.oneOf.map((variant: any, index: number) =>
                optionOf(variant, index, resolveReference, getRefName),
            ),
        });
    }
    if (path && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        choices.push({
            path,
            title: path,
            kind: 'allOf',
            // Leading "Combined" matches the body-level allOf rail (null focus).
            options: [
                {
                    index: -1,
                    label: 'Combined',
                    description: 'Show every field from all composed parts',
                },
                ...schema.allOf.map((variant: any, index: number) =>
                    optionOf(variant, index, resolveReference, getRefName),
                ),
            ],
        });
    }

    const collectChild = (child: any, childPath: string) => {
        choices.push(...collectSchemaBranchChoices(child, resolveReference, getRefName, childPath, refs, objects));
    };

    if (schema.properties && typeof schema.properties === 'object') {
        Object.entries(schema.properties).forEach(([name, value]) => {
            const childPath = path ? `${path}.${name}` : name;
            collectChild(value, childPath);
        });
    }
    if (schema.items && typeof schema.items === 'object') {
        const childPath = path ? `${path}.*` : '*';
        collectChild(schema.items, childPath);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const childPath = path ? `${path}.additionalProperties` : 'additionalProperties';
        collectChild(schema.additionalProperties, childPath);
    }
    if (Array.isArray(schema.prefixItems)) {
        schema.prefixItems.forEach((item: any, index: number) => {
            collectChild(item, `${path}[${index}]`);
        });
    }
    // Descend into allOf/anyOf wrappers without a new path segment so a property
    // whose schema is `{ allOf: […, { oneOf: […] }] }` still surfaces nested
    // oneOf/allOf under that property name. Do not walk `oneOf` here — the
    // field's own oneOf is already recorded above; walking it would re-enter
    // the same path and double-register.
    ['allOf', 'anyOf'].forEach(key => {
        if (Array.isArray(schema[key])) schema[key].forEach((item: any) => collectChild(item, path));
    });

    return choices;
};

/** oneOf-only collector (legacy name). Prefer collectSchemaBranchChoices. */
export const collectSchemaOneOfChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): SchemaBranchChoice[] =>
    collectSchemaBranchChoices(input, resolveReference, getRefName, path, ancestorRefs, ancestorObjects).filter(
        choice => choice.kind === 'oneOf',
    );

export const collectSchemaAllOfChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): SchemaBranchChoice[] =>
    collectSchemaBranchChoices(input, resolveReference, getRefName, path, ancestorRefs, ancestorObjects).filter(
        choice => choice.kind === 'allOf',
    );
