import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import clsx from 'clsx';

interface SchemaJsonEditorProps {
    value: string;
    onChange: (val: string) => void;
    schema: any;
    componentsSchemas: any;
    themeMode?: 'light' | 'dark';
}

export default function SchemaJsonEditor({
    value, onChange, schema, componentsSchemas, themeMode = 'dark'
}: SchemaJsonEditorProps) {
    const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const [minimapEnabled, setMinimapEnabled] = useState(false);
    const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
    const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);

    useEffect(() => {
        const monaco = monacoRef.current;
        if (monaco && schema) {
            try {
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    schemas: [{ uri: 'schemas://openapi/schema.json', fileMatch: ['*'], schema: { ...schema, definitions: componentsSchemas || {} } }],
                });
            } catch (err) { console.warn('Error setting JSON schemas diagnostics:', err); }
        }
    }, [schema, componentsSchemas, monacoRef.current]);

    useEffect(() => {
        if (!value.trim()) { setErrorFeedback(null); return; }
        try { JSON.parse(value); setErrorFeedback(null); } catch (err: any) { setErrorFeedback(err.message); }
    }, [value]);

    const handleFormat = () => {
        if (editorRef.current) {
            editorRef.current.focus();
            editorRef.current.getAction('editor.action.formatDocument')?.run();
        } else {
            try {
                const parsed = JSON.parse(value);
                onChange(JSON.stringify(parsed, null, 2));
                setErrorFeedback(null);
            } catch (err: any) { setErrorFeedback(`Cannot format: ${err.message}`); }
        }
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        if (schema) {
            try {
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    schemas: [{ uri: 'schemas://openapi/schema.json', fileMatch: ['*'], schema: { ...schema, definitions: componentsSchemas || {} } }],
                });
            } catch (err) { console.warn('Error setting JSON schemas diagnostics:', err); }
        }
    };

    const toggleMinimap = () => {
        const next = !minimapEnabled; setMinimapEnabled(next);
        editorRef.current?.updateOptions({ minimap: { enabled: next } });
    };
    const toggleWordWrap = () => {
        const next = !wordWrapEnabled; setWordWrapEnabled(next);
        editorRef.current?.updateOptions({ wordWrap: next ? 'on' : 'off' });
    };
    const toggleLineNumbers = () => {
        const next = !lineNumbersEnabled; setLineNumbersEnabled(next);
        editorRef.current?.updateOptions({ lineNumbers: next ? 'on' : 'off' });
    };
    const triggerFind = () => { editorRef.current?.focus(); editorRef.current?.getAction('actions.find')?.run(); };

    return (
        <div className="flex flex-col gap-2 sm:gap-3 w-full min-w-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--surface)] border border-[var(--border)] px-2.5 py-2 rounded-xl shadow-sm">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--background)] border border-[var(--border)] select-none">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: errorFeedback ? '#ef4444' : '#10b981' }}></span>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-heading)]">
                            {errorFeedback ? 'Error' : 'Valid'}
                        </span>
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] hidden sm:inline">JSON Body</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <ToolBtn active onClick={triggerFind} icon="ph-magnifying-glass" label="Find" title="Search (Ctrl+F)" iconColor="text-sky-500" />
                    <ToolBtn active={wordWrapEnabled} onClick={toggleWordWrap} icon="ph-text-t" label="Wrap" title="Toggle line wrapping" />
                    <ToolBtn active={lineNumbersEnabled} onClick={toggleLineNumbers} icon="ph-list-numbers" label="Numbers" title="Toggle line numbers" />
                    <ToolBtn active={minimapEnabled} onClick={toggleMinimap} icon="ph-map-trifold" label="Minimap" title="Toggle code minimap" />
                    <div className="w-[1px] h-5 bg-[var(--border)] mx-1 hidden sm:block"></div>
                    <button type="button" onClick={handleFormat}
                        title="Prettify JSON"
                        className="px-2 py-1 rounded-md bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[11px] font-semibold cursor-pointer transition-all flex items-center gap-1 text-[var(--text-heading)] active:scale-95">
                        <i className="ph ph-wand text-[var(--primary)] text-[11px]"></i>
                        <span className="hidden sm:inline">Prettify</span>
                    </button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex flex-col relative w-full border border-[var(--border)] rounded-xl overflow-hidden shadow-sm bg-[var(--background)] animate-in fade-in min-w-0"
                style={{ height: 380 }}>
                <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={value}
                    onChange={(val) => onChange(val || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    onMount={handleEditorDidMount}
                    loading={<div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-[var(--text-muted)]"><i className="ph ph-spinner animate-spin text-lg text-[var(--primary)]"></i><span>Loading editor…</span></div>}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        fontFamily: 'var(--font-mono), monospace',
                        lineHeight: 20,
                        tabSize: 2,
                        insertSpaces: true,
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        automaticLayout: true,
                        padding: { top: 12, bottom: 12 },
                        cursorBlinking: 'smooth',
                        smoothScrolling: true,
                        roundedSelection: true,
                        renderLineHighlight: 'all',
                        suggestOnTriggerCharacters: true,
                        acceptSuggestionOnEnter: 'on',
                        quickSuggestions: { other: true, comments: false, strings: true },
                        snippetSuggestions: 'top',
                        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false, alwaysConsumeMouseWheel: false },
                        fixedOverflowWidgets: true,
                    }}
                />
            </div>

            {errorFeedback && (
                <div className="p-3 rounded-xl bg-[var(--method-delete)]/10 border border-[var(--method-delete)]/20 text-[11px] font-mono text-[var(--method-delete)] break-all leading-normal animate-in slide-in-from-top-1">
                    <i className="ph ph-warning mr-1.5 text-[var(--method-delete)]/80"></i>{errorFeedback}
                </div>
            )}
        </div>
    );
}

function ToolBtn({ active, onClick, icon, label, title, iconColor }: {
    active?: boolean; onClick: () => void; icon: string; label: string; title: string; iconColor?: string;
}) {
    return (
        <button type="button" onClick={onClick} title={title}
            className={clsx(
                'p-1.5 rounded-md bg-[var(--background)] border text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1',
                active ? 'text-[var(--primary)] border-[var(--primary)]/30 hover:bg-[var(--surface-hover)]' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)]',
            )}>
            <i className={clsx(`ph ${icon} text-[11px]`, iconColor)}></i>
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}
