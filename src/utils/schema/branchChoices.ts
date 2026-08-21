import {schemaVariantLabel, type SchemaReferenceResolver} from '../schemaProperties';

export interface SchemaOneOfChoiceOption {
    index: number;
    label: string;
    description?: string;
}

export interface SchemaOneOfChoice {
    path: string;
    title: string;
    options: SchemaOneOfChoiceOption[];
}

export const collectSchemaOneOfChoices = (
    input: any,
    resolveReference: SchemaReferenceResolver,
    getRefName: (refStr: string) => string,
    path = '',
    ancestorRefs = new Set<string>(),
    ancestorObjects = new Set<object>(),
): SchemaOneOfChoice[] => {
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

    const choices: SchemaOneOfChoice[] = [];
    if (path && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
        choices.push({
            path,
            title: path,
            options: schema.oneOf.map((variant: any, index: number) => ({
                index,
                label: schemaVariantLabel(variant, resolveReference, getRefName, index),
                description: (resolveReference(variant) || variant)?.description || '',
            })),
        });
    }

    const collectChild = (child: any, childPath: string) => {
        choices.push(...collectSchemaOneOfChoices(child, resolveReference, getRefName, childPath, refs, objects));
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
    ['allOf', 'anyOf'].forEach(key => {
        if (Array.isArray(schema[key])) schema[key].forEach((item: any) => collectChild(item, path));
    });

    return choices;
};
