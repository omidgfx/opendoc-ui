import React, {useEffect, useMemo, useState} from 'react';
import clsx from 'clsx';
import CodeViewer from '../../common/CodeViewer';
import CustomDropdown from '../../common/CustomDropdown';
import ScrollableRow from '../../common/ScrollableRow';
import CombinatorLabel from '../../common/CombinatorLabel';
import Markdown from '../../common/Markdown';
import {Tip} from '../../common/Tooltip';
import SchemaPropertiesTable from '../SchemaPropertiesTable';
import AllOfCompositionNote from '../AllOfCompositionNote';
import {inlineMenusForCode} from '../inlineMenus';
import type {OpenApiSpec} from '../../../types';
import type {CustomDropdownOption} from '../../../types/ui';
import {
    COMBINATOR_META,
    describeAllOfComposition,
    detectSchemaCombinator,
    type CombinatorKind,
} from '../../../utils/schema/combinators';
import {applySchemaBranchSelections, SCHEMA_BRANCH_SELECTION_EVENT} from '../../../utils/schema/branchSelections';
import {collectSchemaOneOfChoices} from '../../../utils/schema/branchChoices';
import {flattenSchemaProperties, schemaVariantLabel} from '../../../utils/schemaProperties';
import {exampleLanguageFor, formatExample} from '../../../utils/endpoint/exampleFormatting';
import {describeRequestBody, type RequestBodyKindInfo} from '../../../utils/endpoint/requestBodyShape';
import {
    EXAMPLE_ENCODINGS,
    defaultExampleEncodingId,
    dimmedLinesForObjectCode,
    exampleEncodingOf,
} from '../../../utils/schema/exampleEncodings';
import {
    extractMockLineMarkers,
    generateValidatedMock,
    prepareMockForAnnotation,
} from '../../../utils/runner/mockGenerator';
import {mockMarkersToLineMarkers} from '../../../utils/lineMarkers';
import {getRefName, resolveReference as resolveOpenApiReference} from '../../../utils/openapi';

export type SchemaViewerTab = 'example' | 'schema' | 'enum' | 'spec-example';

export interface SchemaViewerSpecExample {
    key: string;
    label: string;
    value: unknown;
    /** Media type this example belongs to, when known. */
    mediaType?: string;
    group?: string;
}

export interface SchemaViewerProps {
    spec: OpenApiSpec;
    /** Schema used for the table matrix (before nested oneOf picks). */
    matrixSchema: any;
    /** Schema already narrowed by host-level branch / composition choices. */
    effectiveSchema: any;
    /** Original content schema (for $ref naming / inspect). */
    contentSchema?: any;
    mediaType?: string;
    selectionScopeKey: string;
    activeTab: SchemaViewerTab;
    onTabChange: (tab: SchemaViewerTab) => void;
    /** Durable representation preference (example | schema only). */
    onPersistRepresentation?: (mode: 'example' | 'schema') => void;
    specExamples?: SchemaViewerSpecExample[];
    activeSpecExampleKey?: string;
    onSpecExampleKeyChange?: (key: string) => void;
    /** Top-level choice combinator index (oneOf/anyOf host branch). */
    branchIndex?: number;
    onBranchIndexChange?: (index: number) => void;
    /** anyOf multi-select indices; when omitted the viewer manages its own. */
    anyOfSelectedIndices?: number[];
    onAnyOfSelectedIndicesChange?: (indices: number[]) => void;
    /** allOf focus index for dimming unrelated fields; null = show all. */
    allOfFocusIndex?: number | null;
    onAllOfFocusIndexChange?: (index: number | null) => void;
    inspectName?: string | null;
    onOpenSchema?: (name: string) => void;
    onTestPattern?: (pattern: string) => void;
    /** Host-owned “View Schema” control rendered beside the tab strip. */
    headerActions?: React.ReactNode;
    /** Optional footer under the unified schema pane (e.g. submitted shape). */
    schemaFooter?: React.ReactNode;
    /** Body shape chip next to encoding type. */
    shapeInfo?: RequestBodyKindInfo | null;
    showSchemaWide?: boolean;
    className?: string;
}

