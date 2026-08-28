import React, {useEffect, useMemo, useState} from 'react';
import clsx from 'clsx';
import CodeViewer from '../../common/CodeViewer';
import CustomDropdown from '../../common/CustomDropdown';
import ScrollableRow from '../../common/ScrollableRow';
import Markdown from '../../common/Markdown';
import {Tip} from '../../common/Tooltip';
import SchemaPropertiesTable from '../SchemaPropertiesTable';
import {inlineMenusForCode} from '../inlineMenus';
import type {OpenApiSpec} from '../../../types';
import type {CustomDropdownOption} from '../../../types/ui';
import {
    COMBINATOR_META,
    combinatorActiveSurfaceStyle,
    combinatorSelectionIconClass,
    describeAllOfComposition,
    detectSchemaCombinator,
    expandAllOfBranches,
    type CombinatorKind,
} from '../../../utils/schema/combinators';
import {
    applySchemaBranchSelections,
    propertyNamesOfSchema,
    readSchemaAllOfFocus,
    SCHEMA_BRANCH_SELECTION_EVENT,
} from '../../../utils/schema/branchSelections';
import {collectSchemaBranchChoices} from '../../../utils/schema/branchChoices';
import {flattenSchemaProperties, schemaVariantLabel} from '../../../utils/schemaProperties';
import {exampleLanguageFor, formatExample} from '../../../utils/endpoint/exampleFormatting';
import type {MockUsage} from '../../../utils/runner/mockGenerator';
import {
    EXAMPLE_ENCODINGS,
    defaultExampleEncodingId,
    dimmedLinesForFieldAllOfFocus,
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
    /** Mock generation usage — request omits readOnly; response omits writeOnly. */
    usage?: MockUsage;
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
            ? // Color comes from style={{...combinatorActiveSurfaceStyle}} so each keyword keeps its hue.
              'border-current'
            : muted
              ? 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] opacity-55'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]',
    );

