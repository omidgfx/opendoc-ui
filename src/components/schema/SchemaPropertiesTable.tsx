import React from 'react';
import Markdown from '../common/Markdown';
import { Tip } from '../common/Tooltip';

interface SchemaPropertiesTableProps {
    properties: { [name: string]: any; };
    schema: any;
    resolveReference: (item: any) => any;
    getRefName: (refStr: string) => string;
    onPushSchema: (schemaName: string) => void;
    onViewExample: (name: string, schema: any) => void;
    onTestPattern: (pattern: string) => void;
    useModal?: boolean;
}

export default function SchemaPropertiesTable({
                                                  properties,
                                                  schema,
                                                  resolveReference,
                                                  getRefName,
                                                  onPushSchema,
                                                  onViewExample,
                                                  onTestPattern,
                                                  useModal = false
                                              }: SchemaPropertiesTableProps) {

    const getSchemaName = (): string | null => {
        if (schema?.$ref) {
            return getRefName(schema.$ref);
        }
        if (schema?.title) {
            return schema.title;
        }
        return null;
    };

    const schemaName = getSchemaName();

    const mapValueLabel = (additionalProperties: any): string => {
        if (!additionalProperties) return 'any';
        if (additionalProperties.$ref) return getRefName(additionalProperties.$ref);
        const t = Array.isArray(additionalProperties.type)
            ? additionalProperties.type.find((x: string) => x !== 'null')
            : additionalProperties.type;
        if (t === 'array') {
            if (additionalProperties.items?.$ref) return `Array<${getRefName(additionalProperties.items.$ref)}>`;
            const it = Array.isArray(additionalProperties.items?.type)
                ? additionalProperties.items.type.find((x: string) => x !== 'null')
                : additionalProperties.items?.type;
            return `Array<${it || 'any'}>`;
        }
        if (t) return additionalProperties.format ? `${t} (${additionalProperties.format})` : `${t}`;
        return 'any';
    };

    const renderSchemaType = (prop: any): React.ReactNode => {
        if (!prop) {
            return <span className="text-xs font-mono opacity-50">any</span>;
        }

        const renderTypeName = (tValue: any, format?: string) => {
            if (Array.isArray(tValue)) {
                return tValue.map((t) => `${t}${format ? ` (${format})` : ''}`).join(' | ');
            }
            return `${tValue || 'any'}${format ? ` (${format})` : ''}`;
        };

        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            return (
                <Tip content={`Inspect schema: ${refName}`}>
                    <button
                        onClick={() => onPushSchema(refName)}
                        className="text-[var(--primary)] hover:underline font-semibold text-xs text-left inline-flex items-center gap-1 cursor-pointer">
                        <i className="ph ph-diamonds-four text-[12px]"></i>
                        <div className={'max-w-32 truncate'}>{refName}</div>
                    </button>
                </Tip>);
        }

        if (prop.type === 'object' && !prop.properties && prop.additionalProperties && typeof prop.additionalProperties === 'object') {
            return (
                <span className="font-mono text-xs text-[var(--text)]">
                    object <span className="text-[var(--text-muted)]">Map&lt;string, {mapValueLabel(prop.additionalProperties)}&gt;</span>
                </span>
            );
        }

        if (prop.oneOf && Array.isArray(prop.oneOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span
                        className="text-[10px] font-bold text-[var(--method-options)] uppercase tracking-wider font-sans">
                        One Of:
                    </span>
                    <div className="flex flex-col flex-wrap gap-1.5">
                        {prop.oneOf.map((sub: any, sIdx: number) =>
                            <div key={sIdx}>
                                {renderSchemaType(sub)}
                            </div>
                        )}
                    </div>
                </div>);

        }

        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-put)] uppercase tracking-wider font-sans">Any
                        Of:</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.anyOf.map((sub: any, sIdx: number) =>
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 &&
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">|</span>}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        )}
                    </div>
                </div>);

        }

        if (prop.allOf && Array.isArray(prop.allOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-sans">All
                        Of:</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.allOf.map((sub: any, sIdx: number) =>
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && <span
                                    className="text-[var(--text-muted)] font-mono text-xs select-none">&amp;</span>}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        )}
                    </div>
                </div>);

        }

        if (prop.type === 'array' && prop.items) {
            if (prop.items.$ref) {
                const refName = getRefName(prop.items.$ref);
                return (
                    <span className="text-xs font-sans">
                        Array&lt;
                        <button
                            onClick={() => onPushSchema(refName)}
                            className="text-[var(--primary)] hover:underline font-semibold cursor-pointer">

                            {refName}
                        </button>
                        &gt;
                    </span>);

            }

            if (prop.items.oneOf || prop.items.anyOf) {
                return (
                    <span className="text-xs font-sans">
                        Array&lt;{renderSchemaType(prop.items)}&gt;
                    </span>);

            }

            const resolvedItemsType = Array.isArray(prop.items.type) ? prop.items.type.join(' | ') : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">
                Array&lt;{resolvedItemsType}&gt;</span>;
        }

        return (
            <span className="font-mono text-xs text-[var(--text)]">
                {renderTypeName(prop.type, prop.format)}
            </span>);

    };

    // Helper to resolve pattern from a property
    const resolvePattern = (prop: any): string | null => {
        if (!prop) return null;
        if (prop.pattern) return prop.pattern;
        if (prop.schema?.pattern) return prop.schema.pattern;
        if (prop.$ref) {
            const refSchema = resolveReference(prop);
            if (refSchema?.pattern) return refSchema.pattern;
            if (refSchema?.schema?.pattern) return refSchema.schema.pattern;
        }
        return null;
    };

    if (Object.keys(properties).length === 0) {
        return (
            <p className="text-xs italic py-4 text-[var(--text-muted)]">
                No properties specified for this schema.
            </p>);

    }

    return (
        <div className="border rounded-xl overflow-hidden mt-2 mb-3 border-[var(--border)] bg-[var(--background)]">
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[560px]">
                <thead>
                <tr className={"whitespace-nowrap brightness-95 bg-[var(--surface-hover)]"}>
                    <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]">
                        Field Target
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]">
                        Type/Structure
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider animate-pulse text-[var(--primary)] text-[var(--text-heading)]">
                        EXAMPLE
                    </th>
                    <th className="px-3 w-full py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]" style={{ width: '100%' }}>

                        <div className={'flex justify-between'}>
                            <span>Description</span>
                            {useModal && schemaName && (
                                <Tip content={`Inspect ${schemaName} schema`}>
                                    <button
                                        type="button"
                                        onClick={() => onPushSchema(schemaName)}
                                        className="sm:px-2 px-1.5 py-1 rounded-md text-[10px] font-sans flex items-center gap-1 transition-all cursor-pointer border hover:bg-[var(--background)] bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)]">
                                        <i className="ph ph-diamonds-four text-[11px]"></i>
                                        <span className="hidden sm:inline">Inspect Schema</span>
                                    </button>
                                </Tip>
                            )}
                        </div>
                    </th>
                </tr>
                </thead>
                <tbody>
                {Object.entries(properties).map(([name, pVal]) => {
                    let isRequired = false;
                    const nameParts = name.split('.');
                    let schemaContext = resolveReference(schema);

                    for (let i = 0; i < nameParts.length; i++) {
                        const part = nameParts[i];
                        if (!schemaContext) break;
                        if (schemaContext.required && schemaContext.required.includes(part)) {
                            isRequired = true;
                            break;
                        }
                        if (schemaContext.properties && schemaContext.properties[part]) {
                            schemaContext = resolveReference(schemaContext.properties[part]);
                        } else {
                            break;
                        }
                    }

                    const isComplexType = pVal.$ref || pVal.type === 'object' || pVal.type === 'array' || pVal.properties || pVal.items || pVal.allOf || pVal.anyOf || pVal.oneOf;
                    const pattern = resolvePattern(pVal);

                    return (
                        <tr key={name}
                            className="hover:bg-[var(--text-muted)]/5 transition-colors align-top border-b last:border-b-0 border-b-[var(--border)]">
                            <td className="px-3 py-2.5 font-mono font-bold text-[var(--text-heading)] whitespace-nowrap">
                                <div className={'flex items-start gap-1'}>
                                    <span className="break-all">{name}</span>
                                    {isRequired && (
                                        <Tip content="Required field">
                                            <span className="text-[var(--method-delete)] leading-none -mt-0.5 font-semibold text-[16px] cursor-help">*</span>
                                        </Tip>
                                    )}
                                </div>
                            </td>
                            <td className="px-3 py-2.5">
                                <div className="flex flex-col gap-1">
                                    <div>{renderSchemaType(pVal)}</div>
                                    {pVal.format &&
                                        <div className="text-[10px] font-mono flex items-center gap-1">
                                            <span style={{}}>format:</span>
                                            <code
                                                className="px-1 py-0.5 rounded bg-[var(--background)] text-[var(--accent)] text-[var(--accent)] border border-[var(--border)] font-mono select-all text-[9.5px]">
                                                {pVal.format}
                                            </code>
                                        </div>
                                    }
                                    {pattern &&
                                        <div
                                            className="text-[10px] font-mono flex items-center gap-1 mt-0.5">
                                            <span style={{}}>pattern:</span>
                                            <code
                                                className="px-1 py-0.5 rounded bg-[var(--background)] max-w-24 truncate bg-[var(--background)] text-[var(--method-put)] border border-[var(--border)] font-mono select-all text-[9.5px]">
                                                {pattern}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={() => onTestPattern(pattern)}
                                                className="px-1 whitespace-nowrap py-0.5 text-[9px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20 hover:underline inline-flex items-center gap-0.5 rounded cursor-pointer transition-colors">

                                                <i className="ph ph-dna text-[8px]"></i> Test Pattern
                                            </button>
                                        </div>
                                    }
                                </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                                <div className="flex flex-col gap-1.5">
                                    {isComplexType && (
                                        <Tip content="Generate simulated example for this sub-schema">
                                            <button
                                                type="button"
                                                onClick={() => onViewExample(name, pVal)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] cursor-pointer transition-all select-none w-fit shrink-0">
                                                <i className="ph ph-dna text-[9px]"></i> View Example
                                            </button>
                                        </Tip>
                                    )}

                                    {/* Show quick scalar inline representation if available */}
                                    {!isComplexType && (pVal.example !== undefined || pVal.default !== undefined) &&
                                        <div className="text-[10px] font-mono opacity-75">
                                            <span
                                                className="text-[var(--text-muted)] mr-1">{pVal.example !== undefined ? 'ex:' : 'def:'}</span>
                                            <code
                                                className="text-[10.5px] px-1 py-0.2 rounded bg-[var(--background)] border text-[var(--method-get)] font-mono">
                                                {String(pVal.example !== undefined ? pVal.example : pVal.default)}
                                            </code>
                                        </div>
                                    }
                                </div>
                            </td>
                            <td className="px-3 py-2.5 leading-relaxed font-sans text-[var(--text)]">
                                {pVal.description ?
                                    <div className="markdown-body">
                                        <Markdown text={pVal.description}/>
                                    </div> :

                                    <span className="text-[var(--text-muted)] italic text-[11px]">No description</span>
                                }
                                {pVal.externalDocs && pVal.externalDocs.url &&
                                    <div className="mt-1.5">
                                        <a
                                            href={pVal.externalDocs.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20 rounded cursor-pointer transition-colors">

                                            <i className="ph ph-arrow-square-out text-[8px]"></i>
                                            <span>{pVal.externalDocs.description || 'External Docs'}</span>
                                        </a>
                                    </div>
                                }
                                {pVal.enum &&
                                    <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                                        <span className="font-semibold text-[10px] text-[var(--text-muted)]">
                                            Enum:</span>
                                        {pVal.enum.map((vEnum: any) =>
                                            <span key={vEnum}
                                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">


                                                {vEnum}
                                            </span>
                                        )}
                                    </div>
                                }
                            </td>
                        </tr>);

                })}
                </tbody>
            </table>
            </div>
        </div>);

}
