import React, { useEffect, useState } from 'react';
import * as jsYaml from 'js-yaml';
import { ActiveAuth, OpenApiSpec, Operation } from '../../../types';
import Markdown from '../../common/Markdown';
import CodeViewer from '../../common/CodeViewer';
import SchemaPropertiesTable from '../../schema/SchemaPropertiesTable';
import PatternTesterModal from '../../modals/PatternTesterModal';
import MethodBadge from '../../common/MethodBadge';
import CustomDropdown from '../../common/CustomDropdown';
import clsx from "clsx";
import ShareModal from '../../modals/ShareModal';
import { useEscClose } from '../../../hooks/useEscClose';
import { Tip } from '../../common/Tooltip';
import { useBreakpoint } from '../../../hooks/useBreakpoint';

interface ViewTabProps {
    key: any;
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    onOpenSchemaModal: (schemaName: string) => void;
    activeAuth: ActiveAuth;
    activeResponseCode?: string | null;
    onSelectResponseCode?: (code: string | null) => void;
}

interface FlatProperty {
    name: string;
    typeNode: React.ReactNode;
    description: string;
    isRequired: boolean;
    rawProp?: any;
}

const getRefName = (refStr: string): string => {
    if (!refStr) return '';
    const parts = refStr.split('/');
    return parts[parts.length - 1];
};

/** Human-readable type label for the value schema of a Map / dictionary
 *  (i.e. an `object` defined only through `additionalProperties`). */
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

const getPatternFromParam = (param: any, spec: OpenApiSpec | null): string | null => {
    if (!param) return null;
    if (param.pattern) return param.pattern;
    if (param.schema?.pattern) return param.schema.pattern;
    if (param.schema?.$ref) {
        const refName = getRefName(param.schema.$ref);
        const refSchema = spec?.components?.schemas?.[refName];
        if (refSchema?.pattern) return refSchema.pattern;
        if (refSchema?.schema?.pattern) return refSchema.schema.pattern;
    }
    return null;
};

const resolveParameter = (param: any, spec: OpenApiSpec | null): any => {
    if (!param) return param;
    if (param.$ref) {
        const refName = getRefName(param.$ref);
        const resolved = spec?.components?.parameters?.[refName];
        if (resolved) return resolveParameter(resolved, spec);
    }
    return param;
};

const resolveRequestBody = (body: any, spec: OpenApiSpec | null): any => {
    if (!body) return body;
    if (body.$ref) {
        const refName = getRefName(body.$ref);
        const resolved = (spec?.components as any)?.requestBodies?.[refName];
        if (resolved) return resolveRequestBody(resolved, spec);
    }
    return body;
};

const getMergedParameters = (pathItem: any, operation: any, spec: OpenApiSpec | null): any[] => {
    const list: any[] = [];
    const seen = new Set<string>();
    const addParam = (p: any) => {
        const resolved = resolveParameter(p, spec);
        if (resolved && resolved.name && !seen.has(`${resolved.name}-${resolved.in}`)) {
            seen.add(`${resolved.name}-${resolved.in}`);
            list.push(resolved);
        }
    };
    if (operation?.parameters) operation.parameters.forEach(addParam);
    if (pathItem?.parameters) pathItem.parameters.forEach(addParam);
    return list;
};

