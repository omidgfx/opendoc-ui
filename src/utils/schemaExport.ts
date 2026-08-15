import {createZipBlob, downloadBlob} from './zip';
import {generateValidatedMock} from './mockGenerator';
import {absoluteRouteHref, toCleanRouteHref} from './routing';

export function getRefName(ref: string): string {
    if (!ref) return '';
    const raw = ref.split('/').pop() || '';
    try {
        return decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    } catch {
        return raw.replace(/~1/g, '/').replace(/~0/g, '~');
    }
}

const TS_RESERVED = new Set([
    'any',
    'boolean',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'constructor',
    'continue',
    'debugger',
    'declare',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'from',
    'function',
    'get',
    'if',
    'implements',
    'import',
    'in',
    'infer',
    'instanceof',
    'interface',
    'keyof',
    'let',
    'module',
    'namespace',
    'never',
    'new',
    'null',
    'number',
    'object',
    'package',
    'private',
    'protected',
    'public',
    'readonly',
    'require',
    'return',
    'set',
    'static',
    'string',
    'super',
    'switch',
    'symbol',
    'this',
    'throw',
    'true',
    'try',
    'type',
    'typeof',
    'undefined',
    'unique',
    'unknown',
    'var',
    'void',
    'while',
    'with',
    'yield',
]);

export const toTypeScriptIdentifier = (name: string): string => {
    const normalized = String(name || 'Schema')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
    const parts = normalized.split(/[^a-zA-Z0-9_$]+/).filter(Boolean);
    let identifier = parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('') || 'Schema';
    if (/^\d/.test(identifier)) identifier = `Schema${identifier}`;
    identifier = identifier.replace(/[^a-zA-Z0-9_$]/g, '');
    if (!identifier) identifier = 'Schema';
    if (TS_RESERVED.has(identifier.toLowerCase())) identifier = `${identifier}Model`;
    return identifier;
};

export const createTypeNameMap = (names: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    const used = new Set<string>();
    names.forEach(original => {
        const base = toTypeScriptIdentifier(original);
        let candidate = base;
        let suffix = 2;
        while (used.has(candidate.toLowerCase())) candidate = `${base}${suffix++}`;
        used.add(candidate.toLowerCase());
        result[original] = candidate;
    });
    return result;
};

