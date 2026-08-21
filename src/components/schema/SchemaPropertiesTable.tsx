import React, {useEffect, useMemo, useState} from 'react';
import clsx from 'clsx';
import {usePreferences} from '../../contexts/PreferencesContext';
import CardOrTable, {CARD_LAYOUT_WIDTH} from '../common/CardOrTable';
import DataCard, {RequiredBadge} from '../common/DataCard';
import Markdown from '../common/Markdown';
import {Tip} from '../common/Tooltip';
import {
    describeNotConstraint,
    flattenSchemaProperties,
    RECURSIVE_SCHEMA_ICON,
    schemaIsRecursive,
    schemaVariantLabel,
} from '../../utils/schemaProperties';
import CombinatorLabel from '../common/CombinatorLabel';
import {COMBINATOR_META} from '../../utils/schema/combinators';
import ModalPortal from '../common/ModalPortal';
import {useModalTransition} from '../../hooks/useModalTransition';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import CodeViewer from '../common/CodeViewer';
import SerializerPlaygroundModal from '../modals/SerializerPlaygroundModal';
import {
    applySchemaBranchSelections,
    readSchemaBranchSelections,
    SCHEMA_BRANCH_SELECTION_EVENT,
    writeSchemaBranchSelection,
} from '../../utils/schema/branchSelections';

interface SchemaPropertiesTableProps {
    properties: {
        [name: string]: any;
    };
    schema: any;
    resolveReference: (item: any) => any;
    getRefName: (refStr: string) => string;
    onPushSchema: (schemaName: string) => void;
    onViewExample: (name: string, schema: any) => void;
    onTestPattern: (pattern: string) => void;
    useModal?: boolean;
    inspectName?: string | null;
    selectionScopeKey?: string;
}

interface PropertyRowDetailsSection {
    title: string;
    rows: Array<{label: string; value: React.ReactNode}>;
}

const formatExampleText = (value: unknown): string => {
    if (value !== null && typeof value === 'object') {
        try {
            const text = JSON.stringify(value);
            if (text !== undefined) return text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
        } catch {}
    }
    const text = value === null ? 'null' : String(value);
    return text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
};

const CHROME_BUTTON_CLASS =
    'sm:px-2 px-1.5 py-1 rounded-md text-[10px] font-sans flex items-center gap-1 transition-all border hover:bg-[var(--background)] bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] cursor-pointer';
const GRID_TITLE_CLASS = 'text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]';
const GRID_TEXT_CLASS = 'text-[10px] text-[var(--text)] leading-relaxed';

