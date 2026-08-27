export type SchemaReferenceResolver = (schema: any) => any;

const isObjectSchema = (schema: any): boolean =>
    !!schema &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    (schema.type === 'object' || !!schema.properties || Array.isArray(schema.allOf));

const isArraySchema = (schema: any): boolean =>
    !!schema && typeof schema === 'object' && !Array.isArray(schema) && schema.type === 'array' && !!schema.items;

const hasCompositeBranches = (schema: any): boolean =>
    !!schema &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf) || Array.isArray(schema.allOf));

const schemaTypes = (schema: any): string[] => {
    if (!schema || typeof schema !== 'object') return [];
    if (Array.isArray(schema.type)) return schema.type.filter((type: string) => typeof type === 'string');
    return typeof schema.type === 'string' ? [schema.type] : [];
};

/** True when the schema only admits the JSON null value (directly or through $ref). */
export const isNullOnlySchema = (schema: any, resolveReference: SchemaReferenceResolver): boolean => {
    if (schema === true || schema === false || !schema || typeof schema !== 'object') return false;
    if (typeof schema.$ref === 'string') {
        const resolved = resolveReference(schema);
        if (!resolved || resolved === schema) return false;
        return isNullOnlySchema(resolved, resolveReference);
    }
    const types = schemaTypes(schema);
    return types.length > 0 && types.every(type => type === 'null');
};

/**
 * Human label for one alternative of a oneOf/anyOf branch. Prefers the
 * referenced schema name, then the branch title, then a compact type
 * description, and finally a positional fallback.
 */
export const schemaVariantLabel = (
    variant: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    index: number,
): string => {
    // Pure JSON null is a valid oneOf/anyOf branch in OAS 3.1; keep the label
    // stable so branch rails never fall through to a generic "Variant n".
    if (variant === null || variant === undefined) return 'null';
    if (variant === true) return 'any';
    if (variant === false) return 'never';
    if (typeof variant !== 'object') return String(variant);
    if (typeof variant.$ref === 'string' && variant.$ref.startsWith('#/components/schemas/'))
        return getRefName(variant.$ref);
    if (variant.title) return variant.title;
    let resolved: any = variant;
    try {
        resolved = resolveReference(variant) || variant;
    } catch {
        resolved = variant;
    }
    if (resolved && typeof resolved === 'object') {
        if (typeof resolved.$ref === 'string') return getRefName(resolved.$ref);
        if (resolved.title) return resolved.title;
    }
    if (resolved && typeof resolved === 'object') {
        if (resolved.const !== undefined) return JSON.stringify(resolved.const);
        if (Array.isArray(resolved.enum))
            return resolved.enum.map((value: unknown) => JSON.stringify(value)).join(' | ');
    }
    const types = schemaTypes(resolved);
    const nonNullTypes = types.filter(type => type !== 'null');
    if (nonNullTypes.length === 1 && nonNullTypes[0] === 'object' && resolved?.properties)
        return `object (${Object.keys(resolved.properties).length} props)`;
    if (nonNullTypes.length === 1 && nonNullTypes[0] === 'array' && Array.isArray(resolved?.prefixItems))
        return `array (${resolved.prefixItems.length} tuple slot${resolved.prefixItems.length === 1 ? '' : 's'})`;
    if (nonNullTypes.length > 0) return nonNullTypes.join(' | ');
    if (types.includes('null')) return 'null';
    return `Variant ${index + 1}`;
};

/** Phosphor glyph used to mark recursive/reused schemas in tables, examples and modals. */
export const RECURSIVE_SCHEMA_ICON = 'ph ph-arrow-clockwise';

/**
 * True when following $refs from the schema eventually revisits a reference —
 * the schema reuses itself recursively, either directly, through `items`, or
 * through one of its properties. Expansion in tables and examples is guarded
 * at the first cycle, so these rows are marked with the recursive icon.
 */
export const schemaIsRecursive = (schema: any, resolveReference: SchemaReferenceResolver): boolean => {
    const chainRefs = new Set<string>();
    const follow = (input: any, depth: number): boolean => {
        if (!input || typeof input !== 'object' || depth > 64) return false;
        if (typeof input.$ref === 'string') {
            const ref = input.$ref;
            if (chainRefs.has(ref)) return true;
            const resolved = resolveReference(input);
            if (!resolved || resolved === input) return false;
            chainRefs.add(ref);
            const result = follow(resolved, depth + 1);
            chainRefs.delete(ref);
            return result;
        }
        const branches: any[] = [];
        if (input.items) branches.push(input.items);
        if (input.additionalProperties && typeof input.additionalProperties === 'object')
            branches.push(input.additionalProperties);
        if (input.properties && typeof input.properties === 'object') branches.push(...Object.values(input.properties));
        if (Array.isArray(input.oneOf)) branches.push(...input.oneOf);
        if (Array.isArray(input.anyOf)) branches.push(...input.anyOf);
        if (Array.isArray(input.allOf)) branches.push(...input.allOf);
        return branches.some(branch => follow(branch, depth + 1));
    };
    return follow(schema, 0);
};

