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
    /** True when the first branch is the merged allOf object, not a declared one. */
    unifiedFirst?: boolean;
}

export type SchemaBranchResolver = (schema: any) => any;

/** Caption of the merged allOf branch, and the way every label helper names it. */
export const UNIFIED_BRANCH_TITLE = 'Unified';

/**
 * allOf means every branch applies at once, so the shape a payload really has
 * is the merge of them. That merge is offered as a branch of its own; the
 * declared parts stay behind it so each constraint can still be inspected.
 * Returns null when there is nothing to unify, e.g. allOf of plain constraints.
 */
export const mergeAllOfBranches = (branches: any[], resolve: SchemaBranchResolver = schema => schema): any => {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const seen = new Set<any>();
    let merged = false;
    const visit = (branch: any, depth: number) => {
        if (!branch || typeof branch !== 'object' || depth > 16) return;
        const schema = resolve(branch) || branch;
        if (!schema || typeof schema !== 'object' || seen.has(schema)) return;
        seen.add(schema);
        if (Array.isArray(schema.allOf)) schema.allOf.forEach((part: any) => visit(part, depth + 1));
        if (schema.properties && typeof schema.properties === 'object') {
            merged = true;
            Object.entries(schema.properties).forEach(([name, property]) => {
                properties[name] = property;
            });
        }
        if (Array.isArray(schema.required))
            schema.required.forEach((name: any) => {
                const key = String(name);
                if (!required.includes(key)) required.push(key);
            });
    };
    branches.forEach(branch => visit(branch, 0));
    if (!merged) return null;
    return {
        title: UNIFIED_BRANCH_TITLE,
        type: 'object',
        description: 'Every allOf constraint merged into the one object a payload actually has.',
        properties,
        ...(required.length > 0 ? {required} : {}),
    };
};

/**
 * The polymorphism keyword a schema declares, if any, with its branches. Give
 * it a reference resolver and allOf leads with its merged object.
 */
export const detectSchemaCombinator = (schema: any, resolve?: SchemaBranchResolver): SchemaCombinator | null => {
    if (!schema || typeof schema !== 'object') return null;
    if (Array.isArray(schema.oneOf) && schema.oneOf.length)
        return {meta: COMBINATOR_META.oneOf, branches: schema.oneOf};
    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
        return {meta: COMBINATOR_META.anyOf, branches: schema.anyOf};
    if (Array.isArray(schema.allOf) && schema.allOf.length) {
        const unified = mergeAllOfBranches(schema.allOf, resolve);
        return {
            meta: COMBINATOR_META.allOf,
            branches: unified ? [unified, ...schema.allOf] : schema.allOf,
            unifiedFirst: !!unified,
        };
    }
    if (schema.not && typeof schema.not === 'object') return {meta: COMBINATOR_META.not, branches: [schema.not]};
    return null;
};
