/**
 * Schema to TypeScript exporter with TSDoc
 * Implements:
 * - TSDoc docblocks per field and per model
 * - Source link generation
 * - Example for field and whole model
 * - Export all as zip + single schema export
 */

import { createZipBlob, downloadBlob } from './zip';

export function getRefName(ref: string): string {
  if (!ref) return '';
  return ref.split('/').pop() || '';
}

function isPlainObject(v: any) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Generate mock value similar to previous implementation
export function generateMockValue(
  schema: any,
  allSchemas: Record<string, any> = {},
  visited = new Set<string>(),
  depth = 0
): any {
  if (!schema) return null;
  if (depth > 12) return {};

  if (schema.$ref) {
    const refName = getRefName(schema.$ref);
    if (visited.has(refName)) return {};
    visited.add(refName);
    const refSchema = allSchemas[refName];
    if (refSchema) return generateMockValue(refSchema, allSchemas, visited, depth + 1);
    return {};
  }

  if (schema.const !== undefined) return schema.const;
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  if (schema.allOf && Array.isArray(schema.allOf)) {
    let merged: any = {};
    schema.allOf.forEach((sub: any) => {
      const subMock = generateMockValue(sub, allSchemas, new Set(visited), depth + 1);
      if (isPlainObject(subMock) && isPlainObject(merged)) {
        merged = { ...merged, ...subMock };
      } else if (subMock !== undefined) {
        if (isPlainObject(subMock)) merged = { ...merged, ...subMock };
        else if (Object.keys(merged).length === 0) merged = subMock;
      }
    });
    return merged;
  }

  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateMockValue(schema.oneOf[0], allSchemas, new Set(visited), depth + 1);
  }
  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generateMockValue(schema.anyOf[0], allSchemas, new Set(visited), depth + 1);
  }

  const typeVal = schema.type;
  const resolvedType = Array.isArray(typeVal) ? typeVal.find((t) => t !== 'null') : typeVal;

  if (resolvedType === 'object' || schema.properties) {
    const obj: any = {};
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([k, v]: [string, any]) => {
        obj[k] = generateMockValue(v, allSchemas, new Set(visited), depth + 1);
      });
    }
    return obj;
  }

  if (resolvedType === 'array') {
    return [generateMockValue(schema.items || {}, allSchemas, new Set(visited), depth + 1)];
  }

  if (resolvedType === 'string') {
    if (schema.format === 'date-time' || schema.format === 'date') return new Date().toISOString();
    if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
    if (schema.format === 'email') return 'user@example.com';
    if (schema.format === 'uri') return 'https://example.com/path';
    return schema.enum ? schema.enum[0] : 'string';
  }
  if (resolvedType === 'integer' || resolvedType === 'number') return 0;
  if (resolvedType === 'boolean') return true;

  if (schema.properties) {
    const obj: any = {};
    Object.entries(schema.properties).forEach(([k, v]: [string, any]) => {
      obj[k] = generateMockValue(v, allSchemas, new Set(visited), depth + 1);
    });
    return obj;
  }

  return null;
}

// TS type mapping
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
  visited = new Set<string>()
): string {
  if (!schema) return 'any';

  if (schema.$ref) {
    const refName = getRefName(schema.$ref);
    return refName || 'any';
  }

  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  if (schema.enum && Array.isArray(schema.enum)) {
    return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ') || 'any';
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((s: any) => schemaToTsType(s, allSchemas, new Set(visited))).join(' | ') || 'any';
  }
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((s: any) => schemaToTsType(s, allSchemas, new Set(visited))).join(' | ') || 'any';
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((s: any) => schemaToTsType(s, allSchemas, new Set(visited)));
    return parts.join(' & ') || 'any';
  }

  if (Array.isArray(schema.type)) {
    if (schema.type.includes('array')) {
      const mapped: string[] = [];
      for (const t of schema.type) {
        if (t === 'array') {
          const it = schema.items ? schemaToTsType(schema.items, allSchemas, new Set(visited)) : 'any';
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
    const itemType = schema.items ? schemaToTsType(schema.items, allSchemas, new Set(visited)) : 'any';
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
        const t = schemaToTsType(v, allSchemas, new Set(visited));
        return `${JSON.stringify(k)}${isReq ? '' : '?'}: ${t}`;
      });
      return `{ ${props.join('; ')} }`;
    }
    if (schema.additionalProperties) {
      if (isPlainObject(schema.additionalProperties)) {
        const valType = schemaToTsType(schema.additionalProperties, allSchemas, new Set(visited));
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
      const t = schemaToTsType(v, allSchemas, new Set(visited));
      return `${JSON.stringify(k)}${isReq ? '' : '?'}: ${t}`;
    });
    return `{ ${props.join('; ')} }`;
  }

  return 'any';
}