const tabButtonClass = (active: boolean) =>
    clsx(
        'px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer',
        active ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80',
    );

const branchChipClass = (active: boolean, muted = false) =>
    clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer select-none',
        active
            ? 'border-[var(--primary)]/40 bg-[var(--primary)]/15 text-[var(--primary)]'
            : muted
              ? 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] opacity-55'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]',
    );

const displayTypeOf = (schema: any, resolveReference: (item: any) => any): string => {
    const resolved = resolveReference(schema) || schema;
    if (!resolved || typeof resolved !== 'object') return 'any';
    if (resolved.$ref) return getRefName(resolved.$ref);
    if (Array.isArray(resolved.type)) return resolved.type.join(' | ');
    if (resolved.type) return resolved.format ? `${resolved.type} (${resolved.format})` : String(resolved.type);
    if (resolved.oneOf) return 'oneOf';
    if (resolved.anyOf) return 'anyOf';
    if (resolved.allOf) return 'allOf';
    if (resolved.properties || resolved.additionalProperties) return 'object';
    if (resolved.items) return 'array';
    return 'any';
};

const propertyNamesOf = (schema: any, resolveReference: (item: any) => any): string[] => {
    const flat = flattenSchemaProperties(schema, resolveReference);
    return Object.keys(flat)
        .map(path => path.split('.')[0])
        .filter(Boolean);
};

const unique = (items: string[]) => Array.from(new Set(items));

/** Safe label for a combinator branch, including pure-null / boolean schemas. */
const branchLabelOf = (branch: any, resolveReference: (item: any) => any, index: number): string => {
    if (branch === null || branch === undefined) return 'null';
    if (branch === true) return 'any';
    if (branch === false) return 'never';
    if (typeof branch !== 'object') return String(branch);
    try {
        const label = schemaVariantLabel(branch, resolveReference, getRefName, index);
        if (label && label !== `Variant ${index + 1}`) return label;
        const resolved = resolveReference(branch) || branch;
        if (
            resolved?.type === 'null' ||
            (Array.isArray(resolved?.type) && resolved.type.every((t: string) => t === 'null'))
        )
            return 'null';
        if (resolved?.const === null) return 'null';
        return label || `Option ${index + 1}`;
    } catch {
        return `Option ${index + 1}`;
    }
};

/** Copy-button chrome so the format picker sits as a sibling control in the code bar. */
const CODE_TOOLBAR_TRIGGER_CLASS =
    'flex w-auto min-w-0 items-center justify-between gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-sans font-semibold cursor-pointer border transition-all select-none hover:bg-[var(--background)] bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

