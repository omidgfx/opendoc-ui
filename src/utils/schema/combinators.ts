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

/** The polymorphism keyword a schema declares, if any, with its branches. */
export const detectSchemaCombinator = (schema: any): SchemaCombinator | null => {
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
