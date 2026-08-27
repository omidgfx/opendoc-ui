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
import {COMBINATOR_META, expandAllOfBranches} from '../../utils/schema/combinators';
import ModalPortal from '../common/ModalPortal';
import {useModalTransition} from '../../hooks/useModalTransition';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import CodeViewer from '../common/CodeViewer';
import SerializerPlaygroundModal from '../modals/SerializerPlaygroundModal';
import CustomDropdown from '../common/CustomDropdown';
import {
    applySchemaBranchSelections,
    readSchemaAllOfFocus,
    readSchemaBranchSelections,
    SCHEMA_BRANCH_SELECTION_EVENT,
    writeSchemaAllOfFocus,
    writeSchemaBranchSelection,
} from '../../utils/schema/branchSelections';
import {collectSchemaBranchChoices} from '../../utils/schema/branchChoices';
import {getMockSnippetWithMarkers} from '../../utils/runner/mockGenerator';
import {mockMarkersToLineMarkers} from '../../utils/lineMarkers';
import {inlineMenusForCode} from './inlineMenus';
import {dimmedLinesForObjectCode} from '../../utils/schema/exampleEncodings';
import {propertyNamesOfSchema} from '../../utils/schema/branchSelections';
import SchemaOneOfMenuButton from './SchemaOneOfMenuButton';

interface SchemaPropertiesTableProps {
    properties: {
        [name: string]: any;
    };
    schema: any;
    resolveReference: (item: any) => any;
    getRefName: (refStr: string) => string;
    onPushSchema: (schemaName: string) => void;
    onViewExample?: (name: string, schema: any) => void;
    onTestPattern: (pattern: string) => void;
    useModal?: boolean;
    inspectName?: string | null;
    selectionScopeKey?: string;
    showSchemaWide?: boolean;
}

