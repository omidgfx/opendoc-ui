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

/** Names each declared part of an allOf, so the reader sees where the fields come from. */
export const describeAllOfParts = (
    branches: any[],
    resolve: SchemaBranchResolver = value => value,
    refName: (ref: string) => string = ref => ref.split('/').pop() || ref,
): AllOfPart[] =>
    branches.map((branch, index) => {
        const resolved = (branch && resolve(branch)) || branch;
        const fieldCount =
            resolved && typeof resolved === 'object' && resolved.properties
                ? Object.keys(resolved.properties).length
                : 0;
        const empty = !declaresSomething(resolved);
        const name = branch?.$ref ? refName(branch.$ref) : resolved?.title || null;
        const label = name
            ? name
            : empty
              ? 'Empty part'
              : fieldCount > 0
                ? `${fieldCount} inline field${fieldCount === 1 ? '' : 's'}`
                : `Part ${index + 1}`;
        return {
            label,
            refName: branch?.$ref ? refName(branch.$ref) : null,
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
    const branches = Array.isArray(schema?.allOf) ? schema.allOf : [];
    if (branches.length === 0) return null;
    const effective = effectiveAllOfSchema(schema, resolve);
    const parts = describeAllOfParts(branches, resolve, refName);
    return {
        effective: effective || schema,
        parts,
        fieldCount: effective?.properties ? Object.keys(effective.properties).length : 0,
        requiredCount: Array.isArray(effective?.required) ? effective.required.length : 0,
        emptyCount: parts.filter(part => part.empty).length,
    };
};

/** The polymorphism keyword a schema declares, if any, with its branches. */
export const detectSchemaCombinator = (schema: any, _resolve?: SchemaBranchResolver): SchemaCombinator | null => {
    if (!schema || typeof schema !== 'object') return null;
    if (Array.isArray(schema.oneOf) && schema.oneOf.length)
        return {meta: COMBINATOR_META.oneOf, branches: schema.oneOf};
    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
        return {meta: COMBINATOR_META.anyOf, branches: schema.anyOf};
    if (Array.isArray(schema.allOf) && schema.allOf.length)
        return {meta: COMBINATOR_META.allOf, branches: schema.allOf};
    if (schema.not && typeof schema.not === 'object') return {meta: COMBINATOR_META.not, branches: [schema.not]};
    return null;
};