// Resolve allOf properties merging
function resolveAllOfProperties(schema: any, allSchemas: Record<string, any>, visited = new Set<string>()): { properties: Record<string, any>; required: string[]; description?: string; } {
  let props: Record<string, any> = {};
  let required: string[] = [];
  let description: string | undefined = schema.description;

  if (!schema) return { properties: props, required, description };

  if (schema.$ref) {
    const refName = getRefName(schema.$ref);
    if (visited.has(refName)) return { properties: props, required, description };
    visited.add(refName);
    const refSchema = allSchemas[refName];
    if (refSchema) {
      const resolved = resolveAllOfProperties(refSchema, allSchemas, visited);
      props = { ...props, ...resolved.properties };
      required = [...required, ...resolved.required];
      if (!description && resolved.description) description = resolved.description;
    }
    return { properties: props, required, description };
  }

  if (schema.allOf && Array.isArray(schema.allOf)) {
    schema.allOf.forEach((sub: any) => {
      const subResolved = resolveAllOfProperties(sub, allSchemas, new Set(visited));
      props = { ...props, ...subResolved.properties };
      required = [...required, ...subResolved.required];
      if (!description && subResolved.description) description = subResolved.description;
    });
  }

  if (schema.properties) {
    props = { ...props, ...schema.properties };
  }
  if (schema.required && Array.isArray(schema.required)) {
    required = [...required, ...schema.required];
  }

  return { properties: props, required: Array.from(new Set(required)), description };
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
  const { description, deprecated, example, seeLink, defaultValue, format, pattern } = opts;

  if (description) {
    const descLines = sanitizeDoc(description).split('\n');
    descLines.forEach((l) => lines.push(l.trim() ? l : ''));
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
      exampleStr.split('\n').forEach((l) => lines.push(l));
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

  const blockLines = ['/**', ...lines.map((l) => ` * ${l}`.trimEnd()), ' */'];
  return blockLines.join('\n');
}

function buildFieldDocBlock(prop: any, seeOverride?: string): string {
  if (!prop) return '';
  const description = prop.description;

  const lines: string[] = [];
  if (description) {
    sanitizeDoc(description).split('\n').forEach((l) => lines.push(l));
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
      exStr.split('\n').forEach((l) => lines.push(l));
      lines.push('```');
    } else {
      lines.push(exStr);
    }
  }

  if (lines.length === 0) return '';

  const block = ['/**', ...lines.map((l) => ` * ${l}`.trimEnd()), ' */'].join('\n');
  return block;
}

