import {useEffect, useRef, useState} from 'react';
import Editor from '@monaco-editor/react';

interface SchemaJsonEditorProps {
    value: string;
    onChange: (val: string) => void;
    schema: any;
    componentsSchemas: any;
    themeMode?: 'light' | 'dark';
}

export default function SchemaJsonEditor({
                                             value,
                                             onChange,
                                             schema,
                                             componentsSchemas,
                                             themeMode = 'dark'
                                         }: SchemaJsonEditorProps) {
    const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const [minimapEnabled, setMinimapEnabled] = useState(false);
    const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
    const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);

    // Dynamic schema suggestions updater
    useEffect(() => {
        const monaco = monacoRef.current;
        if (monaco && schema) {
            try {
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    schemas: [{
                        uri: 'schemas://openapi/schema.json',
                        fileMatch: ['*'],
                        schema: {
                            ...schema,
                            definitions: componentsSchemas || {}
                        }
                    }]
                });
            } catch (err) {
                console.warn('Error setting JSON schemas diagnostics:', err);
            }
        }
    }, [schema, componentsSchemas, monacoRef.current]);

    // Real-time JSON validation
    useEffect(() => {
        if (!value.trim()) {
            setErrorFeedback(null);
            return;
        }
        try {
            JSON.parse(value);
            setErrorFeedback(null);
        } catch (err: any) {
            setErrorFeedback(err.message);
        }
    }, [value]);

    // Manual Trigger Prettify format helper using Monaco's native formatter
    const handleFormat = () => {
        if (editorRef.current) {
            editorRef.current.focus();
            editorRef.current.getAction('editor.action.formatDocument')?.run();
        } else {
            // Fallback
            try {
                const parsed = JSON.parse(value);
                onChange(JSON.stringify(parsed, null, 2));
                setErrorFeedback(null);
            } catch (err: any) {
                setErrorFeedback(`Cannot format: ${err.message}`);
            }
        }
    };

    // Editor Mount: Setup diagnostic schema and save editorRef
    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        if (schema) {
            try {
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    schemas: [{
                        uri: 'schemas://openapi/schema.json',
                        fileMatch: ['*'],
                        schema: {
                            ...schema,
                            definitions: componentsSchemas || {}
                        }
                    }]
                });
            } catch (err) {
                console.warn('Error setting JSON schemas diagnostics:', err);
            }
        }
    };

    const toggleMinimap = () => {
        const next = !minimapEnabled;
        setMinimapEnabled(next);
        editorRef.current?.updateOptions({minimap: {enabled: next}});
    };

    const toggleWordWrap = () => {
        const next = !wordWrapEnabled;
        setWordWrapEnabled(next);
        editorRef.current?.updateOptions({wordWrap: next ? 'on' : 'off'});
    };

    const toggleLineNumbers = () => {
        const next = !lineNumbersEnabled;
        setLineNumbersEnabled(next);
        editorRef.current?.updateOptions({lineNumbers: next ? 'on' : 'off'});
    };

    const triggerFind = () => {
        editorRef.current?.getAction('actions.find').run();
    };

    return (
        <div className="flex flex-col gap-3 w-full">
            {/* Redesigned Integrated Toolbar */}
            <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 rounded-xl shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Validity status indicator */}
                    <div
                        className="flex items-center gap-2 bg-black/10 bg-black/30 px-2.5 py-1 rounded-lg border border-[var(--border)] select-none">
                        <span className="w-1.5 h-1.5 rounded-full"
                              style={{backgroundColor: errorFeedback ? '#ef4444' : '#10b981'}}></span>
                        <span
                            className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-heading)]">
                            {errorFeedback ? 'Syntax Error' : 'JSON Valid'}
                        </span>
                    </div>
                </div>

                {/* Monaco action integrations & Formatting */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {/* Monaco internal action triggers */}
                    <button
                        type="button"
                        onClick={triggerFind}
                        className="p-1.5 rounded bg-[var(--background)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] font-semibold text-[var(--text-heading)] hover:text-[var(--primary-hover)] transition-all cursor-pointer flex items-center gap-1"
                        title="Search and Replace (Ctrl+F)"
                    >
                        <i className="ph ph-magnifying-glass text-sky-500 text-[10px]"></i>
                        <span>Find</span>
                    </button>

                    <button
                        type="button"
                        onClick={toggleWordWrap}
                        className={`p-1.5 rounded bg-[var(--background)] border border-[var(--border)] text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${wordWrapEnabled ? 'text-[var(--primary)] hover:text-[var(--primary-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`}
                        title="Toggle line wrapping"
                    >
                        <i className="ph ph-text-t text-[10px]"></i>
                        <span>Wrap</span>
                    </button>

                    <button
                        type="button"
                        onClick={toggleLineNumbers}
                        className={`p-1.5 rounded bg-[var(--background)] border border-[var(--border)] text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${lineNumbersEnabled ? 'text-[var(--primary)] hover:text-[var(--primary-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`}
                        title="Toggle line numbers"
                    >
                        <i className="ph ph-list-numbers text-[10px]"></i>
                        <span>Numbers</span>
                    </button>

                    <button
                        type="button"
                        onClick={toggleMinimap}
                        className={`p-1.5 rounded bg-[var(--background)] border border-[var(--border)] text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${minimapEnabled ? 'text-[var(--primary)] hover:text-[var(--primary-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`}
                        title="Toggle Code Minimap"
                    >
                        <i className="ph ph-map-trifold text-[10px]"></i>
                        <span>Minimap</span>
                    </button>

                    <div className="w-[1px] h-5 bg-[var(--border)] mx-1 hidden sm:block"></div>

                    {/* Formatters */}
                    <button
                        type="button"
                        onClick={handleFormat}
                        className="px-2.5 py-1.5 rounded bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[11px] font-semibold select-none cursor-pointer transition-all flex items-center gap-1 text-[var(--text-heading)] active:scale-95"
                        title="Prettify JSON draft formatting"
                    >
                        <i className="ph ph-wand text-[var(--primary)] text-[10px]"></i>
                        <span>Prettify</span>
                    </button>
                </div>
            </div>

            {/* Editor Body */}
            <div
                className="flex flex-col relative w-full border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm h-[380px] bg-[var(--background)] animate-in fade-in">
                <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={value}
                    onChange={(val) => onChange(val || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    onMount={handleEditorDidMount}
                    loading={
                        <div
                            className="flex flex-col items-center justify-center h-full gap-2 text-xs text-[var(--text-muted)]">
                            <i className="ph ph-spinner animate-spin text-lg text-[var(--primary)]"></i>
                            <span>Loading Monaco Editor...</span>
                        </div>
                    }
                    options={{
                        minimap: {enabled: false},
                        fontSize: 12,
                        fontFamily: 'var(--font-mono), monospace',
                        lineHeight: 20,
                        tabSize: 2,
                        insertSpaces: true,
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        automaticLayout: true,
                        padding: {top: 12, bottom: 12},
                        cursorBlinking: 'smooth',
                        smoothScrolling: true,
                        roundedSelection: true,
                        renderLineHighlight: 'all',
                        suggestOnTriggerCharacters: true,
                        acceptSuggestionOnEnter: 'on',
                        quickSuggestions: {
                            other: true,
                            comments: false,
                            strings: true
                        },
                        snippetSuggestions: 'top',
                        scrollbar: {
                            verticalScrollbarSize: 8,
                            horizontalScrollbarSize: 8,
                            useShadows: false
                        }
                    }}
                />
            </div>

            {errorFeedback && (
                <div
                    className="p-3 rounded-xl bg-[var(--method-delete)]/5 bg-[var(--method-delete)]/10 border border-[var(--method-delete)]/20 text-[11px] font-mono text-[var(--method-delete)] break-all leading-normal animate-in slide-in-from-top-1">
                    <i className="ph ph-warning mr-1.5 text-[var(--method-delete)]/80"></i> {errorFeedback}
                </div>
            )}
        </div>
    );
}