export const toSafeGeneratedFileName = (name: string): string => {
    const safe =
        toTypeScriptIdentifier(name)
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\.{2,}/g, '_')
            .replace(/[. ]+$/g, '')
            .slice(0, 100) || 'Schema';
    const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}_model` : safe;
    return `${reserved}.ts`;
};

function isPlainObject(v: any) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

export function generateMockValue(schema: any, allSchemas: Record<string, any> = {}): any {
    const result = generateValidatedMock(schema, {
        openapi: '3.1.1',
        info: {title: 'Generated models', version: '1'},
        paths: {},
        components: {schemas: allSchemas},
    });
    if (!result.ok) throw new Error(result.diagnostics.map(item => item.message).join('; '));
    return result.value;
}

function mapPrimitiveType(t: string): string {
    switch (t) {
        case 'string':
            return 'string';
        case 'number':
        case 'integer':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'null':
            return 'null';
        case 'object':
            return 'Record<string, any>';
        default:
            return 'any';
    }
}

export function schemaToTsType(
    schema: any,
    allSchemas: Record<string, any>,
    visited = new Set<string>(),
    nameMap: Record<string, string> = createTypeNameMap(Object.keys(allSchemas)),
): string {
    if (schema === true) return 'unknown';
    if (schema === false) return 'never';
    if (schema === undefined || schema === null) return 'unknown';
    if (schema.nullable === true)
        return `${schemaToTsType({...schema, nullable: false}, allSchemas, new Set(visited), nameMap)} | null`;
    if (schema.$ref) {
        const refName = getRefName(schema.$ref);
        return nameMap[refName] || toTypeScriptIdentifier(refName) || 'unknown';
    }
    if (schema.const !== undefined) {
        return JSON.stringify(schema.const);
    }
    if (schema.enum && Array.isArray(schema.enum)) {
        return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ') || 'any';
    }
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
        return (
            schema.oneOf.map((s: any) => schemaToTsType(s, allSchemas, new Set(visited), nameMap)).join(' | ') || 'any'
        );
    }
    if (schema.anyOf && Array.isArray(schema.anyOf)) {
        return (
            schema.anyOf.map((s: any) => schemaToTsType(s, allSchemas, new Set(visited), nameMap)).join(' | ') || 'any'
        );
    }
    if (schema.allOf && Array.isArray(schema.allOf)) {
        const parts = schema.allOf.map((s: any) => schemaToTsType(s, allSchemas, new Set(visited), nameMap));
        return parts.join(' & ') || 'any';
    }
    if (Array.isArray(schema.type)) {
        if (schema.type.includes('array')) {
            const mapped: string[] = [];
            for (const t of schema.type) {
                if (t === 'array') {
                    const it = schema.items
                        ? schemaToTsType(schema.items, allSchemas, new Set(visited), nameMap)
                        : 'any';
                    mapped.push(`${it}[]`);
                } else {
                    mapped.push(mapPrimitiveType(t));
                }
            }
            return mapped.join(' | ');
        }
        return schema.type.map((t: string) => mapPrimitiveType(t)).join(' | ');
    }
    if (schema.type === 'array') {
        const itemType = schema.items ? schemaToTsType(schema.items, allSchemas, new Set(visited), nameMap) : 'any';
        if (itemType.includes(' | ') || itemType.includes(' & ')) {
            return `(${itemType})[]`;
        }
        return `${itemType}[]`;
    }
    if (schema.type === 'object' || schema.properties) {
        if (schema.properties && Object.keys(schema.properties).length > 0) {
            const req = new Set(schema.required || []);
            const props = Object.entries(schema.properties).map(([k, v]: [string, any]) => {
                const isReq = req.has(k);
                const t = schemaToTsType(v, allSchemas, new Set(visited), nameMap);
                return `${JSON.stringify(k)}${isReq ? '' : '?'}: ${t}`;
            });
            return `{ ${props.join('; ')} }`;
        }
        if (schema.additionalProperties) {
            if (isPlainObject(schema.additionalProperties)) {
                const valType = schemaToTsType(schema.additionalProperties, allSchemas, new Set(visited), nameMap);
                return `Record<string, ${valType}>`;
            }
            return 'Record<string, any>';
        }
        return 'Record<string, any>';
    }
    if (schema.type) {
        return mapPrimitiveType(schema.type);
    }
    if (schema.properties) {
        const req = new Set(schema.required || []);
        const props = Object.entries(schema.properties).map(([k, v]: [string, any]) => {
            const isReq = req.has(k);
            const t = schemaToTsType(v, allSchemas, new Set(visited), nameMap);
            return `${JSON.stringify(k)}${isReq ? '' : '?'}: ${t}`;
        });
        return `{ ${props.join('; ')} }`;
    }
    return 'any';
}

function resolveAllOfProperties(
    schema: any,
    allSchemas: Record<string, any>,
    visited = new Set<string>(),
): {
    properties: Record<string, any>;
    required: string[];
    description?: string;
} {
    let props: Record<string, any> = {};
    let required: string[] = [];
    let description: string | undefined = schema.description;
    if (schema === undefined || schema === null || typeof schema === 'boolean')
        return {properties: props, required, description};
    if (schema.$ref) {
        const refName = getRefName(schema.$ref);
        if (visited.has(refName)) return {properties: props, required, description};
        visited.add(refName);
        const refSchema = allSchemas[refName];
        if (refSchema) {
            const resolved = resolveAllOfProperties(refSchema, allSchemas, visited);
            props = {...props, ...resolved.properties};
            required = [...required, ...resolved.required];
            if (!description && resolved.description) description = resolved.description;
        }
        return {properties: props, required, description};
    }
    if (schema.allOf && Array.isArray(schema.allOf)) {
        schema.allOf.forEach((sub: any) => {
            const subResolved = resolveAllOfProperties(sub, allSchemas, new Set(visited));
            props = {...props, ...subResolved.properties};
            required = [...required, ...subResolved.required];
            if (!description && subResolved.description) description = subResolved.description;
        });
    }
    if (schema.properties) {
        props = {...props, ...schema.properties};
    }
    if (schema.required && Array.isArray(schema.required)) {
        required = [...required, ...schema.required];
    }
    return {properties: props, required: Array.from(new Set(required)), description};
}

function sanitizeDoc(text: string): string {
    if (!text) return '';
    return text.replace(/\*\//g, '*\\/');
}

function buildDocBlock(opts: {
    description?: string;
    deprecated?: boolean;
    example?: any;
    seeLink?: string;
    defaultValue?: any;
    format?: string;
    pattern?: string;
}): string {
    const lines: string[] = [];
    const {description, deprecated, example, seeLink, defaultValue, format, pattern} = opts;
    if (description) {
        const descLines = sanitizeDoc(description).split('\n');
        descLines.forEach(l => lines.push(l.trim() ? l : ''));
    }
    const remarks: string[] = [];
    if (format) remarks.push(`Format: ${format}`);
    if (pattern) remarks.push(`Pattern: ${pattern}`);
    if (remarks.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push(...remarks);
    }
    if (deprecated) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        lines.push('@deprecated');
    }
    if (defaultValue !== undefined) {
        if (lines.length > 0) lines.push('');
        lines.push(`@defaultValue ${JSON.stringify(defaultValue)}`);
    }
    if (seeLink) {
        if (lines.length > 0) lines.push('');
        lines.push(`@see {@link ${seeLink}}`);
    }
    if (example !== undefined) {
        if (lines.length > 0) lines.push('');
        lines.push('@example');
        let exampleStr: string;
        if (typeof example === 'string') {
            try {
                const parsed = JSON.parse(example);
                exampleStr = JSON.stringify(parsed, null, 2);
            } catch {
                exampleStr = example;
            }
        } else {
            try {
                exampleStr = JSON.stringify(example, null, 2);
            } catch {
                exampleStr = String(example);
            }
        }
        if (example !== null && typeof example === 'object') {
            lines.push('```json');
            exampleStr.split('\n').forEach(l => lines.push(l));
            lines.push('```');
        } else {
            if (typeof example === 'string') {
                lines.push(JSON.stringify(example));
            } else {
                try {
                    lines.push(JSON.stringify(example));
                } catch {
                    lines.push(String(example));
                }
            }
        }
    }
    if (lines.length === 0) return '';
    const blockLines = ['/**', ...lines.map(l => ` * ${l}`.trimEnd()), ' */'];
    return blockLines.join('\n');
}

