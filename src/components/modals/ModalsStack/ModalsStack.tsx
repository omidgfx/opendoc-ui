import React, {useEffect, useState} from 'react';
import CodeViewer from '../../common/CodeViewer';
import SchemaPropertiesTable from '../../schema/SchemaPropertiesTable';
import {RECURSIVE_SCHEMA_ICON, schemaIsRecursive} from '../../../utils/schemaProperties';
import Markdown from '../../common/Markdown';
import PatternTesterModal from '../PatternTesterModal';
import CustomDropdown from '../../common/CustomDropdown';
import ShareModal from '../ShareModal';
import * as jsYaml from 'js-yaml';
import clsx from 'clsx';
import {useModalTransition} from '../../../hooks/useModalTransition';
import {useEscClose} from '../../../hooks/useEscClose';
import SchemaViewerHeader from './SchemaViewerHeader';
import SchemaExampleModal from './SchemaExampleModal';
import {
    getMockSnippet as generateMockSnippet,
    generateValidatedMock,
    prepareMockForAnnotation,
    extractMockLineMarkers,
    type MockLineMarker,
} from '../../../utils/runner/mockGenerator';
import {mockMarkersToLineMarkers, type CodeLineMarker} from '../../../utils/lineMarkers';
import type {OpenApiSpec} from '../../../types';
import {getRefName, resolveReference as resolveOpenApiReference, resolveReferenceResult} from '../../../utils/openapi';
import {absoluteRouteHref, toCleanRouteHref} from '../../../utils/routing';
import ReferenceStatusNotice from '../../common/ReferenceStatusNotice';
import {flattenSchemaProperties} from '../../../utils/schemaProperties';

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
    const [activeTabs, setActiveTabs] = useState<{
        [index: number]: 'table' | 'example' | 'enum';
    }>({});
    const [exampleEncodings, setExampleEncodings] = useState<Record<number, string>>({});
    const [patternToTest, setPatternToTest] = useState<string | null>(null);
    const [shareModal, setShareModal] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const {requestClose, backdropClassName} = useModalTransition(true, onCloseAll);
    const helpTransition = useModalTransition(!!helpModalContent, () => setHelpModalContent(null));
    useEscClose(!!helpModalContent, helpTransition.requestClose, !!helpModalContent);
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
    if (modals.length === 0) {
        return null;
    }
    const activeIndex = modals.length - 1;
    const activeModal = modals[activeIndex];
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
    const traverseSchemaProperties = (schema: any): Record<string, any> =>
        flattenSchemaProperties(schema, resolveReference);
    const renderSchemaType = (prop: any): React.ReactNode => {
        if (!prop) {
            return <span className="text-xs font-mono opacity-50">any</span>;
        }
        const renderTypeName = (tValue: any, format?: string) => {
            if (Array.isArray(tValue)) {
                return tValue.map(t => `${t}${format ? ` (${format})` : ''}`).join(' | ');
            }
            return `${tValue || 'any'}${format ? ` (${format})` : ''}`;
        };
        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            return (
                <button
                    onClick={() => onPushSchema(refName)}
                    className="text-[var(--primary)] hover:underline font-semibold text-xs text-left inline-flex items-center gap-1 cursor-pointer"
                >
                    <i className="ph ph-diamonds-four text-[10px]"></i> {refName}
                </button>
            );
        }
        if (prop.oneOf && Array.isArray(prop.oneOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-options)] uppercase tracking-wider font-sans">
                        One Of:
                    </span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.oneOf.map((sub: any, sIdx: number) => (
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && (
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">|</span>
                                )}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-put)] uppercase tracking-wider font-sans">
                        Any Of:
                    </span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.anyOf.map((sub: any, sIdx: number) => (
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && (
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">|</span>
                                )}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        }
        if (prop.allOf && Array.isArray(prop.allOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-sans">
                        All Of · every constraint applies:
                    </span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.allOf.map((sub: any, sIdx: number) => (
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && (
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">
                                        &amp;
                                    </span>
                                )}
                                {renderSchemaType(sub)}
                            </React.Fragment>
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
                            onClick={() => onPushSchema(refName)}
                            className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
                        >
                            {refName}
                        </button>
                        &gt;
                    </span>
                );
            }
            if (prop.items.oneOf || prop.items.anyOf) {
                return <span className="text-xs font-sans">Array&lt;{renderSchemaType(prop.items)}&gt;</span>;
            }
            const resolvedItemsType = Array.isArray(prop.items.type)
                ? prop.items.type.join(' | ')
                : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">Array&lt;{resolvedItemsType}&gt;</span>;
        }
        return <span className="font-mono text-xs text-[var(--text)]">{renderTypeName(prop.type, prop.format)}</span>;
    };
    const viewerSpec = {
        openapi: '3.1.1',
        info: {title: 'Schema viewer', version: '1'},
        paths: {},
        components: {schemas: componentsSchemas || {}},
    };
    const getMockSnippet = (schema: any): string => generateMockSnippet(schema, viewerSpec);
    const escapeXml = (value: unknown) =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    const toXml = (value: any, nodeName = 'root', depth = 0): string => {
        const indent = '  '.repeat(depth);
        const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
        if (value === null || value === undefined) return `${indent}<${safeName} />`;
        if (Array.isArray(value)) {
            return value.map(item => toXml(item, 'item', depth)).join('\n');
        }
        if (typeof value === 'object') {
            const children = Object.entries(value)
                .map(([key, child]) => toXml(child, key, depth + 1))
                .join('\n');
            return children
                ? `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>`
                : `${indent}<${safeName}></${safeName}>`;
        }
        return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    };
    const toPhpArray = (value: any, indentLevel = 0): string => {
        const pad = (n: number) => '    '.repeat(n);
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'string') {
            const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `'${escaped}'`;
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'bigint') return String(value);
        if (Array.isArray(value)) {
            if (value.length === 0) return '[]';
            const items = value.map(v => `${pad(indentLevel + 1)}${toPhpArray(v, indentLevel + 1)}`);
            return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
        }
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length === 0) return '[]';
            const items = keys.map(k => {
                const escapedKey = k.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `${pad(indentLevel + 1)}'${escapedKey}' => ${toPhpArray(value[k], indentLevel + 1)}`;
            });
            return `[\n${items.join(',\n')}\n${pad(indentLevel)}]`;
        }
        return 'null';
    };
    const formatSimulationExample = (
        schema: any,
        schemaName: string,
        encoding: string,
    ): {code: string; markers: MockLineMarker[]} => {
        const plain = (): {code: string; markers: MockLineMarker[]} => {
            const json = getMockSnippet(schema);
            let value: any;
            try {
                value = JSON.parse(json);
            } catch {
                value = json;
            }
            if (encoding === 'application/xml') {
                return {
                    code: `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, schemaName || 'root')}`,
                    markers: [],
                };
            }
            if (encoding === 'application/yaml')
                return {code: jsYaml.dump(value, {noRefs: true, lineWidth: 100}), markers: []};
            if (encoding === 'application/x-php-array') return {code: toPhpArray(value), markers: []};
            return {code: JSON.stringify(value, null, 2), markers: []};
        };
        const generated = generateValidatedMock(schema, viewerSpec);
        if (generated.value === undefined) return plain();
        try {
            const prepared = prepareMockForAnnotation(generated.value);
            const value: any = prepared.value;
            let raw: string;
            if (encoding === 'application/xml') {
                raw = `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, schemaName || 'root')}`;
            } else if (encoding === 'application/yaml') {
                raw = jsYaml.dump(value, {noRefs: true, lineWidth: 100});
            } else if (encoding === 'application/x-php-array') {
                raw = toPhpArray(value);
            } else {
                raw = JSON.stringify(value, null, 2);
            }
            return extractMockLineMarkers(raw, prepared);
        } catch {
            return plain();
        }
    };
    const activeSchemaObj = modals[modals.length - 1];
    const activeModalIndex = modals.length - 1;
    const activeResolution = resolveReferenceResult(activeSchemaObj.schema, spec);
    const resolvedSchema = activeResolution.value || activeSchemaObj.schema;
    const isEnum = resolvedSchema?.enum && Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0;
    const activeTab = activeTabs[activeModalIndex] || 'table';
    const activeExampleEncoding = exampleEncodings[activeModalIndex] || 'application/json';
    const simulationLanguage =
        activeExampleEncoding === 'application/xml'
            ? 'xml'
            : activeExampleEncoding === 'application/yaml'
              ? 'yaml'
              : activeExampleEncoding === 'application/x-php-array'
                ? 'php'
                : 'json';
    const setTab = (tab: 'table' | 'example' | 'enum') => {
        setActiveTabs(prev => ({
            ...prev,
            [activeModalIndex]: tab,
        }));
    };
    const properties = traverseSchemaProperties(activeSchemaObj.schema);
    const schemaIsRecursiveView = schemaIsRecursive(activeSchemaObj.schema, resolveReference);
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
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex w-fit rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                                <button
                                    onClick={() => setTab('table')}
                                    className={clsx(
                                        'rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                                        activeTab === 'table'
                                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold'
                                            : 'hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    <i className="ph ph-table mr-1 text-[10px]" /> Scope Table
                                </button>
                                {isEnum && (
                                    <button
                                        onClick={() => setTab('enum')}
                                        className={clsx(
                                            'rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                                            activeTab === 'enum'
                                                ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold'
                                                : 'hover:bg-[var(--surface-hover)]',
                                        )}
                                    >
                                        <i className="ph ph-list-numbers mr-1 text-[10px]" /> Enum Values
                                    </button>
                                )}
                                <button
                                    onClick={() => setTab('example')}
                                    className={clsx(
                                        'rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                                        activeTab === 'example'
                                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold'
                                            : 'hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    <i className="ph ph-dna mr-1 text-[10px]" /> Unified Simulation Example
                                </button>
                            </div>

                            {activeTab === 'example' && (
                                <div className="flex min-w-[245px] items-center gap-2 animate-fade-in">
                                    <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        Encoding type
                                    </span>
                                    <CustomDropdown
                                        value={activeExampleEncoding}
                                        onChange={encoding =>
                                            setExampleEncodings(current => ({
                                                ...current,
                                                [activeModalIndex]: encoding,
                                            }))
                                        }
                                        options={[
                                            {value: 'application/json', label: 'application/json'},
                                            {value: 'application/xml', label: 'application/xml'},
                                            {value: 'application/yaml', label: 'application/yaml'},
                                            {value: 'application/x-php-array', label: 'PHP array'},
                                        ]}
                                        icon="ph ph-code-block text-[13px]"
                                        className="min-w-[170px]"
                                    />
                                </div>
                            )}
                        </div>
                        {(activeSchemaObj.schema?.description || activeSchemaObj.schema?.externalDocs) && (
                            <div className="mb-4 p-3 rounded-lg border text-xs leading-relaxed space-y-3 bg-[var(--background)] border-[var(--border)]">
                                {activeSchemaObj.schema?.description && (
                                    <div>
                                        <p className="font-semibold mb-1 text-[var(--text-heading)]">Description:</p>
                                        <div>
                                            <Markdown text={activeSchemaObj.schema.description} />
                                        </div>
                                    </div>
                                )}
                                {activeSchemaObj.schema?.externalDocs && activeSchemaObj.schema.externalDocs.url && (
                                    <div className="pt-2 border-t border-[var(--border)]">
                                        <p className="font-semibold mb-1 text-[var(--text-heading)]">
                                            External Reference Docs:
                                        </p>
                                        <a
                                            href={activeSchemaObj.schema.externalDocs.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20 rounded cursor-pointer transition-colors"
                                        >
                                            <i className="ph ph-arrow-square-out text-[8.5px]"></i>
                                            <span>
                                                {activeSchemaObj.schema.externalDocs.description ||
                                                    'Open External Documentation'}
                                            </span>
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSchemaObj.schema === true ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 text-xs">
                                <strong className="text-[var(--text-heading)]">Unrestricted schema</strong>
                                <p className="mt-1 text-[var(--text-muted)]">
                                    Any JSON value satisfies this boolean schema.
                                </p>
                            </div>
                        ) : activeSchemaObj.schema === false ? (
                            <div className="rounded-xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 p-5 text-xs">
                                <strong className="text-[var(--method-delete)]">Impossible schema</strong>
                                <p className="mt-1 text-[var(--text-muted)]">
                                    No JSON value satisfies this boolean schema.
                                </p>
                            </div>
                        ) : activeTab === 'example' ? (
                            <div className="space-y-2 animate-in fade-in" key={activeExampleEncoding}>
                                {schemaIsRecursiveView && (
                                    <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                        <i className={`${RECURSIVE_SCHEMA_ICON} mt-0.5 shrink-0 text-[12px]`} />
                                        <span>
                                            This schema references itself recursively. The example is generated from the
                                            guarded view — nested self-references stop at the first cycle.
                                        </span>
                                    </div>
                                )}
                                {(() => {
                                    const simulation = formatSimulationExample(
                                        activeSchemaObj.schema,
                                        activeSchemaObj.schemaName,
                                        activeExampleEncoding,
                                    );
                                    return (
                                        <CodeViewer
                                            code={simulation.code}
                                            language={simulationLanguage}
                                            maxHeight="none"
                                            lineMarkers={mockMarkersToLineMarkers(simulation.markers, {
                                                onOpenSchema: onPushSchema,
                                                onTestPattern: setPatternToTest,
                                            })}
                                        />
                                    );
                                })()}
                            </div>
                        ) : activeTab === 'enum' && isEnum ? (
                            <div className="flex flex-wrap gap-2 p-3 rounded-xl border animate-in fade-in border-[var(--border)] bg-[var(--background)]">
                                {resolvedSchema.enum.map((val: any) => (
                                    <span
                                        key={val}
                                        className="px-2.5 py-1 rounded-lg text-xs font-mono border bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
                                    >
                                        {JSON.stringify(val)}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in">
                                {activeSchemaObj.schema?.type && (
                                    <div className="text-xs font-mono">
                                        <span className="font-sans font-semibold mr-1 text-[var(--text-heading)]">
                                            Base Type:
                                        </span>
                                        <span className="px-2 py-0.5 rounded text-[11px] border bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]">
                                            {activeSchemaObj.schema.type}
                                        </span>
                                    </div>
                                )}

                                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    Properties
                                </h4>
                                <SchemaPropertiesTable
                                    properties={properties}
                                    schema={activeSchemaObj.schema}
                                    inspectName={activeSchemaObj.schemaName}
                                    resolveReference={resolveReference}
                                    getRefName={getRefName}
                                    onPushSchema={onPushSchema}
                                    onViewExample={(name, subSchema) => {
                                        const example = formatSimulationExample(subSchema, name, 'application/json');
                                        setHelpModalContent({
                                            title: `${name} Simulated Example`,
                                            content: example.code,
                                            isJson: true,
                                            lineMarkers: mockMarkersToLineMarkers(example.markers, {
                                                onOpenSchema: schemaName => {
                                                    helpTransition.requestClose();
                                                    onPushSchema(schemaName);
                                                },
                                                onTestPattern: setPatternToTest,
                                            }),
                                        });
                                    }}
                                    onTestPattern={setPatternToTest}
                                />
                            </div>
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
