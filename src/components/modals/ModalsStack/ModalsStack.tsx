import React, {useEffect, useMemo, useState} from 'react';
import PatternTesterModal from '../PatternTesterModal';
import ShareModal from '../ShareModal';
import {useModalTransition} from '../../../hooks/useModalTransition';
import {useModalShortcuts} from '../../../hooks/useModalShortcuts';
import SchemaViewerHeader from './SchemaViewerHeader';
import SchemaExampleModal from './SchemaExampleModal';
import SchemaViewer, {type SchemaViewerTab} from '../../schema/viewer/SchemaViewer';
import type {CodeLineMarker} from '../../../utils/lineMarkers';
import type {OpenApiSpec} from '../../../types';
import {
    exampleValueOf,
    getRefName,
    resolveReference as resolveOpenApiReference,
    resolveReferenceResult,
} from '../../../utils/openapi';
import {absoluteRouteHref, toCleanRouteHref} from '../../../utils/routing';
import ReferenceStatusNotice from '../../common/ReferenceStatusNotice';
import {usePreferences} from '../../../contexts/PreferencesContext';
import {modalRepresentationOf} from '../../../utils/storage/preferences';
import {
    detectSchemaCombinator,
    describeAllOfComposition,
    effectiveBranchSchema,
    mergeAnyOfBranchSchemas,
    schemaDeclaresNothing,
} from '../../../utils/schema/combinators';
import {applySchemaBranchSelections} from '../../../utils/schema/branchSelections';

interface ModalsStackProps {
    spec: OpenApiSpec;
    modals: Array<{
        schemaName: string;
        schema: any;
    }>;
    componentsSchemas:
        | {
              [key: string]: any;
          }
        | undefined;
    onPushSchema: (schemaName: string) => void;
    onPopSchema: () => void;
    onCloseAll: () => void;
    parsableKey?: string;
}