function buildFieldDocBlock(prop: any, seeOverride?: string): string {
    if (!prop) return '';
    const description = prop.description;
    const lines: string[] = [];
    if (description) {
        sanitizeDoc(description)
            .split('\n')
            .forEach(l => lines.push(l));
    }
    if (prop.deprecated) {
        if (lines.length) lines.push('');
        lines.push('@deprecated');
    }
    if (prop.format || prop.pattern) {
        if (lines.length) lines.push('');
        if (prop.format) lines.push(`Format: ${prop.format}`);
        if (prop.pattern) lines.push(`Pattern: ${prop.pattern}`);
    }
    if (prop.default !== undefined) {
        if (lines.length) lines.push('');
        lines.push(`@defaultValue ${JSON.stringify(prop.default)}`);
    }
    if (seeOverride) {
        if (lines.length) lines.push('');
        lines.push(`@see {@link ${seeOverride}}`);
    }
    if (prop.example !== undefined) {
        if (lines.length) lines.push('');
        lines.push('@example');
        let exStr: string;
        try {
            exStr = JSON.stringify(prop.example, null, 2);
        } catch {
            exStr = String(prop.example);
        }
        if (typeof prop.example === 'object' && prop.example !== null) {
            lines.push('```json');
            exStr.split('\n').forEach(l => lines.push(l));
            lines.push('```');
        } else {
            lines.push(exStr);
        }
    }
    if (lines.length === 0) return '';
    const block = ['/**', ...lines.map(l => ` * ${l}`.trimEnd()), ' */'].join('\n');
    return block;
}

