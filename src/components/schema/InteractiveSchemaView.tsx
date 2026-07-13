import {useState} from 'react';
import SchemaPropertiesTable from './SchemaPropertiesTable';
import CodeViewer from '../common/CodeViewer';
import Markdown from '../common/Markdown';

interface InteractiveSchemaViewProps {
    schema: any;
    resolveReference: (item: any) => any;
    getRefName: (refStr: string) => string;
    onPushSchema: (schemaName: string) => void;
    onViewExample: (name: string, schema: any) => void;
    onTestPattern: (pattern: string) => void;
    getMockSnippet: (schema: any) => string;
}

export default function InteractiveSchemaView({
                                                  schema,
                                                  resolveReference,
                                                  getRefName,
                                                  onPushSchema,
                                                  onViewExample,
                                                  onTestPattern,
                                                  getMockSnippet
                                              }: InteractiveSchemaViewProps) {
    const [activeTabMap, setActiveTabMap] = useState<{ [combinatorKey: string]: number; }>({});
    const [viewMode, setViewMode] = useState<'table' | 'example' | 'enum'>('table');

    if (!schema) {
        return <p className="text-xs italic opacity-50">No schema provided.</p>;
    }

    const resolved = resolveReference(schema) || schema;
    const isEnum = resolved.enum && Array.isArray(resolved.enum) && resolved.enum.length > 0;

    // Detect combinators
    const hasOneOf = resolved.oneOf && Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0;
    const hasAnyOf = resolved.anyOf && Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0;
    const hasAllOf = resolved.allOf && Array.isArray(resolved.allOf) && resolved.allOf.length > 0;

    const combinatorType = hasOneOf ? 'oneOf' : hasAnyOf ? 'anyOf' : hasAllOf ? 'allOf' : null;
    const subSchemas = combinatorType ?
        resolved[combinatorType] as any[] :
        [];

    const getSubSchemaLabel = (sub: any, idx: number): string => {
        if (!sub) return `Option ${idx + 1}`;
        if (sub.$ref) {
            return getRefName(sub.$ref);
        }
        if (sub.title) {
            return sub.title;
        }
        const resolvedSub = resolveReference(sub) || sub;
        if (resolvedSub.$ref) {
            return getRefName(resolvedSub.$ref);
        }
        if (resolvedSub.title) {
            return resolvedSub.title;
        }
        if (resolvedSub.type === 'object' && resolvedSub.properties) {
            return `Object (${Object.keys(resolvedSub.properties).length} props)`;
        }
        if (resolvedSub.type) {
            return `${resolvedSub.type}`;
        }
        return `Option ${idx + 1}`;
    };

    // Render when NO combinators are active
    const renderStandardSchema = (s: any) => {
        const resolvedS = resolveReference(s) || s;
        const resolvedProps: { [name: string]: any; } = {};

        // Helper to resolve properties recursively for standard schema
        const resolvePropertiesLocal = (sObj: any, prefix = '', visited = new Set<string>()): {
            [name: string]: any;
        } => {
            if (!sObj) return {};
            let props: { [name: string]: any; } = {};

            if (sObj.$ref) {
                const refName = getRefName(sObj.$ref);
                if (visited.has(refName)) return {};
                visited.add(refName);
                const refSchema = resolveReference(sObj);
                if (refSchema) {
                    props = {...props, ...resolvePropertiesLocal(refSchema, prefix, visited)};
                }
                return props;
            }

            if (sObj.allOf && Array.isArray(sObj.allOf)) {
                sObj.allOf.forEach((sub: any) => {
                    props = {...props, ...resolvePropertiesLocal(sub, prefix, new Set(visited))};
                });
            }

            if (sObj.properties) {
                Object.entries(sObj.properties).forEach(([name, prop]: [string, any]) => {
                    const key = prefix ? `${prefix}.${name}` : name;
                    props[key] = prop;

                    const res = resolveReference(prop);
                    if (res && (res.type === 'object' || res.properties || res.allOf)) {
                        const nested = resolvePropertiesLocal(res, key, new Set(visited));
                        props = {...props, ...nested};
                    } else if (res && res.type === 'array' && res.items) {
                        const resItems = resolveReference(res.items);
                        if (resItems && (resItems.type === 'object' || resItems.properties || resItems.allOf)) {
                            const nested = resolvePropertiesLocal(resItems, `${key}.*`, new Set(visited));
                            props = {...props, ...nested};
                        }
                    }
                });
            }

            if (sObj.oneOf && Array.isArray(sObj.oneOf)) {
                sObj.oneOf.forEach((sub: any) => {
                    props = {...props, ...resolvePropertiesLocal(sub, prefix, new Set(visited))};
                });
            }

            if (sObj.anyOf && Array.isArray(sObj.anyOf)) {
                sObj.anyOf.forEach((sub: any) => {
                    props = {...props, ...resolvePropertiesLocal(sub, prefix, new Set(visited))};
                });
            }

            // Map / dictionary types: object defined only via `additionalProperties`.
            if (!sObj.properties && sObj.additionalProperties && typeof sObj.additionalProperties === 'object') {
                const mapKey = prefix ? `${prefix}.«any key»` : '«any key»';
                props[mapKey] = sObj.additionalProperties;
            }

            return props;
        };

        const properties = resolvePropertiesLocal(resolvedS);

        return (
            <div className="space-y-4">
                {resolvedS.description &&
                    <div
                        className="p-3 rounded-lg border text-xs leading-relaxed bg-[var(--background)] border-[var(--border)]">

                        <p className="font-semibold mb-1 text-[var(--text-heading)]">Sub-schema
                            Description:</p>
                        <div style={{}}>
                            <Markdown text={resolvedS.description}/>
                        </div>
                    </div>
                }

                <div className="flex border-b gap-4 pb-1 border-[var(--border)]">
                    <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`pb-1 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                            viewMode === 'table' ?
                                'border-[var(--primary)] text-[var(--primary)] font-bold' :
                                'border-transparent text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`
                        }>

                        Unified Schema Matrix
                    </button>
                    {isEnum &&
                        <button
                            type="button"
                            onClick={() => setViewMode('enum')}
                            className={`pb-1 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                                viewMode === 'enum' ?
                                    'border-[var(--primary)] text-[var(--primary)] font-bold' :
                                    'border-transparent text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`
                            }>

                            Enum Values
                        </button>
                    }
                    <button
                        type="button"
                        onClick={() => setViewMode('example')}
                        className={`pb-1 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                            viewMode === 'example' ?
                                'border-[var(--primary)] text-[var(--primary)] font-bold' :
                                'border-transparent text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`
                        }>

                        Example Simulation Object
                    </button>
                </div>

                <div className="mt-2">
                    {viewMode === 'table' ?
                        <SchemaPropertiesTable
                            properties={properties}
                            schema={resolvedS}
                            resolveReference={resolveReference}
                            getRefName={getRefName}
                            onPushSchema={onPushSchema}
                            onViewExample={onViewExample}
                            onTestPattern={onTestPattern}/> :

                        viewMode === 'enum' && isEnum ?
                            <div
                                className="flex flex-wrap gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">

                                {resolved.enum.map((val: any) =>
                                    <span key={val}
                                          className="px-2.5 py-1 rounded-lg text-xs font-mono border bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">


                                        {JSON.stringify(val)}
                                    </span>
                                )}
                            </div> :

                            <CodeViewer code={getMockSnippet(resolvedS)} language="json" maxHeight="none"/>
                    }
                </div>
            </div>);

    };

    if (!combinatorType) {
        return renderStandardSchema(schema);
    }

    // Combinator active!
    const cacheKey = `${combinatorType}-${resolved.title || 'root'}`;
    const selectedIdx = activeTabMap[cacheKey] || 0;
    const activeSubSchema = subSchemas[selectedIdx];

    const getBadgeStyle = () => {
        switch (combinatorType) {
            case 'oneOf':
                return {
                    label: 'One Of',
                    classes: 'bg-[var(--method-options)]/10 text-[var(--method-options)] border-[var(--method-options)]/25'
                };
            case 'anyOf':
                return {
                    label: 'Any Of',
                    classes: 'bg-[var(--method-put)]/10 text-[var(--method-put)] border-[var(--method-put)]/25'
                };
            case 'allOf':
                return {
                    label: 'All Of',
                    classes: 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/25'
                };
            default:
                return {
                    label: 'Schema',
                    classes: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/25'
                };
        }
    };

    const badge = getBadgeStyle();

    return (
        <div
            className="space-y-4 border rounded-2xl p-4 md:p-5 font-sans bg-[var(--surface-hover)] border-[var(--border)]">

            {/* Combinator Header */}
            <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">

                <div className="flex items-center gap-2">
                    <span
                        className={`px-2 py-0.5 text-[10px] uppercase font-extrabold tracking-wider border rounded-full ${badge.classes}`}>
                        {badge.label}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-heading)]">
                        This schema contains multiple structural definitions
                    </span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">
                    Choose a sub-schema definition to inspect details and simulations.
                </p>
            </div>

            {/* Sub Schema Selector Tabs */}
            <div className="flex flex-wrap gap-1.5 py-1">
                {subSchemas.map((sub, idx) => {
                    const isSelected = selectedIdx === idx;
                    const label = getSubSchemaLabel(sub, idx);
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveTabMap((prev) => ({...prev, [cacheKey]: idx}))}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer select-none transition-all duration-150 ${
                                isSelected ?
                                    'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)] shadow-sm' :
                                    'bg-[var(--text-muted)]/5 border-[var(--border)]/10 hover:bg-[var(--text-muted)]/15'}`
                            }>

                            {label}
                        </button>);

                })}
            </div>

            {/* Sub Schema Detail Render */}
            <div className="p-4 rounded-xl border bg-[var(--surface)] bg-[var(--surface)] border-[var(--border)]">
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[var(--border)]">

                    <span className="text-xs font-extrabold tracking-wide uppercase text-[var(--text-muted)]">

                        Active Representation: {getSubSchemaLabel(activeSubSchema, selectedIdx)}
                    </span>
                    {activeSubSchema && activeSubSchema.$ref &&
                        <button
                            type="button"
                            onClick={() => onPushSchema(getRefName(activeSubSchema.$ref))}
                            className="px-2 py-1 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/25 rounded cursor-pointer transition-colors">

                            Drill-down to Schema
                        </button>
                    }
                </div>

                {activeSubSchema ?
                    renderStandardSchema(activeSubSchema) :

                    <p className="text-xs italic opacity-50">Empty sub-schema definition.</p>
                }
            </div>
        </div>);

}
