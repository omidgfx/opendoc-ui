import React, {useEffect, useRef, useState} from 'react';
import {ActiveAuth, OpenApiSpec, Operation} from '../../../types';
import Markdown from '../../common/Markdown';
import CodeViewer from '../../common/CodeViewer';
import SchemaPropertiesTable from '../../schema/SchemaPropertiesTable';
import PatternTesterModal from '../../modals/PatternTesterModal';
import MethodBadge from '../../common/MethodBadge';
import PatternPreview from '../../common/PatternPreview';
import {expandServerUrl} from '../../../utils/specification/serverResolver';
import CustomDropdown from '../../common/CustomDropdown';
import clsx from 'clsx';
import ShareModal from '../../modals/ShareModal';
import {useModalShortcuts} from '../../../hooks/useModalShortcuts';
import {useModalTransition} from '../../../hooks/useModalTransition';
import EndpointInfoModal from './EndpointInfoModal';
import ResponseCodeNavigator from './ResponseCodeNavigator';
import ResponseCodeSheet from './ResponseCodeSheet';
import {useVisibleResponseCode} from '@/src/hooks/useVisibleResponseCode';
import {createResponseExampleHelpers} from '@/src/utils/endpoint/responseExamples';
import {resolveRequestBodySource} from '@/src/utils/endpoint/requestBodySource';
import {usePreferences} from '@/src/contexts/PreferencesContext';
import AdaptiveTabStrip from '../../common/AdaptiveTabStrip';
import ScrollableRow from '../../common/ScrollableRow';
import OverflowActionsMenu from '../../common/OverflowActionsMenu';
import CardOrTable, {CARD_LAYOUT_WIDTH, COMPACT_CARD_LAYOUT_WIDTH} from '../../common/CardOrTable';
import DataCard, {RequiredBadge} from '../../common/DataCard';
import CombinatorLabel from '../../common/CombinatorLabel';
import {describeAllOfComposition, detectSchemaCombinator} from '@/src/utils/schema/combinators';
import AllOfCompositionNote from '@/src/components/schema/AllOfCompositionNote';
import {buildFormSkeleton, describeRequestBody, formSkeletonSnippet} from '@/src/utils/endpoint/requestBodyShape';
import {exampleLanguageFor, formatExample} from '@/src/utils/endpoint/exampleFormatting';
import {endpointRepresentationOf} from '@/src/utils/storage/preferences';
import {groupParameters, parameterGroupMetaOf} from '@/src/utils/endpoint/parameterGroups';
import ParameterLocationTag from '../../common/ParameterLocationTag';
import SerializationTag from '../../common/SerializationTag';
import SerializerPlaygroundModal from '../../modals/SerializerPlaygroundModal';
import {describeParameterSerialization} from '@/src/utils/endpoint/parameterSerialization';
import DescriptionTip from '../ExamineTab/recursive/DescriptionTip';
import {usesDescriptionTooltip} from '@/src/utils/runner/recursiveBody';
import {mockMarkersToLineMarkers, type CodeLineMarker} from '@/src/utils/lineMarkers';
import {useSchemaViewer} from '@/src/hooks/useSchemaViewer';
import {Tip} from '../../common/Tooltip';
import {useBreakpoint} from '../../../hooks/useBreakpoint';
import {specStorage, storage} from '../../../utils/storage/index';
import {
    getMergedParameters,
    getRefName,
    resolveReference as resolveOpenApiReference,
    resolveRequestBody,
} from '../../../utils/openapi';
import {isOperationAuthenticated, isOperationProtected} from '../../../utils/runner/auth';
import {flattenSchemaProperties, schemaVariantLabel} from '../../../utils/schemaProperties';

interface ViewTabProps {
    key: any;
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    onOpenSchemaModal: (schemaName: string) => void;
    activeAuth: ActiveAuth;
    selectedServer: string;
    serverVariables?: Record<string, string>;
    activeResponseCode?: string | null;
    onSelectResponseCode?: (code: string | null) => void;
    parsableKey?: string;
    isActive?: boolean;
}

interface FlatProperty {
    name: string;
    typeNode: React.ReactNode;
    description: string;
    isRequired: boolean;
    rawProp?: any;
}