function buildModelDocBlock(schemaName: string, schema: any, exampleValue: any, parsableKey: string): string {
    const encodedKey = encodeURIComponent(parsableKey);
    const encodedSchema = encodeURIComponent(schemaName);
    const fullLink = absoluteRouteHref(`#/parsable/${encodedKey}/schema-explorer?schemas=${encodedSchema}`);
    const schemaObject = isPlainObject(schema) ? schema : {};
    const description =
        schemaObject.description ||
        schemaObject.title ||
        (schema === true
            ? `${schemaName}: any value is allowed`
            : schema === false
              ? `${schemaName}: no value is allowed`
              : `${schemaName} model`);
    return buildDocBlock({
        description,
        seeLink: fullLink,
        example: exampleValue,
    });
}

export function generateTsContentForSchema(
    schemaName: string,
    schema: any,
    allSchemas: Record<string, any>,
    parsableKey: string,
): string {
    const nameMap = createTypeNameMap(Object.keys(allSchemas));
    const safeSchemaName = nameMap[schemaName] || toTypeScriptIdentifier(schemaName);
    let exampleValue: any = undefined;
    try {
        exampleValue = generateMockValue(schema, allSchemas);
    } catch {
        // An unsatisfiable schema (`false`, contradictory allOf, etc.) has no example.
    }
    const modelDoc = buildModelDocBlock(schemaName, schema, exampleValue, parsableKey);

    if (schema === true) return `\n\n${modelDoc}\nexport type ${safeSchemaName} = unknown;\n`;
    if (schema === false) return `\n\n${modelDoc}\nexport type ${safeSchemaName} = never;\n`;

    const resolved = resolveAllOfProperties(schema, allSchemas);
    const hasProps = Object.keys(resolved.properties).length > 0;
    const isObjectType =
        schema?.type === 'object' ||
        hasProps ||
        schema?.allOf ||
        (!schema?.type && !schema?.enum && schema?.const === undefined && !schema?.oneOf && !schema?.anyOf);
    let body = '';
    if (schema?.enum) {
        const tsType = schemaToTsType(schema, allSchemas, new Set(), nameMap);
        body = `${modelDoc}\nexport type ${safeSchemaName} = ${tsType};\n`;
    } else if (schema?.const !== undefined) {
        const tsType = JSON.stringify(schema.const);
        body = `${modelDoc}\nexport type ${safeSchemaName} = ${tsType};\n`;
    } else if (schema?.oneOf || schema?.anyOf) {
        const tsType = schemaToTsType(schema, allSchemas, new Set(), nameMap);
        body = `${modelDoc}\nexport type ${safeSchemaName} = ${tsType};\n`;
    } else if (schema?.type === 'array' || (Array.isArray(schema?.type) && schema.type.includes('array'))) {
        const tsType = schemaToTsType(schema, allSchemas, new Set(), nameMap);
        body = `${modelDoc}\nexport type ${safeSchemaName} = ${tsType};\n`;
    } else if (isObjectType) {
        const requiredSet = new Set(resolved.required);
        const lines: string[] = [];
        lines.push(modelDoc);
        lines.push(`export interface ${safeSchemaName} {`);
        for (const [propName, propSchema] of Object.entries(resolved.properties)) {
            const prop = propSchema as any;
            const isRequired = requiredSet.has(propName);
            const tsType = schemaToTsType(prop, allSchemas, new Set(), nameMap);
            const fieldDoc = buildFieldDocBlock(prop);
            if (fieldDoc) lines.push(`  ${fieldDoc.split('\n').join('\n  ')}`);
            const optional = isRequired ? '' : '?';
            const safePropName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : JSON.stringify(propName);
            lines.push(`  ${safePropName}${optional}: ${tsType};`);
            lines.push('');
        }
        if (schema?.additionalProperties && !hasProps) {
            const valType = isPlainObject(schema.additionalProperties)
                ? schemaToTsType(schema.additionalProperties, allSchemas, new Set(), nameMap)
                : 'unknown';
            lines.push(`  [key: string]: ${valType};`);
        } else if (Object.keys(resolved.properties).length === 0) {
            lines.push('  [key: string]: unknown;');
        }
        lines.push('}');
        body = lines.join('\n');
    } else {
        const tsType = schemaToTsType(schema, allSchemas, new Set(), nameMap);
        body = `${modelDoc}\nexport type ${safeSchemaName} = ${tsType};\n`;
    }

    let finalContent = body;
    if (exampleValue !== null && exampleValue !== undefined) {
        const exampleJson = JSON.stringify(exampleValue, null, 2);
        const exampleConst = [
            '',
            '/**',
            ` * Example of ${safeSchemaName}`,
            ' * @example',
            ' * ```json',
            ...exampleJson.split('\n').map(line => ` * ${line}`),
            ' * ```',
            ' */',
            `export const ${safeSchemaName}Example: ${safeSchemaName} = ${exampleJson};`,
            '',
        ].join('\n');
        finalContent += `\n${exampleConst}`;
    }
    return `\n\n${finalContent}\n`;
}

