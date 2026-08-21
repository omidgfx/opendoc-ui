import React, {useEffect, useMemo, useState} from 'react';
import clsx from 'clsx';
import {usePreferences} from '../../contexts/PreferencesContext';
import {useBreakpoint} from '../../hooks/useBreakpoint';
import CardOrTable, {CARD_LAYOUT_WIDTH} from '../common/CardOrTable';
import DataCard from '../common/DataCard';
import Markdown from '../common/Markdown';
import ScrollableRow from '../common/ScrollableRow';
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
const GRID_TITLE_CLASS = 'text-[10px] font-semibold uppercase tracking-wider text-[var(--text-heading)]';
const GRID_TEXT_CLASS = 'text-[10px] text-[var(--text)] leading-relaxed';
const FACT_PILL_BASE_CLASS =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold leading-none';
const STICKY_HEADER_CLASS =
    'sticky top-0 z-10 h-[39px] border-b border-[var(--border)] bg-[var(--surface-hover)] px-3 py-0 text-[10px] font-semibold uppercase tracking-wider leading-none text-[var(--text-heading)] align-middle';

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
    const bp = useBreakpoint();
    const isMobileLayout = bp === 'mobile' || bp === 'tablet';
    const cardLayout = preferences.narrowTableLayout === 'cards';
    const preferCards = isMobileLayout || (!useModal && cardLayout);
    const [selectedPropertyName, setSelectedPropertyName] = useState('');
    const [detailsModalName, setDetailsModalName] = useState<string | null>(null);
    const [serializerPropertyName, setSerializerPropertyName] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [copiedPropertyName, setCopiedPropertyName] = useState(false);
    const [expandedCardProperties, setExpandedCardProperties] = useState<Record<string, boolean>>({});
    const sidebarOpen = !isMobileLayout && !sidebarCollapsed;
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

    const sourceProperties = useMemo(() => properties || {}, [properties]);
    const effectiveSchema = useMemo(
        () => applySchemaBranchSelections(schema, selectionKey, resolveReference),
        [schema, selectionKey, branchSelections, selectionRevision, resolveReference],
    );
    const effectiveProperties = useMemo(
        () => flattenSchemaProperties(effectiveSchema, resolveReference),
        [effectiveSchema, resolveReference],
    );
    const displayProperties = useMemo(
        () =>
            Object.fromEntries(
                Object.keys(effectiveProperties || {}).map(name => [
                    name,
                    sourceProperties[name] ?? effectiveProperties[name],
                ]),
            ),
        [effectiveProperties, sourceProperties],
    );
    const propertyEntries = useMemo(() => Object.entries(displayProperties || {}), [displayProperties]);

    useEffect(() => {
        if (propertyEntries.length === 0) {
            setSelectedPropertyName('');
            return;
        }
        if (selectedPropertyName && displayProperties[selectedPropertyName]) return;
        setSelectedPropertyName(propertyEntries[0][0]);
    }, [displayProperties, propertyEntries, selectedPropertyName]);

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

    const renderSchemaLink = (schemaName: string, withIcon = true) => (
        <button
            type="button"
            onClick={() => onPushSchema(schemaName)}
            className="inline-flex items-center gap-1 text-left font-semibold text-[var(--primary)] hover:underline cursor-pointer"
        >
            {withIcon && <i className="ph ph-diamonds-four text-[10px]"></i>}
            <span className="break-all">{schemaName}</span>
        </button>
    );

    const renderTypeName = (typeValue: any): string => {
        if (Array.isArray(typeValue)) return typeValue.join(' | ');
        return typeValue ? String(typeValue) : 'any';
    };

    const mapValueLabel = (additionalProperties: any): string => {
        if (!additionalProperties) return 'any';
        if (additionalProperties.$ref) return getRefName(additionalProperties.$ref);
        const t = Array.isArray(additionalProperties.type)
            ? additionalProperties.type.find((x: string) => x !== 'null')
            : additionalProperties.type;
        if (t === 'array') {
            if (additionalProperties.items?.$ref) return `array<${getRefName(additionalProperties.items.$ref)}>`;
            const it = Array.isArray(additionalProperties.items?.type)
                ? additionalProperties.items.type.find((x: string) => x !== 'null')
                : additionalProperties.items?.type;
            return `array<${it || 'any'}>`;
        }
        if (t) return `${t}`;
        return 'any';
    };

    const directReferenceNames = (prop: any): string[] => {
        const names: string[] = [];
        const pushRef = (value: any) => {
            if (value?.$ref) {
                const refName = getRefName(value.$ref);
                if (!names.includes(refName)) names.push(refName);
            }
        };
        if (!prop || typeof prop !== 'object') return names;
        pushRef(prop);
        ['oneOf', 'anyOf', 'allOf'].forEach(key => {
            if (Array.isArray(prop[key])) prop[key].forEach((item: any) => pushRef(item));
        });
        if (prop.items) pushRef(prop.items);
        if (prop.additionalProperties && typeof prop.additionalProperties === 'object')
            pushRef(prop.additionalProperties);
        if (Array.isArray(prop.prefixItems)) prop.prefixItems.forEach((item: any) => pushRef(item));
        return names;
    };

    const renderReferenceList = (names: string[]) => {
        if (names.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-1.5">
                {names.map(name => (
                    <span key={name}>{renderSchemaLink(name, true)}</span>
                ))}
            </div>
        );
    };

    const renderInlineSchemaValue = (prop: any): React.ReactNode => {
        if (prop === true) return <span className="font-mono text-[10px] text-[var(--text)]">any</span>;
        if (prop === false) return <span className="font-mono text-[10px] text-[var(--method-delete)]">never</span>;
        if (!prop) return <span className="font-mono text-[10px] text-[var(--text)]">any</span>;
        if (prop.$ref) return renderSchemaLink(getRefName(prop.$ref), true);
        const resolved = resolveReference(prop) || prop;
        if (resolved?.oneOf) return <span className="font-mono text-[10px] text-[var(--text)]">oneOf</span>;
        if (resolved?.anyOf) return <span className="font-mono text-[10px] text-[var(--text)]">anyOf</span>;
        if (resolved?.allOf) return <span className="font-mono text-[10px] text-[var(--text)]">allOf</span>;
        if (resolved?.type === 'array') return <span className="font-mono text-[10px] text-[var(--text)]">array</span>;
        if (
            resolved?.type === 'object' &&
            !resolved?.properties &&
            resolved?.additionalProperties &&
            typeof resolved.additionalProperties === 'object'
        ) {
            return (
                <span className="font-mono text-[10px] text-[var(--text)]">
                    object{' '}
                    <span className="text-[var(--text-muted)]">
                        map&lt;string, {mapValueLabel(resolved.additionalProperties)}&gt;
                    </span>
                </span>
            );
        }
        const type = resolved?.type;
        if (type) return <span className="font-mono text-[10px] text-[var(--text)]">{renderTypeName(type)}</span>;
        if (resolved?.properties || resolved?.additionalProperties || resolved?.patternProperties)
            return <span className="font-mono text-[10px] text-[var(--text)]">object</span>;
        return <span className="font-mono text-[10px] text-[var(--text)]">any</span>;
    };

    const renderStructureLine = (label: string, value: React.ReactNode, key: string) => (
        <div key={key} className="flex flex-wrap items-center gap-1.5 text-[10px] leading-relaxed">
            <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 font-bold uppercase tracking-wide text-[9px] text-[var(--text-muted)]">
                {label}
            </span>
            <div className="min-w-0 break-words text-[var(--text)]">{value}</div>
        </div>
    );

    const combinatorTitle = (kind: 'oneOf' | 'anyOf' | 'allOf', count: number) => {
        const meta = COMBINATOR_META[kind];
        const title = kind === 'oneOf' ? 'ONE OF' : kind === 'anyOf' ? 'ANY OF' : 'ALL OF';
        return (
            <div
                className="inline-flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wider"
                style={{color: meta.color}}
            >
                <i className={`${meta.icon} text-[11px]`} />
                {title} ({count}):
            </div>
        );
    };

    const renderCombinatorOptions = (
        name: string,
        kind: 'oneOf' | 'anyOf' | 'allOf',
        branches: any[],
        controlScope: 'table' | 'sidebar' | 'details' | 'mobile' = 'table',
    ): React.ReactNode => {
        if (!Array.isArray(branches) || branches.length === 0) return null;
        const selected = kind === 'oneOf' ? Math.max(0, Math.min(branches.length - 1, branchSelections[name] ?? 0)) : 0;
        return (
            <div className="flex flex-col gap-1.5">
                {combinatorTitle(kind, branches.length)}
                <div className="flex flex-col gap-1.5">
                    {branches.map((sub: any, index: number) => {
                        const label = schemaVariantLabel(sub, resolveReference, getRefName, index);
                        const active = kind === 'oneOf' ? selected === index : false;
                        const refName = sub?.$ref ? getRefName(sub.$ref) : '';
                        return (
                            <label
                                key={`${name}:${kind}:${index}:${controlScope}`}
                                className="flex items-start gap-2 text-[10px] leading-relaxed text-[var(--text)]"
                            >
                                {kind === 'oneOf' ? (
                                    <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
                                        <input
                                            type="radio"
                                            name={`oneof-${selectionKey}-${controlScope}-${name}`}
                                            checked={active}
                                            onChange={() => updateBranchSelection(name, index)}
                                            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                                        />
                                        <span className="absolute inset-0 rounded-full border border-[var(--border)] bg-[var(--surface)] transition-colors peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)]/10"></span>
                                        <span className="relative size-1.5 rounded-full bg-transparent transition-colors peer-checked:bg-[var(--primary)]"></span>
                                    </span>
                                ) : (
                                    <span className="mt-[4px] size-1.5 rounded-full bg-[var(--border)]"></span>
                                )}
                                <span className="min-w-0 break-words">
                                    {refName ? renderSchemaLink(refName, true) : <span>{label}</span>}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderStructureDetails = (
        name: string,
        prop: any,
        controlScope: 'table' | 'sidebar' | 'details' | 'mobile' = 'table',
    ): React.ReactNode => {
        if (!prop || prop === true || prop === false || prop.$ref) return null;
        const resolved = resolveReference(prop) || prop;
        const rows: React.ReactNode[] = [];
        if (Array.isArray(resolved?.oneOf) && resolved.oneOf.length > 0)
            rows.push(
                <div key={`${name}:oneOf`} className="flex flex-col gap-1.5">
                    {renderCombinatorOptions(name, 'oneOf', resolved.oneOf, controlScope)}
                </div>,
            );
        if (Array.isArray(resolved?.anyOf) && resolved.anyOf.length > 0)
            rows.push(
                <div key={`${name}:anyOf`} className="flex flex-col gap-1.5">
                    {renderCombinatorOptions(name, 'anyOf', resolved.anyOf, controlScope)}
                </div>,
            );
        if (Array.isArray(resolved?.allOf) && resolved.allOf.length > 0)
            rows.push(
                <div key={`${name}:allOf`} className="flex flex-col gap-1.5">
                    {renderCombinatorOptions(name, 'allOf', resolved.allOf, controlScope)}
                </div>,
            );
        if (
            resolved?.type === 'object' &&
            !resolved?.properties &&
            resolved?.additionalProperties &&
            typeof resolved.additionalProperties === 'object'
        ) {
            rows.push(
                renderStructureLine(
                    'values',
                    <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">string</span>
                        <span className="text-[var(--text-muted)]">→</span>
                        {renderInlineSchemaValue(resolved.additionalProperties)}
                    </span>,
                    `${name}:values`,
                ),
            );
        }
        if (resolved?.type === 'array' && Array.isArray(resolved?.prefixItems) && resolved.prefixItems.length > 0) {
            rows.push(
                renderStructureLine(
                    'items',
                    <span className="font-mono text-[10px] text-[var(--text)]">
                        tuple · {resolved.prefixItems.length} slot{resolved.prefixItems.length === 1 ? '' : 's'}
                    </span>,
                    `${name}:tuple`,
                ),
            );
        }
        if (resolved?.type === 'array' && resolved?.items !== undefined) {
            rows.push(
                renderStructureLine(
                    'items',
                    resolved.items === false ? (
                        <span className="font-mono text-[10px] text-[var(--method-delete)]">false</span>
                    ) : (
                        renderInlineSchemaValue(resolved.items)
                    ),
                    `${name}:items`,
                ),
            );
        }
        return rows.length > 0 ? <div className="flex flex-col gap-1.5">{rows}</div> : null;
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
    const notSchema = (effectiveSchema as any)?.not;
    const additionalPropertiesSchema = (effectiveSchema as any)?.additionalProperties;
    const isOpenObject =
        (effectiveSchema as any)?.type === 'object' &&
        !(effectiveSchema as any).properties &&
        (effectiveSchema as any)?.additionalProperties !== undefined &&
        (effectiveSchema as any)?.additionalProperties !== false;
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

    const isRequiredAlongPath = (propertyPath: string): boolean => {
        const segments = propertyPath.split('.');
        const walk = (current: any, index: number): boolean => {
            const resolved = resolveReference(current) || current;
            if (!resolved || typeof resolved !== 'object' || index >= segments.length) return false;
            const token = segments[index];
            const branches = [
                ...(Array.isArray(resolved.allOf) ? resolved.allOf : []),
                ...(Array.isArray(resolved.anyOf) ? resolved.anyOf : []),
                ...(Array.isArray(resolved.oneOf) ? resolved.oneOf : []),
            ];
            if (branches.some(branch => walk(branch, index))) return true;
            if (token === '*') return resolved.items ? walk(resolved.items, index + 1) : false;
            if (token === '«any key»')
                return resolved.additionalProperties && typeof resolved.additionalProperties === 'object'
                    ? walk(resolved.additionalProperties, index + 1)
                    : false;
            if (Array.isArray(resolved.required) && resolved.required.includes(token)) return true;
            if (resolved.properties && resolved.properties[token]) return walk(resolved.properties[token], index + 1);
            return false;
        };
        return walk(effectiveSchema, 0);
    };

    const renderFlagPill = (
        key: string,
        label: React.ReactNode,
        tone: 'neutral' | 'good' | 'danger' | 'warn' = 'neutral',
    ) => {
        const toneClass =
            tone === 'good'
                ? 'border-[var(--method-get)]/25 bg-[var(--method-get)]/10 text-[var(--method-get)]'
                : tone === 'danger'
                  ? 'border-[var(--method-delete)]/25 bg-[var(--method-delete)]/10 text-[var(--method-delete)]'
                  : tone === 'warn'
                    ? 'border-[var(--method-put)]/25 bg-[var(--method-put)]/10 text-[var(--method-put)]'
                    : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]';
        return (
            <span key={key} className={`${FACT_PILL_BASE_CLASS} ${toneClass}`}>
                {label}
            </span>
        );
    };

    const renderValuePill = (key: string, label: string, value: React.ReactNode) => (
        <span key={key} className={`${FACT_PILL_BASE_CLASS} border-[var(--border)] bg-[var(--background)]`}>
            <span className="text-[var(--text-muted)]">{label}:</span>
            <span className="text-[var(--text)]">{value}</span>
        </span>
    );

    const renderPatternPill = (pattern: string) => (
        <button
            key={`pattern:${pattern}`}
            type="button"
            onClick={() => onTestPattern(pattern)}
            className={`${FACT_PILL_BASE_CLASS} border-[var(--method-put)]/25 bg-[var(--method-put)]/10 text-[var(--text)] cursor-pointer transition-colors hover:bg-[var(--method-put)]/15`}
        >
            <i className="ph ph-dna text-[10px] text-[var(--method-put)]" />
            <span>pattern (test)</span>
        </button>
    );

    const propertyFacts = (name: string, pVal: any) => {
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
        const pattern = resolvePattern(pVal);
        const referenceNames = directReferenceNames(pVal);
        return {
            resolved,
            isRequired: isRequiredAlongPath(name),
            isComplexType,
            pattern,
            recursive: schemaIsRecursive(pVal, resolveReference),
            deprecated: resolved?.deprecated === true,
            readOnly: resolved?.readOnly === true,
            writeOnly: resolved?.writeOnly === true,
            contentEncoding: typeof resolved?.contentEncoding === 'string' ? resolved.contentEncoding : '',
            contentMediaType: typeof resolved?.contentMediaType === 'string' ? resolved.contentMediaType : '',
            format: typeof resolved?.format === 'string' ? resolved.format : '',
            referenceNames,
        };
    };

    const renderValidationPills = (facts: ReturnType<typeof propertyFacts>): React.ReactNode[] => {
        const pills: React.ReactNode[] = [];
        if (Array.isArray(facts.resolved?.enum) && facts.resolved.enum.length > 0)
            pills.push(renderValuePill('enum', 'enum', facts.resolved.enum.length));
        if (facts.resolved?.const !== undefined) pills.push(renderFlagPill('const', 'const'));
        if (facts.resolved?.minLength !== undefined)
            pills.push(renderValuePill('minLength', 'minLength', facts.resolved.minLength));
        if (facts.resolved?.maxLength !== undefined)
            pills.push(renderValuePill('maxLength', 'maxLength', facts.resolved.maxLength));
        if (facts.resolved?.minimum !== undefined)
            pills.push(renderValuePill('minimum', 'minimum', facts.resolved.minimum));
        if (facts.resolved?.maximum !== undefined)
            pills.push(renderValuePill('maximum', 'maximum', facts.resolved.maximum));
        if (facts.resolved?.exclusiveMinimum !== undefined)
            pills.push(renderValuePill('exclusiveMinimum', 'exclusiveMinimum', facts.resolved.exclusiveMinimum));
        if (facts.resolved?.exclusiveMaximum !== undefined)
            pills.push(renderValuePill('exclusiveMaximum', 'exclusiveMaximum', facts.resolved.exclusiveMaximum));
        if (facts.resolved?.multipleOf !== undefined)
            pills.push(renderValuePill('multipleOf', 'multipleOf', facts.resolved.multipleOf));
        if (facts.resolved?.minItems !== undefined)
            pills.push(renderValuePill('minItems', 'minItems', facts.resolved.minItems));
        if (facts.resolved?.maxItems !== undefined)
            pills.push(renderValuePill('maxItems', 'maxItems', facts.resolved.maxItems));
        if (facts.resolved?.uniqueItems === true) pills.push(renderFlagPill('uniqueItems', 'uniqueItems'));
        if (facts.resolved?.minProperties !== undefined)
            pills.push(renderValuePill('minProperties', 'minProperties', facts.resolved.minProperties));
        if (facts.resolved?.maxProperties !== undefined)
            pills.push(renderValuePill('maxProperties', 'maxProperties', facts.resolved.maxProperties));
        if (facts.pattern) pills.push(renderPatternPill(facts.pattern));
        return pills;
    };

    const renderStatePills = (facts: ReturnType<typeof propertyFacts>): React.ReactNode[] => {
        const pills: React.ReactNode[] = [];
        if (facts.readOnly) pills.push(renderFlagPill('readOnly', 'readOnly', 'good'));
        if (facts.writeOnly) pills.push(renderFlagPill('writeOnly', 'writeOnly'));
        if (facts.deprecated) pills.push(renderFlagPill('deprecated', 'deprecated', 'danger'));
        if (facts.recursive)
            pills.push(
                renderFlagPill(
                    'recursive',
                    <>
                        <i className={`${RECURSIVE_SCHEMA_ICON} text-[10px] text-[var(--method-delete)]`} /> recursive
                    </>,
                ),
            );
        if (facts.contentEncoding) pills.push(renderValuePill('contentEncoding', 'encoding', facts.contentEncoding));
        if (facts.contentMediaType) pills.push(renderValuePill('contentMediaType', 'media', facts.contentMediaType));
        return pills;
    };

    const renderInlineFacts = (name: string, pVal: any) => {
        const facts = propertyFacts(name, pVal);
        return [...renderStatePills(facts), ...renderValidationPills(facts)];
    };

    const propertyCells = (name: string, pVal: any) => {
        const facts = propertyFacts(name, pVal);
        const factPills = renderInlineFacts(name, pVal);
        const combinedAction = (
            <button
                type="button"
                onClick={() => setDetailsModalName(name)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] transition-all select-none w-fit shrink-0 cursor-pointer"
            >
                <i className="ph ph-eye text-[9px]" /> More / Example
            </button>
        );
        const structureNode = renderStructureDetails(name, pVal, 'table');
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
                <div className="flex flex-col gap-1.5">
                    <div>{renderInlineSchemaValue(pVal)}</div>
                    {facts.format && (
                        <div className="text-[10px] text-[var(--text-muted)]">
                            format:{' '}
                            <code className="px-1 py-0.5 rounded bg-[var(--background)] text-[#2468a8] border border-[var(--border)] font-mono select-all text-[9.5px]">
                                {facts.format}
                            </code>
                        </div>
                    )}
                    {structureNode}
                    {factPills.length > 0 && <div className="flex flex-wrap gap-1">{factPills}</div>}
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

    const selectedProperty = displayProperties[selectedPropertyName];
    const selectedEffectiveProperty = effectiveProperties[selectedPropertyName];

    const buildPropertyRows = (
        propertyName: string,
        propertySchema: any,
        controlScope: 'sidebar' | 'mobile' | 'details' = 'sidebar',
        options: {includeName?: boolean; includeDescription?: boolean; includePatternRow?: boolean} = {},
    ): Array<{label: string; value: React.ReactNode}> => {
        if (!propertyName || !propertySchema) return [];
        const {includeName = true, includeDescription = true, includePatternRow = true} = options;
        const facts = propertyFacts(propertyName, propertySchema);
        const validationPills = renderValidationPills(facts);
        const statePills = renderStatePills(facts);
        const structureNode = renderStructureDetails(propertyName, propertySchema, controlScope);
        const rows: Array<{label: string; value: React.ReactNode}> = [];

        if (includeName)
            rows.push({
                label: 'Name',
                value: (
                    <div className="flex min-w-0 items-center gap-1.5">
                        <ScrollableRow className="flex-1 font-mono select-all text-[10px] text-[var(--text)]">
                            {propertyName}
                        </ScrollableRow>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(propertyName);
                                setCopiedPropertyName(true);
                                setTimeout(() => setCopiedPropertyName(false), 1500);
                            }}
                            className="inline-flex size-5 shrink-0 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--primary)] cursor-pointer"
                            aria-label="Copy property name"
                        >
                            <i className={`ph ${copiedPropertyName ? 'ph-check' : 'ph-copy'} text-[11px]`}></i>
                        </button>
                    </div>
                ),
            });

        rows.push({label: 'Type', value: displayType(propertySchema)});
        rows.push({label: 'Format', value: facts.format || '—'});
        rows.push({
            label: 'Required',
            value: facts.isRequired ? <span className="font-semibold text-[var(--method-delete)]">true</span> : 'false',
        });

        if (includeDescription)
            rows.push({
                label: 'Description',
                value: facts.resolved?.description ? (
                    <Markdown text={facts.resolved.description} className="text-[10px] leading-relaxed" />
                ) : (
                    '—'
                ),
            });

        if (facts.referenceNames.length > 0)
            rows.push({label: 'Reference', value: renderReferenceList(facts.referenceNames)});
        if (structureNode) rows.push({label: 'Structure', value: structureNode});
        if (validationPills.length > 0)
            rows.push({label: 'Validation', value: <div className="flex flex-wrap gap-1">{validationPills}</div>});
        if (statePills.length > 0)
            rows.push({label: 'Flags', value: <div className="flex flex-wrap gap-1">{statePills}</div>});
        if (includePatternRow && facts.pattern) rows.push({label: 'Pattern', value: renderPatternPill(facts.pattern)});
        if (facts.contentEncoding) rows.push({label: 'Encoding', value: facts.contentEncoding});
        if (facts.contentMediaType) rows.push({label: 'Media', value: facts.contentMediaType});
        return rows;
    };

    const renderPropertyRowsGrid = (
        rows: Array<{label: string; value: React.ReactNode}>,
        prefix: string,
        labelColumn = '104px',
    ) => (
        <div className="grid gap-px bg-[var(--border)]">
            {rows.map(row => (
                <div
                    key={`${prefix}:${row.label}`}
                    className="grid gap-2 bg-[var(--surface)] px-3 py-2"
                    style={{gridTemplateColumns: `${labelColumn} minmax(0,1fr)`}}
                >
                    <div className="font-semibold text-[var(--text-muted)] text-[10px]">{row.label}</div>
                    <div className={GRID_TEXT_CLASS}>{row.value}</div>
                </div>
            ))}
        </div>
    );

    const selectedRows = useMemo(
        () => buildPropertyRows(selectedPropertyName, selectedProperty, 'sidebar'),
        [selectedProperty, selectedPropertyName, branchSelections, selectionRevision, copiedPropertyName],
    );

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
            compositionRows.push({label: 'oneOf', value: `ONE OF (${facts.resolved.oneOf.length})`});
        if (Array.isArray(facts.resolved?.anyOf))
            compositionRows.push({label: 'anyOf', value: `ANY OF (${facts.resolved.anyOf.length})`});
        if (Array.isArray(facts.resolved?.allOf))
            compositionRows.push({label: 'allOf', value: `ALL OF (${facts.resolved.allOf.length})`});
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
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-in fade-in xl:h-[calc(100vh-12.5rem)]">
                <div
                    className={clsx(
                        'grid h-full min-w-0 xl:gap-0',
                        sidebarOpen ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : 'xl:grid-cols-[minmax(0,1fr)]',
                    )}
                >
                    <div className="flex min-w-0 h-full min-h-0 flex-col border-b border-[var(--border)] xl:border-b-0 xl:border-r bg-[var(--surface)]">
                        <CardOrTable
                            preferCards={preferCards}
                            maxWidth={CARD_LAYOUT_WIDTH}
                            className="h-full min-h-0"
                            cards={() => (
                                <>
                                    {isMobileLayout && (
                                        <section className="border-b border-[var(--border)] bg-[var(--surface)]">
                                            <div className="flex h-[39px] items-center px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-heading)] bg-[var(--surface-hover)] border-b border-[var(--border)]">
                                                Schema-wide
                                            </div>
                                            {renderPropertyRowsGrid(schemaWideRows, 'mobile-schema')}
                                        </section>
                                    )}
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
                                            const expanded = !!expandedCardProperties[name];
                                            const mobileRows = buildPropertyRows(name, pVal, 'mobile', {
                                                includeName: false,
                                                includeDescription: false,
                                                includePatternRow: false,
                                            });
                                            return (
                                                <DataCard
                                                    key={name}
                                                    onClick={() => setSelectedPropertyName(name)}
                                                    className={clsx(
                                                        'rounded-xl',
                                                        selectedPropertyName === name &&
                                                            'ring-1 ring-[var(--primary)]/25 border-[var(--primary)]/30 shadow-[0_0_0_1px_rgba(79,70,229,0.12)]',
                                                    )}
                                                    title={
                                                        <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                                                            {cells.name}
                                                        </span>
                                                    }
                                                    facts={[
                                                        {label: 'Type', value: cells.type},
                                                        {label: 'Details', value: cells.description, wide: true},
                                                    ]}
                                                    footer={
                                                        <div className="space-y-2">
                                                            {expanded && (
                                                                <>
                                                                    {mobileRows.length > 0 &&
                                                                        renderPropertyRowsGrid(
                                                                            mobileRows,
                                                                            `mobile-card:${name}`,
                                                                            '92px',
                                                                        )}
                                                                    <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={event => {
                                                                                event.stopPropagation();
                                                                                setDetailsModalName(name);
                                                                            }}
                                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] transition-all select-none w-fit shrink-0 cursor-pointer"
                                                                        >
                                                                            <i className="ph ph-eye text-[9px]" />
                                                                            More / Example
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={event => {
                                                                                event.stopPropagation();
                                                                                setSerializerPropertyName(name);
                                                                            }}
                                                                            className={CHROME_BUTTON_CLASS}
                                                                        >
                                                                            <i className="ph ph-arrows-split text-[11px]"></i>
                                                                            <span>Playground</span>
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            )}
                                                            <div className="flex justify-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={event => {
                                                                        event.stopPropagation();
                                                                        setExpandedCardProperties(current => ({
                                                                            ...current,
                                                                            [name]: !current[name],
                                                                        }));
                                                                    }}
                                                                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-[10px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                                                                >
                                                                    <i
                                                                        className={`ph ${expanded ? 'ph-caret-up' : 'ph-caret-down'} text-[10px]`}
                                                                    />
                                                                    <span>Property Info</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            table={() => (
                                <div className="h-full min-h-0 overflow-auto scrollbar-thin">
                                    <table className="w-full text-left border-collapse text-xs min-w-[860px]">
                                        <thead>
                                            <tr className={'whitespace-nowrap'}>
                                                <th className={STICKY_HEADER_CLASS}>
                                                    <div className="flex h-full items-center">Field Target</div>
                                                </th>
                                                <th className={STICKY_HEADER_CLASS}>
                                                    <div className="flex h-full items-center">Type/Structure</div>
                                                </th>
                                                <th className={STICKY_HEADER_CLASS}>
                                                    <div className="flex h-full items-center">Consumer Notes</div>
                                                </th>
                                                <th className={STICKY_HEADER_CLASS} style={{width: '100%'}}>
                                                    <div className="flex h-full w-full items-center justify-between gap-2">
                                                        <span>Description</span>
                                                        {!sidebarOpen && !isMobileLayout && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSidebarCollapsed(false)}
                                                                className="inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:bg-[var(--background)] cursor-pointer"
                                                                aria-label="Expand sidebar"
                                                            >
                                                                <i className="ph ph-caret-left text-[12px]" />
                                                            </button>
                                                        )}
                                                    </div>
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
                                                        <td className="px-3 py-2.5 min-w-[260px]">{cells.type}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap align-top">
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

                    {sidebarOpen && (
                        <aside
                            className="min-w-0 h-full min-h-0 bg-[var(--surface)] xl:sticky xl:top-0"
                            style={{boxShadow: '0 10px 24px -20px rgba(15, 23, 42, 0.28)'}}
                        >
                            <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
                                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                                    <section>
                                        <div
                                            className={`${STICKY_HEADER_CLASS} flex items-center justify-between gap-2`}
                                        >
                                            <h5 className={GRID_TITLE_CLASS}>Schema-wide</h5>
                                            {!isMobileLayout && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSidebarCollapsed(true)}
                                                    className="inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:bg-[var(--background)] cursor-pointer"
                                                    aria-label="Collapse sidebar"
                                                >
                                                    <i className="ph ph-caret-right text-[12px]" />
                                                </button>
                                            )}
                                        </div>
                                        {renderPropertyRowsGrid(schemaWideRows, 'schema')}
                                    </section>
                                    <section>
                                        <div
                                            className={`${STICKY_HEADER_CLASS} flex items-center border-t border-[var(--border)]`}
                                        >
                                            <h5 className={GRID_TITLE_CLASS}>Selected Property</h5>
                                        </div>
                                        {renderPropertyRowsGrid(selectedRows, 'selected')}
                                    </section>
                                </div>
                                {selectedPropertyName && selectedEffectiveProperty && (
                                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--background)] px-3 py-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setDetailsModalName(selectedPropertyName)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] transition-all select-none w-fit shrink-0 cursor-pointer"
                                        >
                                            <i className="ph ph-eye text-[9px]" />
                                            More / Example
                                        </button>
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
                    )}
                </div>
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
                                            className="inline-flex items-center gap-1 px-4 py-1.5 border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)] font-semibold text-xs rounded-lg cursor-pointer transition-colors select-none hover:bg-[var(--primary)]/15"
                                        >
                                            <i className="ph ph-eye text-[9px]" />
                                            More / Example
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
