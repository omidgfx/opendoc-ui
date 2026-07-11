import React, { useEffect, useState } from 'react';
import CodeViewer from '../../common/CodeViewer';
import SchemaPropertiesTable from '../../schema/SchemaPropertiesTable';
import Markdown from '../../common/Markdown';
import PatternTesterModal from '../PatternTesterModal';
import CustomDropdown from '../../common/CustomDropdown';
import ShareModal from '../ShareModal';
import * as jsYaml from 'js-yaml';
import clsx from 'clsx';
import { generateSingleSchemaFile } from '../../../utils/schemaExport';

interface ModalsStackProps {
    modals: Array<{ schemaName: string; schema: any; }>;
    componentsSchemas: { [key: string]: any; } | undefined;
    onPushSchema: (schemaName: string) => void;
    onPopSchema: () => void;
    onCloseAll: () => void;
    parsableKey?: string;
}

export default function ModalsStack({
                                        modals,
                                        componentsSchemas,
                                        onPushSchema,
                                        onPopSchema,
                                        onCloseAll,
                                        parsableKey = 'API'
                                    }: ModalsStackProps) {
    const [helpModalContent, setHelpModalContent] = useState<{
        title: string;
        content: string;
        isJson?: boolean;
    } | null>(null);
    const [activeTabs, setActiveTabs] = useState<{ [index: number]: 'table' | 'example' | 'enum'; }>({});
    const [exampleEncodings, setExampleEncodings] = useState<Record<number, string>>({});
    const [patternToTest, setPatternToTest] = useState<string | null>(null);
    const [shareModal, setShareModal] = useState<{ url: string; title: string; description?: string } | null>(null);

    // ESC handling for stack: pop one by one, then close
    useEffect(() => {
        if (modals.length === 0) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (helpModalContent || patternToTest || shareModal) return;
            e.preventDefault();
            if (modals.length > 1) {
                onPopSchema();
            } else {
                onCloseAll();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [modals.length, helpModalContent, patternToTest, shareModal, onPopSchema, onCloseAll]);

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

    const getRefName = (refStr: string): string => {
        if (!refStr) return '';
        const parts = refStr.split('/');
        return parts[parts.length - 1];
    };

    const resolveReference = (item: any): any => {
        if (!item) return item;
        if (item.$ref) {
            const refName = getRefName(item.$ref);
            const refSchema = componentsSchemas?.[refName];
            if (refSchema) {
                return resolveReference(refSchema);
            }
        }
        return item;
    };

    const getSchemaShareUrl = (schemaName: string) => {
        if (typeof window === 'undefined') return '';
        const encodedKey = encodeURIComponent(parsableKey);
        const encodedSchema = encodeURIComponent(schemaName);
        return `${window.location.origin}${window.location.pathname}#/parsable/${encodedKey}/schema-explorer?schemas=${encodedSchema}`;
    };

    const handleShareSchema = (schemaName: string) => {
        const url = getSchemaShareUrl(schemaName);
        setShareModal({
            url,
            title: `${schemaName} - Schema`,
            description: `Check out ${schemaName} schema in ${parsableKey} - ${componentsSchemas?.[schemaName]?.description?.slice(0, 140) || 'OpenAPI schema model'}`
        });
    };

    const traverseSchemaProperties = (schema: any, prefix = '', visited = new Set<string>()): {
        [name: string]: any;
    } => {
        if (!schema) return {};

        let props: { [name: string]: any; } = {};

        if (schema.$ref) {
            const refName = getRefName(schema.$ref);
            if (visited.has(refName)) return {};
            visited.add(refName);
            const refSchema = componentsSchemas?.[refName];
            if (refSchema) {
                return traverseSchemaProperties(refSchema, prefix, visited);
            }
            return {};
        }

        if (schema.allOf && Array.isArray(schema.allOf)) {
            schema.allOf.forEach((sub: any) => {
                props = {...props, ...traverseSchemaProperties(sub, prefix, new Set(visited))};
            });
        }

        if (schema.properties) {
            Object.entries(schema.properties).forEach(([name, prop]: [string, any]) => {
                const key = prefix ? `${prefix}.${name}` : name;
                props[key] = prop;

                const resolved = resolveReference(prop);
                if (resolved && (resolved.type === 'object' || resolved.properties || resolved.allOf)) {
                    const nested = traverseSchemaProperties(resolved, key, new Set(visited));
                    props = {...props, ...nested};
                } else if (resolved && resolved.type === 'array' && resolved.items) {
                    const resolvedItems = resolveReference(resolved.items);
                    if (resolvedItems && (resolvedItems.type === 'object' || resolvedItems.properties || resolvedItems.allOf)) {
                        const nested = traverseSchemaProperties(resolvedItems, `${key}.*`, new Set(visited));
                        props = {...props, ...nested};
                    }
                }
            });
        }

        if (schema.oneOf && Array.isArray(schema.oneOf)) {
            schema.oneOf.forEach((sub: any) => {
                props = {...props, ...traverseSchemaProperties(sub, prefix, new Set(visited))};
            });
        }
        if (schema.anyOf && Array.isArray(schema.anyOf)) {
            schema.anyOf.forEach((sub: any) => {
                props = {...props, ...traverseSchemaProperties(sub, prefix, new Set(visited))};
            });
        }

        return props;
    };

    const renderSchemaType = (prop: any): React.ReactNode => {
        if (!prop) {
            return <span className="text-xs font-mono opacity-50">any</span>;
        }

        const renderTypeName = (tValue: any, format?: string) => {
            if (Array.isArray(tValue)) {
                return tValue.map((t) => `${t}${format ? ` (${format})` : ''}`).join(' | ');
            }
            return `${tValue || 'any'}${format ? ` (${format})` : ''}`;
        };

        if (prop.$ref) {
            const refName = getRefName(prop.$ref);
            return (
                <button
                    onClick={() => onPushSchema(refName)}
                    className="text-[var(--primary)] hover:underline font-semibold text-xs text-left inline-flex items-center gap-1 cursor-pointer">

                    <i className="ph ph-diamonds-four text-[10px]"></i> {refName}
                </button>);

        }

        if (prop.oneOf && Array.isArray(prop.oneOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span
                        className="text-[10px] font-bold text-[var(--method-options)] uppercase tracking-wider font-sans">One
                        Of:</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.oneOf.map((sub: any, sIdx: number) =>
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 &&
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">|</span>}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        )}
                    </div>
                </div>);

        }

        if (prop.anyOf && Array.isArray(prop.anyOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span
                        className="text-[10px] font-bold text-[var(--method-put)] uppercase tracking-wider font-sans">Any
                        Of:</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.anyOf.map((sub: any, sIdx: number) =>
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 &&
                                    <span className="text-[var(--text-muted)] font-mono text-xs select-none">|</span>}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        )}
                    </div>
                </div>);

        }

        if (prop.allOf && Array.isArray(prop.allOf)) {
            return (
                <div className="flex flex-col gap-1 items-start">
                    <span
                        className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-sans">All
                        Of:</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {prop.allOf.map((sub: any, sIdx: number) =>
                            <React.Fragment key={sIdx}>
                                {sIdx > 0 && <span
                                    className="text-[var(--text-muted)] font-mono text-xs select-none">&amp;</span>}
                                {renderSchemaType(sub)}
                            </React.Fragment>
                        )}
                    </div>
                </div>);

        }

        if (prop.type === 'array' && prop.items) {
            if (prop.items.$ref) {
                const refName = getRefName(prop.items.$ref);
                return (
                    <span className="text-xs font-sans">
                        Array&lt;
                        <button
                            onClick={() => onPushSchema(refName)}
                            className="text-[var(--primary)] hover:underline font-semibold cursor-pointer">

                            {refName}
                        </button>
                        &gt;
                    </span>);

            }

            if (prop.items.oneOf || prop.items.anyOf) {
                return (
                    <span className="text-xs font-sans">
                        Array&lt;{renderSchemaType(prop.items)}&gt;
                    </span>);

            }

            const resolvedItemsType = Array.isArray(prop.items.type) ? prop.items.type.join(' | ') : prop.items.type || 'any';
            return <span className="text-xs font-mono text-[var(--text-muted)]">
                Array&lt;{resolvedItemsType}&gt;</span>;
        }

        return (
            <span className="font-mono text-xs text-[var(--text)]">
                {renderTypeName(prop.type, prop.format)}
            </span>);

    };

    const getMockSnippet = (schema: any): string => {
        if (!schema) return 'null';

        const generateMockFromPattern = (pattern: string): string => {
            if (!pattern) return 'string';
            if (pattern.includes('uuid') || pattern.includes('UUID')) {
                return '123e4567-e89b-12d3-a456-426614174000';
            }
            if (pattern.includes('^[0-9]+$') || pattern.includes('^\\d+$')) {
                return '12345';
            }
            if (pattern.includes('^[a-zA-Z0-9]+$')) {
                return 'string123';
            }
            if (pattern.includes('@') || pattern.includes('email')) {
                return 'user@example.com';
            }
            if (pattern.includes('phone') || pattern.includes('^[\\+]?[0-9]')) {
                return '+1234567890';
            }
            if (pattern.includes('date') || pattern.includes('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) {
                return '2026-07-03';
            }

            let generated = '';
            let cleaned = pattern.replace(/^\^/, '').replace(/\$$/, '');
            let i = 0;
            while (i < cleaned.length) {
                let char = cleaned[i];
                if (char === '\\') {
                    let next = cleaned[i + 1];
                    if (next === 'd') {
                        generated += '5';
                    } else if (next === 'w') {
                        generated += 'a';
                    } else if (next === 's') {
                        generated += ' ';
                    } else {
                        generated += next || '';
                    }
                    i += 2;
                } else if (char === '[') {
                    let endIdx = cleaned.indexOf(']', i);
                    if (endIdx !== -1) {
                        let content = cleaned.substring(i + 1, endIdx);
                        if (content.includes('0-9') || content.includes('\\d')) {
                            generated += '9';
                        } else if (content.includes('a-z')) {
                            generated += 'x';
                        } else if (content.includes('A-Z')) {
                            generated += 'X';
                        } else if (content.length > 0) {
                            generated += content[0];
                        } else {
                            generated += 'a';
                        }
                        i = endIdx + 1;
                    } else {
                        generated += '[';
                        i++;
                    }
                } else if (cleaned[i] === '{') {
                    let endIdx = cleaned.indexOf('}', i);
                    if (endIdx !== -1) {
                        let countStr = cleaned.substring(i + 1, endIdx);
                        let count = parseInt(countStr, 10) || 1;
                        let lastChar = generated[generated.length - 1] || 'a';
                        for (let k = 0; k < count - 1; k++) {
                            generated += lastChar;
                        }
                        i = endIdx + 1;
                    } else {
                        generated += '{';
                        i++;
                    }
                } else if (char === '(' || char === ')' || char === '?' || char === '*' || char === '+') {
                    i++;
                } else if (char === '|') {
                    break;
                } else {
                    generated += char;
                    i++;
                }
            }
            return generated || 'string';
        };

        const generateMock = (s: any, depth = 0, visited = new Set<string>()): any => {
            if (!s) return null;
            if (depth > 1000) return {};

            if (s.$ref) {
                const refName = getRefName(s.$ref);
                if (visited.has(refName)) return {};
                visited.add(refName);
                const refSchema = componentsSchemas?.[refName];
                if (refSchema) {
                    return generateMock(refSchema, depth + 1, visited);
                }
                return {};
            }

            if (s.const !== undefined) return s.const;
            if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
            if (s.example !== undefined) return s.example;
            if (s.default !== undefined) return s.default;

            if (s.allOf && Array.isArray(s.allOf)) {
                let merged = {};
                s.allOf.forEach((sub: any) => {
                    const subMock = generateMock(sub, depth + 1, new Set(visited));
                    if (typeof subMock === 'object' && subMock !== null) {
                        merged = {...merged, ...subMock};
                    } else if (subMock !== null) {
                        merged = subMock;
                    }
                });
                return merged;
            }

            if (s.oneOf && Array.isArray(s.oneOf) && s.oneOf.length > 0) {
                return generateMock(s.oneOf[0], depth + 1, new Set(visited));
            }

            if (s.anyOf && Array.isArray(s.anyOf) && s.anyOf.length > 0) {
                return generateMock(s.anyOf[0], depth + 1, new Set(visited));
            }

            const typeVal = s.type;
            const resolvedType = Array.isArray(typeVal) ? typeVal.find((t) => t !== 'null') : typeVal;

            if (resolvedType === 'object' || s.properties) {
                const obj: any = {};
                if (s.properties) {
                    Object.entries(s.properties).forEach(([k, v]: [string, any]) => {
                        obj[k] = generateMock(v, depth + 1, new Set(visited));
                    });
                }
                return obj;
            }

            if (resolvedType === 'array') {
                return [generateMock(s.items || {}, depth + 1, new Set(visited))];
            }

            if (resolvedType === 'string') {
                if (s.format === 'date-time') return new Date().toISOString();
                if (s.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
                if (s.pattern) {
                    return generateMockFromPattern(s.pattern);
                }
                return s.enum ? s.enum[0] : 'string';
            }
            if (resolvedType === 'integer' || resolvedType === 'number') {
                return 0;
            }
            if (resolvedType === 'boolean') {
                return true;
            }

            if (s.properties) {
                const obj: any = {};
                Object.entries(s.properties).forEach(([k, v]: [string, any]) => {
                    obj[k] = generateMock(v, depth + 1, new Set(visited));
                });
                return obj;
            }

            return null;
        };

        try {
            return JSON.stringify(generateMock(schema), null, 2);
        } catch {
            return '{}';
        }
    };

    const escapeXml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const toXml = (value: any, nodeName = 'root', depth = 0): string => {
        const indent = '  '.repeat(depth);
        const safeName = String(nodeName || 'item').replace(/[^A-Za-z0-9_.:-]/g, '_') || 'item';
        if (value === null || value === undefined) return `${indent}<${safeName} />`;
        if (Array.isArray(value)) {
            return value.map((item) => toXml(item, 'item', depth)).join('\n');
        }
        if (typeof value === 'object') {
            const children = Object.entries(value).map(([key, child]) => toXml(child, key, depth + 1)).join('\n');
            return children ?
                `${indent}<${safeName}>\n${children}\n${indent}</${safeName}>` :
                `${indent}<${safeName}></${safeName}>`;
        }
        return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    };

    const formatSimulationExample = (schema: any, schemaName: string, encoding: string) => {
        const json = getMockSnippet(schema);
        let value: any;
        try {
            value = JSON.parse(json);
        } catch {
            value = json;
        }

        if (encoding === 'application/xml') {
            return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, schemaName || 'root')}`;
        }
        if (encoding === 'application/yaml') {
            return jsYaml.dump(value, {noRefs: true, lineWidth: 100});
        }
        return typeof value === 'string' ? JSON.stringify(value, null, 2) : JSON.stringify(value, null, 2);
    };

    const activeSchemaObj = modals[modals.length - 1];
    const activeModalIndex = modals.length - 1;
    const resolvedSchema = resolveReference(activeSchemaObj.schema) || activeSchemaObj.schema;
    const isEnum = resolvedSchema?.enum && Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0;
    const activeTab = activeTabs[activeModalIndex] || 'table';
    const activeExampleEncoding = exampleEncodings[activeModalIndex] || 'application/json';
    const simulationLanguage = activeExampleEncoding === 'application/xml' ?
        'xml' :
        activeExampleEncoding === 'application/yaml' ? 'yaml' : 'json';

    const setTab = (tab: 'table' | 'example' | 'enum') => {
        setActiveTabs((prev) => ({
            ...prev,
            [activeModalIndex]: tab
        }));
    };

    const properties = traverseSchemaProperties(activeSchemaObj.schema);

    return (
        <>
            <div
                className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-150"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) onCloseAll();
                }}
            >
                <div
                    className="w-full max-w-4xl h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-200 bg-[var(--surface)] border-[var(--border)]">

                    <div
                        className="px-6 py-4 flex flex-col gap-3 border-b shrink-0 border-[var(--border)] bg-[var(--background)]">

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span
                                    className="size-10 rounded-lg flex items-center justify-center text-xs font-bold text-[var(--primary)]"
                                    style={{backgroundColor: 'rgba(79, 70, 229, 0.1)'}}>
                                    <i className="ph ph-diamonds-four text-[24px]"></i>
                                </span>
                                <div>
                                    <h3 className="font-semibold text-base font-sans text-[var(--text-heading)]">

                                        {activeSchemaObj.schemaName}
                                    </h3>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Schema Explorer
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleShareSchema(activeSchemaObj.schemaName)}
                                    className="h-8 w-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10"
                                    title="Share this schema link"
                                >
                                    <i className="ph ph-share-network text-[14px]"></i>
                                </button>
                                <button
                                    onClick={() => {
                                        if (componentsSchemas) {
                                            generateSingleSchemaFile(
                                                activeSchemaObj.schemaName,
                                                activeSchemaObj.schema,
                                                componentsSchemas,
                                                parsableKey
                                            );
                                        }
                                    }}
                                    className="h-8 px-3 rounded-lg border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer bg-[var(--method-get)] text-[var(--method-get-contrast)] border-[var(--method-get)] hover:opacity-90"
                                    title="Export this schema as TypeScript model"
                                >
                                    <i className="ph ph-download-simple text-[12px]"></i>
                                    Export TS
                                </button>
                                <button
                                    onClick={onCloseAll}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-all cursor-pointer select-none text-[var(--text-muted)]"

                                    title="Close schema viewer">

                                    <i className="ph ph-x"></i>
                                </button>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none text-xs select-none">
                            <span
                                className="text-[var(--text-muted)] font-semibold flex items-center shrink-0">Path:</span>
                            {modals.map((m, idx) => {
                                const isLast = idx === modals.length - 1;
                                return (
                                    <div key={idx} className="flex items-center gap-1.5 shrink-0">
                                        {idx > 0 &&
                                            <i className="ph ph-caret-right text-[9px] text-[var(--text-muted)]"></i>}
                                        <div className="flex items-center gap-0.5">
                                            <button
                                                disabled={isLast}
                                                onClick={() => {
                                                    for (let p = modals.length - 1; p > idx; p--) {
                                                        onPopSchema();
                                                    }
                                                }}
                                                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all select-none truncate max-w-[140px] ${
                                                    isLast ?
                                                        'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold pointer-events-none' :
                                                        'bg-[var(--text-muted)]/10 hover:bg-[var(--text-muted)]/20 text-[var(--primary)] cursor-pointer'}`}
                                            >
                                                {m.schemaName}
                                            </button>
                                            {!isLast && (
                                                <button
                                                    onClick={() => handleShareSchema(m.schemaName)}
                                                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors cursor-pointer"
                                                    title={`Share ${m.schemaName}`}
                                                >
                                                    <i className="ph ph-share-network"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>);

                            })}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                            <i className="ph ph-keyboard"></i>
                            <span>Press <kbd className="px-1 py-0.5 rounded border text-[9px] bg-[var(--surface-hover)] border-[var(--border)]">ESC</kbd> to {modals.length > 1 ? 'go back' : 'close'}</span>
                        </div>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1 font-sans scrollbar-thin">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div
                                className="flex w-fit rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                                <button
                                    onClick={() => setTab('table')}
                                    className={clsx(
                                        'rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                                        activeTab === 'table' ?
                                            'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' :
                                            'hover:bg-[var(--surface-hover)]'
                                    )}>

                                    <i className="ph ph-table mr-1 text-[10px]"/> Scope Table
                                </button>
                                {isEnum &&
                                    <button
                                        onClick={() => setTab('enum')}
                                        className={clsx(
                                            'rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                                            activeTab === 'enum' ?
                                                'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' :
                                                'hover:bg-[var(--surface-hover)]'
                                        )}>

                                        <i className="ph ph-list-numbers mr-1 text-[10px]"/> Enum Values
                                    </button>
                                }
                                <button
                                    onClick={() => setTab('example')}
                                    className={clsx(
                                        'rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                                        activeTab === 'example' ?
                                            'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm font-bold' :
                                            'hover:bg-[var(--surface-hover)]'
                                    )}>

                                    <i className="ph ph-vial mr-1 text-[10px]"/> Unified Simulation Example
                                </button>
                            </div>

                            {activeTab === 'example' &&
                                <div className="flex min-w-[245px] items-center gap-2 animate-fade-in">
                                    <span
                                        className="shrink-0 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                        Encoding type
                                    </span>
                                    <CustomDropdown
                                        value={activeExampleEncoding}
                                        onChange={(encoding) => setExampleEncodings((current) => ({
                                            ...current,
                                            [activeModalIndex]: encoding
                                        }))}
                                        options={[
                                            {value: 'application/json', label: 'application/json'},
                                            {value: 'application/xml', label: 'application/xml'},
                                            {value: 'application/yaml', label: 'application/yaml'}]
                                        }
                                        icon="ph ph-code-block text-[13px]"
                                        className="min-w-[170px]"/>

                                </div>
                            }
                        </div>
                        {(activeSchemaObj.schema?.description || activeSchemaObj.schema?.externalDocs) &&
                            <div
                                className="mb-4 p-3 rounded-lg border text-xs leading-relaxed space-y-3 bg-[var(--background)] border-[var(--border)]">

                                {activeSchemaObj.schema?.description &&
                                    <div>
                                        <p className="font-semibold mb-1 text-[var(--text-heading)]">
                                            Description:</p>
                                        <div style={{}}>
                                            <Markdown text={activeSchemaObj.schema.description}/>
                                        </div>
                                    </div>
                                }
                                {activeSchemaObj.schema?.externalDocs && activeSchemaObj.schema.externalDocs.url &&
                                    <div className="pt-2 border-t border-[var(--border)]">
                                        <p className="font-semibold mb-1 text-[var(--text-heading)]">
                                            External Reference Docs:</p>
                                        <a
                                            href={activeSchemaObj.schema.externalDocs.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20 rounded cursor-pointer transition-colors">

                                            <i className="ph ph-arrow-square-out text-[8.5px]"></i>
                                            <span>{activeSchemaObj.schema.externalDocs.description || 'Open External Documentation'}</span>
                                        </a>
                                    </div>
                                }
                            </div>
                        }

                        {activeTab === 'example' ?
                            <div className="space-y-2 animate-in fade-in" key={activeExampleEncoding}>
                                <CodeViewer
                                    code={formatSimulationExample(
                                        activeSchemaObj.schema,
                                        activeSchemaObj.schemaName,
                                        activeExampleEncoding
                                    )}
                                    language={simulationLanguage}
                                    maxHeight="none"/>

                            </div> :
                            activeTab === 'enum' && isEnum ?
                                <div
                                    className="flex flex-wrap gap-2 p-3 rounded-xl border animate-in fade-in border-[var(--border)] bg-[var(--background)]">

                                    {resolvedSchema.enum.map((val: any) =>
                                        <span key={val}
                                              className="px-2.5 py-1 rounded-lg text-xs font-mono border bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">


                                            {JSON.stringify(val)}
                                        </span>
                                    )}
                                </div> :

                                <div className="space-y-4 animate-in fade-in">
                                    {activeSchemaObj.schema?.type &&
                                        <div className="text-xs font-mono">
                                            <span className="font-sans font-semibold mr-1 text-[var(--text-heading)]">
                                                Base Type:</span>
                                            <span
                                                className="px-2 py-0.5 rounded text-[11px] border bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]">


                                                {activeSchemaObj.schema.type}
                                            </span>
                                        </div>
                                    }

                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        Properties
                                    </h4>
                                    <SchemaPropertiesTable
                                        properties={properties}
                                        schema={activeSchemaObj.schema}
                                        resolveReference={resolveReference}
                                        getRefName={getRefName}
                                        onPushSchema={onPushSchema}
                                        onViewExample={(name, subSchema) => setHelpModalContent({
                                            title: `${name} Simulated Example`,
                                            content: getMockSnippet(subSchema),
                                            isJson: true
                                        })}
                                        onTestPattern={setPatternToTest}/>

                                </div>
                        }
                    </div>

                    <div
                        className="px-6 py-3 text-[11px] flex justify-between border-t shrink-0 border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]">


                        <span>Indexed reference schemas</span>
                        <span>Stack Depth: {activeIndex + 1} nested level</span>
                    </div>
                </div>
            </div>

            {helpModalContent &&
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[3000] backdrop-blur-[2px]"
                     style={{backgroundColor: 'rgba(0, 0, 0, 0.4)'}}
                     onMouseDown={(e) => {
                         if (e.target === e.currentTarget) setHelpModalContent(null);
                     }}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl border flex flex-col max-h-[80vh] overflow-hidden shadow-2xl transition-transform animate-in fade-in zoom-in-95 duration-150 bg-[var(--surface)] border-[var(--border)]">

                        <div
                            className="px-5 py-4 border-b flex items-center justify-between border-[var(--border)] bg-[var(--background)]">

                            <span className="font-bold text-sm tracking-wide text-[var(--text-heading)]">
                                <i className="ph ph-info mr-1.5 text-[var(--primary)]"></i> {helpModalContent.title}
                            </span>
                            <button onClick={() => setHelpModalContent(null)}
                                    className="w-8 h-8 rounded-lg hover:bg-[var(--surface-hover)] hover:text-[var(--primary-hover)] flex items-center justify-center text-sm cursor-pointer transition-colors text-[var(--text-muted)]">

                                <i className="ph ph-x"></i>
                            </button>
                        </div>
                        <div
                            className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed max-w-none text-inherit scrollbar-thin text-[var(--text)]">

                            {helpModalContent.isJson ?
                                <CodeViewer code={helpModalContent.content} language="json" maxHeight="none"/> :

                                <div className="text-xs leading-relaxed opacity-95 whitespace-pre-wrap">
                                    {helpModalContent.content}
                                </div>
                            }
                        </div>
                        <div className="px-5 py-3 border-t text-right border-[var(--border)] bg-[var(--background)]">

                            <button onClick={() => setHelpModalContent(null)}
                                    className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 transition-colors shadow-sm select-none bg-[var(--primary)]">

                                Close Help
                            </button>
                        </div>
                    </div>
                </div>
            }

            {patternToTest &&
                <PatternTesterModal
                    pattern={patternToTest}
                    onClose={() => setPatternToTest(null)}/>

            }

            {shareModal &&
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            }
        </>);

}