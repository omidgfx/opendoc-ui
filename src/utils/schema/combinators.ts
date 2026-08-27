/**
 * One description of the polymorphism keywords, so a schema branch is named
 * and coloured the same in the documentation, the schema tables, the response
 * viewer and the Runner.
 */
export type CombinatorKind = 'oneOf' | 'anyOf' | 'allOf' | 'not';

export interface CombinatorMeta {
    kind: CombinatorKind;
    /** Caption above a branch selector. */
    label: string;
    /** Inline caption used inside type cells. */
    inlineLabel: string;
    /** Theme token, so each keyword keeps its hue in every palette. */
    color: string;
    icon: string;
    hint: string;
}

export const COMBINATOR_META: Record<CombinatorKind, CombinatorMeta> = {
    oneOf: {
        kind: 'oneOf',
        label: 'One of',
        inlineLabel: 'One Of:',
        color: 'var(--method-options)',
        icon: 'ph ph-git-branch',
        hint: 'Exactly one branch must match.',
    },
    anyOf: {
        kind: 'anyOf',
        label: 'Any of',
        inlineLabel: 'Any Of:',
        color: 'var(--method-put)',
        icon: 'ph ph-git-fork',
        hint: 'One or more branches may match.',
    },
    allOf: {
        kind: 'allOf',
        label: 'All of',
        inlineLabel: 'All Of · every constraint applies:',
        color: 'var(--primary)',
        icon: 'ph ph-intersect',
        hint: 'Every constraint applies at once; the branches are listed so each one can be inspected.',
    },
    not: {
        kind: 'not',
        label: 'Not',
        inlineLabel: 'Not:',
        color: 'var(--method-delete)',
        icon: 'ph ph-prohibit',
        hint: 'The value must not match this schema.',
    },
};

export interface SchemaCombinator {
    meta: CombinatorMeta;
    branches: any[];
}

export type SchemaBranchResolver = (schema: any) => any;

export interface AllOfPart {
    /** What the part is called in the composition line. */
    label: string;
    refName: string | null;
    fieldCount: number;
    /** A part that declares nothing has nothing to show. */
    empty: boolean;
    description?: string;
}

export interface AllOfComposition {
    /** The single object a payload really has: parent and every part merged. */
    effective: any;
    parts: AllOfPart[];
    fieldCount: number;
    requiredCount: number;
    /** Parts that declare nothing at all, e.g. an empty base schema. */
    emptyCount: number;
}

const SCHEMA_KEYWORDS = [
    'type',
    'properties',
    'items',
    'enum',
    'const',
    'format',
    'pattern',
    'required',
    'additionalProperties',
    'oneOf',
    'anyOf',
    'allOf',
    'not',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
];

const declaresSomething = (schema: any): boolean =>
    !!schema && typeof schema === 'object' && SCHEMA_KEYWORDS.some(keyword => schema[keyword] !== undefined);

/** An empty schema accepts anything, and adds nothing wherever it is composed. */
export const schemaDeclaresNothing = (schema: any): boolean =>
    !!schema && typeof schema === 'object' && !Array.isArray(schema) && !declaresSomething(schema);

/**
 * allOf composes: every part applies at once, so a payload has one object made
 * of the parent and all parts together. This builds that object — properties
 * and required from every level, nested allOf included — and returns null when
 * there is nothing to merge.
 */
export const effectiveAllOfSchema = (schema: any, resolve: SchemaBranchResolver = value => value): any => {
    if (!schema || typeof schema !== 'object') return null;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const seen = new Set<any>();
    let merged = false;
    let additionalProperties: any;
    const visit = (input: any, depth: number) => {
        if (!input || typeof input !== 'object' || depth > 16) return;
        const current = resolve(input) || input;
        if (!current || typeof current !== 'object' || seen.has(current)) return;
        seen.add(current);
        if (Array.isArray(current.allOf)) current.allOf.forEach((part: any) => visit(part, depth + 1));
        if (current.properties && typeof current.properties === 'object') {
            merged = true;
            Object.entries(current.properties).forEach(([name, property]) => {
                properties[name] = property;
            });
        }
        if (Array.isArray(current.required))
            current.required.forEach((name: any) => {
                const key = String(name);
                if (!required.includes(key)) required.push(key);
            });
        if (current.additionalProperties !== undefined && additionalProperties === undefined)
            additionalProperties = current.additionalProperties;
    };
    visit(schema, 0);
    if (!merged) return null;
    const resolvedRoot = resolve(schema) || schema;
    return {
        type: 'object',
        ...(resolvedRoot.title ? {title: resolvedRoot.title} : {}),
        ...(resolvedRoot.description ? {description: resolvedRoot.description} : {}),
        ...(resolvedRoot.example !== undefined ? {example: resolvedRoot.example} : {}),
        properties,
        ...(required.length > 0 ? {required} : {}),
        ...(additionalProperties !== undefined ? {additionalProperties} : {}),
    };
};

