export type SchemaReferenceResolver = (schema: any) => any;

const isObjectSchema = (schema: any): boolean =>
    !!schema &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    (schema.type === 'object' || !!schema.properties || Array.isArray(schema.allOf));

const isArraySchema = (schema: any): boolean =>
    !!schema && typeof schema === 'object' && !Array.isArray(schema) && schema.type === 'array' && !!schema.items;

/**
 * Build the dotted property matrix used by documentation and schema views.
 * Reference and object ancestry are path-local so legitimate sibling reuse is
 * retained while recursive schemas terminate at the first cycle.
 */
export const flattenSchemaProperties = (
    rootSchema: any,
    resolveReference: SchemaReferenceResolver,
    maxDepth = 64,
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

        if (Array.isArray(schema.allOf)) schema.allOf.forEach((part: any) => visitBranch(part));

        if (schema.properties && typeof schema.properties === 'object') {
            Object.entries(schema.properties).forEach(([name, property]: [string, any]) => {
                const key = prefix ? `${prefix}.${name}` : name;
                properties[key] = property;
                const resolvedProperty = resolveReference(property) || property;
                if (isObjectSchema(resolvedProperty)) {
                    visitBranch(property, key);
                } else if (isArraySchema(resolvedProperty)) {
                    const item = resolvedProperty.items;
                    const resolvedItem = resolveReference(item) || item;
                    if (isObjectSchema(resolvedItem)) visitBranch(item, `${key}.*`);
                }
            });
        }

        if (Array.isArray(schema.oneOf)) schema.oneOf.forEach((part: any) => visitBranch(part));
        if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((part: any) => visitBranch(part));

        if (!schema.properties && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const key = prefix ? `${prefix}.«any key»` : '«any key»';
            properties[key] = schema.additionalProperties;
        }
        return properties;
    };

    return visit(rootSchema, '', new Set<string>(), new Set<object>(), 0);
};