export default function ViewTab({
    spec, path, method, operation, onOpenSchemaModal, activeAuth,
    activeResponseCode, onSelectResponseCode,
}: ViewTabProps) {
    const [copiedPath, setCopiedPath] = useState(false);
    const [helpModalContent, setHelpModalContent] = useState<{ title: string; content: string } | null>(null);
    const [exampleModalContent, setExampleModalContent] = useState<{ title: string; content: string } | null>(null);
    const [patternToTest, setPatternToTest] = useState<string | null>(null);
    const [shareModal, setShareModal] = useState<{ url: string; title: string; description?: string } | null>(null);
    const [responseActiveTab, setResponseActiveTab] = useState<{ [code: string]: 'example' | 'schema' | 'enum' }>({});
    const [responseContentTypes, setResponseContentTypes] = useState<{ [code: string]: string }>({});
    const [requestBodyContentType, setRequestBodyContentType] = useState('');
    const [viewerExampleSchemas, setViewerExampleSchemas] = useState<{ [code: string]: any }>({});
    const [collapsedResponses, setCollapsedResponses] = useState<{ [code: string]: boolean }>(() => {
        const initial: { [code: string]: boolean } = {};
        if (operation.responses) {
            Object.keys(operation.responses).forEach((code) => { initial[code] = !code.startsWith('2'); });
        }
        return initial;
    });
    const bp = useBreakpoint();
    const isMobile = bp === 'mobile' || bp === 'tablet';

    useEffect(() => {
        if (activeResponseCode && operation.responses?.[activeResponseCode]) {
            setCollapsedResponses(prev => ({ ...prev, [activeResponseCode]: false }));
            const timer = setTimeout(() => {
                const el = document.getElementById(`response-${activeResponseCode}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-[var(--primary)]', 'scale-[1.01]');
                    const removeHighlight = setTimeout(() => { el.classList.remove('ring-2', 'ring-[var(--primary)]', 'scale-[1.01]'); }, 2000);
                    return () => clearTimeout(removeHighlight);
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [activeResponseCode, operation.responses]);

    const toggleResponse = (code: string) => {
        const nextCollapsed = !collapsedResponses[code];
        setCollapsedResponses(prev => ({ ...prev, [code]: nextCollapsed }));
        if (onSelectResponseCode) onSelectResponseCode(nextCollapsed ? null : code);
    };

    useEscClose(!!helpModalContent, () => setHelpModalContent(null), !!helpModalContent);
    useEscClose(!!exampleModalContent, () => setExampleModalContent(null), !!exampleModalContent);
    useEscClose(!!patternToTest, () => setPatternToTest(null), !!patternToTest);
    useEscClose(!!shareModal, () => setShareModal(null), !!shareModal);

    const getBaseUrlWithoutResponse = () => typeof window === 'undefined' ? '' : window.location.href.split('#response-')[0];
    const getEndpointShareUrl = () => getBaseUrlWithoutResponse();
    const getResponseShareUrl = (code: string) => `${getBaseUrlWithoutResponse()}#response-${code}`;

    const handleShareEndpoint = () => setShareModal({
        url: getEndpointShareUrl(),
        title: `${method.toUpperCase()} ${path} - ${operation.summary || 'API Endpoint'}`,
        description: operation.description ? operation.description.slice(0, 200) : operation.summary || `Endpoint ${method.toUpperCase()} ${path}`
    });

    const handleShareResponse = (code: string, resp: any, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setShareModal({
            url: getResponseShareUrl(code),
            title: `${method.toUpperCase()} ${path} - Response ${code}`,
            description: resp?.description || `Response ${code} for ${method.toUpperCase()} ${path}`
        });
    };

    const resolveReference = (item: any): any => {
        if (!item) return item;
        if (item.$ref) {
            const refName = getRefName(item.$ref);
            const refSchema = spec.components?.schemas?.[refName];
            if (refSchema) return resolveReference(refSchema);
        }
        return item;
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
                    <button onClick={() => onOpenSchemaModal(refName)}
                        className="text-[var(--primary)] hover:underline font-semibold text-xs text-left inline-flex items-center gap-1 cursor-pointer">
                        <i className="ph ph-diamonds-four text-[12px]"></i>{isMobile ? '' : ` ${refName}`}
                    </button>
                </Tip>
            );
        }
        if (prop.type === 'object' && !prop.properties && prop.additionalProperties && typeof prop.additionalProperties === 'object') {
            return (
                <span className="font-mono text-xs text-[var(--text)]">
                    object <span className="text-[var(--text-muted)]">Map&lt;string, {mapValueLabel(prop.additionalProperties)}&gt;</span>
                </span>
            );
        }
        if (prop.oneOf && Array.isArray(prop.oneOf)) {
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-options)] uppercase tracking-wider font-sans">One Of:</span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.oneOf.map((sub: any, sIdx: number) =>
                            <button key={sIdx} onClick={() => { const refName = sub.$ref ? getRefName(sub.$ref) : null; if (refName) onOpenSchemaModal(refName); }}
                                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80">
                                {sub.$ref ? getRefName(sub.$ref) : `Option ${sIdx + 1}`}
                            </button>)}
                    </div>
                </div>
            );
        }
        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-put)] uppercase tracking-wider font-sans">Any Of:</span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.anyOf.map((sub: any, sIdx: number) =>
                            <button key={sIdx} onClick={() => { const refName = sub.$ref ? getRefName(sub.$ref) : null; if (refName) onOpenSchemaModal(refName); }}
                                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80">
                                {sub.$ref ? getRefName(sub.$ref) : `Option ${sIdx + 1}`}
                            </button>)}
                    </div>
                </div>
            );
        }
        if (prop.allOf && Array.isArray(prop.allOf)) {
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-sans">All Of:</span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.allOf.map((sub: any, sIdx: number) =>
                            <button key={sIdx} onClick={() => { const refName = sub.$ref ? getRefName(sub.$ref) : null; if (refName) onOpenSchemaModal(refName); }}
                                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80">
                                {sub.$ref ? getRefName(sub.$ref) : `Option ${sIdx + 1}`}
                            </button>)}
                    </div>
                </div>
            );
        }
        if (prop.type === 'array' && prop.items) {
            if (prop.items.$ref) {
                const refName = getRefName(prop.items.$ref);
                return (
                    <span className="text-xs font-sans">Array&lt;
                        <button onClick={() => onOpenSchemaModal(refName)} className="text-[var(--primary)] hover:underline font-semibold cursor-pointer">{refName}</button>&gt;
                    </span>
                );
            }
            if (prop.items.oneOf || prop.items.anyOf) return <span className="text-xs font-sans">Array&lt;{renderSchemaType(prop.items)}&gt;</span>;
            const resolvedItemsType = Array.isArray(prop.items.type) ? prop.items.type.join(' | ') : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">Array&lt;{resolvedItemsType}&gt;</span>;
        }
        return <span className="font-mono text-xs text-[var(--text)]">{renderTypeName(prop.type, prop.format)}</span>;
    };

    const renderSchemaButton = (schema: any) => {
        if (!schema) return <span className="text-[var(--text-muted)] italic">any</span>;
        return <div className="space-y-2">{renderSchemaType(schema)}</div>;
    };

    const isSchemaActive = (sub: any, code: string, viewerSchema: any): boolean => {
        if (!viewerSchema) return false;
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
            if (resolved.type === 'object' && resolved.properties) return `Object (${Object.keys(resolved.properties).length} props)`;
            if (resolved.type) return `${resolved.type}`;
            return `Option ${idx + 1}`;
        };
        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            const refSchema = spec.components?.schemas?.[refName];
            const viewerSchema = viewerExampleSchemas[code];
            const isActive = isSchemaActive(prop, code, viewerSchema);
            return (
                <button onClick={() => setViewerExampleSchemas(prev => ({ ...prev, [code]: refSchema || prop }))}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                    <i className="ph ph-diamonds-four text-[12px] mr-1"></i> {refName}
                </button>
            );
        }
        if (prop.type === 'object' && !prop.properties && prop.additionalProperties && typeof prop.additionalProperties === 'object') {
            return (
                <span className="font-mono text-xs text-[var(--text)]">
                    object <span className="text-[var(--text-muted)]">Map&lt;string, {mapValueLabel(prop.additionalProperties)}&gt;</span>
                </span>
            );
        }
        if (prop.oneOf && Array.isArray(prop.oneOf)) {
            const viewerSchema = viewerExampleSchemas[code];
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-options)] uppercase tracking-wider font-sans">One Of:</span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.oneOf.map((sub: any, sIdx: number) => {
                            const isActive = isSchemaActive(sub, code, viewerSchema);
                            return (
                                <button key={sIdx} onClick={() => setViewerExampleSchemas(prev => ({ ...prev, [code]: sub }))}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                                    {getSubLabel(sub, sIdx)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }
        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            const viewerSchema = viewerExampleSchemas[code];
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--method-put)] uppercase tracking-wider font-sans">Any Of:</span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.anyOf.map((sub: any, sIdx: number) => {
                            const isActive = isSchemaActive(sub, code, viewerSchema);
                            return (
                                <button key={sIdx} onClick={() => setViewerExampleSchemas(prev => ({ ...prev, [code]: sub }))}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                                    {getSubLabel(sub, sIdx)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }
        if (prop.allOf && Array.isArray(prop.allOf)) {
            const viewerSchema = viewerExampleSchemas[code];
            return (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-sans">All Of:</span>
                    <div className="flex p-0.5 rounded-lg border flex-wrap border-[var(--border)] bg-[var(--background)]">
                        {prop.allOf.map((sub: any, sIdx: number) => {
                            const isActive = isSchemaActive(sub, code, viewerSchema);
                            return (
                                <button key={sIdx} onClick={() => setViewerExampleSchemas(prev => ({ ...prev, [code]: sub }))}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                                    {getSubLabel(sub, sIdx)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }
        if (prop.type === 'array' && prop.items) {
            if (prop.items.$ref) {
                const refName = getRefName(prop.items.$ref);
                const refSchema = spec.components?.schemas?.[refName];
                const viewerSchema = viewerExampleSchemas[code];
                const isActive = isSchemaActive(prop.items, code, viewerSchema);
                return (
                    <span className="text-xs font-sans">Array&lt;
                        <button onClick={() => setViewerExampleSchemas(prev => ({ ...prev, [code]: refSchema || prop.items }))}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>{refName}</button>&gt;
                    </span>
                );
            }
            if (prop.items.oneOf || prop.items.anyOf) return <span className="text-xs font-sans">Array&lt;{renderSchemaTypeExample(prop.items, code)}&gt;</span>;
            const resolvedItemsType = Array.isArray(prop.items.type) ? prop.items.type.join(' | ') : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">Array&lt;{resolvedItemsType}&gt;</span>;
        }
        return <span className="font-mono text-xs text-[var(--text)]">{renderTypeName(prop.type, prop.format)}</span>;
    };

    const resolveProperties = (sObj: any, prefix = '', visited = new Set<string>()): { [name: string]: any } => {
        if (!sObj) return {};
        let props: { [name: string]: any } = {};
        if (sObj.$ref) {
            const refName = getRefName(sObj.$ref);
            if (visited.has(refName)) return {};
            visited.add(refName);
            const refSchema = spec.components?.schemas?.[refName];
            if (refSchema) props = { ...props, ...resolveProperties(refSchema, prefix, visited) };
            return props;
        }
        if (sObj.allOf && Array.isArray(sObj.allOf)) sObj.allOf.forEach((sub: any) => { props = { ...props, ...resolveProperties(sub, prefix, new Set(visited)) }; });
        if (sObj.properties) {
            Object.entries(sObj.properties).forEach(([name, prop]: [string, any]) => {
                const key = prefix ? `${prefix}.${name}` : name;
                props[key] = prop;
                const resolved = resolveReference(prop);
                if (resolved && (resolved.type === 'object' || resolved.properties || resolved.allOf)) {
                    const nested = resolveProperties(resolved, key, new Set(visited));
                    props = { ...props, ...nested };
                } else if (resolved && resolved.type === 'array' && resolved.items) {
                    const resolvedItems = resolveReference(resolved.items);
                    if (resolvedItems && (resolvedItems.type === 'object' || resolvedItems.properties || resolvedItems.allOf)) {
                        const nested = resolveProperties(resolvedItems, `${key}.*`, new Set(visited));
                        props = { ...props, ...nested };
                    }
                }
            });
        }
        if (sObj.oneOf && Array.isArray(sObj.oneOf)) sObj.oneOf.forEach((sub: any) => { props = { ...props, ...resolveProperties(sub, prefix, new Set(visited)) }; });
        if (sObj.anyOf && Array.isArray(sObj.anyOf)) sObj.anyOf.forEach((sub: any) => { props = { ...props, ...resolveProperties(sub, prefix, new Set(visited)) }; });
        // Map / dictionary types: object defined only via `additionalProperties` (no named `properties`).
        if (!sObj.properties && sObj.additionalProperties && typeof sObj.additionalProperties === 'object') {
            const mapKey = prefix ? `${prefix}.«any key»` : '«any key»';
            props[mapKey] = sObj.additionalProperties;
        }
        return props;
    };

    const renderSchemaPropertiesTable = (schema: any) => {
        if (!schema) return null;
        const properties = resolveProperties(schema);
        return (
            <SchemaPropertiesTable properties={properties} schema={schema} resolveReference={resolveReference} getRefName={getRefName}
                onPushSchema={onOpenSchemaModal}
                onViewExample={(name, subSchema) => setExampleModalContent({ title: `${name} Simulated Example`, content: getMockSnippet(subSchema) })}
                onTestPattern={setPatternToTest} useModal={true} />
        );
    };

    const getMockSnippet = (schema: any): string => {
        if (!schema) return 'null';
        const generateMockFromPattern = (pattern: string): string => {
            if (!pattern) return 'string';
            if (pattern.includes('uuid') || pattern.includes('UUID')) return '123e4567-e89b-12d3-a456-426614174000';
            if (pattern.includes('^[0-9]+$') || pattern.includes('^\\d+$')) return '12345';
            if (pattern.includes('^[a-zA-Z0-9]+$')) return 'string123';
            if (pattern.includes('@') || pattern.includes('email')) return 'user@example.com';
            if (pattern.includes('phone') || pattern.includes('^[\\+]?[0-9]')) return '+1234567890';
            if (pattern.includes('date') || pattern.includes('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) return '2026-07-03';
            let generated = ''; let cleaned = pattern.replace(/^\^/, '').replace(/\$$/, ''); let i = 0;
            while (i < cleaned.length) {
                let char = cleaned[i];
                if (char === '\\') {
                    let next = cleaned[i + 1];
                    if (next === 'd') generated += '5'; else if (next === 'w') generated += 'a'; else if (next === 's') generated += ' '; else generated += next || '';
                    i += 2;
                } else if (char === '[') {
                    let endIdx = cleaned.indexOf(']', i);
                    if (endIdx !== -1) {
                        let content = cleaned.substring(i + 1, endIdx);
                        if (content.includes('0-9') || content.includes('\\d')) generated += '9';
                        else if (content.includes('a-z')) generated += 'x';
                        else if (content.includes('A-Z')) generated += 'X';
                        else if (content.length > 0) generated += content[0];
                        else generated += 'a';
                        i = endIdx + 1;
                    } else { generated += '['; i++; }
                } else if (cleaned[i] === '{') {
                    let endIdx = cleaned.indexOf('}', i);
                    if (endIdx !== -1) {
                        let countStr = cleaned.substring(i + 1, endIdx); let count = parseInt(countStr, 10) || 1;
                        let lastChar = generated[generated.length - 1] || 'a';
                        for (let k = 0; k < count - 1; k++) generated += lastChar;
                        i = endIdx + 1;
                    } else { generated += '{'; i++; }
                } else if (char === '(' || char === ')' || char === '?' || char === '*' || char === '+') { i++; }
                else if (char === '|') break;
                else { generated += char; i++; }
            }
            return generated || 'string';
        };
        const generateMock = (s: any, depth = 0, visited = new Set<string>()): any => {
            if (!s) return null; if (depth > 1000) return {};
            if (s.$ref) {
                const refName = getRefName(s.$ref);
                if (visited.has(refName)) return {};
                visited.add(refName);
                const refSchema = spec.components?.schemas?.[refName];
                if (refSchema) return generateMock(refSchema, depth + 1, visited);
                return {};
            }
            if (s.const !== undefined) return s.const;
            if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
            if (s.example !== undefined) return s.example;
            if (s.default !== undefined) return s.default;
            if (s.allOf && Array.isArray(s.allOf)) {
                let merged = {};
                s.allOf.forEach((sub: any) => { const subMock = generateMock(sub, depth + 1, new Set(visited)); if (typeof subMock === 'object' && subMock !== null) merged = { ...merged, ...subMock }; else if (subMock !== null) merged = subMock; });
                return merged;
            }
            if (s.oneOf && Array.isArray(s.oneOf) && s.oneOf.length > 0) return generateMock(s.oneOf[0], depth + 1, new Set(visited));
            if (s.anyOf && Array.isArray(s.anyOf) && s.anyOf.length > 0) return generateMock(s.anyOf[0], depth + 1, new Set(visited));
            const typeVal = s.type;
            const resolvedType = Array.isArray(typeVal) ? typeVal.find(t => t !== 'null') : typeVal;
            // Map / dictionary types: object defined through `additionalProperties`.
            if ((resolvedType === 'object' || resolvedType === undefined) && s.additionalProperties && typeof s.additionalProperties === 'object') {
                const obj: any = {};
                if (s.properties) Object.entries(s.properties).forEach(([k, v]: [string, any]) => { obj[k] = generateMock(v, depth + 1, new Set(visited)); });
                obj.key = generateMock(s.additionalProperties, depth + 1, new Set(visited));
                return obj;
            }
            if (resolvedType === 'object' || s.properties) {
                const obj: any = {};
                if (s.properties) Object.entries(s.properties).forEach(([k, v]: [string, any]) => { obj[k] = generateMock(v, depth + 1, new Set(visited)); });
                return obj;
            }
            if (resolvedType === 'array') return [generateMock(s.items || {}, depth + 1, new Set(visited))];
            if (resolvedType === 'string') {
                if (s.format === 'date-time') return new Date().toISOString();
                if (s.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
                if (s.pattern) return generateMockFromPattern(s.pattern);
                return s.enum ? s.enum[0] : 'string';
            }
            if (resolvedType === 'integer' || resolvedType === 'number') return 0;
            if (resolvedType === 'boolean') return true;
            if (s.properties) {
                const obj: any = {};
                Object.entries(s.properties).forEach(([k, v]: [string, any]) => { obj[k] = generateMock(v, depth + 1, new Set(visited)); });
                return obj;
            }
            return null;
        };
        try { return JSON.stringify(generateMock(schema), null, 2); } catch { return '{}'; }
    };

    const getMockValue = (schema: any): any => { try { return JSON.parse(getMockSnippet(schema)); } catch { return null; } };

    const getFirstExplicitExample = (contentObj: any): any => {
        if (!contentObj) return undefined;
        if (contentObj.example !== undefined) return contentObj.example;
        if (contentObj.examples && typeof contentObj.examples === 'object') {
            const first = Object.values(contentObj.examples)[0] as any;
            if (first) { if (first.value !== undefined) return first.value; if (first.externalValue !== undefined) return first.externalValue; return first; }
        }
        return undefined;
    };

    const escapeXml = (value: any) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const toXml = (value: any, nodeName = 'response', depth = 0): string => {
        const indent = '  '.repeat(depth);
        const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
        if (value === null || value === undefined) return `${indent}<${safeName} />`;
        if (Array.isArray(value)) { if (value.length === 0) return `${indent}<${safeName}></${safeName}>`; return value.map(item => toXml(item, safeName, depth)).join('\n'); }
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            if (entries.length === 0) return `${indent}<${safeName}></${safeName}>`;
            const children = entries.map(([key, child]) => toXml(child, key, depth + 1)).join('\n');
            return `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>`;
        }
        return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    };

    const getSchemaDisplayName = (schema: any, fallback = 'response') => {
        if (!schema) return fallback;
        if (schema.xml?.name) return schema.xml.name;
        if (schema.$ref) return getRefName(schema.$ref);
        if (schema.items?.$ref) return getRefName(schema.items.$ref);
        if (schema.title) return schema.title;
        return fallback;
    };

    const getLanguageForContentType = (contentType: string): string => {
        const c = contentType.toLowerCase();
        if (c.includes('json')) return 'json';
        if (c.includes('yaml') || c.includes('yml')) return 'yaml';
        if (c.includes('xml')) return 'xml';
        if (c.includes('html')) return 'html';
        if (c.includes('javascript')) return 'javascript';
        if (c.includes('x-www-form-urlencoded')) return 'http';
        return 'text';
    };

    const getResponseExampleSnippet = (schema: any, contentObj: any, contentType: string): string => {
        const explicitExample = getFirstExplicitExample(contentObj);
        const hasExplicit = explicitExample !== undefined;
        const value = hasExplicit ? explicitExample : getMockValue(schema);
        const c = contentType.toLowerCase();
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (c.includes('json')) { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return JSON.stringify(value, null, 2); } }
            if (c.includes('xml') || c.includes('html') || c.includes('text') || c.includes('plain')) return value;
            if (c.includes('yaml') || c.includes('yml')) return trimmed.startsWith('{') || trimmed.startsWith('[') ? jsYaml.dump(JSON.parse(value)) : value;
            return value;
        }
        if (c.includes('xml')) {
            if (Array.isArray(value)) {
                const itemName = getSchemaDisplayName(schema?.items || schema, 'item');
                const children = value.map(item => toXml(item, itemName, 1)).join('\n');
                return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n${children}\n</response>`;
            }
            return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, getSchemaDisplayName(schema))}`;
        }
        if (c.includes('html')) return typeof value === 'object' ? `<pre>${escapeXml(JSON.stringify(value, null, 2))}</pre>` : String(value ?? '');
        if (c.includes('yaml') || c.includes('yml')) return jsYaml.dump(value);
        if (c.includes('text') || c.includes('plain')) return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
        return JSON.stringify(value, null, 2);
    };

    const humanizeSchemaName = (name: string): string => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase();

    const getSchemaNamesFromResponse = (resp: any): string[] => {
        if (!resp?.content) return [];
        const names = new Set<string>();
        Object.values(resp.content).forEach((contentObj: any) => {
            const schema = contentObj?.schema; if (!schema) return;
            if (schema.$ref) names.add(getRefName(schema.$ref));
            if (schema.oneOf && Array.isArray(schema.oneOf)) schema.oneOf.forEach((sub: any) => { if (sub.$ref) names.add(getRefName(sub.$ref)); if (sub.title) names.add(sub.title); });
            if (schema.anyOf && Array.isArray(schema.anyOf)) schema.anyOf.forEach((sub: any) => { if (sub.$ref) names.add(getRefName(sub.$ref)); if (sub.title) names.add(sub.title); });
            if (schema.allOf && Array.isArray(schema.allOf)) schema.allOf.forEach((sub: any) => { if (sub.$ref) names.add(getRefName(sub.$ref)); if (sub.title) names.add(sub.title); });
            if (schema.title) names.add(schema.title);
        });
        return Array.from(names);
    };

    const truncateText = (text: string, maxLength = 80) => { if (!text) return ''; if (text.length <= maxLength) return text; return text.substring(0, maxLength) + '...'; };

    const pathItem = spec.paths[path] || {};
    const mergedParameters = getMergedParameters(pathItem, operation, spec);
    const resolvedRequestBody = resolveRequestBody(operation.requestBody, spec);
    const pathParams = mergedParameters.filter(p => p.in === 'path');
    const otherParams = mergedParameters.filter(p => p.in !== 'path');
    const requestBodyContentEntries = Object.entries(resolvedRequestBody?.content || {}) as [string, any][];
    const selectedRequestBodyContentType = requestBodyContentType && resolvedRequestBody?.content?.[requestBodyContentType] ? requestBodyContentType : requestBodyContentEntries[0]?.[0] || '';
    const selectedRequestBodyContent = selectedRequestBodyContentType ? resolvedRequestBody?.content?.[selectedRequestBodyContentType] : null;
    const opSecurity = operation.security;
    const isProtected = !!(opSecurity && opSecurity.length > 0) || !!(spec?.security && spec.security.length > 0);

    return (
        <div className="w-full h-full overflow-y-auto p-3 sm:p-6 md:p-8 mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200 select-text font-sans scrollbar-thin min-w-0"
            style={{ maxWidth: '100%' }}>
            <div className="p-4 sm:p-6 rounded-2xl border flex flex-col gap-4 shadow-sm bg-[var(--surface)] border-[var(--border)] min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
                        <MethodBadge method={method} size="md" className="rounded-full px-3 py-1 shrink-0" />
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="font-mono text-sm font-bold truncate tracking-tight break-all text-[var(--text-heading)]">{path}</span>
                            <Tip content="Copy endpoint path">
                                <button onClick={() => { navigator.clipboard.writeText(path); setCopiedPath(true); setTimeout(() => setCopiedPath(false), 2000); }}
                                    className={clsx('w-7 h-7 rounded flex items-center justify-center text-xs transition-colors cursor-pointer select-none shrink-0', copiedPath ? 'text-[var(--method-get)]' : 'text-[var(--text-muted)]')}>
                                    {copiedPath ? <i className="ph ph-check text-[var(--method-get)] text-[11px]"></i> : <i className="ph ph-copy text-[11px]"></i>}
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
                            <span className="inline-flex items-center gap-1.5 pe-2.5 ps-1.5 py-1 text-[10px] font-bold font-sans rounded-full border bg-[var(--method-delete)]/10 border-[var(--method-delete)]/20 text-[var(--method-delete)] select-none animate-pulse">
                                <i className="ph-fill ph-lock-key text-[16px]"></i> Protected
                            </span>
                        )}
                        <Tip content="Share this endpoint">
                            <button onClick={handleShareEndpoint}
                                className="w-7 h-7 rounded flex items-center justify-center text-xs transition-colors cursor-pointer select-none text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10">
                                <i className="ph ph-share-network text-[13px]"></i>
                            </button>
                        </Tip>
                    </div>
                </div>

                <div className="border-t border-[var(--border)]"></div>

                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight font-sans text-[var(--text-heading)] break-words">{operation.summary || 'Endpoint Documentation'}</h1>
                    {operation.description && (
                        <div className="mt-2 text-sm max-w-none text-inherit leading-relaxed animate-in fade-in text-[var(--text)]">
                            <Markdown text={operation.description} />
                        </div>
                    )}
                    {operation.externalDocs && operation.externalDocs.url && (
                        <div className="mt-3">
                            <a href={operation.externalDocs.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--primary-contrast)] transition-all hover:opacity-90 cursor-pointer shadow-sm select-none bg-[var(--primary)]">
                                <i className="ph ph-arrow-square-out text-[10px]"></i>
                                <span>{operation.externalDocs.description || 'View Operation Reference'}</span>
                            </a>
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full space-y-8 mx-auto min-w-0">
                {mergedParameters.length > 0 && (
                    <div className="space-y-3 min-w-0">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">Request Parameters</h2>
                        <div className="border rounded-2xl overflow-hidden animate-in fade-in border-[var(--border)] bg-[var(--surface)] min-w-0">
                            <div className="overflow-x-auto scrollbar-thin">
                                <table className="w-full text-left border-collapse" style={{ minWidth: 560 }}>
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">Parameter Name</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">Location</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">Schema / Pattern</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">Example</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-[var(--text-heading)] border-b border-[var(--border)]">Required</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mergedParameters.map((param, idx) => {
                                            const pattern = getPatternFromParam(param, spec);
                                            return (
                                                <tr key={idx} className="hover:bg-[var(--surface-hover)] transition-colors border-b border-[var(--border)]">
                                                    <td className="px-4 py-3 text-xs align-top">
                                                        <div className="flex items-start flex-wrap gap-1">
                                                            <span className="font-mono font-bold text-[var(--text-heading)]">{param.name}</span>
                                                            {param.description && param.description.length > 80 && (
                                                                <Tip content={param.description}>
                                                                    <button onClick={() => setHelpModalContent({ title: param.name, content: param.description || '' })}
                                                                        className="inline-flex items-center gap-1 text-[10px] text-[var(--primary)] hover:text-[var(--primary-hover)] font-bold bg-[var(--primary)]/5 px-1.5 py-0.5 rounded border border-[var(--primary)]/20 hover:bg-[var(--primary)]/10 cursor-pointer transition-all select-none">
                                                                        <i className="ph ph-question text-[10px]"></i> Info
                                                                    </button>
                                                                </Tip>
                                                            )}
                                                        </div>
                                                        {param.description && (
                                                            <p className="text-[10px] mt-0.5 leading-normal max-w-md break-words text-[var(--text-muted)]">{truncateText(param.description, 80)}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs select-none">
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)]">{param.in}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs">
                                                        <div className="flex flex-col gap-1">
                                                            <div>{renderSchemaButton(param.schema)}</div>
                                                            {pattern && (
                                                                <div className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
                                                                    <span>pattern:</span>
                                                                    <code className="px-1 py-0.5 rounded bg-[var(--background)] text-[var(--method-put)] border border-[var(--border)] select-all text-[9.5px] break-all">{pattern}</code>
                                                                    <Tip content="Test this regex pattern">
                                                                        <button type="button" onClick={() => setPatternToTest(pattern)}
                                                                            className="px-1 py-0.5 text-[9px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20 hover:underline inline-flex items-center gap-0.5 rounded cursor-pointer transition-colors">
                                                                            <i className="ph ph-vial text-[7px]"></i> Test
                                                                        </button>
                                                                    </Tip>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs">
                                                        {param.example !== undefined ? (
                                                            <code className="text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--method-get)]/30 text-[var(--method-get)] font-mono select-all break-all">{String(param.example)}</code>
                                                        ) : param.schema?.example !== undefined ? (
                                                            <code className="text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--method-get)]/30 text-[var(--method-get)] font-mono select-all break-all">{String(param.schema.example)}</code>
                                                        ) : param.schema?.default !== undefined ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[9px] font-semibold select-none text-[var(--text-muted)]">Default:</span>
                                                                <code className="text-[10px] px-1 py-0.5 rounded bg-[var(--background)] border text-[var(--text-muted)] font-mono select-all w-fit break-all">{String(param.schema.default)}</code>
                                                            </div>
                                                        ) : <span className="text-[var(--text-muted)] italic text-[10px]">None</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs select-none">
                                                        {param.required ? <span className="text-[var(--method-delete)] font-bold text-xs">Yes</span> : <span>No</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {selectedRequestBodyContent && (
                    <div className="space-y-3 font-sans min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">Request Body Context</h2>
                            <div className="flex min-w-0 items-center justify-end gap-2 flex-wrap">
                                <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Encoding type</span>
                                <CustomDropdown value={selectedRequestBodyContentType} onChange={setRequestBodyContentType}
                                    options={requestBodyContentEntries.map(([contentType]) => ({ value: contentType, label: contentType }))}
                                    icon="ph ph-code-block text-[13px]" className="min-w-[180px]" />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 animate-in fade-in min-w-0">
                            {resolvedRequestBody.description && <p className="mb-4 text-xs font-semibold leading-relaxed text-[var(--text)]">{resolvedRequestBody.description}</p>}
                            <div key={selectedRequestBodyContentType} className="space-y-4 animate-fade-in">
                                <p className="text-xs font-mono select-none">
                                    <span className="mr-1 font-sans font-semibold text-[var(--text-heading)]">Encoding TYPE:</span>
                                    <span className="rounded bg-[var(--background)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-heading)] break-all">{selectedRequestBodyContentType}</span>
                                </p>
                                <div className="pt-1 min-w-0">{renderSchemaPropertiesTable(selectedRequestBodyContent.schema)}</div>
                                <div className="border-t border-[var(--border)] pt-2">
                                    <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Inspect Body Schema</h4>
                                    <div>{renderSchemaButton(selectedRequestBodyContent.schema)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-3 animate-in fade-in min-w-0">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Response Matrix</h4>
                    <div className="space-y-2">
                        {Object.entries(operation.responses).map(([code, resp]) => {
                            const isCollapsed = collapsedResponses[code] ?? true;
                            const isSuccess = code.startsWith('2');
                            const activeResponseTab = responseActiveTab[code] || 'example';
                            const responseContentEntries = resp.content ? Object.entries(resp.content) as [string, any][] : [];
                            const selectedContentType = responseContentTypes[code] && resp.content?.[responseContentTypes[code]] ? responseContentTypes[code] : responseContentEntries[0]?.[0] || '';
                            const selectedContentObj = selectedContentType && resp.content ? (resp.content as any)[selectedContentType] : null;
                            const setResponseTab = (tab: 'example' | 'schema' | 'enum') => setResponseActiveTab(prev => ({ ...prev, [code]: tab }));
                            const schemaNames = getSchemaNamesFromResponse(resp);

                            return (
                                <div key={code} id={`response-${code}`}
                                    className="rounded-xl border overflow-hidden transition-all duration-150 animate-in fade-in bg-[var(--surface)] border-[var(--border)] group/resp">
                                    <div onClick={() => toggleResponse(code)}
                                        className={clsx(
                                            'px-3 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-[var(--text-muted)]/5 transition-colors gap-2 min-w-0'
                                        )}>
                                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 flex-wrap">
                                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${isSuccess ? 'bg-[var(--method-get)]/10 text-[var(--method-get)] border border-[var(--method-get)]/20' : 'bg-[var(--method-delete)]/10 text-[var(--method-delete)] border border-[var(--method-delete)]/20'}`}>{code}</span>
                                            <span className="text-xs font-semibold leading-none text-[var(--text-heading)] truncate min-w-0 flex-1">
                                                {resp.description || 'Response details'}
                                            </span>
                                            {/* Desktop: schema badges inline next to description */}
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
                                                <button onClick={(e) => handleShareResponse(code, resp, e)}
                                                    className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-colors cursor-pointer border border-transparent hover:border-[var(--primary)]/20">
                                                    <i className="ph ph-share-network text-[12px]"></i>
                                                </button>
                                            </Tip>
                                            <i className={`ph transform transition-transform duration-100 ${isCollapsed ? 'ph-caret-down' : 'ph-caret-up'}`}></i>
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <div className="p-3 sm:p-5 border-t space-y-4 animate-in fade-in border-[var(--border)] min-w-0">
                                            {resp.headers && (
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">Response Headers</p>
                                                    <div className="border rounded-lg overflow-hidden border-[var(--border)]">
                                                        <div className="overflow-x-auto scrollbar-thin">
                                                            <table className="w-full text-xs text-left border-collapse" style={{ minWidth: 400 }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th className="px-3 py-2 font-semibold">Header</th>
                                                                        <th className="px-3 py-2 font-semibold">Details</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {Object.entries(resp.headers).map(([hName, hObj]: any) => (
                                                                        <tr key={hName} className="border-b border-[var(--border)]">
                                                                            <td className="px-3 py-2 font-mono font-bold whitespace-nowrap text-[var(--text-heading)]">{hName}</td>
                                                                            <td className="px-3 py-2 leading-relaxed text-[var(--text)]">
                                                                                {hObj.description}
                                                                                {hObj.schema?.example && <div className="font-mono text-[9px] mt-0.5 opacity-80 overflow-x-auto whitespace-pre-wrap">Ex: {hObj.schema.example}</div>}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {resp.content && selectedContentObj ? (
                                                <>
                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                        <div className="flex p-0.5 rounded-lg border w-fit border-[var(--border)] bg-[var(--background)] flex-wrap">
                                                            <button onClick={() => setResponseTab('example')}
                                                                className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeResponseTab === 'example' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                                                                <span className="hidden sm:inline">Example Representation</span>
                                                                <span className="sm:hidden">Example</span>
                                                            </button>
                                                            {(() => {
                                                                const s = resolveReference(viewerExampleSchemas[code] || selectedContentObj?.schema);
                                                                const hasEnum = s?.enum && Array.isArray(s.enum) && s.enum.length > 0;
                                                                return hasEnum ? (
                                                                    <button onClick={() => setResponseTab('enum')}
                                                                        className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeResponseTab === 'enum' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                                                                        Enum
                                                                    </button>
                                                                ) : null;
                                                            })()}
                                                            <button onClick={() => setResponseTab('schema')}
                                                                className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeResponseTab === 'schema' ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' : 'hover:opacity-80'}`}>
                                                                <span className="hidden sm:inline">Unified Schema</span>
                                                                <span className="sm:hidden">Schema</span>
                                                            </button>
                                                        </div>
                                                        {responseContentEntries.length > 1 && (
                                                            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                                                <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 text-[var(--text-muted)]">Format</span>
                                                                <CustomDropdown value={selectedContentType}
                                                                    onChange={(val) => setResponseContentTypes(prev => ({ ...prev, [code]: val }))}
                                                                    options={responseContentEntries.map(([mime]) => ({ value: mime, label: mime }))}
                                                                    icon="ph ph-code-block text-[14px]" className="w-full max-w-[200px]" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-3 min-w-0">
                                                        {(() => {
                                                            const cType = selectedContentType;
                                                            const cObj = selectedContentObj;
                                                            const activeSchema = viewerExampleSchemas[code] || cObj.schema;
                                                            const resolvedSchema = resolveReference(activeSchema);
                                                            const isEnum = resolvedSchema?.enum && Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0;
                                                            return (
                                                                <div key={cType} className="space-y-3 min-w-0">
                                                                    <p className="text-[10px] font-mono select-none text-[var(--text-muted)] break-all">Content Type: {cType}</p>
                                                                    {activeResponseTab === 'example' ? (
                                                                        <div className="space-y-3 min-w-0">
                                                                            <div className="pt-2 border-t border-[var(--border)] min-w-0">
                                                                                <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-[var(--text-muted)]">Inspect Response Schema</h4>
                                                                                <div className="flex flex-col gap-2 min-w-0">
                                                                                    <div className="min-w-0 overflow-x-auto scrollbar-thin">{renderSchemaTypeExample(cObj.schema, code)}</div>
                                                                                    {activeSchema?.description && (
                                                                                        <div className="text-xs p-3 rounded-lg border border-[var(--primary)]/10 bg-[var(--primary)]/5 mt-1">
                                                                                            <div className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--primary)] mb-1">Schema Description:</div>
                                                                                            <div className="markdown-body"><Markdown text={activeSchema.description} /></div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <CodeViewer code={getResponseExampleSnippet(activeSchema, cObj, cType)} language={getLanguageForContentType(cType)} maxHeight="none" />
                                                                        </div>
                                                                    ) : activeResponseTab === 'enum' && isEnum ? (
                                                                        <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
                                                                            {resolvedSchema.enum.map((val: any) =>
                                                                                <span key={JSON.stringify(val)} className="px-2.5 py-1 rounded-lg text-xs font-mono border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] break-all">{JSON.stringify(val)}</span>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="space-y-3 min-w-0">
                                                                            <div className="pt-2 border-t border-[var(--border)] min-w-0">
                                                                                <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-[var(--text-muted)]">Inspect Response Schema</h4>
                                                                                <div className="flex flex-col gap-2 min-w-0">
                                                                                    <div className="min-w-0 overflow-x-auto scrollbar-thin">{renderSchemaTypeExample(cObj.schema, code)}</div>
                                                                                    {activeSchema?.description && (
                                                                                        <div className="text-xs p-3 rounded-lg border border-[var(--primary)]/10 bg-[var(--primary)]/5 mt-1">
                                                                                            <div className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--primary)] mb-1">Schema Description:</div>
                                                                                            <div className="markdown-body"><Markdown text={activeSchema.description} /></div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {renderSchemaPropertiesTable(activeSchema)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-xs italic text-[11px] text-[var(--text-muted)]">Does not return structured body payload.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {helpModalContent && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[2000] backdrop-blur-[2px] animate-in fade-in duration-150" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setHelpModalContent(null); }}>
                    <div className="w-full max-w-lg rounded-2xl border flex flex-col max-h-[80vh] overflow-hidden shadow-2xl transition-transform animate-in fade-in zoom-in-95 duration-150 bg-[var(--surface)] border-[var(--border)]">
                        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b flex items-center justify-between border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad shrink-0">
                            <span className="font-bold text-sm tracking-wide text-[var(--text-heading)] truncate">
                                <i className="ph ph-info mr-1.5 text-[var(--primary)]"></i>{helpModalContent.title}
                            </span>
                            <Tip content="Close">
                                <button onClick={() => setHelpModalContent(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                                    <i className="ph ph-x"></i>
                                </button>
                            </Tip>
                        </div>
                        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs leading-relaxed scrollbar-thin text-[var(--text)]">
                            <div className="text-xs leading-relaxed opacity-95">{helpModalContent.content}</div>
                        </div>
                        <div className="px-4 sm:px-5 py-3 border-t text-right border-[var(--border)] bg-[var(--background)] shrink-0">
                            <button onClick={() => setHelpModalContent(null)}
                                className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer transition-colors shadow-sm select-none">Close Help</button>
                        </div>
                    </div>
                </div>
            )}

            {exampleModalContent && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[3000] backdrop-blur-[2px] animate-in fade-in duration-150" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setExampleModalContent(null); }}>
                    <div className="w-full max-w-lg rounded-2xl border flex flex-col max-h-[80vh] overflow-hidden shadow-2xl transition-transform animate-in fade-in zoom-in-95 duration-150 bg-[var(--surface)] border-[var(--border)]">
                        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b flex items-center justify-between border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad shrink-0">
                            <span className="font-bold text-sm tracking-wide text-[var(--text-heading)] truncate">
                                <i className="ph ph-eye mr-1.5 text-[var(--primary)]"></i>{exampleModalContent.title}
                            </span>
                            <Tip content="Close">
                                <button onClick={() => setExampleModalContent(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                                    <i className="ph ph-x"></i>
                                </button>
                            </Tip>
                        </div>
                        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs leading-relaxed scrollbar-thin text-[var(--text)]">
                            <CodeViewer code={exampleModalContent.content} language="json" maxHeight="none" />
                        </div>
                        <div className="px-4 sm:px-5 py-3 border-t text-right border-[var(--border)] bg-[var(--background)] shrink-0">
                            <button onClick={() => setExampleModalContent(null)}
                                className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer transition-colors shadow-sm select-none">Close Example</button>
                        </div>
                    </div>
                </div>
            )}

            {patternToTest && <PatternTesterModal pattern={patternToTest} onClose={() => setPatternToTest(null)} />}

            {shareModal && <ShareModal isOpen={!!shareModal} onClose={() => setShareModal(null)} url={shareModal.url} title={shareModal.title} description={shareModal.description} />}
        </div>
    );
}
