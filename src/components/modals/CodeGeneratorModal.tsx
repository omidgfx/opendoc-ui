import {useEffect, useMemo, useRef, useState} from 'react';
import {ActiveAuth, OpenApiSpec} from '../../types';
import CodeViewer from '../common/CodeViewer';
import {Tip} from '../common/Tooltip';
import {buildCodegenRequest, generateRequestSnippet, type CodeLanguage} from '../../utils/export/codeGeneration';
import type {CodeLineMarker} from '../../utils/lineMarkers';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import {useModalTransition} from '../../hooks/useModalTransition';
import {getRefName, resolveReference as resolveOpenApiReference, resolveRequestBody} from '../../utils/openapi';
import {schemaVariantLabel} from '../../utils/schemaProperties';
import {applySchemaBranchSelections} from '../../utils/schema/branchSelections';

interface CodeGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    spec: OpenApiSpec;
    specKey: string;
    path: string;
    method: string;
    operation: any;
    selectedServer: string;
    serverVariables?: Record<string, string>;
    activeAuth: ActiveAuth;
}

const CODE_LANGUAGES: Array<{id: CodeLanguage; name: string}> = [
    {id: 'curl', name: 'cURL'},
    {id: 'js-fetch', name: 'JS Fetch'},
    {id: 'js-axios', name: 'Axios'},
    {id: 'angular', name: 'Angular'},
    {id: 'laravel', name: 'Laravel'},
    {id: 'php', name: 'PHP'},
    {id: 'python', name: 'Python'},
    {id: 'go', name: 'Go'},
    {id: 'csharp', name: 'C#'},
];