/**
 * True when a schema is only an allOf composition (plus harmless metadata).
 * Used to unwrap `allOf: [ $ref → { allOf: [A,B,C] } ]` into the real parts
 * A/B/C for focus chips and field menus — otherwise the reader sees one opaque
 * wrapper instead of the twelve composed schemas the author wrote.
 */
export const isAllOfWrapperSchema = (schema: any): boolean => {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
    if (!Array.isArray(schema.allOf) || schema.allOf.length === 0) return false;
    const meta = new Set([
        'title',
        'description',
        'deprecated',
        'example',
        'examples',
        'externalDocs',
        'default',
        'readOnly',
        'writeOnly',
        'nullable',
        '$id',
        '$anchor',
        '$schema',
        '$comment',
        '$ref',
        'allOf',
    ]);
    return Object.keys(schema).every(key => meta.has(key));
};

/**
 * Flatten allOf branches through pure allOf wrappers and $refs to allOf
 * wrappers, preserving authoring identity on leaf parts (keep the $ref that
 * points at a concrete schema with properties).
 */
export const expandAllOfBranches = (
    schema: any,
    resolve: SchemaBranchResolver = value => value,
    depth = 0,
    seen = new Set<any>(),
): any[] => {
    if (!schema || typeof schema !== 'object' || depth > 12) return [];
    const root = resolve(schema) || schema;
    if (!root || typeof root !== 'object') return [];
    const list = Array.isArray(root.allOf) ? root.allOf : Array.isArray(schema.allOf) ? schema.allOf : [];
    if (list.length === 0) return [];

    const out: any[] = [];
    list.forEach(branch => {
        if (!branch || typeof branch !== 'object') {
            out.push(branch);
            return;
        }
        // Prefer resolving $ref to decide whether this hop is a wrapper.
        const resolved = resolve(branch) || branch;
        if (resolved && typeof resolved === 'object') {
            if (seen.has(resolved)) {
                out.push(branch);
                return;
            }
            if (isAllOfWrapperSchema(resolved) && Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
                const nextSeen = new Set(seen);
                nextSeen.add(resolved);
                // Recurse so nested wrappers also flatten; pass the resolved
                // node so its allOf list is walked.
                out.push(...expandAllOfBranches(resolved, resolve, depth + 1, nextSeen));
                return;
            }
        }
        out.push(branch);
    });
    return out;
};

/** Names each declared part of an allOf, so the reader sees where the fields come from. */
export const describeAllOfParts = (
    branches: any[],
    resolve: SchemaBranchResolver = value => value,
    refName: (ref: string) => string = ref => ref.split('/').pop() || ref,
): AllOfPart[] =>
    branches.map((branch, index) => {
        const resolved = (branch && resolve(branch)) || branch;
        // Nested allOf wrappers may still appear as a single branch if expansion
        // was skipped; count fields through effective merge so the label is honest.
        const effective =
            resolved && typeof resolved === 'object' && Array.isArray(resolved.allOf)
                ? effectiveAllOfSchema(resolved, resolve)
                : null;
        const propsSource = effective?.properties || resolved?.properties;
        const fieldCount = propsSource && typeof propsSource === 'object' ? Object.keys(propsSource).length : 0;
        const empty = !declaresSomething(resolved) && fieldCount === 0;
        const name = branch?.$ref
            ? refName(branch.$ref)
            : resolved?.$ref
              ? refName(resolved.$ref)
              : resolved?.title || null;
        const label = name
            ? name
            : empty
              ? 'Empty part'
              : fieldCount > 0
                ? `${fieldCount} inline field${fieldCount === 1 ? '' : 's'}`
                : `Part ${index + 1}`;
        return {
            label,
            refName: branch?.$ref ? refName(branch.$ref) : resolved?.$ref ? refName(resolved.$ref) : null,
            fieldCount,
            empty,
            description: resolved?.description,
        };
    });

/** Everything a view needs to explain an allOf without pretending it is a choice. */
export const describeAllOfComposition = (
    schema: any,
    resolve: SchemaBranchResolver = value => value,
    refName?: (ref: string) => string,
): AllOfComposition | null => {
    const rawBranches = Array.isArray(schema?.allOf)
        ? schema.allOf
        : Array.isArray((resolve(schema) || schema)?.allOf)
          ? (resolve(schema) || schema).allOf
          : [];
    if (rawBranches.length === 0) return null;
    const branches = expandAllOfBranches(schema, resolve);
    const effective = effectiveAllOfSchema(schema, resolve);
    const parts = describeAllOfParts(branches.length > 0 ? branches : rawBranches, resolve, refName);
    return {
        effective: effective || schema,
        parts,
        fieldCount: effective?.properties ? Object.keys(effective.properties).length : 0,
        requiredCount: Array.isArray(effective?.required) ? effective.required.length : 0,
        emptyCount: parts.filter(part => part.empty).length,
    };
};

