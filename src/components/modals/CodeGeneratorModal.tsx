import {useMemo, useState} from 'react';
import {ActiveAuth, OpenApiSpec} from '../../types';
import CodeViewer from '../common/CodeViewer';
import {Tip} from '../common/Tooltip';
import {buildCodegenRequest, generateRequestSnippet, type CodeLanguage} from '../../utils/export/codeGeneration';
import type {CodeLineMarker} from '../../utils/lineMarkers';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import {useModalTransition} from '../../hooks/useModalTransition';

interface CodeGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: any;
    selectedServer: string;
    serverVariables?: Record<string, string>;
    activeAuth: ActiveAuth;
}

export default function CodeGeneratorModal({
    isOpen,
    onClose,
    spec,
    path,
    method,
    operation,
    selectedServer,
    serverVariables,
    activeAuth,
}: CodeGeneratorModalProps) {
    const [selectedLang, setSelectedLang] = useState('curl');
    const {shouldRender, requestClose, backdropClassName} = useModalTransition(isOpen, onClose);
    useModalShortcuts({isOpen, onClose: requestClose});
    if (!shouldRender) return null;
    const codegenRequest = buildCodegenRequest({
        spec,
        path,
        method,
        operation,
        selectedServer,
        serverVariables,
        activeAuth,
    });
    const activeSnippet = useMemo(
        () => generateRequestSnippet(selectedLang as CodeLanguage, codegenRequest),
        [selectedLang, codegenRequest],
    );
    /* Gutter markers: badge every line that carries a redacted credential
       placeholder, so it is obvious what must be replaced before running. */
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
    const getLanguageLabel = (lang: string) => {
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
                    <div className="rounded-2xl border overflow-hidden shadow-sm bg-[var(--surface)] border-[var(--border)]">
                        <div className="flex border-b overflow-x-auto scrollbar-thin flex-nowrap border-[var(--border)] bg-[var(--background)]">
                            {[
                                {id: 'curl', name: 'cURL'},
                                {id: 'js-fetch', name: 'JS Fetch'},
                                {id: 'js-axios', name: 'Axios'},
                                {id: 'angular', name: 'Angular'},
                                {id: 'laravel', name: 'Laravel'},
                                {id: 'php', name: 'PHP'},
                                {id: 'python', name: 'Python'},
                                {id: 'go', name: 'Go'},
                                {id: 'csharp', name: 'C#'},
                            ].map(lang => (
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