export default function SchemaPropertiesTable({
    properties,
    schema,
    resolveReference,
    getRefName,
    onPushSchema,
    onViewExample,
    onTestPattern,
    useModal = false,
    inspectName = null,
    selectionScopeKey,
}: SchemaPropertiesTableProps) {
    const {preferences} = usePreferences();
    const cardLayout = preferences.narrowTableLayout === 'cards';
    const preferCards = useModal ? false : cardLayout;
    const [selectedPropertyName, setSelectedPropertyName] = useState('');
    const [detailsModalName, setDetailsModalName] = useState<string | null>(null);
    const [serializerPropertyName, setSerializerPropertyName] = useState<string | null>(null);
    const detailsTransition = useModalTransition(!!detailsModalName, () => setDetailsModalName(null));
    useModalShortcuts({isOpen: !!detailsModalName, onClose: detailsTransition.requestClose});

    const getSchemaName = (): string | null => {
        if (schema?.$ref) return getRefName(schema.$ref);
        if (schema?.title) return schema.title;
        return null;
    };
    const schemaName = getSchemaName();
    const selectionKey = selectionScopeKey || inspectName || schemaName || 'schema';
    const [branchSelections, setBranchSelections] = useState(() => readSchemaBranchSelections(selectionKey));
    const [selectionRevision, setSelectionRevision] = useState(0);

    useEffect(() => {
        setBranchSelections(readSchemaBranchSelections(selectionKey));
    }, [selectionKey]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{key?: string}>).detail;
            if (detail?.key !== selectionKey) return;
            setBranchSelections(readSchemaBranchSelections(selectionKey));
            setSelectionRevision(current => current + 1);
        };
        window.addEventListener(SCHEMA_BRANCH_SELECTION_EVENT, handler as EventListener);
        return () => window.removeEventListener(SCHEMA_BRANCH_SELECTION_EVENT, handler as EventListener);
    }, [selectionKey]);

    const updateBranchSelection = (path: string, index: number) => {
        const next = writeSchemaBranchSelection(selectionKey, path, index);
        setBranchSelections(next);
        setSelectionRevision(current => current + 1);
    };

    const effectiveSchema = useMemo(
        () => applySchemaBranchSelections(schema, selectionKey, resolveReference),
        [schema, selectionKey, branchSelections, selectionRevision, resolveReference],
    );
    const effectiveProperties = useMemo(
        () => flattenSchemaProperties(effectiveSchema, resolveReference),
        [effectiveSchema, resolveReference],
    );
    const propertyEntries = useMemo(() => Object.entries(effectiveProperties || {}), [effectiveProperties]);

    useEffect(() => {
        if (propertyEntries.length === 0) {
            setSelectedPropertyName('');
            return;
        }
        if (selectedPropertyName && effectiveProperties[selectedPropertyName]) return;
        setSelectedPropertyName(propertyEntries[0][0]);
    }, [effectiveProperties, propertyEntries, selectedPropertyName]);

    const displayType = (prop: any): string => {
        if (prop === true) return 'any';
        if (prop === false) return 'never';
        if (!prop) return 'any';
        if (prop.$ref) return getRefName(prop.$ref);
        const resolved = resolveReference(prop) || prop;
        if (resolved?.oneOf) return 'oneOf';
        if (resolved?.anyOf) return 'anyOf';
        if (resolved?.allOf) return 'allOf';
        if (resolved?.type === 'array') return 'array';
        const type = resolved?.type;
        if (Array.isArray(type)) return type.join(' | ');
        if (type) return String(type);
        if (resolved?.properties || resolved?.additionalProperties || resolved?.patternProperties) return 'object';
        return 'any';
    };

    const typeSummary = (prop: any): string => {
        if (prop === true) return 'any';
        if (prop === false) return 'never';
        if (!prop) return 'any';
        if (prop.$ref) return getRefName(prop.$ref);
        const resolved = resolveReference(prop) || prop;
        if (resolved?.oneOf) return `oneOf(${resolved.oneOf.length})`;
        if (resolved?.anyOf) return `anyOf(${resolved.anyOf.length})`;
        if (resolved?.allOf) return `allOf(${resolved.allOf.length})`;
        if (resolved?.type === 'array') {
            if (Array.isArray(resolved?.prefixItems) && resolved.prefixItems.length > 0)
                return `tuple[${resolved.prefixItems.length}]`;
            return resolved.items ? `array<${typeSummary(resolved.items)}>` : 'array';
        }
        if (
            resolved?.type === 'object' &&
            !resolved?.properties &&
            resolved?.additionalProperties &&
            typeof resolved.additionalProperties === 'object'
        )
            return `map<${typeSummary(resolved.additionalProperties)}>`;
        const type = resolved?.type;
        if (Array.isArray(type)) return type.join(' | ');
        if (type) return String(type);
        if (resolved?.properties || resolved?.additionalProperties || resolved?.patternProperties) return 'object';
        return 'any';
    };

    const structureHint = (prop: any): string | null => {
        if (!prop) return null;
        if (prop.$ref) return `reference → ${getRefName(prop.$ref)}`;
        const resolved = resolveReference(prop) || prop;
        if (resolved?.oneOf) return `${resolved.oneOf.length} oneOf branches`;
        if (resolved?.anyOf) return `${resolved.anyOf.length} anyOf branches`;
        if (resolved?.allOf) return `${resolved.allOf.length} allOf parts`;
        if (resolved?.type === 'array' && Array.isArray(resolved?.prefixItems) && resolved.prefixItems.length > 0)
            return `tuple head ${resolved.prefixItems.length}`;
        if (
            resolved?.type === 'object' &&
            !resolved?.properties &&
            resolved?.additionalProperties &&
            typeof resolved.additionalProperties === 'object'
        )
            return `map of ${displayType(resolved.additionalProperties)}`;
        if (resolved?.type === 'array' && resolved?.items) return `items ${displayType(resolved.items)}`;
        return null;
    };

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

    const renderSchemaType = (name: string, prop: any): React.ReactNode => {
        if (!prop) return <span className="text-xs font-mono opacity-50">any</span>;
        const renderTypeName = (tValue: any, format?: string) => {
            if (Array.isArray(tValue)) {
                return tValue.map(t => `${t}${format ? ` (${format})` : ''}`).join(' | ');
            }
            return `${tValue || 'any'}${format ? ` (${format})` : ''}`;
        };
        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            return (
                <Tip content={`Inspect schema: ${refName}`}>
                    <button
                        type="button"
                        onClick={() => onPushSchema(refName)}
                        className="text-[var(--primary)] hover:underline font-semibold text-xs text-left inline-flex items-center gap-1 cursor-pointer"
                    >
                        <i className="ph ph-diamonds-four text-[12px]"></i>
                        <div className={'max-w-32 truncate'}>{refName}</div>
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
            const selected = Math.max(0, Math.min(prop.oneOf.length - 1, branchSelections[name] ?? 0));
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <CombinatorLabel meta={COMBINATOR_META.oneOf} variant="inline" />
                    <div className="flex flex-col gap-1.5">
                        {prop.oneOf.map((sub: any, index: number) => {
                            const label = schemaVariantLabel(sub, resolveReference, getRefName, index);
                            const active = selected === index;
                            const refName = sub?.$ref ? getRefName(sub.$ref) : '';
                            return (
                                <label
                                    key={`${name}:oneOf:${index}`}
                                    className="flex items-center gap-2 text-xs text-[var(--text)]"
                                >
                                    <input
                                        type="radio"
                                        name={`oneof-${selectionKey}-${name}`}
                                        checked={active}
                                        onChange={() => updateBranchSelection(name, index)}
                                        className="m-0 size-3.5 accent-[var(--primary)]"
                                    />
                                    {refName ? (
                                        <button
                                            type="button"
                                            onClick={event => {
                                                event.preventDefault();
                                                onPushSchema(refName);
                                            }}
                                            className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
                                        >
                                            {refName}
                                        </button>
                                    ) : (
                                        <span>{label}</span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                </div>
            );
        }
        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <CombinatorLabel meta={COMBINATOR_META.anyOf} variant="inline" />
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.anyOf.map((sub: any, sIdx: number) => (
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && (
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">|</span>
                                )}
                                {renderSchemaType(`${name}.anyOf[${sIdx}]`, sub)}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.allOf && Array.isArray(prop.allOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <CombinatorLabel meta={COMBINATOR_META.allOf} variant="inline" />
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.allOf.map((sub: any, sIdx: number) => (
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && (
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">
                                        &amp;
                                    </span>
                                )}
                                {renderSchemaType(`${name}.allOf[${sIdx}]`, sub)}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.type === 'array' && Array.isArray(prop.prefixItems) && prop.prefixItems.length > 0) {
            return (
                <div className="flex flex-col gap-1 items-start text-xs font-mono text-[var(--text)]">
                    <span>array</span>
                    <span className="text-[var(--text-muted)]">
                        tuple[{prop.prefixItems.length} slot{prop.prefixItems.length === 1 ? '' : 's'}]
                    </span>
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
                            type="button"
                            onClick={() => onPushSchema(refName)}
                            className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
                        >
                            {refName}
                        </button>
                        &gt;
                    </span>
                );
            }
            if (prop.items.oneOf || prop.items.anyOf)
                return (
                    <span className="text-xs font-sans">
                        Array&lt;{renderSchemaType(`${name}.items`, prop.items)}&gt;
                    </span>
                );
            const resolvedItemsType = Array.isArray(prop.items.type)
                ? prop.items.type.join(' | ')
                : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">Array&lt;{resolvedItemsType}&gt;</span>;
        }
        return <span className="font-mono text-xs text-[var(--text)]">{renderTypeName(prop.type, prop.format)}</span>;
    };

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

    const patternEntries = Object.entries((effectiveSchema as any)?.patternProperties || {});
    const tupleEntries = Array.isArray((effectiveSchema as any)?.prefixItems)
        ? (((effectiveSchema as any).prefixItems as any[]) || []).map((item, index) => [index, item] as const)
        : [];
    const dependentRequiredEntries = Object.entries((effectiveSchema as any)?.dependentRequired || {});
    const discriminator = (effectiveSchema as any)?.discriminator;
    const propertyNamesSchema = (effectiveSchema as any)?.propertyNames;
    const ifSchema = (effectiveSchema as any)?.if;
    const thenSchema = (effectiveSchema as any)?.then;
    const elseSchema = (effectiveSchema as any)?.else;
    const arrayItemsSchema = (effectiveSchema as any)?.items;
    const unevaluatedProperties = (effectiveSchema as any)?.unevaluatedProperties;
    const schemaContentEncoding = (effectiveSchema as any)?.contentEncoding;
    const schemaContentMediaType = (effectiveSchema as any)?.contentMediaType;
    const schemaContentSchema = (effectiveSchema as any)?.contentSchema;
    const notSchema = (effectiveSchema as any)?.not;
    const additionalPropertiesSchema = (effectiveSchema as any)?.additionalProperties;
    const isOpenObject =
        (effectiveSchema as any)?.type === 'object' &&
        !(effectiveSchema as any).properties &&
        (effectiveSchema as any)?.additionalProperties !== undefined &&
        (effectiveSchema as any)?.additionalProperties !== false;
    const openAdditionalPropertiesSchema =
        isOpenObject && (effectiveSchema as any).additionalProperties !== true
            ? (effectiveSchema as any).additionalProperties
            : undefined;
    const hasSchemaNotes =
        tupleEntries.length > 0 ||
        dependentRequiredEntries.length > 0 ||
        !!discriminator ||
        !!propertyNamesSchema ||
        !!ifSchema ||
        unevaluatedProperties !== undefined ||
        !!schemaContentEncoding ||
        !!schemaContentMediaType ||
        !!arrayItemsSchema;

    if (
        Object.keys(effectiveProperties).length === 0 &&
        patternEntries.length === 0 &&
        !notSchema &&
        !isOpenObject &&
        !hasSchemaNotes
    ) {
        return <p className="text-xs italic py-4 text-[var(--text-muted)]">No properties specified for this schema.</p>;
    }

    const propertyFacts = (name: string, pVal: any) => {
        let isRequired = false;
        const nameParts = name.split('.');
        let schemaContext = resolveReference(effectiveSchema);
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
        const resolved = resolveReference(pVal) || pVal;
        const isComplexType =
            pVal?.$ref ||
            resolved?.type === 'object' ||
            resolved?.type === 'array' ||
            resolved?.properties ||
            resolved?.items ||
            resolved?.allOf ||
            resolved?.anyOf ||
            resolved?.oneOf;
        return {
            resolved,
            isRequired,
            isComplexType,
            pattern: resolvePattern(pVal),
            recursive: schemaIsRecursive(pVal, resolveReference),
            deprecated: resolved?.deprecated === true,
            readOnly: resolved?.readOnly === true,
            writeOnly: resolved?.writeOnly === true,
            contentEncoding: typeof resolved?.contentEncoding === 'string' ? resolved.contentEncoding : '',
            contentMediaType: typeof resolved?.contentMediaType === 'string' ? resolved.contentMediaType : '',
            format: typeof resolved?.format === 'string' ? resolved.format : '',
            hint: structureHint(pVal),
        };
    };

    const renderInlineFacts = (name: string, pVal: any) => {
        const facts = propertyFacts(name, pVal);
        const tags: React.ReactNode[] = [];
        if (facts.readOnly)
            tags.push(
                <span key="readOnly" className="fact good">
                    readOnly
                </span>,
            );
        if (facts.writeOnly)
            tags.push(
                <span key="writeOnly" className="fact">
                    writeOnly
                </span>,
            );
        if (facts.deprecated)
            tags.push(
                <span key="deprecated" className="fact danger">
                    deprecated
                </span>,
            );
        if (facts.recursive)
            tags.push(
                <span key="recursive" className="fact">
                    <i className={`${RECURSIVE_SCHEMA_ICON} text-[10px]`} /> recursive
                </span>,
            );
        if (facts.hint)
            tags.push(
                <span key="hint" className="fact">
                    {facts.hint}
                </span>,
            );
        if (Array.isArray(facts.resolved?.enum) && facts.resolved.enum.length > 0)
            tags.push(
                <span key="enum" className="fact">
                    enum {facts.resolved.enum.length}
                </span>,
            );
        if (facts.resolved?.const !== undefined)
            tags.push(
                <span key="const" className="fact">
                    const
                </span>,
            );
        if (facts.resolved?.minLength !== undefined)
            tags.push(
                <span key="minLength" className="fact">
                    minLength {facts.resolved.minLength}
                </span>,
            );
        if (facts.resolved?.maxLength !== undefined)
            tags.push(
                <span key="maxLength" className="fact">
                    maxLength {facts.resolved.maxLength}
                </span>,
            );
        if (facts.resolved?.minimum !== undefined)
            tags.push(
                <span key="minimum" className="fact">
                    minimum {facts.resolved.minimum}
                </span>,
            );
        if (facts.resolved?.maximum !== undefined)
            tags.push(
                <span key="maximum" className="fact">
                    maximum {facts.resolved.maximum}
                </span>,
            );
        if (facts.resolved?.multipleOf !== undefined)
            tags.push(
                <span key="multipleOf" className="fact">
                    multipleOf {facts.resolved.multipleOf}
                </span>,
            );
        if (facts.resolved?.minItems !== undefined)
            tags.push(
                <span key="minItems" className="fact">
                    minItems {facts.resolved.minItems}
                </span>,
            );
        if (facts.resolved?.maxItems !== undefined)
            tags.push(
                <span key="maxItems" className="fact">
                    maxItems {facts.resolved.maxItems}
                </span>,
            );
        if (facts.resolved?.uniqueItems === true)
            tags.push(
                <span key="uniqueItems" className="fact">
                    uniqueItems
                </span>,
            );
        if (facts.pattern)
            tags.push(
                <span key="pattern" className="fact warn">
                    pattern
                </span>,
            );
        if (facts.contentEncoding)
            tags.push(
                <span key="contentEncoding" className="fact">
                    {facts.contentEncoding}
                </span>,
            );
        if (facts.contentMediaType)
            tags.push(
                <span key="contentMediaType" className="fact">
                    {facts.contentMediaType}
                </span>,
            );
        return tags;
    };

    const propertyCells = (name: string, pVal: any) => {
        const facts = propertyFacts(name, pVal);
        const combinedAction = (
            <button
                type="button"
                onClick={() => setDetailsModalName(name)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] transition-all select-none w-fit shrink-0 cursor-pointer"
            >
                {facts.recursive ? (
                    <i className={`${RECURSIVE_SCHEMA_ICON} text-[9px]`} />
                ) : (
                    <i className="ph ph-eye text-[9px]" />
                )}{' '}
                View Example / More
            </button>
        );
        return {
            isRequired: facts.isRequired,
            name: (
                <div className={'flex items-start gap-1'}>
                    <span className="break-all">{name}</span>
                    {facts.isRequired && (
                        <Tip content="Required field">
                            <span className="text-[var(--method-delete)] leading-none -mt-0.5 font-semibold text-[16px] cursor-help">
                                *
                            </span>
                        </Tip>
                    )}
                </div>
            ),
            type: (
                <div className="flex flex-col gap-1">
                    <div>{renderSchemaType(name, pVal)}</div>
                    {facts.format && (
                        <div className="text-[10px] text-[var(--text-muted)]">
                            format:{' '}
                            <code className="px-1 py-0.5 rounded bg-[var(--background)] text-[#2468a8] border border-[var(--border)] font-mono select-all text-[9.5px]">
                                {facts.format}
                            </code>
                        </div>
                    )}
                    {renderInlineFacts(name, pVal).length > 0 && (
                        <div className="flex flex-wrap gap-1">{renderInlineFacts(name, pVal)}</div>
                    )}
                </div>
            ),
            consumer: combinedAction,
            description: (
                <>
                    {facts.resolved?.description ? (
                        <div className="markdown-body">
                            <Markdown text={facts.resolved.description} />
                        </div>
                    ) : (
                        <span className="text-[var(--text-muted)] italic text-[11px]">No description</span>
                    )}
                </>
            ),
        };
    };

    const schemaWideRows = useMemo(() => {
        const rows: Array<{label: string; value: React.ReactNode}> = [];
        if ((effectiveSchema as any)?.title || inspectName || schemaName)
            rows.push({
                label: 'Name',
                value: inspectName || schemaName || (effectiveSchema as any)?.title || 'Schema',
            });
        if ((effectiveSchema as any)?.description)
            rows.push({
                label: 'Description',
                value: <Markdown text={(effectiveSchema as any).description} className="text-[10px] leading-relaxed" />,
            });
        rows.push({label: 'Type', value: displayType(effectiveSchema)});
        if ((effectiveSchema as any)?.$schema)
            rows.push({label: '$schema', value: <code className="mono">{(effectiveSchema as any).$schema}</code>});
        if ((effectiveSchema as any)?.$id)
            rows.push({label: '$id', value: <code className="mono">{(effectiveSchema as any).$id}</code>});
        if ((effectiveSchema as any)?.$anchor)
            rows.push({label: '$anchor', value: <code className="mono">{(effectiveSchema as any).$anchor}</code>});
        if (Array.isArray((effectiveSchema as any)?.required) && (effectiveSchema as any).required.length > 0)
            rows.push({label: 'Required', value: (effectiveSchema as any).required.join(', ')});
        if ((effectiveSchema as any)?.minProperties !== undefined)
            rows.push({label: 'Min props', value: String((effectiveSchema as any).minProperties)});
        if ((effectiveSchema as any)?.maxProperties !== undefined)
            rows.push({label: 'Max props', value: String((effectiveSchema as any).maxProperties)});
        if (Object.keys((effectiveSchema as any)?.patternProperties || {}).length > 0)
            rows.push({
                label: 'Pattern props',
                value: `${Object.keys((effectiveSchema as any).patternProperties).length} pattern${Object.keys((effectiveSchema as any).patternProperties).length === 1 ? '' : 's'}`,
            });
        if (propertyNamesSchema?.pattern)
            rows.push({label: 'Property names', value: <code className="mono">{propertyNamesSchema.pattern}</code>});
        if (additionalPropertiesSchema !== undefined)
            rows.push({
                label: 'Addl. props',
                value:
                    typeof additionalPropertiesSchema === 'boolean'
                        ? String(additionalPropertiesSchema)
                        : typeSummary(additionalPropertiesSchema),
            });
        if (unevaluatedProperties !== undefined)
            rows.push({
                label: 'Unevaluated',
                value:
                    typeof unevaluatedProperties === 'boolean'
                        ? String(unevaluatedProperties)
                        : typeSummary(unevaluatedProperties),
            });
        if (Array.isArray((effectiveSchema as any)?.allOf) && (effectiveSchema as any).allOf.length > 0)
            rows.push({label: 'allOf', value: `${(effectiveSchema as any).allOf.length}`});
        if (Array.isArray((effectiveSchema as any)?.anyOf) && (effectiveSchema as any).anyOf.length > 0)
            rows.push({label: 'anyOf', value: `${(effectiveSchema as any).anyOf.length}`});
        if (Array.isArray((effectiveSchema as any)?.oneOf) && (effectiveSchema as any).oneOf.length > 0)
            rows.push({label: 'oneOf', value: `${(effectiveSchema as any).oneOf.length}`});
        if (discriminator?.propertyName) rows.push({label: 'Discriminator', value: discriminator.propertyName});
        if (ifSchema || thenSchema || elseSchema) rows.push({label: 'if/then/else', value: 'present'});
        if (dependentRequiredEntries.length > 0)
            rows.push({label: 'Dependent req', value: `${dependentRequiredEntries.length}`});
        if ((effectiveSchema as any)?.example !== undefined)
            rows.push({
                label: 'Example',
                value: <code className="mono">{formatExampleText((effectiveSchema as any).example)}</code>,
            });
        const extensionKeys = Object.keys(effectiveSchema || {}).filter(key => key.startsWith('x-'));
        if (extensionKeys.length > 0)
            rows.push({
                label: 'Extensions',
                value: `${extensionKeys.length} key${extensionKeys.length === 1 ? '' : 's'}`,
            });
        return rows;
    }, [
        additionalPropertiesSchema,
        dependentRequiredEntries.length,
        discriminator?.propertyName,
        effectiveSchema,
        elseSchema,
        ifSchema,
        inspectName,
        propertyNamesSchema?.pattern,
        schemaName,
        thenSchema,
        unevaluatedProperties,
    ]);

    const selectedProperty = effectiveProperties[selectedPropertyName];
    const selectedRows = useMemo(() => {
        if (!selectedPropertyName || !selectedProperty) return [] as Array<{label: string; value: React.ReactNode}>;
        const facts = propertyFacts(selectedPropertyName, selectedProperty);
        const rows: Array<{label: string; value: React.ReactNode}> = [
            {label: 'Name', value: <code className="mono">{selectedPropertyName}</code>},
            {label: 'Type', value: displayType(selectedProperty)},
            {label: 'Format', value: facts.format || '—'},
            {label: 'Required', value: facts.isRequired ? 'true' : 'false'},
            {
                label: 'Description',
                value: facts.resolved?.description ? (
                    <Markdown text={facts.resolved.description} className="text-[10px] leading-relaxed" />
                ) : (
                    '—'
                ),
            },
        ];
        if (facts.pattern) rows.push({label: 'Pattern', value: <code className="mono">{facts.pattern}</code>});
        if (facts.hint) rows.push({label: 'Structure', value: facts.hint});
        if (facts.contentEncoding) rows.push({label: 'Encoding', value: facts.contentEncoding});
        if (facts.contentMediaType) rows.push({label: 'Media', value: facts.contentMediaType});
        return rows;
    }, [effectiveProperties, selectedProperty, selectedPropertyName]);

    const buildDetailSections = (name: string, pVal: any): PropertyRowDetailsSection[] => {
        const facts = propertyFacts(name, pVal);
        const sections: PropertyRowDetailsSection[] = [];
        const generalRows: PropertyRowDetailsSection['rows'] = [
            {label: 'Name', value: <code className="mono">{name}</code>},
            {label: 'Type', value: displayType(pVal)},
            {label: 'Format', value: facts.format || '—'},
            {label: 'Required', value: facts.isRequired ? 'true' : 'false'},
            {
                label: 'Description',
                value: facts.resolved?.description ? (
                    <Markdown text={facts.resolved.description} className="text-[10px] leading-relaxed" />
                ) : (
                    '—'
                ),
            },
        ];
        sections.push({title: 'General', rows: generalRows});

        const validationRows: PropertyRowDetailsSection['rows'] = [];
        if (Array.isArray(facts.resolved?.enum) && facts.resolved.enum.length > 0)
            validationRows.push({label: 'Enum', value: facts.resolved.enum.join(', ')});
        if (facts.resolved?.const !== undefined)
            validationRows.push({label: 'Const', value: JSON.stringify(facts.resolved.const)});
        if (facts.pattern)
            validationRows.push({label: 'Pattern', value: <code className="mono">{facts.pattern}</code>});
        if (facts.resolved?.minLength !== undefined)
            validationRows.push({label: 'minLength', value: String(facts.resolved.minLength)});
        if (facts.resolved?.maxLength !== undefined)
            validationRows.push({label: 'maxLength', value: String(facts.resolved.maxLength)});
        if (facts.resolved?.minimum !== undefined)
            validationRows.push({label: 'minimum', value: String(facts.resolved.minimum)});
        if (facts.resolved?.maximum !== undefined)
            validationRows.push({label: 'maximum', value: String(facts.resolved.maximum)});
        if (facts.resolved?.multipleOf !== undefined)
            validationRows.push({label: 'multipleOf', value: String(facts.resolved.multipleOf)});
        if (facts.resolved?.minItems !== undefined)
            validationRows.push({label: 'minItems', value: String(facts.resolved.minItems)});
        if (facts.resolved?.maxItems !== undefined)
            validationRows.push({label: 'maxItems', value: String(facts.resolved.maxItems)});
        if (facts.resolved?.uniqueItems === true) validationRows.push({label: 'uniqueItems', value: 'true'});
        if (validationRows.length > 0) sections.push({title: 'Validation', rows: validationRows});

        const compositionRows: PropertyRowDetailsSection['rows'] = [];
        if (Array.isArray(facts.resolved?.oneOf))
            compositionRows.push({label: 'oneOf', value: `${facts.resolved.oneOf.length} branches`});
        if (Array.isArray(facts.resolved?.anyOf))
            compositionRows.push({label: 'anyOf', value: `${facts.resolved.anyOf.length} branches`});
        if (Array.isArray(facts.resolved?.allOf))
            compositionRows.push({label: 'allOf', value: `${facts.resolved.allOf.length} parts`});
        if (facts.resolved?.not)
            compositionRows.push({label: 'Not', value: `Must not match ${describeNotConstraint(facts.resolved.not)}`});
        if (facts.resolved?.discriminator?.propertyName)
            compositionRows.push({label: 'Discriminator', value: facts.resolved.discriminator.propertyName});
        if (compositionRows.length > 0) sections.push({title: 'Composition', rows: compositionRows});

        const conditionalRows: PropertyRowDetailsSection['rows'] = [];
        if (facts.resolved?.if) conditionalRows.push({label: 'if', value: 'present'});
        if (facts.resolved?.then) conditionalRows.push({label: 'then', value: 'present'});
        if (facts.resolved?.else) conditionalRows.push({label: 'else', value: 'present'});
        if (facts.resolved?.dependentRequired) conditionalRows.push({label: 'dependentRequired', value: 'present'});
        if (facts.resolved?.dependentSchemas) conditionalRows.push({label: 'dependentSchemas', value: 'present'});
        if (conditionalRows.length > 0) sections.push({title: 'Conditional', rows: conditionalRows});

        const objectRows: PropertyRowDetailsSection['rows'] = [];
        if (facts.resolved?.minProperties !== undefined)
            objectRows.push({label: 'minProperties', value: String(facts.resolved.minProperties)});
        if (facts.resolved?.maxProperties !== undefined)
            objectRows.push({label: 'maxProperties', value: String(facts.resolved.maxProperties)});
        if (facts.resolved?.propertyNames?.pattern)
            objectRows.push({
                label: 'propertyNames',
                value: <code className="mono">{facts.resolved.propertyNames.pattern}</code>,
            });
        if (facts.resolved?.additionalProperties !== undefined)
            objectRows.push({
                label: 'additionalProperties',
                value:
                    typeof facts.resolved.additionalProperties === 'boolean'
                        ? String(facts.resolved.additionalProperties)
                        : typeSummary(facts.resolved.additionalProperties),
            });
        if (facts.resolved?.unevaluatedProperties !== undefined)
            objectRows.push({
                label: 'unevaluatedProperties',
                value:
                    typeof facts.resolved.unevaluatedProperties === 'boolean'
                        ? String(facts.resolved.unevaluatedProperties)
                        : typeSummary(facts.resolved.unevaluatedProperties),
            });
        if (Object.keys(facts.resolved?.patternProperties || {}).length > 0)
            objectRows.push({
                label: 'patternProperties',
                value: `${Object.keys(facts.resolved.patternProperties).length} patterns`,
            });
        if (objectRows.length > 0) sections.push({title: 'Object', rows: objectRows});

        const arrayRows: PropertyRowDetailsSection['rows'] = [];
        if (Array.isArray(facts.resolved?.prefixItems))
            arrayRows.push({label: 'prefixItems', value: `${facts.resolved.prefixItems.length} slots`});
        if (facts.resolved?.items !== undefined)
            arrayRows.push({
                label: 'items',
                value: facts.resolved.items === false ? 'false' : typeSummary(facts.resolved.items),
            });
        if (facts.resolved?.contains) arrayRows.push({label: 'contains', value: typeSummary(facts.resolved.contains)});
        if (facts.resolved?.minContains !== undefined)
            arrayRows.push({label: 'minContains', value: String(facts.resolved.minContains)});
        if (facts.resolved?.maxContains !== undefined)
            arrayRows.push({label: 'maxContains', value: String(facts.resolved.maxContains)});
        if (facts.resolved?.unevaluatedItems !== undefined)
            arrayRows.push({
                label: 'unevaluatedItems',
                value:
                    typeof facts.resolved.unevaluatedItems === 'boolean'
                        ? String(facts.resolved.unevaluatedItems)
                        : typeSummary(facts.resolved.unevaluatedItems),
            });
        if (arrayRows.length > 0) sections.push({title: 'Array', rows: arrayRows});

        const referenceRows: PropertyRowDetailsSection['rows'] = [];
        if (pVal?.$ref) referenceRows.push({label: '$ref', value: <code className="mono">{pVal.$ref}</code>});
        if (facts.resolved?.externalDocs?.url)
            referenceRows.push({label: 'externalDocs', value: facts.resolved.externalDocs.url});
        if (referenceRows.length > 0) sections.push({title: 'References', rows: referenceRows});

        const contentRows: PropertyRowDetailsSection['rows'] = [];
        if (facts.contentEncoding) contentRows.push({label: 'contentEncoding', value: facts.contentEncoding});
        if (facts.contentMediaType) contentRows.push({label: 'contentMediaType', value: facts.contentMediaType});
        if (facts.resolved?.contentSchema)
            contentRows.push({label: 'contentSchema', value: typeSummary(facts.resolved.contentSchema)});
        if (facts.resolved?.xml) contentRows.push({label: 'xml', value: 'configured'});
        if (contentRows.length > 0) sections.push({title: 'Content / OpenAPI', rows: contentRows});

        const extensionKeys = Object.keys(facts.resolved || {}).filter(key => key.startsWith('x-'));
        if (extensionKeys.length > 0)
            sections.push({title: 'Extensions', rows: extensionKeys.map(key => ({label: key, value: 'present'}))});

        return sections;
    };

    const activeDetails = detailsModalName
        ? buildDetailSections(detailsModalName, effectiveProperties[detailsModalName])
        : [];

    return (
        <>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] min-w-0 items-start">
                <div className="min-w-0">
                    <div className="border rounded-xl overflow-hidden animate-in fade-in border-[var(--border)] bg-[var(--surface)] min-w-0">
                        <CardOrTable
                            preferCards={preferCards}
                            maxWidth={CARD_LAYOUT_WIDTH}
                            cards={() => (
                                <>
                                    {useModal && (inspectName ?? schemaName) && (
                                        <div className="flex justify-end border-b px-3 py-2 border-[var(--border)] bg-[var(--surface-hover)]">
                                            <button
                                                type="button"
                                                onClick={() => onPushSchema(inspectName ?? schemaName!)}
                                                className={CHROME_BUTTON_CLASS}
                                            >
                                                <i className="ph ph-diamonds-four text-[11px]"></i>
                                                <span className="whitespace-nowrap">Inspect Schema</span>
                                            </button>
                                        </div>
                                    )}
                                    <div className="space-y-2 p-2">
                                        {propertyEntries.map(([name, pVal]) => {
                                            const cells = propertyCells(name, pVal);
                                            return (
                                                <div
                                                    key={name}
                                                    onClick={() => setSelectedPropertyName(name)}
                                                    className={clsx(
                                                        'rounded-lg transition-colors',
                                                        selectedPropertyName === name &&
                                                            'ring-1 ring-[var(--primary)]/25',
                                                    )}
                                                >
                                                    <DataCard
                                                        title={
                                                            <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                                                                {cells.name}
                                                            </span>
                                                        }
                                                        badge={<RequiredBadge required={cells.isRequired} />}
                                                        facts={[
                                                            {label: 'Type', value: cells.type},
                                                            {label: 'Consumer notes', value: cells.consumer},
                                                            {label: 'Details', value: cells.description, wide: true},
                                                        ]}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            table={() => (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs min-w-[860px]">
                                        <thead>
                                            <tr className={'whitespace-nowrap brightness-95 bg-[var(--surface-hover)]'}>
                                                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]">
                                                    Field Target
                                                </th>
                                                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]">
                                                    Type/Structure
                                                </th>
                                                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]">
                                                    Consumer Notes
                                                </th>
                                                <th
                                                    className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-heading)]"
                                                    style={{width: '100%'}}
                                                >
                                                    Description
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {propertyEntries.map(([name, pVal]) => {
                                                const cells = propertyCells(name, pVal);
                                                return (
                                                    <tr
                                                        key={name}
                                                        onClick={() => setSelectedPropertyName(name)}
                                                        className={clsx(
                                                            'align-top border-b last:border-b-0 border-b-[var(--border)] transition-colors hover:bg-[var(--text-muted)]/5',
                                                            selectedPropertyName === name && 'bg-[var(--primary)]/4',
                                                        )}
                                                    >
                                                        <td className="px-3 py-2.5 font-mono font-bold text-[var(--text-heading)] whitespace-nowrap">
                                                            {cells.name}
                                                        </td>
                                                        <td className="px-3 py-2.5 min-w-[240px]">{cells.type}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                                            {cells.consumer}
                                                        </td>
                                                        <td className="px-3 py-2.5 leading-relaxed font-sans text-[var(--text)]">
                                                            {cells.description}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        />
                    </div>
                </div>

                <aside className="min-w-0 xl:sticky xl:top-4 self-start">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-hover)]">
                            <h5 className={GRID_TITLE_CLASS}>Schema-wide</h5>
                        </div>
                        <div className="grid gap-px bg-[var(--border)]">
                            {schemaWideRows.map(row => (
                                <div
                                    key={`schema:${row.label}`}
                                    className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 bg-[var(--surface)] px-3 py-2"
                                >
                                    <div className="font-semibold text-[var(--text-muted)] text-[10px]">
                                        {row.label}
                                    </div>
                                    <div className={GRID_TEXT_CLASS}>{row.value}</div>
                                </div>
                            ))}
                        </div>
                        <div className="px-3 py-2 border-y border-[var(--border)] bg-[var(--surface-hover)]">
                            <h5 className={GRID_TITLE_CLASS}>Selected Property</h5>
                        </div>
                        <div className="grid gap-px bg-[var(--border)]">
                            {selectedRows.map(row => (
                                <div
                                    key={`selected:${row.label}`}
                                    className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 bg-[var(--surface)] px-3 py-2"
                                >
                                    <div className="font-semibold text-[var(--text-muted)] text-[10px]">
                                        {row.label}
                                    </div>
                                    <div className={GRID_TEXT_CLASS}>{row.value}</div>
                                </div>
                            ))}
                        </div>
                        {selectedPropertyName && effectiveProperties[selectedPropertyName] && (
                            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--background)] px-3 py-2">
                                {propertyFacts(selectedPropertyName, effectiveProperties[selectedPropertyName])
                                    .pattern && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onTestPattern(
                                                propertyFacts(
                                                    selectedPropertyName,
                                                    effectiveProperties[selectedPropertyName],
                                                ).pattern || '',
                                            )
                                        }
                                        className={CHROME_BUTTON_CLASS}
                                    >
                                        <i className="ph ph-dna text-[11px]"></i>
                                        <span>Test Pattern</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setSerializerPropertyName(selectedPropertyName)}
                                    className={CHROME_BUTTON_CLASS}
                                >
                                    <i className="ph ph-arrows-split text-[11px]"></i>
                                    <span>Playground</span>
                                </button>
                            </div>
                        )}
                    </div>
                </aside>
            </div>

            {serializerPropertyName && effectiveProperties[serializerPropertyName] && (
                <SerializerPlaygroundModal
                    parameter={{
                        name: serializerPropertyName,
                        in: 'query',
                        schema: effectiveProperties[serializerPropertyName],
                    }}
                    onClose={() => setSerializerPropertyName(null)}
                />
            )}

            {detailsTransition.shouldRender && detailsModalName && effectiveProperties[detailsModalName] && (
                <ModalPortal>
                    <div
                        className={`${detailsTransition.backdropClassName} fixed inset-0 z-[3000] bg-black/40 backdrop-blur-[1px]`}
                        onMouseDown={event => {
                            if (event.target === event.currentTarget) detailsTransition.requestClose();
                        }}
                    >
                        <div className="modal-surface w-full max-w-4xl rounded-xl border flex flex-col max-h-[84vh] overflow-hidden shadow-2xl bg-[var(--surface)] border-[var(--border)]">
                            <header className="px-4 sm:px-5 py-3 border-b flex items-start justify-between gap-3 border-[var(--border)] bg-[var(--background)] shrink-0">
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-[var(--text-heading)] truncate">
                                        Property Details · {detailsModalName}
                                    </h3>
                                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                                        Advanced information for this schema property, with the current example action
                                        kept here too.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={detailsTransition.requestClose}
                                    className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                >
                                    <i className="ph ph-x text-lg" />
                                </button>
                            </header>
                            <div className="modal-scroll-region p-4 sm:p-5 overflow-y-auto space-y-4 text-xs leading-relaxed scrollbar-thin text-[var(--text)]">
                                <div className="grid gap-3 md:grid-cols-2">
                                    {activeDetails.map(section => (
                                        <section
                                            key={section.title}
                                            className="rounded-lg border border-[var(--border)] bg-[var(--background)] overflow-hidden"
                                        >
                                            <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
                                                <h4 className={GRID_TITLE_CLASS}>{section.title}</h4>
                                            </div>
                                            <div className="grid gap-px bg-[var(--border)]">
                                                {section.rows.map(row => (
                                                    <div
                                                        key={row.label}
                                                        className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 bg-[var(--surface)] px-3 py-2 text-[10px]"
                                                    >
                                                        <div className="font-semibold text-[var(--text-muted)]">
                                                            {row.label}
                                                        </div>
                                                        <div className="min-w-0 break-words text-[var(--text)]">
                                                            {row.value}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>

                                <section className="rounded-lg border border-[var(--border)] bg-[var(--background)] overflow-hidden">
                                    <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
                                        <h4 className={GRID_TITLE_CLASS}>Raw Fragment</h4>
                                    </div>
                                    <div className="p-3">
                                        <CodeViewer
                                            code={JSON.stringify(effectiveProperties[detailsModalName], null, 2)}
                                            language="json"
                                            maxHeight="340px"
                                        />
                                    </div>
                                </section>
                            </div>
                            <footer className="px-4 sm:px-5 py-3 border-t border-[var(--border)] bg-[var(--background)] shrink-0">
                                <div className="flex items-center justify-end gap-2">
                                    {detailsModalName && effectiveProperties[detailsModalName] && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const activeName = detailsModalName;
                                                const activeProperty = effectiveProperties[activeName];
                                                detailsTransition.requestClose();
                                                onViewExample(activeName, activeProperty);
                                            }}
                                            className="px-4 py-1.5 border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)] font-semibold text-xs rounded-lg cursor-pointer transition-colors select-none hover:bg-[var(--primary)]/15"
                                        >
                                            Open Example
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={detailsTransition.requestClose}
                                        className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer transition-colors shadow-sm select-none"
                                    >
                                        Close Details
                                    </button>
                                </div>
                            </footer>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </>
    );
}