export default function ModalsStack({
    spec,
    modals,
    componentsSchemas,
    onPushSchema,
    onPopSchema,
    onCloseAll,
    parsableKey = 'API',
}: ModalsStackProps) {
    const [helpModalContent, setHelpModalContent] = useState<{
        title: string;
        content: string;
        isJson?: boolean;
        lineMarkers?: CodeLineMarker[];
    } | null>(null);
    const {preferences, setModalRepresentation} = usePreferences();
    const [activeTabs, setActiveTabs] = useState<{
        [index: number]: SchemaViewerTab;
    }>({});
    const [modalAnyOfSelected, setModalAnyOfSelected] = useState<Record<string, number[]>>({});
    const [modalAnyOfTouched, setModalAnyOfTouched] = useState<Record<string, boolean>>({});
    const [modalOneOfIndex, setModalOneOfIndex] = useState<Record<string, number>>({});
    const [modalAllOfFocus, setModalAllOfFocus] = useState<Record<string, number | null>>({});
    const [patternToTest, setPatternToTest] = useState<string | null>(null);
    const [shareModal, setShareModal] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const {requestClose, backdropClassName} = useModalTransition(true, onCloseAll);
    const helpTransition = useModalTransition(!!helpModalContent, () => setHelpModalContent(null));
    // The schema stack itself owns browser history, so only the help dialog
    // takes the shared back-navigation contract.
    useModalShortcuts({isOpen: !!helpModalContent, onClose: helpTransition.requestClose});
    useEffect(() => {
        if (modals.length === 0) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (helpModalContent || patternToTest || shareModal) return;
            e.preventDefault();
            if (modals.length > 1) {
                onPopSchema();
            } else {
                requestClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [modals.length, helpModalContent, patternToTest, shareModal, onPopSchema, requestClose]);
    useEffect(() => {
        if (modals.length <= 1) return;
        const handler = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key !== 'ArrowLeft') return;
            if (helpModalContent || patternToTest || shareModal) return;
            e.preventDefault();
            window.history.back();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [modals.length, helpModalContent, patternToTest, shareModal]);
    useEffect(() => {
        if (!helpModalContent) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setHelpModalContent(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [helpModalContent]);
    useEffect(() => {
        if (!patternToTest) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setPatternToTest(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [patternToTest]);
    useEffect(() => {
        if (!shareModal) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShareModal(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [shareModal]);
    // ModalsStack stays mounted while a spec has schemas, so hooks below must
    // run even when the stack is empty — never return before them.
    const activeIndex = Math.max(0, modals.length - 1);
    const resolveReference = (item: any): any => resolveOpenApiReference(item, spec);
    const getSchemaShareUrl = (schemaName: string) => {
        if (typeof window === 'undefined') return '';
        const encodedKey = encodeURIComponent(parsableKey);
        const encodedSchema = encodeURIComponent(schemaName);
        return absoluteRouteHref(`#/parsable/${encodedKey}/schema-explorer?schemas=${encodedSchema}`);
    };
    const handleShareSchema = (schemaName: string) => {
        const url = getSchemaShareUrl(schemaName);
        setShareModal({
            url,
            title: `${schemaName} - Schema`,
            description: `Check out ${schemaName} schema in ${parsableKey} - ${componentsSchemas?.[schemaName]?.description?.slice(0, 140) || 'OpenAPI schema model'}`,
        });
    };
    const activeSchemaObj = modals.length > 0 ? modals[modals.length - 1] : null;
    const activeModal = activeSchemaObj;
    const activeModalIndex = activeIndex;
    const activeResolution = activeSchemaObj ? resolveReferenceResult(activeSchemaObj.schema, spec) : null;
    const resolvedSchema = activeResolution?.value || activeSchemaObj?.schema;
    const [modalExampleKeys, setModalExampleKeys] = useState<Record<number, string>>({});
    const modalRepresentation = activeSchemaObj
        ? modalRepresentationOf(preferences, activeSchemaObj.schemaName)
        : 'example';
    const activeTab: SchemaViewerTab =
        activeTabs[activeModalIndex] || (modalRepresentation === 'schema' ? 'schema' : 'example');
    useEffect(() => {
        // Same rule as the documentation: the enum view is a one-off peek and
        // never survives a schema change or a preference change.
        if (!activeSchemaObj) return;
        setActiveTabs({});
    }, [activeSchemaObj?.schemaName, modalRepresentation]);
    const setTab = (tab: SchemaViewerTab) => {
        if (!activeSchemaObj) return;
        if (tab === 'enum' || tab === 'spec-example') {
            setActiveTabs(prev => ({...prev, [activeModalIndex]: tab}));
            return;
        }
        // Durable example | schema preference; enum/spec-example stay visit-only.
        setActiveTabs({});
        setModalRepresentation(activeSchemaObj.schemaName, tab === 'schema' ? 'schema' : 'example');
    };
    const modalSelectionScopeKey = activeSchemaObj
        ? `${parsableKey}:schema-modal:${activeSchemaObj.schemaName}`
        : `${parsableKey}:schema-modal:`;

    const effectiveModalSchema = activeSchemaObj
        ? applySchemaBranchSelections(activeSchemaObj.schema, modalSelectionScopeKey, resolveReference)
        : null;
    const schemaSpecExamples = useMemo(() => {
        const list: Array<{key: string; label: string; value: unknown; summary?: string; description?: string}> = [];
        if (!activeSchemaObj) return list;
        const seen = new Set<string>();

        const addExample = (key: string, label: string, val: any, summary?: string, desc?: string) => {
            if (seen.has(key)) return;
            seen.add(key);
            list.push({
                key,
                label,
                summary,
                description: desc,
                value: val,
            });
        };

        const targetSchema = resolvedSchema || activeSchemaObj?.schema;
        if (targetSchema && typeof targetSchema === 'object') {
            if (targetSchema.examples && typeof targetSchema.examples === 'object') {
                if (Array.isArray(targetSchema.examples)) {
                    targetSchema.examples.forEach((item: any, idx: number) => {
                        addExample(
                            `example-${idx}`,
                            item?.summary || `Example ${idx + 1}`,
                            exampleValueOf(item, spec),
                            item?.summary,
                            item?.description,
                        );
                    });
                } else {
                    Object.entries(targetSchema.examples).forEach(([key, entry]: [string, any]) => {
                        addExample(
                            key,
                            entry?.summary || key,
                            exampleValueOf(entry, spec),
                            entry?.summary,
                            entry?.description,
                        );
                    });
                }
            }
            if (targetSchema.example !== undefined) {
                addExample('example', 'Example', targetSchema.example);
            }
        }

        const schemaName = activeSchemaObj?.schemaName;
        if (schemaName && spec?.paths) {
            for (const pathItem of Object.values(spec.paths)) {
                if (!pathItem || typeof pathItem !== 'object') continue;
                for (const op of Object.values(pathItem)) {
                    if (!op || typeof op !== 'object') continue;
                    for (const resp of Object.values((op as any).responses || {})) {
                        for (const content of Object.values((resp as any)?.content || {})) {
                            const contentSchema = (content as any)?.schema;
                            if (
                                contentSchema?.$ref?.endsWith(`/${schemaName}`) ||
                                contentSchema?.title === schemaName
                            ) {
                                if ((content as any).examples) {
                                    for (const [exKey, exObj] of Object.entries((content as any).examples)) {
                                        addExample(
                                            exKey,
                                            (exObj as any)?.summary || exKey,
                                            exampleValueOf(exObj, spec),
                                            (exObj as any)?.summary,
                                            (exObj as any)?.description,
                                        );
                                    }
                                }
                                if ((content as any).example !== undefined) {
                                    addExample('example', 'Example', (content as any).example);
                                }
                            }
                        }
                    }
                    for (const content of Object.values((op as any).requestBody?.content || {})) {
                        const contentSchema = (content as any)?.schema;
                        if (contentSchema?.$ref?.endsWith(`/${schemaName}`) || contentSchema?.title === schemaName) {
                            if ((content as any).examples) {
                                for (const [exKey, exObj] of Object.entries((content as any).examples)) {
                                    addExample(
                                        exKey,
                                        (exObj as any)?.summary || exKey,
                                        exampleValueOf(exObj, spec),
                                        (exObj as any)?.summary,
                                        (exObj as any)?.description,
                                    );
                                }
                            }
                            if ((content as any).example !== undefined) {
                                addExample('example', 'Example', (content as any).example);
                            }
                        }
                    }
                }
            }
        }

        if (spec?.components?.examples && typeof spec.components.examples === 'object') {
            const schemaNameLower = (schemaName || '').toLowerCase();
            Object.entries(spec.components.examples).forEach(([key, entry]: [string, any]) => {
                const keyLower = key.toLowerCase();
                if (
                    schemaNameLower &&
                    (keyLower.includes(schemaNameLower) || schemaNameLower.includes(keyLower.replace(/example$/, '')))
                ) {
                    addExample(
                        key,
                        entry?.summary || key,
                        exampleValueOf(entry, spec),
                        entry?.summary,
                        entry?.description,
                    );
                }
            });
        }

        return list;
    }, [resolvedSchema, activeSchemaObj?.schema, activeSchemaObj?.schemaName, spec]);

    const activeModalSpecExample =
        schemaSpecExamples.find(ex => ex.key === (modalExampleKeys[activeModalIndex] || schemaSpecExamples[0]?.key)) ||
        schemaSpecExamples[0];

    const modalResolvedRoot = activeSchemaObj
        ? resolveReference(activeSchemaObj.schema) || activeSchemaObj.schema
        : null;
    const modalRootCombinator = modalResolvedRoot ? detectSchemaCombinator(modalResolvedRoot, resolveReference) : null;
    const modalComposition =
        modalRootCombinator?.meta.kind === 'allOf'
            ? describeAllOfComposition(modalResolvedRoot, resolveReference, getRefName)
            : null;
    const modalChoice = modalComposition ? null : modalRootCombinator;
    const modalSchemaKey = activeSchemaObj?.schemaName || '';
    const modalBranchCount = modalChoice?.branches?.length || 0;
    const modalOneOfIdx = Math.min(modalOneOfIndex[modalSchemaKey] ?? 0, Math.max(0, modalBranchCount - 1));
    const modalAnyOfStored = modalAnyOfSelected[modalSchemaKey] || [];
    const modalAnyOfEffective =
        modalChoice?.meta.kind === 'anyOf'
            ? modalAnyOfStored.length > 0 || modalAnyOfTouched[modalSchemaKey]
                ? modalAnyOfStored
                : modalChoice.branches.map((_: any, index: number) => index)
            : modalAnyOfStored;
    const asBranchSchema = (branch: any): any => {
        if (branch === null || branch === undefined) return {type: 'null'};
        if (branch === true || branch === false) return branch;
        return branch;
    };
    const modalAnyOfSchema =
        modalChoice?.meta.kind === 'anyOf'
            ? mergeAnyOfBranchSchemas(modalChoice.branches, modalAnyOfEffective, resolveReference, {
                  title: modalResolvedRoot?.title,
                  description: modalResolvedRoot?.description,
              })
            : null;
    const modalMatrixSchema = !activeSchemaObj
        ? null
        : modalComposition
          ? modalComposition.effective
          : modalAnyOfSchema
            ? modalAnyOfSchema
            : modalChoice?.meta.kind === 'oneOf'
              ? effectiveBranchSchema(asBranchSchema(modalChoice.branches[modalOneOfIdx]), resolveReference)
              : activeSchemaObj.schema;
    const modalEffectiveForViewer = modalMatrixSchema
        ? applySchemaBranchSelections(modalMatrixSchema, modalSelectionScopeKey, resolveReference)
        : modalMatrixSchema;

    // Hooks above this line must always run; empty stack has nothing to paint.
    if (!activeSchemaObj || !activeResolution) {
        return null;
    }

    return (
        <>
            <div
                className={`${backdropClassName} fixed inset-0 z-[1000] bg-black/40 backdrop-blur-[1px]`}
                onMouseDown={e => {
                    if (e.target === e.currentTarget) requestClose();
                }}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${activeSchemaObj.schemaName} schema`}
                    className="modal-surface modal-surface-tall w-full max-w-4xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl bg-[var(--surface)] border-[var(--border)]"
                >
                    <SchemaViewerHeader
                        active={activeSchemaObj}
                        stack={modals}
                        schemas={componentsSchemas}
                        specKey={parsableKey}
                        onShare={handleShareSchema}
                        onPop={onPopSchema}
                        onClose={requestClose}
                    />

                    <div className="modal-scroll-region p-4 sm:p-6 overflow-y-auto max-h-[calc(85vh-8rem)] font-sans scrollbar-thin">
                        {activeResolution.status !== 'resolved' && (
                            <div className="mb-4">
                                <ReferenceStatusNotice resolution={activeResolution} />
                            </div>
                        )}
                        {schemaDeclaresNothing(effectiveModalSchema) && (
                            <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs leading-relaxed border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]">
                                <i className="ph ph-info mt-0.5 text-[13px] text-[var(--primary)]" />
                                <span>
                                    This schema declares no properties and no constraints, so it accepts any value and
                                    adds nothing where it is composed.
                                </span>
                            </div>
                        )}
                        {effectiveModalSchema === true ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 text-xs">
                                <strong className="text-[var(--text-heading)]">Unrestricted schema</strong>
                                <p className="mt-1 text-[var(--text-muted)]">
                                    Any JSON value satisfies this boolean schema.
                                </p>
                            </div>
                        ) : effectiveModalSchema === false ? (
                            <div className="rounded-xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 p-5 text-xs">
                                <strong className="text-[var(--method-delete)]">Impossible schema</strong>
                                <p className="mt-1 text-[var(--text-muted)]">
                                    No JSON value satisfies this boolean schema.
                                </p>
                            </div>
                        ) : (
                            <SchemaViewer
                                spec={spec}
                                matrixSchema={modalMatrixSchema}
                                effectiveSchema={modalEffectiveForViewer}
                                contentSchema={activeSchemaObj.schema}
                                mediaType="application/json"
                                selectionScopeKey={modalSelectionScopeKey}
                                activeTab={activeTab}
                                onTabChange={setTab}
                                onPersistRepresentation={mode => {
                                    setModalRepresentation(activeSchemaObj.schemaName, mode);
                                    setActiveTabs({});
                                }}
                                specExamples={schemaSpecExamples.map(example => ({
                                    key: example.key,
                                    label: example.label,
                                    value: example.value,
                                    summary: example.summary,
                                    description: example.description,
                                }))}
                                activeSpecExampleKey={
                                    modalExampleKeys[activeModalIndex] || schemaSpecExamples[0]?.key || ''
                                }
                                onSpecExampleKeyChange={key =>
                                    setModalExampleKeys(prev => ({...prev, [activeModalIndex]: key}))
                                }
                                branchIndex={modalOneOfIdx}
                                onBranchIndexChange={index =>
                                    setModalOneOfIndex(prev => ({...prev, [modalSchemaKey]: index}))
                                }
                                anyOfSelectedIndices={modalAnyOfEffective}
                                onAnyOfSelectedIndicesChange={indices => {
                                    setModalAnyOfTouched(prev => ({...prev, [modalSchemaKey]: true}));
                                    setModalAnyOfSelected(prev => ({...prev, [modalSchemaKey]: indices}));
                                }}
                                allOfFocusIndex={
                                    modalSchemaKey in modalAllOfFocus ? modalAllOfFocus[modalSchemaKey] : null
                                }
                                onAllOfFocusIndexChange={index =>
                                    setModalAllOfFocus(prev => ({...prev, [modalSchemaKey]: index}))
                                }
                                inspectName={activeSchemaObj.schemaName}
                                onOpenSchema={onPushSchema}
                                onTestPattern={setPatternToTest}
                                usage="generic"
                            />
                        )}
                    </div>

                    <div className="px-6 py-3 text-[11px] flex justify-between border-t shrink-0 border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]">
                        <span>Indexed reference schemas</span>
                        <span>Stack Depth: {activeIndex + 1} nested level</span>
                    </div>
                </div>
            </div>

            <SchemaExampleModal
                visible={helpTransition.shouldRender}
                backdropClassName={helpTransition.backdropClassName}
                value={helpModalContent}
                onClose={helpTransition.requestClose}
            />

            {patternToTest && <PatternTesterModal pattern={patternToTest} onClose={() => setPatternToTest(null)} />}

            {shareModal && (
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            )}
        </>
    );
}
