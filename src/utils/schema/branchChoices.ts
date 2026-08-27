import {schemaVariantLabel, type SchemaReferenceResolver} from '../schemaProperties';
import {expandAllOfBranches} from './combinators';

export type SchemaBranchKind = 'oneOf' | 'anyOf' | 'allOf' | 'not';

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
 * Walk a schema tree and collect every field-level oneOf (exclusive pick),
 * anyOf (multi-select merge), allOf (focus a composed part), and not
 * (negated schema, inspection only) the reader can act on. Root-level
 * combinators (empty path) are intentionally skipped — the body rail owns
 * those.
 *
 * allOf is never collapsed to a single branch here: composition still applies
 * fully to mocks/tables; the choice only drives focus/dimming (see
 * `readSchemaAllOfFocus` / SchemaViewer allOf chips).
 * anyOf keeps several branches selected and merges their shapes into the mock
 * and table (same idea as the body-level anyOf rail).
 * not has no selection — the single option names the schema that must not match.
 *
 * `skipSamePathAllOf` is set when descending into an allOf list at the same
 * path so a wrapper `allOf: [ $ref → multi-part allOf ]` is not registered twice.
 */
export const collectSchemaBranchChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
    skipSamePathAllOf = false,
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
    if (path && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
        choices.push({
            path,
            title: path,
            kind: 'anyOf',
            // Leading "All" matches the body-level anyOf rail (every branch on).
            options: [
                {
                    index: -1,
                    label: 'All',
                    description: 'Include every anyOf branch in the merged shape',
                },
                ...schema.anyOf.map((variant: any, index: number) =>
                    optionOf(variant, index, resolveReference, getRefName),
                ),
            ],
        });
    }
    if (path && !skipSamePathAllOf && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        // Expand pure allOf wrappers (`allOf: [ $ref → multi-part allOf ]`) so
        // field menus list every composed part, not a single opaque $ref.
        const allOfParts = expandAllOfBranches(schema, resolveReference);
        const parts = allOfParts.length > 0 ? allOfParts : schema.allOf;
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
                ...parts.map((variant: any, index: number) => optionOf(variant, index, resolveReference, getRefName)),
            ],
        });
    }
    if (path && schema.not && typeof schema.not === 'object' && !Array.isArray(schema.not)) {
        // Single inspection option — `not` has no exclusive/multi pick.
        choices.push({
            path,
            title: path,
            kind: 'not',
            options: [optionOf(schema.not, 0, resolveReference, getRefName)],
        });
    }

    const collectChild = (child: any, childPath: string, skipAllOf = false) => {
        choices.push(
            ...collectSchemaBranchChoices(child, resolveReference, getRefName, childPath, refs, objects, skipAllOf),
        );
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
    // Descend into allOf wrappers without a new path segment so a property
    // whose schema is `{ allOf: […, { oneOf: […] }] }` still surfaces nested
    // oneOf/anyOf/allOf/not under that property name. Skip re-recording allOf
    // at the same path (wrapper expansion already listed the real parts).
    // Do not walk `oneOf`/`anyOf` here — those are already recorded above.
    if (Array.isArray(schema.allOf)) schema.allOf.forEach((item: any) => collectChild(item, path, true));
    // Descend into `not` at the same path only for nested combinators inside
    // the negated schema; the field-level `not` choice is already recorded.
    if (schema.not && typeof schema.not === 'object' && !Array.isArray(schema.not)) {
        collectChild(schema.not, path, true);
    }

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

export const collectSchemaAnyOfChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): SchemaBranchChoice[] =>
    collectSchemaBranchChoices(input, resolveReference, getRefName, path, ancestorRefs, ancestorObjects).filter(
        choice => choice.kind === 'anyOf',
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

export const collectSchemaNotChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): SchemaBranchChoice[] =>
    collectSchemaBranchChoices(input, resolveReference, getRefName, path, ancestorRefs, ancestorObjects).filter(
        choice => choice.kind === 'not',
    );