function buildModelDocBlock(schemaName: string, schema: any, exampleValue: any, parsableKey: string): string {
  const encodedKey = encodeURIComponent(parsableKey);
  const encodedSchema = encodeURIComponent(schemaName);
  const fullLink = `${window.location.origin}${window.location.pathname}#/parsable/${encodedKey}/schema-explorer?schemas=${encodedSchema}`;

  const description = schema.description || schema.title || `${schemaName} model`;
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
  parsableKey: string
): string {
  const exampleValue = generateMockValue(schema, allSchemas);
  const modelDoc = buildModelDocBlock(schemaName, schema, exampleValue, parsableKey);

  const resolved = resolveAllOfProperties(schema, allSchemas);
  const hasProps = Object.keys(resolved.properties).length > 0;
  const isObjectType = schema.type === 'object' || hasProps || schema.allOf || (!schema.type && !schema.enum && !schema.const && !schema.oneOf && !schema.anyOf);

  let body = '';

  if (schema.enum) {
    const tsType = schemaToTsType(schema, allSchemas);
    body = `${modelDoc}\nexport type ${schemaName} = ${tsType};\n`;
  } else if (schema.const !== undefined) {
    const tsType = JSON.stringify(schema.const);
    body = `${modelDoc}\nexport type ${schemaName} = ${tsType};\n`;
  } else if (schema.oneOf || schema.anyOf) {
    const tsType = schemaToTsType(schema, allSchemas);
    body = `${modelDoc}\nexport type ${schemaName} = ${tsType};\n`;
  } else if (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
    const tsType = schemaToTsType(schema, allSchemas);
    body = `${modelDoc}\nexport type ${schemaName} = ${tsType};\n`;
  } else if (isObjectType) {
    const requiredSet = new Set(resolved.required);
    const lines: string[] = [];
    lines.push(`${modelDoc}`);
    lines.push(`export interface ${schemaName} {`);

    for (const [propName, propSchema] of Object.entries(resolved.properties)) {
      const prop = propSchema as any;
      const isRequired = requiredSet.has(propName);
      const tsType = schemaToTsType(prop, allSchemas);
      const fieldDoc = buildFieldDocBlock(prop);
      if (fieldDoc) {
        lines.push(`  ${fieldDoc.split('\n').join('\n  ')}`);
      }
      const optional = isRequired ? '' : '?';
      const safePropName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : JSON.stringify(propName);
      lines.push(`  ${safePropName}${optional}: ${tsType};`);
      lines.push('');
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !hasProps) {
      const valType = schemaToTsType(schema.additionalProperties, allSchemas);
      lines.push(`  [key: string]: ${valType};`);
    } else if (Object.keys(resolved.properties).length === 0) {
      lines.push(`  [key: string]: any;`);
    }

    lines.push(`}`);
    body = lines.join('\n');
  } else {
    const tsType = schemaToTsType(schema, allSchemas);
    body = `${modelDoc}\nexport type ${schemaName} = ${tsType};\n`;
  }

  const exampleJson = JSON.stringify(exampleValue, null, 2);
  // Build example const without problematic backticks escaping
  const exampleConstLines = [
    '',
    '/**',
    ` * Example of ${schemaName}`,
    ' * @example',
    ' * ```json',
    ...exampleJson.split('\n').map(l => ` * ${l}`),
    ' * ```',
    ' */',
    `export const ${schemaName}Example: ${schemaName} = ${exampleJson};`,
    ''
  ];
  const exampleConst = exampleConstLines.join('\n');

  let finalContent = body;
  if (exampleValue !== null && exampleValue !== undefined) {
    finalContent += `\n${exampleConst}`;
  }

  const header = `/**\n * ${schemaName} - Generated from OpenAPI schema\n * Parsable: ${parsableKey}\n * Source: ${window.location.origin}${window.location.pathname}#/parsable/${encodeURIComponent(parsableKey)}/schema-explorer?schemas=${encodeURIComponent(schemaName)}\n * Generated at: ${new Date().toISOString()}\n */\n\n`;

  return header + finalContent + '\n';
}

export function generateSingleSchemaFile(
  schemaName: string,
  schema: any,
  allSchemas: Record<string, any>,
  parsableKey: string
) {
  const content = generateTsContentForSchema(schemaName, schema, allSchemas, parsableKey);
  const blob = new Blob([content], { type: 'text/typescript' });
  downloadBlob(blob, `${schemaName}.ts`);
}

export function generateAndDownloadZip(
  schemas: Record<string, any>,
  parsableKey: string
) {
  if (!schemas || Object.keys(schemas).length === 0) {
    alert('No schemas to export');
    return;
  }

  const files: { name: string; content: string }[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const content = generateTsContentForSchema(name, schema, schemas, parsableKey);
    files.push({ name: `${name}.ts`, content });
  }

  const indexContent = [
    `/**`,
    ` * Index of all schemas - Auto generated`,
    ` * Parsable: ${parsableKey}`,
    ` * Generated at: ${new Date().toISOString()}`,
    ` */`,
    ``,
    ...Object.keys(schemas).map((name) => `export * from './${name}';`),
    ``,
  ].join('\n');
  files.push({ name: `index.ts`, content: indexContent });

  const readme = [
    `# Schemas Export - ${parsableKey}`,
    ``,
    `Generated at ${new Date().toISOString()}`,
    ``,
    `Total schemas: ${Object.keys(schemas).length}`,
    ``,
    `## Usage`,
    ``,
    '```ts',
    `import { ${Object.keys(schemas).slice(0, 3).join(', ')} } from './index';`,
    '```',
    ``,
    `## Source`,
    ``,
    `Each file contains TSDoc with @see link to original schema explorer`,
    ``,
  ].join('\n');
  files.push({ name: `README.md`, content: readme });

  const blob = createZipBlob(files);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${parsableKey.replace(/\s+/g, '_')}_schemas_${timestamp}.zip`);
}