export default function CodeGeneratorModal({
    isOpen,
    onClose,
    spec,
    specKey,
    path,
    method,
    operation,
    selectedServer,
    serverVariables,
    activeAuth,
}: CodeGeneratorModalProps) {
    const [selectedLang, setSelectedLang] = useState<CodeLanguage>('curl');
    const [selectedRootBranchIndex, setSelectedRootBranchIndex] = useState(0);
    const [branchMenuOpen, setBranchMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const {shouldRender, requestClose, backdropClassName} = useModalTransition(isOpen, onClose);
    useModalShortcuts({isOpen, onClose: requestClose});

    const resolveReference = (item: any): any => resolveOpenApiReference(item, spec);
    const selectionScopeKey = `${specKey || 'default'}:request:${method.toLowerCase()}:${path}`;
    const resolvedRequestBody = useMemo(
        () => resolveRequestBody(operation.requestBody, spec),
        [operation.requestBody, spec],
    );
    const requestBodyContentType = useMemo(
        () => Object.keys(resolvedRequestBody?.content || {})[0] || '',
        [resolvedRequestBody],
    );
    const requestBodyMedia = requestBodyContentType ? resolvedRequestBody?.content?.[requestBodyContentType] : null;
    const rawRequestBodySchema = requestBodyMedia?.schema;
    const resolvedRequestBodySchema = rawRequestBodySchema
        ? resolveReference(rawRequestBodySchema) || rawRequestBodySchema
        : null;
    const rootOneOfBranches = Array.isArray(resolvedRequestBodySchema?.oneOf) ? resolvedRequestBodySchema.oneOf : [];

    useEffect(() => {
        setSelectedRootBranchIndex(0);
        setBranchMenuOpen(false);
    }, [isOpen, path, method, requestBodyContentType]);

    useEffect(() => {
        if (!branchMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            setBranchMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setBranchMenuOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [branchMenuOpen]);

    const selectedRequestBodySchema = useMemo(() => {
        if (!rawRequestBodySchema) return undefined;
        const baseSchema =
            rootOneOfBranches.length > 0
                ? rootOneOfBranches[Math.max(0, Math.min(rootOneOfBranches.length - 1, selectedRootBranchIndex))]
                : rawRequestBodySchema;
        return applySchemaBranchSelections(baseSchema, selectionScopeKey, resolveReference);
    }, [rawRequestBodySchema, rootOneOfBranches, selectedRootBranchIndex, selectionScopeKey]);

    const branchOptions = useMemo(
        () =>
            rootOneOfBranches.map((branch: any, index: number) => ({
                index,
                label: schemaVariantLabel(branch, resolveReference, getRefName, index),
                description: (resolveReference(branch) || branch)?.description || '',
            })),
        [rootOneOfBranches, spec],
    );

    const codegenRequest = useMemo(
        () =>
            buildCodegenRequest({
                spec,
                path,
                method,
                operation,
                selectedServer,
                serverVariables,
                activeAuth,
                requestBodyOverrides: selectedRequestBodySchema
                    ? {
                          schema: selectedRequestBodySchema,
                          bodyType: requestBodyContentType || undefined,
                      }
                    : undefined,
            }),
        [
            spec,
            path,
            method,
            operation,
            selectedServer,
            serverVariables,
            activeAuth,
            selectedRequestBodySchema,
            requestBodyContentType,
        ],
    );

    const activeSnippet = useMemo(
        () => generateRequestSnippet(selectedLang, codegenRequest),
        [selectedLang, codegenRequest],
    );

    const secretMarkers = useMemo<CodeLineMarker[]>(
        () =>
            activeSnippet.split('\n').flatMap((lineText, index) =>
                /\bYOUR_[A-Z0-9_]+\b/.test(lineText)
                    ? [
                          {
                              line: index + 1,
                              icon: 'ph ph-key',
                              className: 'text-[var(--method-put)]',
                              tip: 'Redacted credential — replace the YOUR_… placeholder with a real value before running.',
                          },
                      ]
                    : [],
            ),
        [activeSnippet],
    );

    const getLanguageLabel = (lang: CodeLanguage) => {
        switch (lang) {
            case 'curl':
                return 'bash';
            case 'python':
                return 'python';
            case 'go':
                return 'go';
            case 'php':
            case 'laravel':
                return 'php';
            case 'csharp':
                return 'csharp';
            case 'angular':
                return 'typescript';
            default:
                return 'javascript';
        }
    };

    if (!shouldRender) return null;

    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[2500] bg-black/40 backdrop-blur-[2px]`}
            onMouseDown={event => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <div className="modal-surface max-h-[90vh] w-full max-w-3xl rounded-2xl border flex flex-col shadow-2xl overflow-hidden bg-[var(--surface)] border-[var(--border)]">
                <div className="px-4 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between border-b shrink-0 border-[var(--border)] bg-[var(--background)] gap-2 modal-header-mobile-pad">
                    <div className="flex items-center gap-3 select-none">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className="ph ph-code text-lg"></i>
                        </span>
                        <div>
                            <h3 className="font-semibold text-base font-sans text-[var(--text-heading)]">
                                Code Snippet Generator
                            </h3>
                            <p className="text-xs text-[var(--text-muted)]">
                                {method.toUpperCase()} {path}
                            </p>
                        </div>
                    </div>

                    <Tip content="Close">
                        <button
                            onClick={requestClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--primary-hover)] transition-all cursor-pointer text-[var(--text-muted)]"
                        >
                            <i className="ph ph-x"></i>
                        </button>
                    </Tip>
                </div>

                <div className="modal-scroll-region min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
                    <div className="rounded-2xl border overflow-visible shadow-sm bg-[var(--surface)] border-[var(--border)]">
                        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)] px-1.5 py-1.5">
                            <div className="min-w-0 flex-1 overflow-x-auto scrollbar-thin">
                                <div className="flex min-w-max flex-nowrap">
                                    {CODE_LANGUAGES.map(lang => (
                                        <button
                                            key={lang.id}
                                            onClick={() => setSelectedLang(lang.id)}
                                            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                                                selectedLang === lang.id
                                                    ? 'border-[var(--primary)] font-bold text-[var(--primary)] bg-[var(--primary)]/5'
                                                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                                            }`}
                                        >
                                            {lang.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {branchOptions.length > 0 && (
                                <div ref={menuRef} className="relative shrink-0 select-none">
                                    <Tip
                                        content={`Select oneOf schema${branchOptions[selectedRootBranchIndex] ? ` · ${branchOptions[selectedRootBranchIndex].label}` : ''}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setBranchMenuOpen(current => !current)}
                                            className={
                                                'flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] cursor-pointer'
                                            }
                                            aria-label="Select oneOf schema"
                                            aria-haspopup="menu"
                                            aria-expanded={branchMenuOpen}
                                        >
                                            <i
                                                className={`ph ${branchMenuOpen ? 'ph-caret-up' : 'ph-caret-down'} text-[14px]`}
                                            />
                                        </button>
                                    </Tip>

                                    {branchMenuOpen && (
                                        <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] max-w-[280px] overflow-hidden rounded-xl border bg-[var(--surface)] p-1 shadow-2xl border-[var(--border)]">
                                            {branchOptions.map(option => (
                                                <button
                                                    key={`branch:${option.index}`}
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setSelectedRootBranchIndex(option.index);
                                                        setBranchMenuOpen(false);
                                                    }}
                                                    className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                                                        selectedRootBranchIndex === option.index
                                                            ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                                            : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                                    }`}
                                                >
                                                    <span
                                                        className={`mt-1 size-2 shrink-0 rounded-full ${
                                                            selectedRootBranchIndex === option.index
                                                                ? 'bg-[var(--primary)]'
                                                                : 'bg-[var(--border)]'
                                                        }`}
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-[11px] font-semibold">
                                                            {option.label}
                                                        </span>
                                                        {option.description && (
                                                            <span className="mt-0.5 block text-[9px] leading-snug text-[var(--text-muted)]">
                                                                {option.description}
                                                            </span>
                                                        )}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-1 bg-transparent">
                            <CodeViewer
                                code={activeSnippet}
                                language={getLanguageLabel(selectedLang)}
                                maxHeight="420px"
                                lineMarkers={secretMarkers}
                            />
                        </div>
                    </div>
                </div>

                <div className="px-6 py-3.5 border-t flex justify-between items-center bg-[var(--background)] text-[11px] border-[var(--border)] text-[var(--text-muted)]">
                    <span className="font-sans">
                        Request semantics are shared with Runner; credentials are safe placeholders
                    </span>
                    <button
                        onClick={requestClose}
                        className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 transition-all shadow-sm active:scale-[0.98] bg-[var(--primary)]"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