const selectionGlyph = (kind: CombinatorKind, active: boolean, sizeClass = 'text-[12px]') => (
    <i
        className={clsx(combinatorSelectionIconClass(kind, active), sizeClass)}
        style={active ? {color: COMBINATOR_META[kind].color} : undefined}
    />
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
    if (resolved.not) return 'not';
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
    usage = 'request',
    className,
}: SchemaViewerProps) {
    const resolveReference = (item: any) => resolveOpenApiReference(item, spec);
    const [exampleEncodingId, setExampleEncodingId] = useState(() => defaultExampleEncodingId(mediaType));
    const [internalAnyOf, setInternalAnyOf] = useState<number[]>([]);
    const [internalAnyOfTouched, setInternalAnyOfTouched] = useState(false);
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
    // Branch rail must reflect ONLY the body schema's own oneOf/anyOf/allOf.
    // Prefer contentSchema (the unresolved media-type schema). Never fall back
    // to matrixSchema when contentSchema is present: matrix is often a narrowed
    // branch or a merged object whose nested field combinators must not surface
    // as a top-level rail.
    const resolvedContent =
        contentSchema !== undefined && contentSchema !== null
            ? resolveReference(contentSchema) || contentSchema
            : resolvedMatrix;
    // Pass resolve so pure allOf wrappers (`allOf: [$ref→allOf]`) expand to real parts.
    const rootCombinator = detectSchemaCombinator(resolvedContent, resolveReference);
    const composition =
        rootCombinator?.meta.kind === 'allOf'
            ? describeAllOfComposition(resolvedContent, resolveReference, getRefName)
            : null;
    // oneOf/anyOf only — allOf has its own rail; not is inspection-only (no pick chips).
    const choiceKind: CombinatorKind | null =
        rootCombinator && (rootCombinator.meta.kind === 'oneOf' || rootCombinator.meta.kind === 'anyOf')
            ? rootCombinator.meta.kind
            : null;
    const choiceBranches = choiceKind && rootCombinator ? rootCombinator.branches : [];
    const allOfBranches =
        rootCombinator?.meta.kind === 'allOf' && rootCombinator.branches.length > 0 ? rootCombinator.branches : [];

    // Controlled: host owns the list (empty = none selected). Uncontrolled:
    // default to every branch until the reader toggles All off.
    const anyOfSelected =
        anyOfSelectedIndices !== undefined
            ? anyOfSelectedIndices
            : internalAnyOf.length > 0 || internalAnyOfTouched
              ? internalAnyOf
              : choiceKind === 'anyOf'
                ? choiceBranches.map((_, index) => index)
                : [];

    const setAnyOfSelected = (indices: number[]) => {
        if (onAnyOfSelectedIndicesChange) onAnyOfSelectedIndicesChange(indices);
        else {
            setInternalAnyOfTouched(true);
            setInternalAnyOf(indices);
        }
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

    // Body-level allOf focus: property names belonging to the focused part stay vivid.
    const rootAllOfActiveKeys = useMemo(() => {
        if (allOfFocusIndex === null || allOfFocusIndex === undefined || !allOfBranches.length) return null;
        const focused = allOfBranches[allOfFocusIndex];
        if (!focused) return null;
        return new Set(propertyNamesOf(focused, resolveReference));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allOfFocusIndex, allOfBranches, branchRevision]);

    // Field-level allOf focus (caret menus): union of owned names, keyed by the
    // field path so nested properties dim relative to their parent object.
    const fieldAllOfActiveKeys = useMemo(() => {
        const focusMap = readSchemaAllOfFocus(selectionScopeKey);
        const entries = Object.entries(focusMap).filter(([, index]) => index !== null && index !== undefined);
        if (entries.length === 0) return null as Map<string, Set<string>> | null;
        const source = matrixSchema || effectiveForView;
        if (!source) return null;
        const map = new Map<string, Set<string>>();
        entries.forEach(([path, index]) => {
            // Walk to the field schema the same way branch collection does.
            const segments = path.split('.').filter(Boolean);
            let current: any = source;
            for (const segment of segments) {
                if (!current || typeof current !== 'object') {
                    current = null;
                    break;
                }
                if (typeof current.$ref === 'string') current = resolveReference(current) || current;
                while (current && typeof current === 'object' && !current.properties && Array.isArray(current.allOf)) {
                    const hit = current.allOf.find((part: any) => {
                        const resolved = resolveReference(part) || part;
                        return resolved?.properties && segment in resolved.properties;
                    });
                    current = resolveReference(hit || current.allOf[0]) || hit || current.allOf[0];
                }
                if (segment === '*') {
                    current = current?.items;
                    continue;
                }
                const bare = segment.replace(/\[[^\]]+\]/g, '');
                if (current?.properties && bare in current.properties) {
                    current = current.properties[bare];
                    continue;
                }
                current = null;
                break;
            }
            if (current && typeof current.$ref === 'string') current = resolveReference(current) || current;
            if (!current || !Array.isArray(current.allOf)) return;
            const parts = expandAllOfBranches(current, resolveReference);
            const list = parts.length > 0 ? parts : current.allOf;
            if (list[index as number] === undefined) return;
            map.set(path, propertyNamesOfSchema(list[index as number], resolveReference));
        });
        return map.size > 0 ? map : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matrixSchema, effectiveForView, selectionScopeKey, branchRevision, spec]);

    const tableProperties = useMemo(
        () => flattenSchemaProperties(matrixSchema ?? effectiveForView, resolveReference),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [matrixSchema, effectiveForView, branchRevision, spec],
    );

    const dimmedPropertyNames = useMemo(() => {
        const dimmed = new Set<string>();
        const allPaths = Object.keys(tableProperties);
        // Body-level allOf: dim every property path whose top-level key is outside the focused part.
        if (rootAllOfActiveKeys) {
            allPaths.forEach(path => {
                const top = path.split('.')[0];
                if (top && !rootAllOfActiveKeys.has(top)) dimmed.add(path);
            });
        }
        // Field-level allOf: dim nested rows under the field that the focused part does not own.
        // Sibling fields outside the allOf field stay vivid (composition is local to that field).
        if (fieldAllOfActiveKeys) {
            fieldAllOfActiveKeys.forEach((activeNames, fieldPath) => {
                allPaths.forEach(path => {
                    if (path === fieldPath) return;
                    if (!path.startsWith(`${fieldPath}.`)) return;
                    const nested = path.slice(fieldPath.length + 1).split('.')[0];
                    if (nested && !activeNames.has(nested)) dimmed.add(path);
                });
            });
        }
        return dimmed;
    }, [rootAllOfActiveKeys, fieldAllOfActiveKeys, tableProperties]);

    const branchChoices = useMemo(
        () =>
            matrixSchema || effectiveForView
                ? collectSchemaBranchChoices(matrixSchema || effectiveForView, resolveReference, getRefName)
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
            const mock = generateValidatedMock(effectiveForView ?? {type: 'null'}, spec, usage);
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
    }, [effectiveForView, spec, exampleEncodingId, rootName, usage]);

    const dimmedCodeLines = useMemo(() => {
        if (exampleEncodingId !== 'json' && exampleEncodingId !== 'yaml') return [];
        // Body-level allOf focus dims top-level keys outside the focused part.
        if (rootAllOfActiveKeys) return dimmedLinesForObjectCode(generated.code, rootAllOfActiveKeys);
        // Field-level allOf focus: same opacity treatment, scoped under each field path
        // so sibling keys (and nested keys owned by the focused part) stay vivid.
        if (fieldAllOfActiveKeys && fieldAllOfActiveKeys.size > 0) {
            return dimmedLinesForFieldAllOfFocus(generated.code, fieldAllOfActiveKeys);
        }
        return [];
    }, [rootAllOfActiveKeys, fieldAllOfActiveKeys, exampleEncodingId, generated.code]);

    const inlineMenus = useMemo(
        () =>
            inlineMenusForCode(
                generated.code,
                selectionScopeKey,
                branchChoices,
                exampleEncodingId || generated.language,
            ),
        [generated.code, generated.language, selectionScopeKey, branchChoices, exampleEncodingId],
    );

    const formatToolbar = (
        <CustomDropdown
            value={exampleEncodingId}
            onChange={setExampleEncodingId}
            options={encodingOptions}
            className="w-auto max-w-[11rem]"
            triggerClassName={CODE_TOOLBAR_TRIGGER_CLASS}
            ariaLabel="Generated example format"
        />
    );

    const renderBranchRail = () => {
        if (choiceKind === 'oneOf' && choiceBranches.length > 0) {
            return (
                <ScrollableRow className="flex min-w-0 w-full items-center gap-1.5">
                    <div className="flex items-center gap-1.5">
                        {choiceBranches.map((branch, index) => {
                            const active = branchIndex === index;
                            const label = branchLabelOf(branch, resolveReference, index);
                            return (
                                <button
                                    type="button"
                                    key={`oneOf-${index}`}
                                    aria-pressed={active}
                                    onClick={() => onBranchIndexChange?.(index)}
                                    className={branchChipClass(active)}
                                    style={combinatorActiveSurfaceStyle('oneOf', active)}
                                >
                                    <span className="relative flex h-[12px] w-[12px] items-center justify-center">
                                        {selectionGlyph('oneOf', active)}
                                    </span>
                                    <span className="max-w-[160px] truncate font-mono">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </ScrollableRow>
            );
        }

        if (choiceKind === 'anyOf' && choiceBranches.length > 0) {
            const allSelected = anyOfSelected.length === choiceBranches.length;
            return (
                <ScrollableRow className="flex min-w-0 w-full items-center gap-1.5">
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            aria-pressed={allSelected}
                            onClick={() => setAnyOfSelected(allSelected ? [] : choiceBranches.map((_, index) => index))}
                            className={branchChipClass(allSelected)}
                            style={combinatorActiveSurfaceStyle('anyOf', allSelected)}
                        >
                            {selectionGlyph('anyOf', allSelected)}
                            All
                        </button>

                        {choiceBranches.map((branch, index) => {
                            const active = anyOfSelected.includes(index);
                            const label = branchLabelOf(branch, resolveReference, index);
                            return (
                                <button
                                    type="button"
                                    key={`anyOf-${index}`}
                                    aria-pressed={active}
                                    onClick={() => {
                                        if (active) {
                                            setAnyOfSelected(anyOfSelected.filter(item => item !== index));
                                        } else {
                                            setAnyOfSelected(unique([...anyOfSelected, index].map(String)).map(Number));
                                        }
                                    }}
                                    className={branchChipClass(active)}
                                    style={combinatorActiveSurfaceStyle('anyOf', active)}
                                >
                                    {selectionGlyph('anyOf', active)}
                                    <span className="max-w-[160px] truncate font-mono">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </ScrollableRow>
            );
        }

        if (composition && allOfBranches.length > 0) {
            return (
                <ScrollableRow className="flex min-w-0 w-full items-center gap-1.5">
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            aria-pressed={allOfFocusIndex === null}
                            onClick={() => onAllOfFocusIndexChange?.(null)}
                            className={branchChipClass(allOfFocusIndex === null)}
                            style={combinatorActiveSurfaceStyle('allOf', allOfFocusIndex === null)}
                        >
                            {selectionGlyph('allOf', allOfFocusIndex === null)}
                            Combined
                        </button>

                        {allOfBranches.map((branch: any, index: number) => {
                            const active = allOfFocusIndex === index;
                            const label = branchLabelOf(branch, resolveReference, index);
                            return (
                                <button
                                    type="button"
                                    key={`allOf-${index}`}
                                    aria-pressed={active}
                                    onClick={() => onAllOfFocusIndexChange?.(active ? null : index)}
                                    className={branchChipClass(active, allOfFocusIndex !== null && !active)}
                                    style={combinatorActiveSurfaceStyle('allOf', active)}
                                >
                                    <span className="relative flex h-[12px] w-[12px] items-center justify-center">
                                        {selectionGlyph('allOf', active)}
                                    </span>
                                    <span className="max-w-[160px] truncate font-mono">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </ScrollableRow>
            );
        }

        if (rootCombinator?.meta.kind === 'not') {
            const negated = rootCombinator.branches[0];
            const negatedRef = typeof negated?.$ref === 'string' ? getRefName(negated.$ref) : '';
            return (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[10px] text-[var(--text-muted)]">
                        Values matching the negated schema are rejected.
                    </span>
                    {negatedRef ? (
                        onOpenSchema ? (
                            <button
                                type="button"
                                onClick={() => onOpenSchema(negatedRef)}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--method-delete)] cursor-pointer"
                            >
                                <i className="ph ph-diamonds-four text-[11px]" />
                                {negatedRef}
                            </button>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--method-delete)]/25 bg-[var(--method-delete)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--method-delete)]">
                                {negatedRef}
                            </span>
                        )
                    ) : null}
                </div>
            );
        }

        return null;
    };

    // Meta header is always open: summary bar + branch rail / description when present.
    const branchRailNode = renderBranchRail();

    const typeLabel = displayTypeOf(effectiveForView || matrixSchema, resolveReference);
    const combinatorBadge = rootCombinator
        ? {
              label: rootCombinator.meta.kind,
              tip: rootCombinator.meta.hint,
              icon: rootCombinator.meta.icon,
              color: rootCombinator.meta.color,
          }
        : null;

    const requiredFieldNames: string[] = Array.isArray(resolvedEffective?.required)
        ? resolvedEffective.required.filter(
              (name: unknown): name is string => typeof name === 'string' && name.length > 0,
          )
        : [];
    const additionalPropertiesValue = resolvedEffective?.additionalProperties;
    const additionalPropertiesLabel =
        additionalPropertiesValue === undefined
            ? null
            : typeof additionalPropertiesValue === 'boolean'
              ? String(additionalPropertiesValue)
              : displayTypeOf(additionalPropertiesValue, resolveReference);

    const metaStat = (opts: {
        label: string;
        value: React.ReactNode;
        tip?: string;
        mono?: boolean;
        icon?: string;
        accent?: string;
        name: string;
    }) => {
        const chip = (
            <span
                className={clsx(
                    'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] leading-none',
                    opts.accent
                        ? 'border-current/20 bg-current/10'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)]',
                )}
                style={opts.accent ? {color: opts.accent} : undefined}
            >
                {opts.icon ? <i className={`${opts.icon} text-[12px] shrink-0 opacity-90`} /> : null}
                <span className="shrink-0 font-sans text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {opts.label}
                </span>
                <span
                    className={clsx(
                        'min-w-0 truncate font-semibold',
                        opts.mono ? 'font-mono' : 'font-sans',
                        !opts.accent && 'text-[var(--text-heading)]',
                    )}
                >
                    {opts.value}
                </span>
            </span>
        );
        return (
            <div className="inline-flex min-w-0 max-w-full">
                {opts.tip ? <Tip content={opts.tip}>{chip}</Tip> : chip}
            </div>
        );
    };

    const metaRowLabelClass =
        'inline-flex items-center gap-1 whitespace-nowrap font-sans text-[10px] font-bold uppercase tracking-wider';
    const metaThClass = 'w-0 whitespace-nowrap bg-[var(--background)] px-3 py-2.5 text-left align-middle';
    const metaTdClass = 'max-w-0 min-w-0 w-full overflow-hidden bg-[var(--surface)]/40 px-3 py-2.5 align-middle';

    const metaRow = (opts: {
        key: string;
        icon: string;
        label: string;
        tip?: string;
        color?: string;
        children: React.ReactNode;
    }) => {
        const labelNode = (
            <span className={metaRowLabelClass} style={opts.color ? {color: opts.color} : undefined}>
                <i className={`${opts.icon} text-[11px]`} />
                {opts.label}
            </span>
        );
        return (
            <tr key={opts.key} className="border-b border-[var(--border)] last:border-b-0">
                <th scope="row" className={metaThClass}>
                    {opts.tip ? (
                        <Tip content={opts.tip}>
                            <span className="cursor-help">{labelNode}</span>
                        </Tip>
                    ) : (
                        labelNode
                    )}
                </th>
                <td className={metaTdClass}>
                    <div className="min-w-0 w-full">{opts.children}</div>
                </td>
            </tr>
        );
    };

    const schemaMetaChips = (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {schemaName
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderName',
                      label: 'Name',
                      value: schemaName,
                      mono: true,
                      tip: `Component / title: ${schemaName}`,
                      icon: 'ph ph-tag',
                  })
                : null}
            {metaStat({
                name: 'SchemaViewer.metaHeaderType',
                label: 'Type',
                value: typeLabel,
                mono: true,
                tip: 'JSON Schema type after branch selection',
                icon: 'ph ph-cube',
            })}
            {combinatorBadge
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderCombinator',
                      label: 'Shape',
                      value: combinatorBadge.label,
                      mono: true,
                      tip: combinatorBadge.tip,
                      icon: combinatorBadge.icon,
                      accent: combinatorBadge.color,
                  })
                : null}
            {mediaType
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderEncoding',
                      label: 'Media',
                      value: mediaType,
                      mono: true,
                      tip: 'Media type (Content-Type) for this body',
                      icon: 'ph ph-file-code',
                  })
                : null}
            {additionalPropertiesLabel !== null
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderAdditional',
                      label: 'Addl. props',
                      value: additionalPropertiesLabel,
                      mono: true,
                      tip:
                          typeof additionalPropertiesValue === 'boolean'
                              ? additionalPropertiesValue
                                  ? 'Objects may include properties beyond those listed'
                                  : 'Objects must not include undeclared properties'
                              : 'Schema for undeclared (additional) properties',
                      icon: 'ph ph-plus-circle',
                  })
                : null}
            {composition
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderFieldCount',
                      label: 'Fields',
                      value: (
                          <>
                              {composition.fieldCount}
                              {composition.requiredCount > 0 ? (
                                  <span className="opacity-80"> · {composition.requiredCount} req</span>
                              ) : null}
                          </>
                      ),
                      tip:
                          composition.requiredCount > 0
                              ? `${composition.fieldCount} field${composition.fieldCount === 1 ? '' : 's'} assembled from allOf · ${composition.requiredCount} required`
                              : `${composition.fieldCount} field${composition.fieldCount === 1 ? '' : 's'} assembled from allOf`,
                      icon: 'ph ph-stack-simple',
                  })
                : null}
            {composition && composition.parts.length > 0
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderPartCount',
                      label: 'Parts',
                      value: composition.parts.length,
                      tip: 'allOf composition parts (use the rail below to focus one)',
                      icon: 'ph ph-intersect',
                      accent: 'var(--primary)',
                  })
                : null}
            {choiceKind && choiceBranches.length > 0
                ? metaStat({
                      name: 'SchemaViewer.metaHeaderBranchCount',
                      label: choiceKind,
                      value: choiceBranches.length,
                      tip: rootCombinator?.meta.hint,
                      icon: rootCombinator?.meta.icon,
                      accent: rootCombinator?.meta.color,
                  })
                : null}
        </div>
    );

    const combinatorRowMeta =
        choiceKind && rootCombinator
            ? COMBINATOR_META[choiceKind]
            : composition
              ? COMBINATOR_META.allOf
              : rootCombinator?.meta.kind === 'not'
                ? COMBINATOR_META.not
                : null;

    const metaHeader = (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm">
            <table className="w-full table-fixed border-collapse">
                <colgroup>
                    <col className="w-0" />
                    <col />
                </colgroup>
                <tbody>
                    {metaRow({
                        key: 'schema',
                        icon: 'ph ph-diamonds-four',
                        label: 'Schema',
                        tip: 'Schema identity and media summary',
                        color: 'var(--primary)',
                        children: schemaMetaChips,
                    })}
                    {requiredFieldNames.length > 0
                        ? metaRow({
                              key: 'required',
                              icon: 'ph ph-asterisk',
                              label: 'Required',
                              tip: 'Top-level required property names',
                              color: 'var(--method-delete)',
                              children: (
                                  <ScrollableRow className="flex min-w-0 w-full items-center gap-1.5">
                                      <div className="flex items-center gap-2">
                                          {requiredFieldNames.map(name => (
                                              <span
                                                  key={name}
                                                  className="shrink-0 max-w-[180px] truncate font-mono text-[10px] font-bold text-[var(--method-delete)]"
                                                  title={`${name} is required`}
                                              >
                                                  {name}
                                              </span>
                                          ))}
                                      </div>
                                  </ScrollableRow>
                              ),
                          })
                        : null}
                    {branchRailNode && combinatorRowMeta
                        ? metaRow({
                              key: `combinator-${combinatorRowMeta.kind}`,
                              icon: combinatorRowMeta.icon,
                              label: combinatorRowMeta.label,
                              tip: combinatorRowMeta.hint,
                              color: combinatorRowMeta.color,
                              children: branchRailNode,
                          })
                        : null}
                    {resolvedEffective?.description
                        ? metaRow({
                              key: 'description',
                              icon: 'ph ph-text-align-left',
                              label: 'About',
                              tip: 'Schema description',
                              color: 'var(--text-muted)',
                              children: (
                                  <div className="text-xs leading-relaxed text-[var(--text)]">
                                      <Markdown text={resolvedEffective.description} />
                                  </div>
                              ),
                          })
                        : null}
                </tbody>
            </table>
        </div>
    );

    const tabStrip = (
        <div className="min-w-0">
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
        </div>
    );

    return (
        <div className={clsx('space-y-3 min-w-0', className)}>
            {metaHeader}
            {tabStrip}

            {activeTab === 'example' && (
                <div className="min-w-0">
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
                </div>
            )}

            {activeTab === 'spec-example' && activeSpecExample && (
                <div className="min-w-0">
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
                <div className="min-w-0">
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
                                    />
                                </div>
                            );
                        })()}
                        {schemaFooter}
                    </div>
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
