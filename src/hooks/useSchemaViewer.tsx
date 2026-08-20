import type React from 'react';
import {useState} from 'react';
import type {OpenApiSpec} from '@/src/types';
import AdaptiveTabStrip from '@/src/components/common/AdaptiveTabStrip';
import CombinatorLabel from '@/src/components/common/CombinatorLabel';
import {detectSchemaCombinator, mergeAllOfBranches} from '@/src/utils/schema/combinators';
import {getRefName, resolveReference as resolveOpenApiReference} from '@/src/utils/openapi';
import {Tip} from '@/src/components/common/Tooltip';

export function useSchemaViewer(spec: OpenApiSpec, onOpenSchemaModal: (name: string) => void) {
    const [viewerExampleSchemas, setViewerExampleSchemas] = useState<Record<string, any>>({});
    const [viewerExampleNames, setViewerExampleNames] = useState<Record<string, string>>({});
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
    const resolveReference = (item: any): any => resolveOpenApiReference(item, spec);
    const pickViewerSchema = (code: string, sub: any, fallbackName?: string | null) => {
        let name: string | null = null;
        if (sub?.$ref) name = getRefName(sub.$ref);
        else {
            const resolved = resolveReference(sub) || sub;
            if (resolved?.title) name = resolved.title;
        }
        if (!name || !spec.components?.schemas?.[name]) name = fallbackName || null;
        setViewerExampleSchemas(prev => ({...prev, [code]: sub}));
        setViewerExampleNames(prev => ({...prev, [code]: name || ''}));
    };
    const renderSchemaType = (prop: any): React.ReactNode => {
        if (!prop) return <span className="text-xs font-mono opacity-50">any</span>;
        const renderTypeName = (tValue: any, format?: string) => {
            if (Array.isArray(tValue)) return tValue.map(t => `${t}${format ? ` (${format})` : ''}`).join(' | ');
            return `${tValue || 'any'}${format ? ` (${format})` : ''}`;
        };
        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            return (
                <Tip content={`Inspect schema: ${refName}`}>
                    <button
                        onClick={() => onOpenSchemaModal(refName)}
                        className="text-[var(--primary)] hover:underline font-semibold text-xs text-left inline-flex items-center gap-1 cursor-pointer"
                    >
                        <i className="ph ph-diamonds-four text-[12px]"></i>
                        {/* The name is the caption of this button: without it a
                            phone shows a bare icon with nothing to read. */}
                        <span className="max-w-[42vw] truncate sm:max-w-none">{refName}</span>
                    </button>
                </Tip>
            );
        }
        if (
            prop.type === 'object' &&
            !prop.properties &&
            prop.additionalProperties &&
            typeof prop.additionalProperties === 'object'
        ) {
            return (
                <span className="font-mono text-xs text-[var(--text)]">
                    object{' '}
                    <span className="text-[var(--text-muted)]">
                        Map&lt;string, {mapValueLabel(prop.additionalProperties)}&gt;
                    </span>
                </span>
            );
        }
        if (prop.oneOf && Array.isArray(prop.oneOf)) {
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-options)] uppercase tracking-wider font-sans">
                        One Of:
                    </span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.oneOf.map((sub: any, sIdx: number) => (
                            <button
                                key={sIdx}
                                onClick={() => {
                                    const refName = sub.$ref ? getRefName(sub.$ref) : null;
                                    if (refName) onOpenSchemaModal(refName);
                                }}
                                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80"
                            >
                                {sub.$ref ? getRefName(sub.$ref) : `Option ${sIdx + 1}`}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-put)] uppercase tracking-wider font-sans">
                        Any Of:
                    </span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.anyOf.map((sub: any, sIdx: number) => (
                            <button
                                key={sIdx}
                                onClick={() => {
                                    const refName = sub.$ref ? getRefName(sub.$ref) : null;
                                    if (refName) onOpenSchemaModal(refName);
                                }}
                                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80"
                            >
                                {sub.$ref ? getRefName(sub.$ref) : `Option ${sIdx + 1}`}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.allOf && Array.isArray(prop.allOf)) {
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-sans">
                        All Of · every constraint applies:
                    </span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.allOf.map((sub: any, sIdx: number) => (
                            <button
                                key={sIdx}
                                onClick={() => {
                                    const refName = sub.$ref ? getRefName(sub.$ref) : null;
                                    if (refName) onOpenSchemaModal(refName);
                                }}
                                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80"
                            >
                                {sub.$ref ? getRefName(sub.$ref) : `Option ${sIdx + 1}`}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.type === 'array' && prop.items) {
            if (prop.items.$ref) {
                const refName = getRefName(prop.items.$ref);
                return (
                    <span className="text-xs font-sans">
                        Array&lt;
                        <button
                            onClick={() => onOpenSchemaModal(refName)}
                            className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
                        >
                            {refName}
                        </button>
                        &gt;
                    </span>
                );
            }
            if (prop.items.oneOf || prop.items.anyOf)
                return <span className="text-xs font-sans">Array&lt;{renderSchemaType(prop.items)}&gt;</span>;
            const resolvedItemsType = Array.isArray(prop.items.type)
                ? prop.items.type.join(' | ')
                : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">Array&lt;{resolvedItemsType}&gt;</span>;
        }
        return <span className="font-mono text-xs text-[var(--text)]">{renderTypeName(prop.type, prop.format)}</span>;
    };
    const renderSchemaButton = (schema: any) => {
        if (schema === undefined || schema === null)
            return <span className="text-[var(--text-muted)] italic">schema not provided</span>;
        if (schema === true) return <span className="text-[var(--text-muted)] italic">any value</span>;
        if (schema === false) return <span className="text-[var(--method-delete)] italic">no value is valid</span>;
        return <div className="space-y-2">{renderSchemaType(schema)}</div>;
    };
    const getDefaultViewerSchema = (schema: any): any => {
        if (!schema) return schema;
        if (schema.$ref) return resolveReference(schema) || schema;
        if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return schema.oneOf[0];
        if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return schema.anyOf[0];
        if (Array.isArray(schema.allOf) && schema.allOf.length > 0)
            return mergeAllOfBranches(schema.allOf, resolveReference) || schema.allOf[0];
        if (schema.type === 'array' && schema.items) return getDefaultViewerSchema(schema.items);
        return schema;
    };
    const resetViewerSchema = (code: string) => {
        setViewerExampleSchemas(previous => {
            const next = {...previous};
            delete next[code];
            return next;
        });
        setViewerExampleNames(previous => {
            const next = {...previous};
            delete next[code];
            return next;
        });
    };
    const isSchemaActive = (sub: any, code: string, viewerSchema: any): boolean => {
        if (viewerSchema === undefined || viewerSchema === null) return false;
        if (sub.$ref) {
            const subRefName = getRefName(sub.$ref);
            if (viewerSchema.$ref && getRefName(viewerSchema.$ref) === subRefName) return true;
            const resolvedSub = resolveReference(sub);
            return resolvedSub && viewerSchema === resolvedSub;
        }
        return viewerSchema === sub;
    };
    const renderSchemaTypeExample = (prop: any, code: string): React.ReactNode => {
        if (!prop) return <span className="text-xs font-mono opacity-50">any</span>;
        const fallbackName = prop?.$ref ? getRefName(prop.$ref) : prop?.title || null;
        const renderTypeName = (tValue: any, format?: string) => {
            if (Array.isArray(tValue)) return tValue.map(t => `${t}${format ? ` (${format})` : ''}`).join(' | ');
            return `${tValue || 'any'}${format ? ` (${format})` : ''}`;
        };
        const getSubLabel = (sub: any, idx: number): string => {
            if (sub.$ref) return getRefName(sub.$ref);
            if (sub.title) return sub.title;
            const resolved = resolveReference(sub) || sub;
            if (resolved.$ref) return getRefName(resolved.$ref);
            if (resolved.title) return resolved.title;
            if (resolved.type === 'object' && resolved.properties)
                return `Object (${Object.keys(resolved.properties).length} props)`;
            if (resolved.type) return `${resolved.type}`;
            return `Option ${idx + 1}`;
        };
        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            const refSchema = resolveReference(prop);
            const viewerSchema = viewerExampleSchemas[code] ?? getDefaultViewerSchema(prop);
            const isActive = isSchemaActive(prop, code, viewerSchema);
            return (
                <button
                    aria-pressed={isActive}
                    onClick={() => pickViewerSchema(code, refSchema || prop, refName)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}
                >
                    <i className="ph ph-diamonds-four text-[12px] mr-1"></i> {refName}
                </button>
            );
        }
        if (
            prop.type === 'object' &&
            !prop.properties &&
            prop.additionalProperties &&
            typeof prop.additionalProperties === 'object'
        ) {
            return (
                <span className="font-mono text-xs text-[var(--text)]">
                    object{' '}
                    <span className="text-[var(--text-muted)]">
                        Map&lt;string, {mapValueLabel(prop.additionalProperties)}&gt;
                    </span>
                </span>
            );
        }
        const combinator = detectSchemaCombinator(prop, resolveReference);
        if (combinator) {
            const viewerSchema = viewerExampleSchemas[code] ?? getDefaultViewerSchema(prop);
            const activeIndex = Math.max(
                0,
                combinator.branches.findIndex(branch => isSchemaActive(branch, code, viewerSchema)),
            );
            return (
                <AdaptiveTabStrip
                    ariaLabel={`${combinator.meta.label} branches`}
                    labelNode={<CombinatorLabel meta={combinator.meta} variant="inline" />}
                    activeId={String(activeIndex)}
                    onSelect={id => pickViewerSchema(code, combinator.branches[Number(id)], fallbackName)}
                    items={combinator.branches.map((branch: any, index: number) => ({
                        id: String(index),
                        label: getSubLabel(branch, index),
                        description: (resolveReference(branch) || branch)?.description,
                    }))}
                />
            );
        }
        if (prop.type === 'array' && prop.items) {
            if (prop.items.$ref) {
                const refName = getRefName(prop.items.$ref);
                const refSchema = resolveReference(prop.items);
                const viewerSchema = viewerExampleSchemas[code] ?? getDefaultViewerSchema(prop);
                const isActive = isSchemaActive(prop.items, code, viewerSchema);
                return (
                    <span className="text-xs font-sans">
                        Array&lt;
                        <button
                            aria-pressed={isActive}
                            onClick={() => pickViewerSchema(code, refSchema || prop.items, refName)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}
                        >
                            {refName}
                        </button>
                        &gt;
                    </span>
                );
            }
            if (prop.items.oneOf || prop.items.anyOf)
                return (
                    <span className="text-xs font-sans">Array&lt;{renderSchemaTypeExample(prop.items, code)}&gt;</span>
                );
            const resolvedItemsType = Array.isArray(prop.items.type)
                ? prop.items.type.join(' | ')
                : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">Array&lt;{resolvedItemsType}&gt;</span>;
        }
        return <span className="font-mono text-xs text-[var(--text)]">{renderTypeName(prop.type, prop.format)}</span>;
    };
    return {
        viewerExampleSchemas,
        viewerExampleNames,
        resolveReference,
        renderSchemaType,
        renderSchemaButton,
        renderSchemaTypeExample,
        pickViewerSchema,
        getDefaultViewerSchema,
        resetViewerSchema,
    };
}
