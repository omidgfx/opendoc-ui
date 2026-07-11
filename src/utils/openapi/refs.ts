import type { OpenApiSpec } from '../../types';

/** Extract the tail name from a $ref string. */
export const getRefName = (refStr: string): string => {
    if (!refStr) return '';
    const parts = refStr.split('/');
    return parts[parts.length - 1];
};

/** Resolve a schema by name from components.schemas (with legacy definitions fallback). */
export const resolveSchema = (refName: string, spec: OpenApiSpec | null): any => {
    if (!spec) return null;
    if (spec.components?.schemas?.[refName]) {
        return spec.components.schemas[refName];
    }
    if ((spec as any).definitions?.[refName]) {
        return (spec as any).definitions[refName];
    }
    return null;
};

/** Walk a $ref (recursively) to get the concrete schema object. */
export const resolveReference = (item: any, spec: OpenApiSpec | null): any => {
    if (!item) return item;
    if (item.$ref) {
        const refName = getRefName(item.$ref);
        const refSchema = resolveSchema(refName, spec);
        if (refSchema) {
            return resolveReference(refSchema, spec);
        }
    }
    return item;
};

/** Resolve a parameter $ref (points to components.parameters). */
export const resolveParameter = (param: any, spec: OpenApiSpec | null): any => {
    if (!param) return param;
    if (param.$ref) {
        const refName = getRefName(param.$ref);
        const resolved = spec?.components?.parameters?.[refName];
        if (resolved) {
            return resolveParameter(resolved, spec);
        }
    }
    return param;
};

/** Resolve a requestBody $ref (points to components.requestBodies). */
export const resolveRequestBody = (body: any, spec: OpenApiSpec | null): any => {
    if (!body) return body;
    if (body.$ref) {
        const refName = getRefName(body.$ref);
        const resolved = (spec?.components as any)?.requestBodies?.[refName];
        if (resolved) {
            return resolveRequestBody(resolved, spec);
        }
    }
    return body;
};

/** Merge path-level & operation-level parameters, de-duplicating by (name,in). */
export const getMergedParameters = (pathItem: any, operation: any, spec: OpenApiSpec | null): any[] => {
    const list: any[] = [];
    const seen = new Set<string>();
    const addParam = (p: any) => {
        const resolved = resolveParameter(p, spec);
        if (resolved && resolved.name && !seen.has(`${resolved.name}-${resolved.in}`)) {
            seen.add(`${resolved.name}-${resolved.in}`);
            list.push(resolved);
        }
    };
    if (operation?.parameters) operation.parameters.forEach(addParam);
    if (pathItem?.parameters) pathItem.parameters.forEach(addParam);
    return list;
};