/**
 * Expand one anyOf/oneOf branch into the object shape a table or mock can use.
 * Branches are often `$ref`s to `allOf` compositions (no top-level `properties`);
 * walking only `resolved.properties` would yield an empty object.
 */
export const effectiveBranchSchema = (branch: any, resolve: SchemaBranchResolver = value => value): any => {
    if (branch === null || branch === undefined) return {type: 'null'};
    if (branch === true || branch === false) return branch;
    if (typeof branch !== 'object') return branch;
    const resolved = resolve(branch) || branch;
    if (!resolved || typeof resolved !== 'object') return resolved;
    if (Array.isArray(resolved.allOf) && resolved.allOf.length) {
        return effectiveAllOfSchema(resolved, resolve) || resolved;
    }
    return resolved;
};

/**
 * anyOf may keep several branches selected. Merge their effective object shapes
 * (including allOf-wrapped `$ref`s) so the matrix and generated example still
 * show fields instead of an empty `{}`.
 */
export const mergeAnyOfBranchSchemas = (
    branches: any[],
    selectedIndices: number[],
    resolve: SchemaBranchResolver = value => value,
    meta?: {title?: string; description?: string},
): any => {
    if (!Array.isArray(branches) || branches.length === 0) return {type: 'object', properties: {}};
    const selected =
        selectedIndices.length > 0
            ? selectedIndices.filter(index => index >= 0 && index < branches.length)
            : branches.map((_, index) => index);
    if (selected.length === 0) return {type: 'object', properties: {}};
    if (selected.length === 1) return effectiveBranchSchema(branches[selected[0]], resolve);

    const properties: Record<string, any> = {};
    const required: string[] = [];
    let additionalProperties: any;
    let sawObject = false;

    selected.forEach(index => {
        const effective = effectiveBranchSchema(branches[index], resolve);
        if (!effective || typeof effective !== 'object' || effective === true || effective === false) return;
        if (effective.properties && typeof effective.properties === 'object') {
            sawObject = true;
            Object.assign(properties, effective.properties);
        }
        if (Array.isArray(effective.required)) {
            effective.required.forEach((name: string) => {
                if (!required.includes(name)) required.push(name);
            });
        }
        if (effective.additionalProperties !== undefined && additionalProperties === undefined) {
            additionalProperties = effective.additionalProperties;
        }
        // Non-object branches (string | null unions, etc.) contribute no properties.
        if (effective.type && effective.type !== 'object' && !effective.properties) return;
        if (effective.type === 'object' || effective.properties) sawObject = true;
    });

    if (!sawObject && Object.keys(properties).length === 0) {
        // Fall back to the first selected branch as-is (e.g. pure scalar anyOf).
        return effectiveBranchSchema(branches[selected[0]], resolve);
    }

    return {
        type: 'object',
        ...(meta?.title ? {title: meta.title} : {}),
        ...(meta?.description ? {description: meta.description} : {}),
        properties,
        ...(required.length > 0 ? {required} : {}),
        ...(additionalProperties !== undefined ? {additionalProperties} : {}),
    };
};

/**
 * The polymorphism keyword declared on this schema node itself — never walks
 * into `properties` / `items`. Nested oneOf/anyOf/allOf belong on the field
 * row, not on the body-level branch rail.
 *
 * When `resolve` is provided, pure allOf wrappers (`allOf: [ $ref → allOf ]`)
 * are expanded so the branch rail lists the real composed parts.
 */
export const detectSchemaCombinator = (schema: any, resolve?: SchemaBranchResolver): SchemaCombinator | null => {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
    // Own keywords only for oneOf/anyOf/not — do not resolve $ref on those so a
    // body `$ref` wrapper stays handled upstream. allOf may expand wrappers.
    if (Array.isArray(schema.oneOf) && schema.oneOf.length)
        return {meta: COMBINATOR_META.oneOf, branches: schema.oneOf};
    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
        return {meta: COMBINATOR_META.anyOf, branches: schema.anyOf};
    if (Array.isArray(schema.allOf) && schema.allOf.length) {
        const branches = resolve ? expandAllOfBranches(schema, resolve) : schema.allOf;
        return {meta: COMBINATOR_META.allOf, branches: branches.length > 0 ? branches : schema.allOf};
    }
    if (schema.not && typeof schema.not === 'object') return {meta: COMBINATOR_META.not, branches: [schema.not]};
    // Body is often a bare $ref to an allOf schema — surface it when resolve is given.
    if (resolve && typeof schema.$ref === 'string') {
        const resolved = resolve(schema);
        if (resolved && resolved !== schema && Array.isArray(resolved.allOf) && resolved.allOf.length) {
            const branches = expandAllOfBranches(resolved, resolve);
            return {meta: COMBINATOR_META.allOf, branches: branches.length > 0 ? branches : resolved.allOf};
        }
    }
    return null;
};