export default function SchemaViewer({
    spec,
    matrixSchema,
    effectiveSchema,
    contentSchema,
    mediaType = 'application/json',
    selectionScopeKey,
    activeTab,
    onTabChange,
    onPersistRepresentation,
    specExamples = [],
    activeSpecExampleKey = '',
    onSpecExampleKeyChange,
    branchIndex = 0,
    onBranchIndexChange,
    anyOfSelectedIndices,
    onAnyOfSelectedIndicesChange,
    allOfFocusIndex = null,
    onAllOfFocusIndexChange,
    inspectName = null,
    onOpenSchema,
    onTestPattern,
    headerActions,
    schemaFooter,
    shapeInfo,
    showSchemaWide = true,
    className,
}: SchemaViewerProps) {
    const resolveReference = (item: any) => resolveOpenApiReference(item, spec);
    const [headerExpanded, setHeaderExpanded] = useState(false);
    const [exampleEncodingId, setExampleEncodingId] = useState(() => defaultExampleEncodingId(mediaType));
    const [internalAnyOf, setInternalAnyOf] = useState<number[]>([]);
    const [branchRevision, setBranchRevision] = useState(0);

    useEffect(() => {
        setExampleEncodingId(defaultExampleEncodingId(mediaType));
    }, [mediaType]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{key?: string}>).detail;
            if (detail?.key && detail.key !== selectionScopeKey) return;
            setBranchRevision(current => current + 1);
        };
        window.addEventListener(SCHEMA_BRANCH_SELECTION_EVENT, handler as EventListener);
        return () => window.removeEventListener(SCHEMA_BRANCH_SELECTION_EVENT, handler as EventListener);
    }, [selectionScopeKey]);

    const resolvedMatrix = matrixSchema ? resolveReference(matrixSchema) || matrixSchema : null;
    // Host often narrows oneOf/anyOf/allOf into matrixSchema already; the rail
    // always reads the original content schema so the keywords stay visible.
    const resolvedContent = contentSchema ? resolveReference(contentSchema) || contentSchema : resolvedMatrix;
    const rootCombinator = detectSchemaCombinator(resolvedContent);
    const composition =
        rootCombinator?.meta.kind === 'allOf'
            ? describeAllOfComposition(resolvedContent, resolveReference, getRefName)
            : null;
    const choiceKind: CombinatorKind | null =
        rootCombinator && rootCombinator.meta.kind !== 'allOf' ? rootCombinator.meta.kind : null;
    const choiceBranches = choiceKind && rootCombinator ? rootCombinator.branches : [];
    const allOfBranches = Array.isArray((resolvedContent as any)?.allOf)
        ? ((resolvedContent as any).allOf as any[])
        : [];

    const anyOfSelected =
        anyOfSelectedIndices ??
        (internalAnyOf.length > 0
            ? internalAnyOf
            : choiceKind === 'anyOf'
              ? choiceBranches.map((_, index) => index)
              : []);

    const setAnyOfSelected = (indices: number[]) => {
        if (onAnyOfSelectedIndicesChange) onAnyOfSelectedIndicesChange(indices);
        else setInternalAnyOf(indices);
    };

    const effectiveForView = useMemo(() => {
        const base = effectiveSchema ?? matrixSchema;
        if (!base) return base;
        return applySchemaBranchSelections(base, selectionScopeKey, resolveReference);
        // branchRevision forces recompute after nested oneOf picks.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveSchema, matrixSchema, selectionScopeKey, branchRevision, spec]);

    const resolvedEffective = effectiveForView ? resolveReference(effectiveForView) || effectiveForView : null;
    const hasEnum =
        !!resolvedEffective?.enum && Array.isArray(resolvedEffective.enum) && resolvedEffective.enum.length > 0;

    const schemaName =
        inspectName ||
        (matrixSchema?.$ref ? getRefName(matrixSchema.$ref) : null) ||
        matrixSchema?.title ||
        resolvedEffective?.title ||
        null;

    const bodyShape = shapeInfo || describeRequestBody(mediaType, effectiveForView);

    // allOf focus: property names belonging only to the focused part stay vivid.
    const allOfActiveKeys = useMemo(() => {
        if (allOfFocusIndex === null || allOfFocusIndex === undefined || !allOfBranches.length) return null;
        const focused = allOfBranches[allOfFocusIndex];
        if (!focused) return null;
        const focusedNames = new Set(propertyNamesOf(focused, resolveReference));
        // Keep names that also appear on other parts vivid only when focused owns them;
        // dim everything the focused part does not declare.
        return focusedNames;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allOfFocusIndex, allOfBranches, branchRevision]);

    const tableProperties = useMemo(
        () => flattenSchemaProperties(matrixSchema ?? effectiveForView, resolveReference),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [matrixSchema, effectiveForView, branchRevision, spec],
    );

    const dimmedPropertyNames = useMemo(() => {
        if (!allOfActiveKeys) return new Set<string>();
        const allNames = Object.keys(tableProperties).map(path => path.split('.')[0]);
        return new Set(allNames.filter(name => name && !allOfActiveKeys.has(name)));
    }, [allOfActiveKeys, tableProperties]);

    const oneOfChoices = useMemo(
        () =>
            matrixSchema || effectiveForView
                ? collectSchemaOneOfChoices(matrixSchema || effectiveForView, resolveReference, getRefName)
                : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [matrixSchema, effectiveForView, branchRevision, spec],
    );

    const activeSpecExample =
        specExamples.find(example => example.key === (activeSpecExampleKey || specExamples[0]?.key)) || specExamples[0];

    // Group spec examples by media type / declared group for the sectionized selector.
    const specExampleOptions: CustomDropdownOption[] = useMemo(() => {
        const groups = new Map<string, SchemaViewerSpecExample[]>();
        specExamples.forEach(example => {
            const group = example.group || example.mediaType || mediaType || 'Examples';
            const bucket = groups.get(group) || [];
            bucket.push(example);
            groups.set(group, bucket);
        });
        const options: CustomDropdownOption[] = [];
        groups.forEach((items, group) => {
            if (groups.size > 1) {
                options.push({
                    value: `__group__:${group}`,
                    label: group,
                    disabled: true,
                });
            }
            items.forEach(item => {
                options.push({
                    value: item.key,
                    label: item.label,
                    description: item.mediaType && item.mediaType !== group ? item.mediaType : undefined,
                });
            });
        });
        return options;
    }, [specExamples, mediaType]);

    const encodingOptions: CustomDropdownOption[] = useMemo(() => {
        const options: CustomDropdownOption[] = [];
        let lastGroup = '';
        EXAMPLE_ENCODINGS.forEach(encoding => {
            if (encoding.group !== lastGroup) {
                options.push({
                    value: `__group__:${encoding.group}`,
                    label: encoding.group,
                    disabled: true,
                });
                lastGroup = encoding.group;
            }
            options.push({value: encoding.id, label: encoding.label});
        });
        return options;
    }, []);

    const selectTab = (tab: SchemaViewerTab) => {
        if (tab === 'example' || tab === 'schema') onPersistRepresentation?.(tab);
        onTabChange(tab);
    };

    const rootName =
        schemaName ||
        (effectiveForView?.$ref ? getRefName(effectiveForView.$ref) : null) ||
        effectiveForView?.title ||
        'request';

    const generated = useMemo(() => {
        const encoding = exampleEncodingOf(exampleEncodingId);
        try {
            const mock = generateValidatedMock(effectiveForView ?? {type: 'null'}, spec, 'request');
            if (mock.value === undefined) {
                return {
                    value: undefined as unknown,
                    code: `// Mock unavailable: ${mock.diagnostics.map(item => item.message).join('; ')}`,
                    markers: [] as ReturnType<typeof extractMockLineMarkers>['markers'],
                    language: encoding.language,
                };
            }
            // prepareMockForAnnotation suffixes keys with __ODUI_KEY_n__ (and
            // stubs with __ODUI_MARK_n__) so serializers carry line positions.
            // extractMockLineMarkers must always run afterwards — otherwise the
            // tokens leak into the reader-facing example (every format).
            const prepared = prepareMockForAnnotation(mock.value);
            const serialized =
                encoding.id === 'json'
                    ? JSON.stringify(prepared.value, null, 2)
                    : encoding.format(prepared.value, rootName);
            const marked = extractMockLineMarkers(serialized, prepared);
            return {
                value: mock.value,
                code: marked.code,
                markers: marked.markers,
                language: encoding.language,
            };
        } catch (error) {
            return {
                value: undefined as unknown,
                code: `// Mock unavailable: ${error instanceof Error ? error.message : 'could not generate example'}`,
                markers: [] as ReturnType<typeof extractMockLineMarkers>['markers'],
                language: encoding.language,
            };
        }
    }, [effectiveForView, spec, exampleEncodingId, rootName]);

    const dimmedCodeLines = useMemo(() => {
        if (!allOfActiveKeys) return [];
        if (exampleEncodingId !== 'json' && exampleEncodingId !== 'yaml') return [];
        return dimmedLinesForObjectCode(generated.code, allOfActiveKeys);
    }, [allOfActiveKeys, exampleEncodingId, generated.code]);

    const inlineMenus = useMemo(() => {
        if (exampleEncodingId !== 'json' && exampleEncodingId !== 'yaml' && exampleEncodingId !== 'xml') {
            return {code: generated.code, menus: []};
        }
        return inlineMenusForCode(generated.code, selectionScopeKey, oneOfChoices);
    }, [generated.code, selectionScopeKey, oneOfChoices, exampleEncodingId]);

    const formatToolbar = (
        <CustomDropdown
            value={exampleEncodingId}
            onChange={setExampleEncodingId}
            options={encodingOptions}
            className="w-auto min-w-[7.5rem] max-w-[11rem]"
            triggerClassName={CODE_TOOLBAR_TRIGGER_CLASS}
            ariaLabel="Generated example format"
        />
    );

    const renderBranchRail = () => {
        if (choiceKind === 'oneOf' && choiceBranches.length > 0) {
            return (
                <div className="flex min-w-0 items-center gap-2">
                    <CombinatorLabel meta={COMBINATOR_META.oneOf} />
                    <ScrollableRow className="flex min-w-0 flex-1 items-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                            {choiceBranches.map((branch, index) => {
                                const active = branchIndex === index;
                                const label = branchLabelOf(branch, resolveReference, index);
                                return (
                                    <button
                                        key={`oneof-${index}`}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => onBranchIndexChange?.(index)}
                                        className={branchChipClass(active)}
                                    >
                                        <span className="relative flex h-[12px] w-[12px] items-center justify-center">
                                            <i
                                                className={clsx(
                                                    active
                                                        ? 'ph-fill ph-radio-button text-[12px] text-[var(--primary)]'
                                                        : 'ph ph-circle text-[12px] text-[var(--text-muted)]',
                                                )}
                                            />
                                        </span>
                                        <span className="max-w-[160px] truncate font-mono">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollableRow>
                </div>
            );
        }

        if (choiceKind === 'anyOf' && choiceBranches.length > 0) {
            const allSelected = anyOfSelected.length === choiceBranches.length;
            return (
                <div className="flex min-w-0 items-center gap-2">
                    <CombinatorLabel meta={COMBINATOR_META.anyOf} />
                    <ScrollableRow className="flex min-w-0 flex-1 items-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                aria-pressed={allSelected}
                                onClick={() =>
                                    setAnyOfSelected(allSelected ? [] : choiceBranches.map((_, index) => index))
                                }
                                className={branchChipClass(allSelected)}
                            >
                                <i className="ph ph-checks text-[12px]" />
                                All
                            </button>
                            {choiceBranches.map((branch, index) => {
                                const active = anyOfSelected.includes(index);
                                const label = branchLabelOf(branch, resolveReference, index);
                                return (
                                    <button
                                        key={`anyof-${index}`}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => {
                                            if (active) {
                                                setAnyOfSelected(anyOfSelected.filter(item => item !== index));
                                            } else {
                                                setAnyOfSelected(
                                                    unique([...anyOfSelected, index].map(String)).map(Number),
                                                );
                                            }
                                        }}
                                        className={branchChipClass(active)}
                                    >
                                        <i
                                            className={clsx(
                                                active
                                                    ? 'ph-fill ph-check-square text-[12px] text-[var(--primary)]'
                                                    : 'ph ph-square text-[12px] text-[var(--text-muted)]',
                                            )}
                                        />
                                        <span className="max-w-[160px] truncate font-mono">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollableRow>
                </div>
            );
        }

        if (composition && allOfBranches.length > 0) {
            return (
                <div className="flex min-w-0 items-center gap-2">
                    <CombinatorLabel meta={COMBINATOR_META.allOf} />
                    <ScrollableRow className="flex min-w-0 flex-1 items-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                aria-pressed={allOfFocusIndex === null}
                                onClick={() => onAllOfFocusIndexChange?.(null)}
                                className={branchChipClass(allOfFocusIndex === null)}
                            >
                                <i className="ph ph-stack text-[12px]" />
                                Combined
                            </button>
                            {allOfBranches.map((branch: any, index: number) => {
                                const active = allOfFocusIndex === index;
                                const label = branchLabelOf(branch, resolveReference, index);
                                return (
                                    <button
                                        key={`allof-${index}`}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => onAllOfFocusIndexChange?.(active ? null : index)}
                                        className={branchChipClass(active, allOfFocusIndex !== null && !active)}
                                    >
                                        <span className="relative flex h-[12px] w-[12px] items-center justify-center">
                                            <i
                                                className={clsx(
                                                    active
                                                        ? 'ph-fill ph-radio-button text-[12px] text-[var(--primary)]'
                                                        : 'ph ph-circle text-[12px] text-[var(--text-muted)]',
                                                )}
                                            />
                                        </span>
                                        <span className="max-w-[160px] truncate font-mono">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollableRow>
                </div>
            );
        }

        if (rootCombinator?.meta.kind === 'not') {
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <CombinatorLabel meta={COMBINATOR_META.not} />
                    <span className="text-[10px] text-[var(--text-muted)]">
                        Values matching the negated schema are rejected.
                    </span>
                    {rootCombinator.branches[0]?.$ref && onOpenSchema && (
                        <button
                            type="button"
                            onClick={() => onOpenSchema(getRefName(rootCombinator.branches[0].$ref))}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold text-[var(--primary)] cursor-pointer"
                        >
                            <i className="ph ph-diamonds-four text-[11px]" />
                            {getRefName(rootCombinator.branches[0].$ref)}
                        </button>
                    )}
                </div>
            );
        }

        // if/then/else and dependentSchemas surface as informational chips.
        const extras: React.ReactNode[] = [];
        if (resolvedContent?.if) {
            extras.push(
                <span
                    key="if"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]"
                >
                    <i className="ph ph-git-diff text-[11px]" />
                    if / then / else
                </span>,
            );
        }
        if (resolvedContent?.dependentSchemas && typeof resolvedContent.dependentSchemas === 'object') {
            extras.push(
                <span
                    key="deps"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]"
                >
                    <i className="ph ph-tree-structure text-[11px]" />
                    dependentSchemas ({Object.keys(resolvedContent.dependentSchemas).length})
                </span>,
            );
        }
        if (extras.length === 0) return null;
        return <div className="flex flex-wrap items-center gap-1.5">{extras}</div>;
    };

    const metaHeader = (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                    <span className="font-black uppercase tracking-wider text-[var(--text-muted)]">Schema</span>
                    {schemaName && (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-[var(--text-heading)]">
                            <span className="text-[var(--text-muted)] font-sans font-semibold">Name:</span>
                            {schemaName}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-[var(--text-heading)]">
                        <span className="text-[var(--text-muted)] font-sans font-semibold">Type:</span>
                        {displayTypeOf(effectiveForView || matrixSchema, resolveReference)}
                    </span>
                    {mediaType && (
                        <span className="inline-flex items-center gap-1 font-mono text-[var(--text-heading)]">
                            <span className="text-[var(--text-muted)] font-sans font-semibold">Encoding:</span>
                            <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold border border-[var(--border)] break-all">
                                {mediaType}
                            </span>
                        </span>
                    )}
                    {bodyShape && (
                        <Tip content={bodyShape.hint}>
                            <span className="inline-flex cursor-help items-center gap-1 rounded-md border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--primary)]">
                                <i className={`${bodyShape.icon} text-[11px]`} />
                                {bodyShape.label}
                            </span>
                        </Tip>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setHeaderExpanded(current => !current)}
                    aria-expanded={headerExpanded}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-heading)] cursor-pointer"
                    aria-label={headerExpanded ? 'Collapse schema header' : 'Expand schema header'}
                >
                    <i className={clsx('ph text-[14px]', headerExpanded ? 'ph-caret-up' : 'ph-caret-down')} />
                </button>
            </div>
            {headerExpanded && (
                <div className="space-y-3 border-t border-[var(--border)] px-3 py-3 animate-in fade-in">
                    {/* <hdr-etyp> */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <p className="text-xs font-mono select-none">
                            <span className="mr-1 font-sans font-semibold text-[var(--text-heading)]">
                                Encoding TYPE:
                            </span>
                            <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-heading)] border border-[var(--border)] break-all">
                                {mediaType}
                            </span>
                        </p>
                        {bodyShape && (
                            <Tip content={bodyShape.hint}>
                                <span className="inline-flex cursor-help items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)]">
                                    <i className={`${bodyShape.icon} text-[12px]`} />
                                    {bodyShape.label}
                                </span>
                            </Tip>
                        )}
                    </div>
                    {/* <hdr-asmbly> */}
                    {composition && (
                        <AllOfCompositionNote
                            composition={composition}
                            subject="request body"
                            onInspect={onOpenSchema}
                        />
                    )}
                    {/* <hdr-brnch> */}
                    {renderBranchRail()}
                    {resolvedEffective?.description && (
                        <div className="text-xs leading-relaxed text-[var(--text)]">
                            <Markdown text={resolvedEffective.description} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const tabStrip = (
        <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex p-0.5 rounded-lg border w-fit border-[var(--border)] bg-[var(--background)] flex-wrap items-center">
                <button
                    type="button"
                    onClick={() => selectTab('example')}
                    aria-pressed={activeTab === 'example'}
                    className={tabButtonClass(activeTab === 'example')}
                >
                    <span className="hidden sm:inline">Generated Example</span>
                    <span className="sm:hidden">Example</span>
                </button>
                <button
                    type="button"
                    onClick={() => selectTab('schema')}
                    aria-pressed={activeTab === 'schema'}
                    className={tabButtonClass(activeTab === 'schema')}
                >
                    <span className="hidden sm:inline">Unified Schema</span>
                    <span className="sm:hidden">Schema</span>
                </button>
                {hasEnum && (
                    <button
                        type="button"
                        onClick={() => selectTab('enum')}
                        aria-pressed={activeTab === 'enum'}
                        className={tabButtonClass(activeTab === 'enum')}
                    >
                        Enum
                    </button>
                )}
                {specExamples.length > 0 && (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => selectTab('spec-example')}
                        onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                selectTab('spec-example');
                            }
                        }}
                        className={clsx(
                            'px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1',
                            activeTab === 'spec-example'
                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold'
                                : 'hover:opacity-80',
                        )}
                    >
                        <span>Example:</span>
                        {specExamples.length > 1 && activeTab === 'spec-example' ? (
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <CustomDropdown
                                    value={activeSpecExampleKey || specExamples[0].key}
                                    onChange={value => onSpecExampleKeyChange?.(value)}
                                    options={specExampleOptions}
                                    className="w-auto min-w-0 max-w-[220px]"
                                    ariaLabel="Specification examples"
                                    plainTrigger
                                />
                            </span>
                        ) : (
                            <span>{activeSpecExample?.label || 'Example'}</span>
                        )}
                    </div>
                )}
            </div>
            {headerActions && <div className="flex items-center gap-2 flex-wrap justify-end">{headerActions}</div>}
        </div>
    );

    // Always keep the branch rail reachable even when the meta header is collapsed.
    const stickyBranch = !headerExpanded ? renderBranchRail() : null;

    return (
        <div className={clsx('space-y-3 min-w-0', className)}>
            {metaHeader}
            {stickyBranch}
            {tabStrip}

            {activeTab === 'example' && (
                <div className="space-y-3 min-w-0">
                    <CodeViewer
                        code={inlineMenus.code}
                        language={generated.language}
                        maxHeight="none"
                        lineMarkers={mockMarkersToLineMarkers(generated.markers, {
                            onOpenSchema,
                            onTestPattern,
                        })}
                        inlineMenus={inlineMenus.menus}
                        toolbarEnd={formatToolbar}
                        dimmedLines={dimmedCodeLines}
                    />
                </div>
            )}

            {activeTab === 'spec-example' && activeSpecExample && (
                <div className="space-y-3 min-w-0">
                    <CodeViewer
                        code={formatExample(
                            activeSpecExample.value,
                            activeSpecExample.mediaType || mediaType,
                            rootName,
                        )}
                        language={exampleLanguageFor(activeSpecExample.mediaType || mediaType)}
                        maxHeight="320px"
                    />
                </div>
            )}

            {activeTab === 'enum' && hasEnum && (
                <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
                    {resolvedEffective.enum.map((val: any) => (
                        <span
                            key={JSON.stringify(val)}
                            className="px-2.5 py-1 rounded-lg text-xs font-mono border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] break-all"
                        >
                            {JSON.stringify(val)}
                        </span>
                    ))}
                </div>
            )}

            {activeTab === 'schema' && (
                <div className="space-y-3 min-w-0">
                    {(() => {
                        const pureNull =
                            matrixSchema === null ||
                            matrixSchema === undefined ||
                            resolvedEffective?.type === 'null' ||
                            (Array.isArray(resolvedEffective?.type) &&
                                resolvedEffective.type.length > 0 &&
                                resolvedEffective.type.every((item: string) => item === 'null'));
                        if (pureNull) {
                            return (
                                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                                    <strong className="text-[var(--text-heading)]">Null schema</strong>
                                    <p className="mt-1">
                                        This branch only accepts JSON <code className="font-mono">null</code> and
                                        declares no properties.
                                    </p>
                                </div>
                            );
                        }
                        if (matrixSchema === true) {
                            return (
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-xs">
                                    <strong className="text-[var(--text-heading)]">Unrestricted schema</strong>
                                    <p className="mt-1 text-[var(--text-muted)]">
                                        Any JSON value satisfies this boolean schema.
                                    </p>
                                </div>
                            );
                        }
                        if (matrixSchema === false) {
                            return (
                                <div className="rounded-xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 p-4 text-xs">
                                    <strong className="text-[var(--method-delete)]">Impossible schema</strong>
                                    <p className="mt-1 text-[var(--text-muted)]">
                                        No JSON value satisfies this boolean schema.
                                    </p>
                                </div>
                            );
                        }
                        return (
                            <div
                                className={clsx(
                                    'pt-1 min-w-0',
                                    dimmedPropertyNames.size > 0 && 'schema-viewer-allof-focus',
                                )}
                                data-dimmed-fields={[...dimmedPropertyNames].join(',')}
                            >
                                <SchemaPropertiesTable
                                    properties={tableProperties}
                                    schema={matrixSchema ?? {type: 'null'}}
                                    resolveReference={resolveReference}
                                    getRefName={getRefName}
                                    onPushSchema={name => onOpenSchema?.(name)}
                                    inspectName={schemaName}
                                    onTestPattern={pattern => onTestPattern?.(pattern)}
                                    selectionScopeKey={selectionScopeKey}
                                    showSchemaWide={showSchemaWide}
                                />
                            </div>
                        );
                    })()}
                    {schemaFooter}
                </div>
            )}

            {/* Dim unrelated property rows when an allOf part is focused. */}
            {dimmedPropertyNames.size > 0 && (
                <style>{`
                    .schema-viewer-allof-focus tr[data-field-name],
                    .schema-viewer-allof-focus [data-field-name] {
                        transition: opacity 120ms ease;
                    }
                    ${[...dimmedPropertyNames]
                        .map(
                            name => `
                    .schema-viewer-allof-focus tr[data-field-name="${CSS.escape(name)}"],
                    .schema-viewer-allof-focus [data-field-name="${CSS.escape(name)}"],
                    .schema-viewer-allof-focus tr[data-field-name^="${CSS.escape(name)}."],
                    .schema-viewer-allof-focus [data-field-name^="${CSS.escape(name)}."] {
                        opacity: 0.35;
                    }`,
                        )
                        .join('\n')}
                `}</style>
            )}
        </div>
    );
}