/**
 * Build the dotted property matrix used by documentation and schema views.
 * Reference and object ancestry are path-local so legitimate sibling reuse is
 * retained while recursive schemas terminate at the first cycle.
 */
/** Human-readable summary of a JSON Schema `not` sub-schema, e.g. `{const: ''}` -> `""`. */
export const describeNotConstraint = (notSchema: any): string => {
    if (!notSchema || typeof notSchema !== 'object') return 'the listed values';
    const parts: string[] = [];
    if (typeof notSchema.$ref === 'string') {
        const name = notSchema.$ref.split('/').pop() || notSchema.$ref;
        parts.push(name);
    }
    if (notSchema.const !== undefined) parts.push(JSON.stringify(notSchema.const));
    if (Array.isArray(notSchema.enum)) parts.push(notSchema.enum.map(value => JSON.stringify(value)).join(' or '));
    if (notSchema.type) {
        const types = Array.isArray(notSchema.type) ? notSchema.type.join('/') : notSchema.type;
        parts.push(`values of type ${types}`);
    }
    if (notSchema.pattern) parts.push(`values matching ${notSchema.pattern}`);
    if (Array.isArray(notSchema.oneOf) && notSchema.oneOf.length) parts.push(`oneOf(${notSchema.oneOf.length})`);
    if (Array.isArray(notSchema.anyOf) && notSchema.anyOf.length) parts.push(`anyOf(${notSchema.anyOf.length})`);
    if (Array.isArray(notSchema.allOf) && notSchema.allOf.length) parts.push(`allOf(${notSchema.allOf.length})`);
    return parts.length > 0 ? parts.join(', ') : 'the listed values';
};

export const flattenSchemaProperties = (
    rootSchema: any,
    resolveReference: SchemaReferenceResolver,
    maxDepth = Number.POSITIVE_INFINITY,
): Record<string, any> => {
    const visit = (
        input: any,
        prefix: string,
        ancestorRefs: Set<string>,
        ancestorObjects: Set<object>,
        depth: number,
    ): Record<string, any> => {
        if (!input || typeof input !== 'object' || depth > maxDepth) return {};

        let schema = input;
        const refs = new Set(ancestorRefs);
        if (typeof schema.$ref === 'string') {
            const ref = schema.$ref;
            if (refs.has(ref)) return {};
            refs.add(ref);
            const resolved = resolveReference(schema);
            if (!resolved || resolved === schema) return {};
            schema = resolved;
        }
        if (!schema || typeof schema !== 'object') return {};
        if (ancestorObjects.has(schema)) return {};
        const objects = new Set(ancestorObjects);
        objects.add(schema);

        let properties: Record<string, any> = {};
        const visitBranch = (branch: any, branchPrefix = prefix) => {
            properties = {
                ...properties,
                ...visit(branch, branchPrefix, new Set(refs), new Set(objects), depth + 1),
            };
        };
        const shouldExpand = (candidate: any): boolean => {
            const resolved = resolveReference(candidate) || candidate;
            return isObjectSchema(resolved) || isArraySchema(resolved) || hasCompositeBranches(resolved);
        };

        if (Array.isArray(schema.allOf)) schema.allOf.forEach((part: any) => visitBranch(part));

        if (schema.properties && typeof schema.properties === 'object') {
            Object.entries(schema.properties).forEach(([name, property]: [string, any]) => {
                const key = prefix ? `${prefix}.${name}` : name;
                properties[key] = property;
                if (shouldExpand(property)) visitBranch(property, key);
            });
        }

        if (isArraySchema(schema) && shouldExpand(schema.items)) {
            visitBranch(schema.items, prefix ? `${prefix}.*` : '*');
        }

        if (Array.isArray(schema.oneOf)) schema.oneOf.forEach((part: any) => visitBranch(part));
        if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((part: any) => visitBranch(part));

        if (!schema.properties && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const key = prefix ? `${prefix}.«any key»` : '«any key»';
            properties[key] = schema.additionalProperties;
            if (shouldExpand(schema.additionalProperties)) visitBranch(schema.additionalProperties, key);
        }
        return properties;
    };

    return visit(rootSchema, '', new Set<string>(), new Set<object>(), 0);
};