const getPatternFromParam = (param: any, spec: OpenApiSpec | null): string | null => {
    if (!param) return null;
    if (param.pattern) return param.pattern;
    if (param.schema?.pattern) return param.schema.pattern;
    if (param.schema?.$ref) {
        const refSchema = resolveOpenApiReference(param.schema, spec);
        if (refSchema?.pattern) return refSchema.pattern;
        if (refSchema?.schema?.pattern) return refSchema.schema.pattern;
    }
    return null;
};
export default function ViewTab({
    spec,
    path,
    method,
    operation,
    onOpenSchemaModal,
    activeAuth,
    selectedServer,
    serverVariables,
    activeResponseCode,
    onSelectResponseCode,
    parsableKey = '',
    isActive = true,
}: ViewTabProps) {
    const {preferences, setEndpointRepresentation} = usePreferences();
    const representationKey = `${method.toLowerCase()}:${path}`;
    const endpointRepresentation = endpointRepresentationOf(preferences, representationKey);
    const [copiedPath, setCopiedPath] = useState(false);
    const [copiedFullUrl, setCopiedFullUrl] = useState(false);
    const [exampleModalContent, setExampleModalContent] = useState<{
        title: string;
        content: string;
        lineMarkers?: CodeLineMarker[];
    } | null>(null);
    const exampleTransition = useModalTransition(!!exampleModalContent, () => setExampleModalContent(null));
    const [patternToTest, setPatternToTest] = useState<string | null>(null);
    const [serializerParameter, setSerializerParameter] = useState<any | null>(null);
    const [shareModal, setShareModal] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const [responseActiveTab, setResponseActiveTab] = useState<{
        [code: string]: 'example' | 'schema' | 'enum';
    }>({});
    // Enum is a peek at the values, not a representation the reader chose to
    // keep: it lasts for this visit only and never touches the preference.
    useEffect(() => {
        setResponseActiveTab({});
    }, [representationKey, endpointRepresentation]);
    const [responseContentTypes, setResponseContentTypes] = useState<{
        [code: string]: string;
    }>({});
    const [requestBodyContentType, setRequestBodyContentType] = useState('');
    const [requestBodyVariant, setRequestBodyVariant] = useState(0);
    const responseCodes = Object.keys(operation.responses || {});
    const [navigatorActiveCode, setNavigatorActiveCode] = useState<string | null>(() =>
        activeResponseCode && responseCodes.includes(activeResponseCode)
            ? activeResponseCode
            : responseCodes.find(code => code.startsWith('2')) || null,
    );
    const [responseScrollTailHeight, setResponseScrollTailHeight] = useState(0);
    const [collapsedResponses, setCollapsedResponses] = useState<{
        [code: string]: boolean;
    }>(() => {
        const initial: {
            [code: string]: boolean;
        } = {};
        if (operation.responses) {
            Object.keys(operation.responses).forEach(code => {
                initial[code] = !code.startsWith('2');
            });
        }
        return initial;
    });
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const responseHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deepLinkHandledRef = useRef('');
    const responseInteractionCodeRef = useRef<string | null>(null);
    const scrollResponseToTop = (code: string, behavior: ScrollBehavior) => {
        const container = scrollContainerRef.current;
        const response = document.getElementById(`response-${code}`);
        if (!container || !response) return;
        const top =
            response.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
        container.scrollTo({top: Math.max(0, top), behavior});
    };
    const requiredTailHeightForTopAlignment = (code: string): number => {
        const container = scrollContainerRef.current;
        const response = document.getElementById(`response-${code}`);
        if (!container || !response) return 0;
        const targetTop =
            response.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        const requiredScrollTop = Math.max(0, targetTop - 16);
        const currentMaximum = Math.max(0, container.scrollHeight - container.clientHeight);
        return Math.ceil(Math.max(0, requiredScrollTop - currentMaximum));
    };
    const highlightDeepLinkedResponse = (code: string) => {
        const response = document.getElementById(`response-${code}`);
        if (!response) return;
        response.classList.remove('ring-2', 'ring-[var(--primary)]', 'response-flash');
        void response.offsetWidth;
        response.classList.add('ring-2', 'ring-[var(--primary)]', 'response-flash');
        if (responseHighlightTimerRef.current) clearTimeout(responseHighlightTimerRef.current);
        responseHighlightTimerRef.current = setTimeout(() => {
            response.classList.remove('ring-2', 'ring-[var(--primary)]', 'response-flash');
            responseHighlightTimerRef.current = null;
        }, 1100);
    };
    useEffect(() => {
        if (!activeResponseCode || !operation.responses?.[activeResponseCode]) return;
        setNavigatorActiveCode(activeResponseCode);
        const hashCode = (() => {
            if (typeof window === 'undefined') return '';
            const match = window.location.hash.match(/#response-([^#?&]+)/);
            if (!match) return '';
            try {
                return decodeURIComponent(match[1]);
            } catch {
                return match[1];
            }
        })();
        const deepLinkKey = `${activeResponseCode}:${typeof window === 'undefined' ? '' : window.location.hash}`;
        const isDirectResponseInteraction = responseInteractionCodeRef.current === activeResponseCode;
        responseInteractionCodeRef.current = null;
        const isNewDeepLink =
            !isDirectResponseInteraction &&
            hashCode === activeResponseCode &&
            deepLinkHandledRef.current !== deepLinkKey;
        if (!isNewDeepLink) {
            setResponseScrollTailHeight(0);
            setCollapsedResponses(previous => ({...previous, [activeResponseCode]: false}));
            return;
        }
        deepLinkHandledRef.current = deepLinkKey;
        setCollapsedResponses(Object.fromEntries(responseCodes.map(code => [code, code !== activeResponseCode])));
        let innerFrame: number | null = null;
        const outerFrame = requestAnimationFrame(() => {
            setResponseScrollTailHeight(requiredTailHeightForTopAlignment(activeResponseCode));
            innerFrame = requestAnimationFrame(() => {
                scrollResponseToTop(activeResponseCode, 'auto');
                highlightDeepLinkedResponse(activeResponseCode);
            });
        });
        return () => {
            cancelAnimationFrame(outerFrame);
            if (innerFrame !== null) cancelAnimationFrame(innerFrame);
        };
    }, [activeResponseCode, operation.responses]);
    useEffect(
        () => () => {
            if (responseHighlightTimerRef.current) clearTimeout(responseHighlightTimerRef.current);
        },
        [],
    );
    const openAndScrollToResponse = (code: string) => {
        // Route serialization is delayed, so an interaction may briefly share the previous hash.
        responseInteractionCodeRef.current = code;
        setResponseScrollTailHeight(0);
        setCollapsedResponses(prev => ({...prev, [code]: false}));
        setNavigatorActiveCode(code);
        onSelectResponseCode?.(code);
        requestAnimationFrame(() => scrollResponseToTop(code, 'smooth'));
    };
    const toggleResponse = (code: string) => {
        if (collapsedResponses[code] ?? true) {
            openAndScrollToResponse(code);
            return;
        }
        setResponseScrollTailHeight(0);
        setCollapsedResponses(prev => ({...prev, [code]: true}));
        if (navigatorActiveCode === code) {
            setNavigatorActiveCode(
                responseCodes.find(candidate => candidate !== code && !collapsedResponses[candidate]) || null,
            );
        }
        onSelectResponseCode?.(null);
    };
    const expandedResponseCodes = new Set(responseCodes.filter(code => !collapsedResponses[code]));
    // Purely observational: the pill follows the response being read without
    // opening, collapsing or navigating anything.
    const visibleResponseCode = useVisibleResponseCode(scrollContainerRef, responseCodes, isMobile);
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || isMobile) return;
        let frame: number | null = null;
        const updateActiveResponse = () => {
            frame = null;
            const containerRect = container.getBoundingClientRect();
            const expanded = responseCodes.filter(code => !collapsedResponses[code]);
            if (expanded.length === 0) return;
            let reached: string | undefined;
            const probe = container.scrollTop + 24;
            for (const code of expanded) {
                const response = document.getElementById(`response-${code}`);
                if (!response) continue;
                const top = response.getBoundingClientRect().top - containerRect.top + container.scrollTop;
                if (top <= probe) reached = code;
                else break;
            }
            if (container.scrollHeight - container.scrollTop - container.clientHeight <= 8) {
                reached = expanded.at(-1);
            }
            if (reached) setNavigatorActiveCode(current => (current === reached ? current : reached));
        };
        const onScroll = () => {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updateActiveResponse);
        };
        container.addEventListener('scroll', onScroll, {passive: true});
        frame = requestAnimationFrame(updateActiveResponse);
        return () => {
            container.removeEventListener('scroll', onScroll);
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [collapsedResponses, isMobile, operation.responses]);
    const scrollStorageKey = specStorage.key(parsableKey || 'default', `scroll:${method.toLowerCase()}:${path}`);
    const initialResponseCodeRef = useRef(activeResponseCode);
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        if (initialResponseCodeRef.current) return;
        const saved = storage.get(scrollStorageKey);
        if (saved) {
            const top = parseInt(saved, 10);
            if (Number.isFinite(top) && top > 0) {
                requestAnimationFrame(() => {
                    el.scrollTop = top;
                });
            }
        }
    }, []);
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        let raf: number | null = null;
        const onScroll = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                storage.set(scrollStorageKey, String(el.scrollTop));
            });
        };
        el.addEventListener('scroll', onScroll, {passive: true});
        return () => {
            el.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [scrollStorageKey]);
    useEffect(() => {
        if (!isActive) return;
        const codes = Object.keys(operation.responses || {});
        if (codes.length === 0) return;
        const handler = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            e.preventDefault();
            const currentCode = activeResponseCode && codes.includes(activeResponseCode) ? activeResponseCode : null;
            const currentIdx = currentCode ? codes.indexOf(currentCode) : -1;
            const goingDown = e.key === 'ArrowDown';
            let nextIdx: number;
            if (currentIdx === -1) nextIdx = goingDown ? 0 : codes.length - 1;
            else nextIdx = goingDown ? (currentIdx + 1) % codes.length : (currentIdx - 1 + codes.length) % codes.length;
            const nextCode = codes[nextIdx];
            if (!e.shiftKey && currentCode) {
                setCollapsedResponses(prev => ({...prev, [currentCode]: true}));
            }
            if (onSelectResponseCode) onSelectResponseCode(nextCode);
            else {
                setCollapsedResponses(prev => ({...prev, [nextCode]: false}));
                const el = document.getElementById(`response-${nextCode}`);
                el?.scrollIntoView({behavior: 'auto', block: 'center'});
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isActive, operation.responses, activeResponseCode, onSelectResponseCode]);
    useModalShortcuts({isOpen: !!exampleModalContent, onClose: exampleTransition.requestClose});
    const getBaseUrlWithoutResponse = () =>
        typeof window === 'undefined' ? '' : window.location.href.split('#response-')[0];
    const getEndpointShareUrl = () => getBaseUrlWithoutResponse();
    const getResponseShareUrl = (code: string) => `${getBaseUrlWithoutResponse()}#response-${code}`;
    const handleShareEndpoint = () =>
        setShareModal({
            url: getEndpointShareUrl(),
            title: `${method.toUpperCase()} ${path} - ${operation.summary || 'API Endpoint'}`,
            description: operation.description
                ? operation.description.slice(0, 200)
                : operation.summary || `Endpoint ${method.toUpperCase()} ${path}`,
        });
    const handleShareResponse = (code: string, resp: any, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setShareModal({
            url: getResponseShareUrl(code),
            title: `${method.toUpperCase()} ${path} - Response ${code}`,
            description: resp?.description || `Response ${code} for ${method.toUpperCase()} ${path}`,
        });
    };
    const {
        viewerExampleSchemas,
        viewerExampleNames,
        resolveReference,
        renderSchemaButton,
        renderSchemaTypeExample,
        getDefaultViewerSchema,
        resetViewerSchema,
    } = useSchemaViewer(spec, onOpenSchemaModal);
    const resolveProperties = (schema: any): Record<string, any> => flattenSchemaProperties(schema, resolveReference);
    const renderSchemaPropertiesTable = (schema: any, inspectName?: string | null) => {
        if (schema === undefined || schema === null) return null;
        const properties = resolveProperties(schema);
        return (
            <SchemaPropertiesTable
                properties={properties}
                schema={schema}
                resolveReference={resolveReference}
                getRefName={getRefName}
                onPushSchema={onOpenSchemaModal}
                inspectName={inspectName ?? null}
                onViewExample={(name, subSchema) => {
                    const example = getMockSnippetWithMarkers(subSchema);
                    setExampleModalContent({
                        title: `${name} Simulated Example`,
                        content: example.code,
                        lineMarkers: mockMarkersToLineMarkers(example.markers, {
                            onOpenSchema: schemaName => {
                                exampleTransition.requestClose();
                                onOpenSchemaModal(schemaName);
                            },
                            onTestPattern: setPatternToTest,
                        }),
                    });
                }}
                onTestPattern={setPatternToTest}
                useModal={true}
            />
        );
    };
    const {
        getMockSnippetWithMarkers,
        getSchemaDisplayName,
        getLanguageForContentType,
        getResponseExampleSnippetWithMarkers,
        humanizeSchemaName,
        getSchemaNamesFromResponse,
    } = createResponseExampleHelpers(spec);
    /* ---------- Example column rendering (Request Parameters) ---------- */
    const exampleEntryValue = (entry: any): unknown => {
        if (entry && typeof entry === 'object') {
            if ('value' in entry) return entry.value;
            if ('dataValue' in entry) return entry.dataValue;
            if ('serializedValue' in entry) return entry.serializedValue;
            if ('externalValue' in entry) return entry.externalValue;
            if ('externalDataValue' in entry) return entry.externalDataValue;
        }
        return entry;
    };
    const safeStringify = (value: unknown, space?: number): string => {
        try {
            const text = JSON.stringify(value, null, space);
            if (text !== undefined) return text;
        } catch {}
        return String(value);
    };
    /* every place a parameter example can legally live, in priority order:
       explicit example, named examples, content-based parameters, then the
       (resolved) schema's example / examples list / default */
    const collectParameterExamples = (
        param: any,
    ): {entries: Array<{label?: string; value: unknown}>; isDefault: boolean} => {
        const named = (map: Record<string, any>) =>
            Object.entries(map).map(([key, entry]) => ({
                label: entry?.summary || key,
                value: exampleEntryValue(entry),
            }));
        if (param.example !== undefined) return {entries: [{value: param.example}], isDefault: false};
        if (param.examples && typeof param.examples === 'object' && Object.keys(param.examples).length > 0)
            return {entries: named(param.examples), isDefault: false};
        const contentObj: any =
            param.content && typeof param.content === 'object' ? Object.values(param.content)[0] : null;
        if (contentObj && typeof contentObj === 'object') {
            if (contentObj.example !== undefined) return {entries: [{value: contentObj.example}], isDefault: false};
            if (
                contentObj.examples &&
                typeof contentObj.examples === 'object' &&
                Object.keys(contentObj.examples).length > 0
            )
                return {entries: named(contentObj.examples), isDefault: false};
            if (contentObj.schema?.example !== undefined)
                return {entries: [{value: contentObj.schema.example}], isDefault: false};
        }
        const schema = param.schema ? resolveReference(param.schema) || param.schema : null;
        if (schema?.example !== undefined) return {entries: [{value: schema.example}], isDefault: false};
        if (Array.isArray(schema?.examples) && schema.examples.length > 0)
            return {
                entries: schema.examples.map((value: unknown, index: number) => ({
                    label: schema.examples.length > 1 ? `Example ${index + 1}` : undefined,
                    value,
                })),
                isDefault: false,
            };
        if (schema?.default !== undefined) return {entries: [{value: schema.default}], isDefault: true};
        return {entries: [], isDefault: false};
    };
    const viewExampleButtonClass =
        'inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] font-bold border border-[var(--primary)]/20 text-[10px] cursor-pointer transition-all select-none w-fit shrink-0';
    const renderExampleValue = (param: any, value: unknown, muted = false) => {
        const chipClass = muted
            ? 'text-[10px] px-1 py-0.5 rounded bg-[var(--background)] border text-[var(--text-muted)] font-mono select-all w-fit break-all'
            : 'text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--method-get)]/30 text-[var(--method-get)] font-mono select-all break-all';
        const isComplex = value !== null && typeof value === 'object';
        const text = isComplex ? safeStringify(value) : value === null ? 'null' : String(value);
        /* short values inline (objects as compact JSON); anything bulky opens
           the example modal, mirroring the schema table's View Example */
        if (text.length <= (isComplex ? 60 : 120)) return <code className={chipClass}>{text}</code>;
        return (
            <button
                type="button"
                onClick={() =>
                    setExampleModalContent({
                        title: `${param.name} Example`,
                        content: isComplex ? safeStringify(value, 4) : text,
                    })
                }
                className={viewExampleButtonClass}
            >
                <i className="ph ph-eye text-[9px]"></i> View Example
            </button>
        );
    };
    const renderParameterExample = (param: any) => {
        const {entries, isDefault} = collectParameterExamples(param);
        if (entries.length === 0) return <span className="text-[var(--text-muted)] italic text-[10px]">None</span>;
        if (isDefault)
            return (
                <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold select-none text-[var(--text-muted)]">Default:</span>
                    {renderExampleValue(param, entries[0].value, true)}
                </div>
            );
        if (entries.length === 1) return renderExampleValue(param, entries[0].value);
        const allInline =
            entries.length <= 3 &&
            entries.every(entry => {
                const complex = entry.value !== null && typeof entry.value === 'object';
                return (complex ? safeStringify(entry.value) : String(entry.value)).length <= 40;
            });
        if (allInline)
            return (
                <div className="flex flex-col items-start gap-1">
                    {entries.map((entry, index) => (
                        <div key={index} className="flex items-center gap-1.5 min-w-0">
                            {renderExampleValue(param, entry.value)}
                            {entry.label && (
                                <span className="text-[9px] select-none text-[var(--text-muted)] truncate max-w-32">
                                    {entry.label}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            );
        return (
            <button
                type="button"
                onClick={() =>
                    setExampleModalContent({
                        title: `${param.name} Examples`,
                        content: safeStringify(
                            Object.fromEntries(
                                entries.map((entry, index) => [entry.label || `example ${index + 1}`, entry.value]),
                            ),
                            4,
                        ),
                    })
                }
                className={viewExampleButtonClass}
            >
                <i className="ph ph-eye text-[9px]"></i> View {entries.length} Examples
            </button>
        );
    };
    const pathItem = spec.paths[path] || {};
    const mergedParameters = getMergedParameters(pathItem, operation, spec);
    const resolvedRequestBody = resolveRequestBody(operation.requestBody, spec);
    const parameterGroups = groupParameters(mergedParameters);
    const separatedParameterTables = preferences.parameterTableLayout === 'separated';
    const cardParameterTables = preferences.narrowTableLayout === 'cards';
    const requestBodySource = resolveRequestBodySource(operation, spec, requestBodyContentType, requestBodyVariant);
    const requestBodyContentEntries = requestBodySource.mediaTypes.map(
        contentType => [contentType, resolvedRequestBody?.content?.[contentType]] as [string, any],
    );
    const selectedRequestBodyContentType = requestBodySource.mediaType;
    const selectedRequestBodyContent = requestBodySource.content;
    // Every polymorphism keyword gets the same rail, including allOf, whose
    // branches are constraints the reader still wants to inspect one by one.
    const resolvedRequestBodySchema = requestBodySource.schema
        ? resolveReference(requestBodySource.schema) || requestBodySource.schema
        : null;
    const requestBodyCombinator = detectSchemaCombinator(resolvedRequestBodySchema);
    // allOf composes rather than offers alternatives: the reader gets the one
    // object it assembles, with a note saying which parts it came from.
    const requestBodyComposition =
        requestBodyCombinator?.meta.kind === 'allOf'
            ? describeAllOfComposition(resolvedRequestBodySchema, resolveReference, getRefName)
            : null;
    const requestBodyChoice = requestBodyComposition ? null : requestBodyCombinator;
    const requestBodyBranchIndex = requestBodyChoice
        ? Math.min(requestBodyVariant, requestBodyChoice.branches.length - 1)
        : 0;
    const requestBodyMatrixSchema = requestBodyComposition
        ? requestBodyComposition.effective
        : requestBodyChoice
          ? requestBodyChoice.branches[requestBodyBranchIndex]
          : requestBodySource.schema;
    const requestBodyExample = requestBodySource.example;
    const requestBodyShape = describeRequestBody(selectedRequestBodyContentType, requestBodyMatrixSchema);
    const requestBodyFormFields =
        requestBodyShape.kind === 'form' || requestBodyShape.kind === 'multipart'
            ? buildFormSkeleton(requestBodyMatrixSchema, spec, selectedRequestBodyContent?.encoding)
            : [];
    const requestBodyFormSnippet = formSkeletonSnippet(requestBodyFormFields, requestBodyShape.kind);
    const renderParameterCard = (param: any, index: number, showLocation: boolean) => {
        const pattern = getPatternFromParam(param, spec);
        const paramGroup = parameterGroupMetaOf(param);
        return (
            <DataCard
                key={index}
                title={
                    <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-[var(--text-heading)]">{param.name}</span>
                        {showLocation && paramGroup && <ParameterLocationTag group={paramGroup} />}
                    </span>
                }
                badge={<RequiredBadge required={!!param.required} />}
                subtitle={param.description}
                facts={[
                    {
                        label: 'Schema',
                        value: (
                            <span className="flex flex-col items-start gap-1">
                                {renderSchemaButton(param.schema)}
                                <SerializationTag
                                    descriptor={describeParameterSerialization(param)}
                                    onOpenPlayground={() => setSerializerParameter(param)}
                                />
                                {pattern && (
                                    <PatternPreview
                                        pattern={pattern}
                                        showLabel
                                        onTest={() => setPatternToTest(pattern)}
                                    />
                                )}
                            </span>
                        ),
                    },
                    {label: 'Example', value: renderParameterExample(param)},
                ]}
            />
        );
    };
    const renderParameterTable = (
        title: string,
        params: any[],
        showLocation: boolean,
        group?: ReturnType<typeof parameterGroupMetaOf>,
    ) => (
        <div key={title} className="@container space-y-3 min-w-0">
            <h2 className="flex items-center text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {group ? <ParameterLocationTag group={group} variant="heading" /> : title}
            </h2>
            <div className="border rounded-2xl overflow-hidden animate-in fade-in border-[var(--border)] bg-[var(--surface)] min-w-0">
                {/* A table needs room; below that the same rows read as cards. */}
                <CardOrTable
                    preferCards={cardParameterTables}
                    maxWidth={CARD_LAYOUT_WIDTH}
                    cards={() => (
                        <div className="space-y-2 p-2">
                            {params.map((param, index) => renderParameterCard(param, index, showLocation))}
                        </div>
                    )}
                    table={() => (
                        <div className="overflow-x-auto scrollbar-thin">
                            <table className="w-full text-left border-collapse" style={{minWidth: 560}}>
                                <thead>
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">
                                            Parameter Name
                                        </th>
                                        {showLocation && (
                                            <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">
                                                Location
                                            </th>
                                        )}
                                        <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">
                                            Schema / Pattern
                                        </th>
                                        <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">
                                            Example
                                        </th>
                                        <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">
                                            Required
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {params.map((param, idx) => {
                                        const pattern = getPatternFromParam(param, spec);
                                        return (
                                            <tr
                                                key={idx}
                                                className="hover:bg-[var(--surface-hover)] transition-colors border-b border-[var(--border)]"
                                            >
                                                <td className="px-4 py-3 text-xs align-top">
                                                    <div className="flex items-start flex-wrap gap-1">
                                                        <span className="font-mono font-bold text-[var(--text-heading)]">
                                                            {param.name}
                                                        </span>
                                                        {param.description &&
                                                            usesDescriptionTooltip(param.description) && (
                                                                <DescriptionTip
                                                                    fieldLabel={param.name}
                                                                    documents={[{text: param.description}]}
                                                                />
                                                            )}
                                                    </div>
                                                    {param.description &&
                                                        !usesDescriptionTooltip(param.description) && (
                                                            <p className="text-[10px] mt-0.5 leading-normal max-w-md break-words text-[var(--text-muted)]">
                                                                {param.description}
                                                            </p>
                                                        )}
                                                </td>
                                                {showLocation && (
                                                    <td className="px-4 py-3 text-xs select-none">
                                                        {(() => {
                                                            const paramGroup = parameterGroupMetaOf(param);
                                                            return paramGroup ? (
                                                                <ParameterLocationTag group={paramGroup} />
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">
                                                                    {param.in}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-xs">
                                                    <div className="flex flex-col items-start gap-1">
                                                        <div>{renderSchemaButton(param.schema)}</div>
                                                        <SerializationTag
                                                            descriptor={describeParameterSerialization(param)}
                                                            onOpenPlayground={() => setSerializerParameter(param)}
                                                        />
                                                        {pattern && (
                                                            <PatternPreview
                                                                pattern={pattern}
                                                                showLabel
                                                                onTest={() => setPatternToTest(pattern)}
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs">{renderParameterExample(param)}</td>
                                                <td className="px-4 py-3 text-xs select-none">
                                                    {param.required ? (
                                                        <span className="text-[var(--method-delete)] font-bold text-xs">
                                                            Yes
                                                        </span>
                                                    ) : (
                                                        <span>No</span>
                                                    )}
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
    );
    const parameterTables = separatedParameterTables
        ? parameterGroups.map(group => renderParameterTable(group.title, group.parameters, false, group))
        : mergedParameters.length > 0
          ? renderParameterTable('Request Parameters', mergedParameters, true)
          : null;
    const isProtected = isOperationProtected(spec, operation);
    const isAuthorized = isOperationAuthenticated(spec, activeAuth, operation);
    const fullEndpointUrl = selectedServer
        ? `${expandServerUrl(selectedServer, serverVariables).replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
        : path;
    return (
        <div
            ref={scrollContainerRef}
            data-endpoint-docs-scroll
            className="w-full h-full overflow-y-auto p-3 sm:p-6 md:p-8 mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0"
            style={{maxWidth: '100%'}}
        >
            <div className="@container p-4 sm:p-6 rounded-2xl border flex flex-col gap-4 shadow-sm bg-[var(--surface)] border-[var(--border)] min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
                        <MethodBadge method={method} size="md" className="rounded-full px-3 py-1 shrink-0 w-16" />
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <ScrollableRow className="font-mono text-sm font-bold tracking-tight text-[var(--text-heading)]">
                                {path}
                            </ScrollableRow>
                            <Tip content="Copy endpoint path">
                                <button
                                    aria-label="Copy endpoint path"
                                    onClick={() => {
                                        navigator.clipboard.writeText(path);
                                        setCopiedPath(true);
                                        setTimeout(() => setCopiedPath(false), 2000);
                                    }}
                                    className={clsx(
                                        'w-7 h-7 rounded hidden @xl:flex items-center justify-center text-xs transition-colors cursor-pointer select-none shrink-0',
                                        copiedPath ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]',
                                    )}
                                >
                                    {copiedPath ? (
                                        <i className="ph ph-check text-[var(--method-get)] text-[11px]"></i>
                                    ) : (
                                        <i className="ph ph-copy text-[11px]"></i>
                                    )}
                                </button>
                            </Tip>
                            <Tip content="Copy full URL from selected server">
                                <button
                                    aria-label="Copy full endpoint URL"
                                    onClick={() => {
                                        navigator.clipboard.writeText(fullEndpointUrl);
                                        setCopiedFullUrl(true);
                                        setTimeout(() => setCopiedFullUrl(false), 2000);
                                    }}
                                    className={clsx(
                                        'w-7 h-7 rounded hidden @xl:flex items-center justify-center text-xs transition-colors cursor-pointer select-none shrink-0',
                                        copiedFullUrl ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]',
                                    )}
                                >
                                    {copiedFullUrl ? (
                                        <i className="ph ph-check text-[var(--method-get)] text-[11px]" />
                                    ) : (
                                        <i className="ph ph-link-simple text-[12px]" />
                                    )}
                                </button>
                            </Tip>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {operation.deprecated && (
                            <span className="inline-flex items-center gap-1.5 pe-2.5 ps-1.5 py-1 text-[10px] font-bold font-sans rounded-full border bg-[var(--method-put)]/10 border-[var(--method-put)]/20 text-[var(--method-put)] select-none">
                                <i className="ph ph-warning-circle text-[16px]"></i> Deprecated
                            </span>
                        )}
                        {isProtected && (
                            <span
                                className={clsx(
                                    'inline-flex items-center gap-1.5 pe-2.5 ps-1.5 py-1 text-[10px] font-bold font-sans rounded-full border select-none',
                                    isAuthorized
                                        ? 'bg-[var(--method-get)]/10 border-[var(--method-get)]/25 text-[var(--method-get)]'
                                        : 'bg-[var(--method-delete)]/10 border-[var(--method-delete)]/20 text-[var(--method-delete)] animate-pulse',
                                )}
                            >
                                <i
                                    className={`ph-fill ${isAuthorized ? 'ph-lock-key-open' : 'ph-lock-key'} text-[16px]`}
                                ></i>
                                {isAuthorized ? 'Authorized' : 'Protected'}
                            </span>
                        )}
                        {/* Narrow panes fold the route actions into one menu at
                            the end of the heading instead of crowding the route. */}
                        <OverflowActionsMenu
                            className="@xl:hidden"
                            ariaLabel="Endpoint actions"
                            actions={[
                                {
                                    id: 'copy-path',
                                    label: 'Copy endpoint path',
                                    doneLabel: 'Copied',
                                    icon: 'ph ph-copy',
                                    onSelect: () => navigator.clipboard.writeText(path),
                                },
                                {
                                    id: 'copy-url',
                                    label: 'Copy full URL',
                                    doneLabel: 'Copied',
                                    icon: 'ph ph-link-simple',
                                    onSelect: () => navigator.clipboard.writeText(fullEndpointUrl),
                                },
                                {
                                    id: 'share',
                                    label: 'Share this endpoint',
                                    icon: 'ph ph-share-network',
                                    onSelect: handleShareEndpoint,
                                },
                            ]}
                        />
                        <Tip content="Share this endpoint">
                            <button
                                onClick={handleShareEndpoint}
                                aria-label="Share this endpoint"
                                className="w-7 h-7 rounded hidden @xl:flex items-center justify-center text-xs transition-colors cursor-pointer select-none text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                            >
                                <i className="ph ph-share-network text-[13px]"></i>
                            </button>
                        </Tip>
                    </div>
                </div>

                <div className="border-t border-[var(--border)]"></div>

                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight font-sans text-[var(--text-heading)] break-words">
                        {operation.summary || 'Endpoint Documentation'}
                    </h1>
                    {operation.description && (
                        <div className="mt-2 text-sm max-w-none text-inherit leading-relaxed animate-in fade-in text-[var(--text)]">
                            <Markdown text={operation.description} />
                        </div>
                    )}
                    {operation.externalDocs && operation.externalDocs.url && (
                        <div className="mt-3">
                            <a
                                href={operation.externalDocs.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--primary-contrast)] transition-all hover:opacity-90 cursor-pointer shadow-sm select-none bg-[var(--primary)]"
                            >
                                <i className="ph ph-arrow-square-out text-[10px]"></i>
                                <span>{operation.externalDocs.description || 'View Operation Reference'}</span>
                            </a>
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full space-y-8 mx-auto min-w-0">
                {parameterTables}

                {selectedRequestBodyContent && (
                    <div className="space-y-3 font-sans min-w-0">
                        <div className="flex flex-nowrap items-center justify-between gap-3">
                            <h2 className="min-w-0 truncate text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Request Body Context
                            </h2>
                            {/* Fixed slot: a long media type used to widen the
                                control until it wrapped onto its own line. */}
                            <div className="flex w-[168px] shrink-0 items-center justify-end gap-2 sm:w-[220px]">
                                <span className="hidden shrink-0 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] sm:inline">
                                    Encoding type
                                </span>
                                <CustomDropdown
                                    value={selectedRequestBodyContentType}
                                    onChange={contentType => {
                                        setRequestBodyVariant(0);
                                        setRequestBodyContentType(contentType);
                                    }}
                                    options={requestBodyContentEntries.map(([contentType]) => ({
                                        value: contentType,
                                        label: contentType,
                                    }))}
                                    icon="ph ph-code-block text-[13px]"
                                    className="w-full min-w-0"
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 animate-in fade-in min-w-0">
                            {resolvedRequestBody.description && (
                                <p className="mb-4 text-xs font-semibold leading-relaxed text-[var(--text)]">
                                    {resolvedRequestBody.description}
                                </p>
                            )}
                            <div key={selectedRequestBodyContentType} className="space-y-4 animate-fade-in">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                    <p className="text-xs font-mono select-none">
                                        <span className="mr-1 font-sans font-semibold text-[var(--text-heading)]">
                                            Encoding TYPE:
                                        </span>
                                        <span className="rounded bg-[var(--background)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-heading)] break-all">
                                            {selectedRequestBodyContentType}
                                        </span>
                                    </p>
                                    <Tip content={requestBodyShape.hint}>
                                        <span className="inline-flex cursor-help items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)]">
                                            <i className={`${requestBodyShape.icon} text-[12px]`} />
                                            {requestBodyShape.label}
                                        </span>
                                    </Tip>
                                </div>
                                {requestBodyComposition && (
                                    <AllOfCompositionNote
                                        composition={requestBodyComposition}
                                        subject="request body"
                                        onInspect={onOpenSchemaModal}
                                    />
                                )}
                                {requestBodyChoice && (
                                    <AdaptiveTabStrip
                                        labelNode={<CombinatorLabel meta={requestBodyChoice.meta} />}
                                        ariaLabel="Request body variants"
                                        activeId={String(requestBodyBranchIndex)}
                                        onSelect={id => setRequestBodyVariant(Number(id))}
                                        items={requestBodyChoice.branches.map((sub, index) => ({
                                            id: String(index),
                                            label: schemaVariantLabel(sub, resolveReference, getRefName, index),
                                            description: (resolveReference(sub) || sub)?.description,
                                        }))}
                                    />
                                )}
                                <div className="pt-1 min-w-0">
                                    {renderSchemaPropertiesTable(
                                        requestBodyMatrixSchema,
                                        requestBodyMatrixSchema?.$ref
                                            ? getRefName(requestBodyMatrixSchema.$ref)
                                            : requestBodyMatrixSchema?.title || null,
                                    )}
                                </div>
                                {requestBodyFormSnippet && (
                                    <div className="border-t border-[var(--border)] pt-2">
                                        <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            <i className={`${requestBodyShape.icon} text-[12px]`} />
                                            Submitted shape
                                        </h4>
                                        <p className="mb-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                            {requestBodyShape.hint}
                                        </p>
                                        <CodeViewer
                                            code={requestBodyFormSnippet}
                                            language={requestBodyShape.kind === 'form' ? 'plaintext' : 'http'}
                                            maxHeight="260px"
                                        />
                                    </div>
                                )}
                                {requestBodyExample !== undefined && (
                                    <div className="border-t border-[var(--border)] pt-2">
                                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Example
                                        </h4>
                                        <CodeViewer
                                            code={formatExample(
                                                requestBodyExample,
                                                selectedRequestBodyContentType,
                                                requestBodyMatrixSchema?.$ref
                                                    ? getRefName(requestBodyMatrixSchema.$ref)
                                                    : requestBodyMatrixSchema?.title || 'request',
                                            )}
                                            language={exampleLanguageFor(selectedRequestBodyContentType)}
                                            maxHeight="320px"
                                        />
                                    </div>
                                )}
                                <div className="border-t border-[var(--border)] pt-2">
                                    <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Inspect Body Schema
                                    </h4>
                                    <div>{renderSchemaButton(selectedRequestBodyContent.schema)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-3 animate-in fade-in min-w-0">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Response Matrix
                    </h4>
                    {/* The rail needs a column of its own; a phone gets the same
                        navigator as a pill above the matrix and a bottom sheet. */}
                    {isMobile && (
                        <ResponseCodeSheet
                            responses={operation.responses}
                            activeCode={visibleResponseCode || navigatorActiveCode}
                            expandedCodes={expandedResponseCodes}
                            onSelect={openAndScrollToResponse}
                        />
                    )}
                    <div className={clsx('relative space-y-2', !isMobile && 'pl-16')}>
                        {!isMobile && (
                            <div className="absolute inset-y-0 left-0 w-16">
                                <ResponseCodeNavigator
                                    responses={operation.responses}
                                    activeCode={navigatorActiveCode}
                                    expandedCodes={expandedResponseCodes}
                                    onSelect={openAndScrollToResponse}
                                />
                            </div>
                        )}
                        {Object.entries(operation.responses).map(([code, resp]) => {
                            const isCollapsed = collapsedResponses[code] ?? true;
                            const isSuccess = code === 'default' || code.startsWith('2');
                            const activeResponseTab = responseActiveTab[code] || endpointRepresentation;
                            const responseContentEntries = resp.content
                                ? (Object.entries(resp.content) as [string, any][])
                                : [];
                            const selectedContentType =
                                responseContentTypes[code] && resp.content?.[responseContentTypes[code]]
                                    ? responseContentTypes[code]
                                    : responseContentEntries[0]?.[0] || '';
                            const selectedContentObj =
                                selectedContentType && resp.content ? (resp.content as any)[selectedContentType] : null;
                            const setResponseTab = (tab: 'example' | 'schema' | 'enum') => {
                                if (tab === 'enum') {
                                    setResponseActiveTab(prev => ({...prev, [code]: tab}));
                                    return;
                                }
                                // Schema and example are constant views, so the
                                // choice is a preference. Its scope decides
                                // whether it stays on this endpoint or follows
                                // the reader to every other one.
                                setResponseActiveTab({});
                                setEndpointRepresentation(representationKey, tab);
                            };
                            const schemaNames = getSchemaNamesFromResponse(resp);
                            return (
                                <div
                                    key={code}
                                    id={`response-${code}`}
                                    className="rounded-xl border overflow-hidden transition-all duration-150 animate-in fade-in bg-[var(--surface)] border-[var(--border)] group/resp"
                                >
                                    <div
                                        onClick={() => toggleResponse(code)}
                                        className={clsx(
                                            'px-2.5 sm:px-3 py-2 flex items-center justify-between cursor-pointer select-none hover:bg-[var(--text-muted)]/5 transition-colors gap-2 min-w-0',
                                        )}
                                    >
                                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 flex-wrap">
                                            <span
                                                className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${isSuccess ? 'bg-[var(--method-get)]/10 text-[var(--method-get)] border border-[var(--method-get)]/20' : 'bg-[var(--method-delete)]/10 text-[var(--method-delete)] border border-[var(--method-delete)]/20'}`}
                                            >
                                                {code}
                                            </span>
                                            <ScrollableRow className="min-w-0 flex-1 text-xs font-semibold leading-none text-[var(--text-heading)]">
                                                {resp.description || 'Response details'}
                                            </ScrollableRow>

                                            {!isMobile && schemaNames.length > 0 && (
                                                <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] min-w-0 flex-wrap">
                                                    {schemaNames.map((name, idx) => (
                                                        <React.Fragment key={name}>
                                                            {idx > 0 && <span className="opacity-50">|</span>}
                                                            <span className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--background)] truncate max-w-[180px]">
                                                                {humanizeSchemaName(name)}
                                                            </span>
                                                        </React.Fragment>
                                                    ))}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 sm:gap-2 text-[var(--text-muted)] shrink-0">
                                            <Tip content="Share link to this response">
                                                <button
                                                    onClick={e => handleShareResponse(code, resp, e)}
                                                    aria-label={`Share response ${code}`}
                                                    className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-colors cursor-pointer border border-transparent hover:border-[var(--primary)]/20"
                                                >
                                                    <i className="ph ph-share-network text-[12px]"></i>
                                                </button>
                                            </Tip>
                                            <i
                                                className={`ph transform transition-transform duration-100 ${isCollapsed ? 'ph-caret-down' : 'ph-caret-up'}`}
                                            ></i>
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <div className="p-2.5 sm:p-3 border-t space-y-4 animate-in fade-in border-[var(--border)] min-w-0">
                                            {resp.headers && (
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">
                                                        Response Headers
                                                    </p>
                                                    <div className="border rounded-lg overflow-hidden border-[var(--border)]">
                                                        {/* Cards when the pane is too narrow for two columns. */}
                                                        <CardOrTable
                                                            preferCards={cardParameterTables}
                                                            maxWidth={COMPACT_CARD_LAYOUT_WIDTH}
                                                            cards={() => (
                                                                <div className="space-y-2 p-2">
                                                                    {Object.entries(resp.headers).map(
                                                                        ([hName, hObj]: any) => (
                                                                            <DataCard
                                                                                key={hName}
                                                                                title={
                                                                                    <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                                                                                        {hName}
                                                                                    </span>
                                                                                }
                                                                                subtitle={hObj.description}
                                                                                facts={[
                                                                                    {
                                                                                        label: 'Example',
                                                                                        value: hObj.schema?.example ? (
                                                                                            <code className="font-mono text-[10px]">
                                                                                                {String(
                                                                                                    hObj.schema.example,
                                                                                                )}
                                                                                            </code>
                                                                                        ) : null,
                                                                                    },
                                                                                ]}
                                                                            />
                                                                        ),
                                                                    )}
                                                                </div>
                                                            )}
                                                            table={() => (
                                                                <div className="overflow-x-auto scrollbar-thin">
                                                                    <table
                                                                        className="w-full text-xs text-left border-collapse"
                                                                        style={{minWidth: 400}}
                                                                    >
                                                                        <thead>
                                                                            <tr>
                                                                                <th className="px-3 py-2 font-semibold">
                                                                                    Header
                                                                                </th>
                                                                                <th className="px-3 py-2 font-semibold">
                                                                                    Details
                                                                                </th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {Object.entries(resp.headers).map(
                                                                                ([hName, hObj]: any) => (
                                                                                    <tr
                                                                                        key={hName}
                                                                                        className="border-b border-[var(--border)]"
                                                                                    >
                                                                                        <td className="px-3 py-2 font-mono font-bold whitespace-nowrap text-[var(--text-heading)]">
                                                                                            {hName}
                                                                                        </td>
                                                                                        <td className="px-3 py-2 leading-relaxed text-[var(--text)]">
                                                                                            {hObj.description}
                                                                                            {hObj.schema?.example && (
                                                                                                <div className="font-mono text-[9px] mt-0.5 opacity-80 overflow-x-auto whitespace-pre-wrap">
                                                                                                    Ex:{' '}
                                                                                                    {
                                                                                                        hObj.schema
                                                                                                            .example
                                                                                                    }
                                                                                                </div>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                ),
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {resp.content && selectedContentObj ? (
                                                <>
                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                        <div className="flex p-0.5 rounded-lg border w-fit border-[var(--border)] bg-[var(--background)] flex-wrap">
                                                            <button
                                                                onClick={() => setResponseTab('example')}
                                                                aria-pressed={activeResponseTab === 'example'}
                                                                className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeResponseTab === 'example' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}
                                                            >
                                                                <span className="hidden sm:inline">
                                                                    Example Representation
                                                                </span>
                                                                <span className="sm:hidden">Example</span>
                                                            </button>
                                                            {(() => {
                                                                const s = resolveReference(
                                                                    viewerExampleSchemas[code] ??
                                                                        getDefaultViewerSchema(
                                                                            selectedContentObj?.schema,
                                                                        ),
                                                                );
                                                                const hasEnum =
                                                                    s?.enum &&
                                                                    Array.isArray(s.enum) &&
                                                                    s.enum.length > 0;
                                                                return hasEnum ? (
                                                                    <button
                                                                        onClick={() => setResponseTab('enum')}
                                                                        aria-pressed={activeResponseTab === 'enum'}
                                                                        className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeResponseTab === 'enum' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}
                                                                    >
                                                                        Enum
                                                                    </button>
                                                                ) : null;
                                                            })()}
                                                            <button
                                                                onClick={() => setResponseTab('schema')}
                                                                aria-pressed={activeResponseTab === 'schema'}
                                                                className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeResponseTab === 'schema' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}
                                                            >
                                                                <span className="hidden sm:inline">Unified Schema</span>
                                                                <span className="sm:hidden">Schema</span>
                                                            </button>
                                                        </div>
                                                        {responseContentEntries.length > 1 && (
                                                            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                                                <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 text-[var(--text-muted)]">
                                                                    Format
                                                                </span>
                                                                <CustomDropdown
                                                                    value={selectedContentType}
                                                                    onChange={value => {
                                                                        setResponseContentTypes(previous => ({
                                                                            ...previous,
                                                                            [code]: value,
                                                                        }));
                                                                        resetViewerSchema(code);
                                                                    }}
                                                                    options={responseContentEntries.map(([mime]) => ({
                                                                        value: mime,
                                                                        label: mime,
                                                                    }))}
                                                                    icon="ph ph-code-block text-[14px]"
                                                                    className="w-full max-w-[200px]"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-3 min-w-0">
                                                        {(() => {
                                                            const cType = selectedContentType;
                                                            const cObj = selectedContentObj;
                                                            const activeSchema =
                                                                viewerExampleSchemas[code] ??
                                                                getDefaultViewerSchema(cObj.schema);
                                                            const resolvedSchema = resolveReference(activeSchema);
                                                            const isEnum =
                                                                resolvedSchema?.enum &&
                                                                Array.isArray(resolvedSchema.enum) &&
                                                                resolvedSchema.enum.length > 0;
                                                            return (
                                                                <div key={cType} className="space-y-3 min-w-0">
                                                                    <p className="text-[10px] font-mono select-none text-[var(--text-muted)] break-all">
                                                                        Content Type: {cType}
                                                                    </p>
                                                                    {activeResponseTab === 'example' ? (
                                                                        <div className="space-y-3 min-w-0">
                                                                            <div className="pt-2 border-t border-[var(--border)] min-w-0">
                                                                                <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-[var(--text-muted)]">
                                                                                    Inspect Response Schema
                                                                                </h4>
                                                                                <div className="flex flex-col gap-2 min-w-0">
                                                                                    <div className="min-w-0 overflow-x-auto scrollbar-thin">
                                                                                        {renderSchemaTypeExample(
                                                                                            cObj.schema,
                                                                                            code,
                                                                                        )}
                                                                                    </div>
                                                                                    {activeSchema?.description && (
                                                                                        <div className="text-xs p-3 rounded-lg border border-[var(--primary)]/10 bg-[var(--primary)]/5 mt-1">
                                                                                            <div className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--primary)] mb-1">
                                                                                                Schema Description:
                                                                                            </div>
                                                                                            <div className="markdown-body">
                                                                                                <Markdown
                                                                                                    text={
                                                                                                        activeSchema.description
                                                                                                    }
                                                                                                />
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {(() => {
                                                                                const example =
                                                                                    getResponseExampleSnippetWithMarkers(
                                                                                        activeSchema,
                                                                                        cObj,
                                                                                        cType,
                                                                                    );
                                                                                return (
                                                                                    <CodeViewer
                                                                                        code={example.code}
                                                                                        language={getLanguageForContentType(
                                                                                            cType,
                                                                                        )}
                                                                                        maxHeight="none"
                                                                                        lineMarkers={mockMarkersToLineMarkers(
                                                                                            example.markers,
                                                                                            {
                                                                                                onOpenSchema:
                                                                                                    onOpenSchemaModal,
                                                                                                onTestPattern:
                                                                                                    setPatternToTest,
                                                                                            },
                                                                                        )}
                                                                                    />
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    ) : activeResponseTab === 'enum' && isEnum ? (
                                                                        <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
                                                                            {resolvedSchema.enum.map((val: any) => (
                                                                                <span
                                                                                    key={JSON.stringify(val)}
                                                                                    className="px-2.5 py-1 rounded-lg text-xs font-mono border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] break-all"
                                                                                >
                                                                                    {JSON.stringify(val)}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="space-y-3 min-w-0">
                                                                            <div className="pt-2 border-t border-[var(--border)] min-w-0">
                                                                                <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-[var(--text-muted)]">
                                                                                    Inspect Response Schema
                                                                                </h4>
                                                                                <div className="flex flex-col gap-2 min-w-0">
                                                                                    <div className="min-w-0 overflow-x-auto scrollbar-thin">
                                                                                        {renderSchemaTypeExample(
                                                                                            cObj.schema,
                                                                                            code,
                                                                                        )}
                                                                                    </div>
                                                                                    {activeSchema?.description && (
                                                                                        <div className="text-xs p-3 rounded-lg border border-[var(--primary)]/10 bg-[var(--primary)]/5 mt-1">
                                                                                            <div className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--primary)] mb-1">
                                                                                                Schema Description:
                                                                                            </div>
                                                                                            <div className="markdown-body">
                                                                                                <Markdown
                                                                                                    text={
                                                                                                        activeSchema.description
                                                                                                    }
                                                                                                />
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {renderSchemaPropertiesTable(
                                                                                activeSchema,
                                                                                viewerExampleNames[code] ||
                                                                                    (cObj.schema?.$ref
                                                                                        ? getRefName(cObj.schema.$ref)
                                                                                        : cObj.schema?.title || null),
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-xs italic text-[11px] text-[var(--text-muted)]">
                                                    Does not return structured body payload.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {responseScrollTailHeight > 0 && (
                            <div
                                data-response-scroll-tail
                                aria-hidden="true"
                                className="!mt-0 pointer-events-none"
                                style={{height: responseScrollTailHeight}}
                            />
                        )}
                    </div>
                </div>
            </div>

            <EndpointInfoModal
                visible={exampleTransition.shouldRender && !!exampleModalContent}
                backdropClassName={exampleTransition.backdropClassName}
                title={exampleModalContent?.title || ''}
                icon="ph ph-eye"
                closeLabel="Close Example"
                onClose={exampleTransition.requestClose}
                zIndex="z-[3000]"
            >
                {exampleModalContent && (
                    <CodeViewer
                        code={exampleModalContent.content}
                        language="json"
                        maxHeight="none"
                        lineMarkers={exampleModalContent.lineMarkers}
                    />
                )}
            </EndpointInfoModal>

            {patternToTest && <PatternTesterModal pattern={patternToTest} onClose={() => setPatternToTest(null)} />}
            {serializerParameter && (
                <SerializerPlaygroundModal
                    parameter={serializerParameter}
                    onClose={() => setSerializerParameter(null)}
                />
            )}

            {shareModal && (
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            )}
        </div>
    );
}