export function generateAllTsContent(schemas: Record<string, any>, parsableKey: string, firstSchema?: string): string {
    const names = Object.keys(schemas);
    const ordered =
        firstSchema && names.includes(firstSchema)
            ? [firstSchema, ...names.filter(name => name !== firstSchema)]
            : names;
    const nameMap = createTypeNameMap(names);
    const mapping = ordered.map(name => `// ${JSON.stringify(name)} -> ${nameMap[name]}`).join('\n');
    return [
        '/* Generated by OpenDoc UI. Original schema names are mapped below.',
        mapping,
        '*/',
        ...ordered.map(name => generateTsContentForSchema(name, schemas[name], schemas, parsableKey)),
    ].join('\n');
}

export function generateSingleSchemaFile(
    schemaName: string,
    _schema: any,
    allSchemas: Record<string, any>,
    parsableKey: string,
) {
    // Include the schema graph in one module so referenced and cyclic model
    // names remain resolvable without a fragile generated import graph.
    const content = generateAllTsContent(allSchemas, parsableKey, schemaName);
    const blob = new Blob([content], {type: 'text/typescript'});
    downloadBlob(blob, toSafeGeneratedFileName(`${schemaName}.models`));
}

export function generateAndDownloadZip(schemas: Record<string, any>, parsableKey: string) {
    if (!schemas || Object.keys(schemas).length === 0) {
        alert('No schemas to export');
        return;
    }
    const nameMap = createTypeNameMap(Object.keys(schemas));
    const modelsContent = generateAllTsContent(schemas, parsableKey);
    const files = [
        {name: 'models.ts', content: modelsContent},
        {name: 'index.ts', content: "export * from './models';\n"},
        {
            name: 'README.md',
            content: [
                `# Schemas Export - ${parsableKey}`,
                '',
                `Generated at ${new Date().toISOString()}`,
                '',
                `Total schemas: ${Object.keys(schemas).length}`,
                '',
                '## Name mapping',
                '',
                ...Object.entries(nameMap).map(([original, generated]) => `- \`${original}\` -> \`${generated}\``),
                '',
                '## Usage',
                '',
                '```ts',
                `import { ${Object.values(nameMap).slice(0, 3).join(', ')} } from './index';`,
                '```',
                '',
                'All declarations are intentionally emitted into one module so cross-schema and cyclic references compile reliably.',
                '',
            ].join('\n'),
        },
    ];
    const blob = createZipBlob(files);
    const timestamp = new Date().toISOString().slice(0, 10);
    const archiveBase = toSafeGeneratedFileName(parsableKey).replace(/\.ts$/i, '');
    downloadBlob(blob, `${archiveBase}_schemas_${timestamp}.zip`);
}