const KNOWN_SCHEMA_KEYS = new Set([
    'type',
    'format',
    'description',
    'title',
    'default',
    'example',
    'examples',
    'enum',
    'const',
    'pattern',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'items',
    'prefixItems',
    'minItems',
    'maxItems',
    'uniqueItems',
    'contains',
    'minContains',
    'maxContains',
    'unevaluatedItems',
    'properties',
    'required',
    'additionalProperties',
    'unevaluatedProperties',
    'minProperties',
    'maxProperties',
    'patternProperties',
    'propertyNames',
    'dependentRequired',
    'dependentSchemas',
    'oneOf',
    'anyOf',
    'allOf',
    'not',
    'discriminator',
    'if',
    'then',
    'else',
    'readOnly',
    'writeOnly',
    'deprecated',
    'contentEncoding',
    'contentMediaType',
    'contentSchema',
    'xml',
    'externalDocs',
    '$ref',
    '$schema',
    '$id',
    '$anchor',
    '$comment',
    '$defs',
    'definitions',
]);

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
    onTestPattern,
    useModal = false,
    inspectName = null,
    selectionScopeKey,
    showSchemaWide = false,
}: SchemaPropertiesTableProps) {
    const {preferences} = usePreferences();
    const bp = useBreakpoint();
    const isMobileLayout = bp === 'mobile';
    const cardLayout = preferences.narrowTableLayout === 'cards';
    const preferCards = isMobileLayout || (!useModal && cardLayout);
    const [detailsModalName, setDetailsModalName] = useState<string | null>(null);
    const [serializerPropertyName, setSerializerPropertyName] = useState<string | null>(null);
    const [copiedPropertyName, setCopiedPropertyName] = useState(false);
    const [copiedPattern, setCopiedPattern] = useState(false);
    const [modalExampleTab, setModalExampleTab] = useState<'generated' | 'spec'>('generated');
    const [modalSpecExampleKey, setModalSpecExampleKey] = useState('');
    const detailsTransition = useModalTransition(!!detailsModalName, () => {
        setDetailsModalName(null);
        setModalExampleTab('generated');
        setModalSpecExampleKey('');
    });
    useModalShortcuts({isOpen: !!detailsModalName, onClose: detailsTransition.requestClose});

    const getSchemaName = (): string | null => {
        if (schema?.$ref) return getRefName(schema.$ref);
        if (schema?.title) return schema.title;
        return null;
    };
    const schemaName = getSchemaName();
    const selectionKey = selectionScopeKey || inspectName || schemaName || 'schema';
    const [branchSelections, setBranchSelections] = useState(() => readSchemaBranchSelections(selectionKey));
    const [allOfFocus, setAllOfFocus] = useState(() => readSchemaAllOfFocus(selectionKey));
    const [selectionRevision, setSelectionRevision] = useState(0);

    useEffect(() => {
        setBranchSelections(readSchemaBranchSelections(selectionKey));
        setAllOfFocus(readSchemaAllOfFocus(selectionKey));
    }, [selectionKey]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{key?: string}>).detail;
            if (detail?.key !== selectionKey) return;
            setBranchSelections(readSchemaBranchSelections(selectionKey));
            setAllOfFocus(readSchemaAllOfFocus(selectionKey));
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

    const updateAllOfFocus = (path: string, index: number | null) => {
        const next = writeSchemaAllOfFocus(selectionKey, path, index);
        setAllOfFocus(next);
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

    const renderSchemaLink = (targetSchemaName: string, withIcon = true) => (
        <button
            type="button"
            onClick={() => onPushSchema(targetSchemaName)}
            className="inline-flex items-center gap-1 text-left font-semibold text-[var(--primary)] hover:underline cursor-pointer"
        >
            {withIcon && <i className="ph ph-diamonds-four text-[10px]"></i>}
            <span className="break-all">{targetSchemaName}</span>
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
        const hint = kind === 'allOf' ? 'focus' : kind === 'oneOf' ? 'pick one' : '';
        return (
            <div
                className="inline-flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wider"
                style={{color: meta.color}}
            >
                <i className={`${meta.icon} text-[11px]`} />
                {title} ({count})
                {hint ? <span className="font-semibold normal-case tracking-normal opacity-70">· {hint}</span> : null}:
            </div>
        );
    };

    const renderCombinatorOptions = (
        name: string,
        kind: 'oneOf' | 'anyOf' | 'allOf',
        branches: any[],
        controlScope: 'table' | 'details' | 'mobile' = 'table',
    ): React.ReactNode => {
        if (!Array.isArray(branches) || branches.length === 0) return null;
        const selectedOneOf =
            kind === 'oneOf' ? Math.max(0, Math.min(branches.length - 1, branchSelections[name] ?? 0)) : 0;
        const focusAllOf = kind === 'allOf' ? allOfFocus[name] : undefined;
        const combinedActive = kind === 'allOf' && (focusAllOf === null || focusAllOf === undefined);
        return (
            <div className="flex flex-col gap-1.5">
                {combinatorTitle(kind, branches.length)}
                <div className="flex flex-col gap-1.5">
                    {kind === 'allOf' && (
                        <button
                            type="button"
                            onClick={() => updateAllOfFocus(name, null)}
                            className={clsx(
                                'flex items-start gap-2 text-left text-[10px] leading-relaxed cursor-pointer rounded-md px-0.5 py-0.5 transition-colors',
                                combinedActive
                                    ? 'text-[var(--primary)]'
                                    : 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                            )}
                        >
                            <span className="relative mt-[1px] flex h-[14px] w-[14px] shrink-0 items-center justify-center leading-none">
                                <i
                                    className={clsx(
                                        combinedActive
                                            ? 'ph-fill ph-radio-button text-[14px] text-[var(--primary)]'
                                            : 'ph ph-circle text-[14px] text-[var(--text-muted)]',
                                    )}
                                />
                            </span>
                            <span className="min-w-0 break-words font-semibold">Combined</span>
                        </button>
                    )}
                    {branches.map((sub: any, index: number) => {
                        const label = schemaVariantLabel(sub, resolveReference, getRefName, index);
                        const active =
                            kind === 'oneOf'
                                ? selectedOneOf === index
                                : kind === 'allOf'
                                  ? focusAllOf === index
                                  : false;
                        const refName = sub?.$ref ? getRefName(sub.$ref) : '';
                        const interactive = kind === 'oneOf' || kind === 'allOf';
                        return (
                            <label
                                key={`${name}:${kind}:${index}:${controlScope}`}
                                className={clsx(
                                    'flex items-start gap-2 text-[10px] leading-relaxed text-[var(--text)]',
                                    interactive && 'cursor-pointer',
                                    active && 'text-[var(--primary)]',
                                )}
                            >
                                {kind === 'oneOf' ? (
                                    <span className="relative mt-[1px] flex h-[14px] w-[14px] shrink-0 items-center justify-center leading-none">
                                        <input
                                            type="radio"
                                            name={`oneof-${selectionKey}-${controlScope}-${name}`}
                                            checked={active}
                                            onChange={() => updateBranchSelection(name, index)}
                                            className="absolute inset-0 m-0 cursor-pointer opacity-0"
                                        />
                                        <i
                                            className={clsx(
                                                active
                                                    ? 'ph-fill ph-radio-button text-[14px] text-[var(--primary)]'
                                                    : 'ph ph-circle text-[14px] text-[var(--text-muted)]',
                                            )}
                                        />
                                    </span>
                                ) : kind === 'allOf' ? (
                                    <span className="relative mt-[1px] flex h-[14px] w-[14px] shrink-0 items-center justify-center leading-none">
                                        <input
                                            type="radio"
                                            name={`allof-${selectionKey}-${controlScope}-${name}`}
                                            checked={active}
                                            onChange={() => updateAllOfFocus(name, index)}
                                            className="absolute inset-0 m-0 cursor-pointer opacity-0"
                                        />
                                        <i
                                            className={clsx(
                                                active
                                                    ? 'ph-fill ph-radio-button text-[14px] text-[var(--primary)]'
                                                    : 'ph ph-circle text-[14px] text-[var(--text-muted)]',
                                            )}
                                        />
                                    </span>
                                ) : (
                                    <span className="mt-[4px] size-1.5 rounded-full bg-[var(--border)] shrink-0" />
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
        controlScope: 'table' | 'details' | 'mobile' = 'table',
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
        if (Array.isArray(resolved?.allOf) && resolved.allOf.length > 0) {
            const allOfParts = expandAllOfBranches(resolved, resolveReference);
            const parts = allOfParts.length > 0 ? allOfParts : resolved.allOf;
            rows.push(
                <div key={`${name}:allOf`} className="flex flex-col gap-1.5">
                    {renderCombinatorOptions(name, 'allOf', parts, controlScope)}
                </div>,
            );
        }
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

    const schemaWideRows = useMemo(() => {
        const rows: Array<{label: string; value: React.ReactNode}> = [];
        if ((effectiveSchema as any)?.title || inspectName || schemaName)
            rows.push({
                label: 'Name',
                value: inspectName || schemaName || (effectiveSchema as any)?.title || 'Schema',
            });
        rows.push({label: 'Type', value: displayType(effectiveSchema)});
        if (Array.isArray((effectiveSchema as any)?.required) && (effectiveSchema as any).required.length > 0)
            rows.push({label: 'Required', value: (effectiveSchema as any).required.join(', ')});
        if ((effectiveSchema as any)?.minProperties !== undefined)
            rows.push({label: 'Min props', value: String((effectiveSchema as any).minProperties)});
        if ((effectiveSchema as any)?.maxProperties !== undefined)
            rows.push({label: 'Max props', value: String((effectiveSchema as any).maxProperties)});
        if (Object.keys((effectiveSchema as any)?.patternProperties || {}).length > 0)
            rows.push({
                label: 'Pattern props',
                value: `${Object.keys((effectiveSchema as any).patternProperties).length} patterns`,
            });
        if ((effectiveSchema as any)?.additionalProperties !== undefined)
            rows.push({
                label: 'Addl. props',
                value:
                    typeof (effectiveSchema as any).additionalProperties === 'boolean'
                        ? String((effectiveSchema as any).additionalProperties)
                        : typeSummary((effectiveSchema as any).additionalProperties),
            });
        if ((effectiveSchema as any)?.unevaluatedProperties !== undefined)
            rows.push({
                label: 'Unevaluated',
                value:
                    typeof (effectiveSchema as any).unevaluatedProperties === 'boolean'
                        ? String((effectiveSchema as any).unevaluatedProperties)
                        : typeSummary((effectiveSchema as any).unevaluatedProperties),
            });
        if (Array.isArray((effectiveSchema as any)?.allOf) && (effectiveSchema as any).allOf.length > 0)
            rows.push({label: 'allOf', value: `${(effectiveSchema as any).allOf.length}`});
        if (Array.isArray((effectiveSchema as any)?.anyOf) && (effectiveSchema as any).anyOf.length > 0)
            rows.push({label: 'anyOf', value: `${(effectiveSchema as any).anyOf.length}`});
        if (Array.isArray((effectiveSchema as any)?.oneOf) && (effectiveSchema as any).oneOf.length > 0)
            rows.push({label: 'oneOf', value: `${(effectiveSchema as any).oneOf.length}`});
        if ((effectiveSchema as any)?.discriminator?.propertyName)
            rows.push({label: 'Discriminator', value: (effectiveSchema as any).discriminator.propertyName});
        return rows;
    }, [effectiveSchema, inspectName, schemaName]);

    if (Object.keys(effectiveProperties).length === 0 && patternEntries.length === 0 && !notSchema && !hasSchemaNotes) {
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
                <div className="flex items-start gap-1">
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

    const buildFieldSpecificationsRows = (
        propertyName: string,
        propertySchema: any,
    ): Array<{label: string; value: React.ReactNode}> => {
        if (!propertyName || !propertySchema) return [];
        const facts = propertyFacts(propertyName, propertySchema);
        const statePills = renderStatePills(facts);
        const structureNode = renderStructureDetails(propertyName, propertySchema, 'details');
        const rows: Array<{label: string; value: React.ReactNode}> = [];

        rows.push({
            label: 'Name',
            value: (
                <div className="flex min-w-0 items-center gap-1.5">
                    <ScrollableRow className="flex-1 font-mono select-all text-[10px] text-[var(--text-heading)] font-bold">
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

        if (facts.resolved?.default !== undefined)
            rows.push({
                label: 'Default',
                value: <code className="mono select-all">{JSON.stringify(facts.resolved.default)}</code>,
            });

        if (facts.resolved?.example !== undefined)
            rows.push({
                label: 'Example',
                value: <code className="mono select-all">{formatExampleText(facts.resolved.example)}</code>,
            });

        if (facts.referenceNames.length > 0)
            rows.push({label: 'Reference', value: renderReferenceList(facts.referenceNames)});

        if (structureNode) rows.push({label: 'Structure', value: structureNode});

        if (statePills.length > 0)
            rows.push({label: 'Flags', value: <div className="flex flex-wrap gap-1">{statePills}</div>});

        if (facts.resolved?.additionalProperties !== undefined)
            rows.push({
                label: 'Addl. props',
                value:
                    typeof facts.resolved.additionalProperties === 'boolean'
                        ? String(facts.resolved.additionalProperties)
                        : typeSummary(facts.resolved.additionalProperties),
            });

        if (facts.resolved?.unevaluatedProperties !== undefined)
            rows.push({
                label: 'Unevaluated',
                value:
                    typeof facts.resolved.unevaluatedProperties === 'boolean'
                        ? String(facts.resolved.unevaluatedProperties)
                        : typeSummary(facts.resolved.unevaluatedProperties),
            });

        if (facts.resolved?.propertyNames?.pattern)
            rows.push({
                label: 'Property names',
                value: <code className="mono select-all">{facts.resolved.propertyNames.pattern}</code>,
            });

        if (Object.keys(facts.resolved?.patternProperties || {}).length > 0)
            rows.push({
                label: 'Pattern props',
                value: `${Object.keys(facts.resolved.patternProperties).length} patterns`,
            });

        if (Array.isArray(facts.resolved?.prefixItems) && facts.resolved.prefixItems.length > 0)
            rows.push({label: 'prefixItems', value: `${facts.resolved.prefixItems.length} slots`});

        if (facts.resolved?.contains) rows.push({label: 'contains', value: typeSummary(facts.resolved.contains)});

        if (facts.resolved?.unevaluatedItems !== undefined)
            rows.push({
                label: 'unevaluatedItems',
                value:
                    typeof facts.resolved.unevaluatedItems === 'boolean'
                        ? String(facts.resolved.unevaluatedItems)
                        : typeSummary(facts.resolved.unevaluatedItems),
            });

        if (facts.resolved?.discriminator?.propertyName)
            rows.push({label: 'Discriminator', value: facts.resolved.discriminator.propertyName});

        if (facts.resolved?.not)
            rows.push({label: 'Not', value: `Must not match ${describeNotConstraint(facts.resolved.not)}`});

        if (facts.resolved?.if || facts.resolved?.then || facts.resolved?.else)
            rows.push({label: 'if/then/else', value: 'present'});

        if (facts.resolved?.dependentRequired) rows.push({label: 'dependentRequired', value: 'present'});

        if (facts.resolved?.dependentSchemas) rows.push({label: 'dependentSchemas', value: 'present'});

        if (facts.contentEncoding) rows.push({label: 'Encoding', value: facts.contentEncoding});
        if (facts.contentMediaType) rows.push({label: 'Media', value: facts.contentMediaType});
        if (facts.resolved?.contentSchema)
            rows.push({label: 'contentSchema', value: typeSummary(facts.resolved.contentSchema)});
        if (facts.resolved?.xml) rows.push({label: 'XML', value: 'configured'});
        if (propertySchema?.$ref)
            rows.push({label: '$ref', value: <code className="mono select-all">{propertySchema.$ref}</code>});
        if (facts.resolved?.externalDocs?.url)
            rows.push({
                label: 'externalDocs',
                value: (
                    <a
                        href={facts.resolved.externalDocs.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--primary)] hover:underline"
                    >
                        {facts.resolved.externalDocs.description || facts.resolved.externalDocs.url}
                    </a>
                ),
            });

        // Unknown / extra properties placed into field specifications (Point 5)
        if (facts.resolved && typeof facts.resolved === 'object') {
            for (const [key, val] of Object.entries(facts.resolved)) {
                if (!KNOWN_SCHEMA_KEYS.has(key)) {
                    rows.push({
                        label: key,
                        value:
                            typeof val === 'object' && val !== null ? (
                                <code className="mono select-all text-[10px]">{JSON.stringify(val)}</code>
                            ) : (
                                String(val)
                            ),
                    });
                }
            }
        }

        return rows;
    };

    const buildValidationRows = (
        propertyName: string,
        propertySchema: any,
    ): Array<{label: string; value: React.ReactNode}> => {
        if (!propertyName || !propertySchema) return [];
        const facts = propertyFacts(propertyName, propertySchema);
        const rows: Array<{label: string; value: React.ReactNode}> = [];

        if (facts.pattern) {
            rows.push({
                label: 'Pattern',
                value: (
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="mono select-all break-all text-[10px]">{facts.pattern}</code>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(facts.pattern!);
                                    setCopiedPattern(true);
                                    setTimeout(() => setCopiedPattern(false), 1500);
                                }}
                                className="inline-flex size-5 shrink-0 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--primary)] cursor-pointer"
                                aria-label="Copy pattern"
                            >
                                <i className={`ph ${copiedPattern ? 'ph-check' : 'ph-copy'} text-[11px]`}></i>
                            </button>
                            <button
                                type="button"
                                onClick={() => onTestPattern(facts.pattern!)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-[var(--method-put)]/25 bg-[var(--method-put)]/10 text-[var(--text)] hover:bg-[var(--method-put)]/20 cursor-pointer transition-colors"
                            >
                                <i className="ph ph-dna text-[10px] text-[var(--method-put)]" />
                                <span>Test</span>
                            </button>
                        </div>
                    </div>
                ),
            });
        }

        rows.push({
            label: 'Serializer',
            value: (
                <button
                    type="button"
                    onClick={() => setSerializerPropertyName(propertyName)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--background)] cursor-pointer transition-colors"
                >
                    <i className="ph ph-arrows-split text-[11px]" />
                    <span>Open Playground</span>
                </button>
            ),
        });

        if (Array.isArray(facts.resolved?.enum) && facts.resolved.enum.length > 0)
            rows.push({label: 'Enum', value: facts.resolved.enum.map((v: any) => JSON.stringify(v)).join(', ')});

        if (facts.resolved?.const !== undefined)
            rows.push({
                label: 'Const',
                value: <code className="mono select-all">{JSON.stringify(facts.resolved.const)}</code>,
            });

        if (facts.resolved?.minLength !== undefined)
            rows.push({label: 'minLength', value: String(facts.resolved.minLength)});

        if (facts.resolved?.maxLength !== undefined)
            rows.push({label: 'maxLength', value: String(facts.resolved.maxLength)});

        if (facts.resolved?.minimum !== undefined) rows.push({label: 'minimum', value: String(facts.resolved.minimum)});

        if (facts.resolved?.maximum !== undefined) rows.push({label: 'maximum', value: String(facts.resolved.maximum)});

        if (facts.resolved?.exclusiveMinimum !== undefined)
            rows.push({label: 'exclusiveMinimum', value: String(facts.resolved.exclusiveMinimum)});

        if (facts.resolved?.exclusiveMaximum !== undefined)
            rows.push({label: 'exclusiveMaximum', value: String(facts.resolved.exclusiveMaximum)});

        if (facts.resolved?.multipleOf !== undefined)
            rows.push({label: 'multipleOf', value: String(facts.resolved.multipleOf)});

        if (facts.resolved?.minItems !== undefined)
            rows.push({label: 'minItems', value: String(facts.resolved.minItems)});

        if (facts.resolved?.maxItems !== undefined)
            rows.push({label: 'maxItems', value: String(facts.resolved.maxItems)});

        if (facts.resolved?.uniqueItems === true) rows.push({label: 'uniqueItems', value: 'true'});

        if (facts.resolved?.minContains !== undefined)
            rows.push({label: 'minContains', value: String(facts.resolved.minContains)});

        if (facts.resolved?.maxContains !== undefined)
            rows.push({label: 'maxContains', value: String(facts.resolved.maxContains)});

        if (facts.resolved?.minProperties !== undefined)
            rows.push({label: 'minProperties', value: String(facts.resolved.minProperties)});

        if (facts.resolved?.maxProperties !== undefined)
            rows.push({label: 'maxProperties', value: String(facts.resolved.maxProperties)});

        return rows;
    };

    const renderPropertyRowsGrid = (
        rows: Array<{label: string; value: React.ReactNode}>,
        prefix: string,
        labelColumn = '120px',
    ) => (
        <div className="flex flex-col flex-1 divide-y divide-[var(--border)]">
            {rows.map((row, idx) => (
                <div
                    key={`${prefix}:${row.label}`}
                    className={clsx(
                        'grid gap-2 px-3 py-1.5 items-start text-[10px] transition-colors',
                        idx % 2 === 1 ? 'bg-[var(--background)]' : 'bg-[var(--surface)]',
                    )}
                    style={{gridTemplateColumns: `${labelColumn} minmax(0,1fr)`}}
                >
                    <div className="font-semibold text-[var(--text-muted)] shrink-0">{row.label}</div>
                    <div className={clsx(GRID_TEXT_CLASS, 'min-w-0 break-words')}>{row.value}</div>
                </div>
            ))}
        </div>
    );

    const activeRawProperty = detailsModalName
        ? sourceProperties[detailsModalName] || effectiveProperties[detailsModalName]
        : null;
    const activeDetailsProperty = detailsModalName
        ? effectiveProperties[detailsModalName] || sourceProperties[detailsModalName]
        : null;
    const activePropertyDescription = activeRawProperty
        ? (resolveReference(activeRawProperty) || activeRawProperty)?.description
        : null;
    const activeSpecRows =
        detailsModalName && activeRawProperty ? buildFieldSpecificationsRows(detailsModalName, activeRawProperty) : [];
    const activeValidationRows =
        detailsModalName && activeRawProperty ? buildValidationRows(detailsModalName, activeRawProperty) : [];
    const activeBranchChoices = useMemo(() => {
        // Collect under the property's real path so selections share the same
        // key space as the parent table / code viewer (`payment`, not ``).
        if (!detailsModalName || !activeRawProperty) return [];
        return collectSchemaBranchChoices(
            {type: 'object', properties: {[detailsModalName]: activeRawProperty}},
            resolveReference,
            getRefName,
        );
    }, [detailsModalName, activeRawProperty, resolveReference, getRefName, selectionRevision]);
    const activeMockExample = useMemo(() => {
        if (!detailsModalName || !activeDetailsProperty) return null;
        return getMockSnippetWithMarkers(activeDetailsProperty, null);
    }, [detailsModalName, activeDetailsProperty, selectionRevision]);

    const propertySpecExamples = useMemo(() => {
        if (!activeRawProperty) return [];
        const resolved = resolveReference(activeRawProperty) || activeRawProperty;
        if (resolved?.examples && typeof resolved.examples === 'object') {
            if (Array.isArray(resolved.examples)) {
                return resolved.examples.map((item: any, idx: number) => ({
                    key: `example-${idx}`,
                    label: `Example ${idx + 1}`,
                    value: typeof item === 'object' && item !== null && 'value' in item ? item.value : item,
                }));
            }
            return Object.entries(resolved.examples).map(([key, entry]: [string, any]) => ({
                key,
                label: entry?.summary || key,
                value: typeof entry === 'object' && entry !== null && 'value' in entry ? entry.value : entry,
            }));
        }
        if (resolved?.example !== undefined) {
            return [{key: 'example', label: 'Example', value: resolved.example}];
        }
        return [];
    }, [activeRawProperty, resolveReference]);

    const activePropertySpecExample =
        propertySpecExamples.find(ex => ex.key === (modalSpecExampleKey || propertySpecExamples[0]?.key)) ||
        propertySpecExamples[0];

    const inlineMockMenus = useMemo(() => {
        if (!activeMockExample) return {code: '', menus: []};
        return inlineMenusForCode(activeMockExample.code, selectionKey, activeBranchChoices);
    }, [activeMockExample, selectionKey, activeBranchChoices]);

    const detailDimmedLines = useMemo(() => {
        if (!detailsModalName || !activeRawProperty) return [] as number[];
        const focus = allOfFocus[detailsModalName];
        if (focus === null || focus === undefined) return [];
        const resolved = resolveReference(activeRawProperty) || activeRawProperty;
        if (!Array.isArray(resolved?.allOf)) return [];
        const parts = expandAllOfBranches(resolved, resolveReference);
        const list = parts.length > 0 ? parts : resolved.allOf;
        if (!list[focus]) return [];
        const active = propertyNamesOfSchema(list[focus], resolveReference);
        if (!activeMockExample) return [];
        return dimmedLinesForObjectCode(activeMockExample.code, active);
    }, [detailsModalName, activeRawProperty, allOfFocus, activeMockExample, resolveReference]);

    return (
        <>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-in fade-in max-h-[calc(100vh-12.5rem)] flex flex-col">
                {showSchemaWide && schemaWideRows.length > 0 && (
                    <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 shrink-0">
                        <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mr-1">
                                Schema:
                            </span>
                            {schemaWideRows.map(row => (
                                <div
                                    key={row.label}
                                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px]"
                                >
                                    <span className="font-semibold text-[var(--text-muted)]">{row.label}:</span>
                                    <span className="text-[var(--text)] font-medium">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex min-w-0 max-h-full min-h-0 flex-col bg-[var(--surface)] flex-1">
                    <CardOrTable
                        preferCards={preferCards}
                        maxWidth={CARD_LAYOUT_WIDTH}
                        className="h-full min-h-0"
                        cards={() => (
                            <div className="space-y-2 p-2">
                                {propertyEntries.map(([name, pVal]) => {
                                    const cells = propertyCells(name, pVal);
                                    return (
                                        <div key={name} data-field-name={name}>
                                            <DataCard
                                                className="rounded-xl"
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
                                                    <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDetailsModalName(name)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] transition-all select-none w-fit shrink-0 cursor-pointer"
                                                        >
                                                            <i className="ph ph-eye text-[9px]" />
                                                            More / Example
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSerializerPropertyName(name)}
                                                            className="sm:px-2 px-1.5 py-1 rounded-md text-[10px] font-sans flex items-center gap-1 transition-all border hover:bg-[var(--background)] bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] cursor-pointer"
                                                        >
                                                            <i className="ph ph-arrows-split text-[11px]"></i>
                                                            <span>Playground</span>
                                                        </button>
                                                    </div>
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        table={() => (
                            <div className="max-h-[calc(100vh-14rem)] overflow-auto scrollbar-thin">
                                <table className="w-full min-w-[980px] text-left border-collapse text-xs">
                                    <colgroup>
                                        <col style={{width: '220px'}} />
                                        <col style={{width: '360px'}} />
                                        <col style={{width: '156px'}} />
                                        <col />
                                    </colgroup>
                                    <thead>
                                        <tr className="whitespace-nowrap">
                                            <th className={STICKY_HEADER_CLASS}>
                                                <div className="flex h-full items-center">Field Target</div>
                                            </th>
                                            <th className={STICKY_HEADER_CLASS}>
                                                <div className="flex h-full items-center">Type/Structure</div>
                                            </th>
                                            <th className={STICKY_HEADER_CLASS}>
                                                <div className="flex h-full items-center">Consumer Notes</div>
                                            </th>
                                            <th className={STICKY_HEADER_CLASS}>
                                                <div className="flex h-full w-full items-center justify-between gap-2">
                                                    <span>Description</span>
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
                                                    data-field-name={name}
                                                    className="align-top border-b last:border-b-0 border-b-[var(--border)] transition-colors hover:bg-[var(--text-muted)]/5"
                                                >
                                                    <td className="px-3 py-2.5 font-mono font-bold text-[var(--text-heading)] whitespace-nowrap align-top">
                                                        {cells.name}
                                                    </td>
                                                    <td className="px-3 py-2.5 align-top min-w-0">{cells.type}</td>
                                                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                                        {cells.consumer}
                                                    </td>
                                                    <td className="px-3 py-2.5 leading-relaxed font-sans text-[var(--text)] align-top">
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

            {detailsTransition.shouldRender && detailsModalName && activeDetailsProperty && (
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
                                        Field specifications, validation constraints, and simulated example.
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
                                {activePropertyDescription && (
                                    <div className="rounded-lg border border-[var(--primary)]/15 bg-[var(--primary)]/5 p-3 text-xs leading-relaxed text-[var(--text)]">
                                        <div className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--primary)] mb-1">
                                            Description:
                                        </div>
                                        <div className="markdown-body">
                                            <Markdown text={activePropertyDescription} />
                                        </div>
                                    </div>
                                )}

                                <div className="grid gap-3 md:grid-cols-2 items-stretch">
                                    <section className="flex flex-col h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                                        <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-hover)] shrink-0">
                                            <h4 className={GRID_TITLE_CLASS}>Field Specifications</h4>
                                        </div>
                                        {renderPropertyRowsGrid(activeSpecRows, 'spec')}
                                    </section>

                                    <section className="flex flex-col h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                                        <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-hover)] shrink-0">
                                            <h4 className={GRID_TITLE_CLASS}>Validation</h4>
                                        </div>
                                        {renderPropertyRowsGrid(activeValidationRows, 'validation')}
                                    </section>
                                </div>

                                <section className="rounded-lg border border-[var(--border)] bg-[var(--background)] overflow-hidden">
                                    <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex p-0.5 rounded-lg border w-fit border-[var(--border)] bg-[var(--background)] items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setModalExampleTab('generated')}
                                                aria-pressed={modalExampleTab === 'generated'}
                                                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                                    modalExampleTab === 'generated'
                                                        ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold'
                                                        : 'hover:opacity-80 text-[var(--text-muted)]'
                                                }`}
                                            >
                                                Generated Example
                                            </button>
                                            {propertySpecExamples.length > 0 && (
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setModalExampleTab('spec')}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setModalExampleTab('spec');
                                                        }
                                                    }}
                                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1 ${
                                                        modalExampleTab === 'spec'
                                                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold'
                                                            : 'hover:opacity-80 text-[var(--text-muted)]'
                                                    }`}
                                                >
                                                    <span>Example:</span>
                                                    {propertySpecExamples.length > 1 && modalExampleTab === 'spec' ? (
                                                        <span className="inline-flex min-w-0 items-center gap-1">
                                                            <CustomDropdown
                                                                value={
                                                                    modalSpecExampleKey || propertySpecExamples[0].key
                                                                }
                                                                onChange={setModalSpecExampleKey}
                                                                options={propertySpecExamples.map(example => ({
                                                                    value: example.key,
                                                                    label: example.label,
                                                                }))}
                                                                className="w-auto min-w-0 max-w-[180px]"
                                                                ariaLabel="Property examples"
                                                                plainTrigger
                                                            />
                                                        </span>
                                                    ) : (
                                                        <span>{activePropertySpecExample?.label || 'Example'}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {modalExampleTab === 'generated' && activeBranchChoices.length > 0 && (
                                            <SchemaOneOfMenuButton
                                                selectionKey={selectionKey}
                                                choices={activeBranchChoices}
                                            />
                                        )}
                                    </div>
                                    <div className="p-3">
                                        {modalExampleTab === 'generated' && activeMockExample ? (
                                            <CodeViewer
                                                code={inlineMockMenus.code}
                                                language="json"
                                                maxHeight="340px"
                                                dimmedLines={detailDimmedLines}
                                                lineMarkers={mockMarkersToLineMarkers(activeMockExample.markers, {
                                                    onOpenSchema: schemaName => {
                                                        detailsTransition.requestClose();
                                                        onPushSchema(schemaName);
                                                    },
                                                    onTestPattern,
                                                })}
                                                inlineMenus={inlineMockMenus.menus}
                                            />
                                        ) : (
                                            <CodeViewer
                                                code={
                                                    typeof activePropertySpecExample?.value === 'object'
                                                        ? JSON.stringify(activePropertySpecExample.value, null, 2)
                                                        : String(activePropertySpecExample?.value ?? '')
                                                }
                                                language="json"
                                                maxHeight="340px"
                                            />
                                        )}
                                    </div>
                                </section>
                            </div>
                            <footer className="px-4 sm:px-5 py-3 border-t border-[var(--border)] bg-[var(--background)] shrink-0 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={detailsTransition.requestClose}
                                    className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer transition-colors shadow-sm select-none"
                                >
                                    Close Details
                                </button>
                            </footer>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </>
    );
}
