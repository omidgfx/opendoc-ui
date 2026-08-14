import {useEffect, useRef, useState} from 'react';
import Editor from '@monaco-editor/react';
import SchemaEditorToolButton from './SchemaEditorToolButton';
import {Tip} from '../common/Tooltip';
import {formatBodyText, getBodyEditorLanguage, getBodyFormat, validateBodyText} from '../../utils/bodyFormats';

interface SchemaJsonEditorProps {
    value: string;
    onChange: (val: string) => void;
    schema: any;
    componentsSchemas: any;
    mediaType?: string;
    themeMode?: 'light' | 'dark';
    onCtrlEnter?: () => void;
}

export default function SchemaJsonEditor({
    value,
    onChange,
    schema,
    componentsSchemas,
    mediaType = 'application/json',
    themeMode = 'dark',
    onCtrlEnter,
}: SchemaJsonEditorProps) {
    const format = getBodyFormat(mediaType);
    const editorLanguage = getBodyEditorLanguage(value, mediaType);
    const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const [minimapEnabled, setMinimapEnabled] = useState(false);
    const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
    const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco) return;
        try {
            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                validate: format.isJson,
                schemas:
                    format.isJson && schema
                        ? [
                              {
                                  uri: 'schemas://openapi/schema.json',
                                  fileMatch: ['*'],
                                  schema: {...schema, definitions: componentsSchemas || {}},
                              },
                          ]
                        : [],
            });
        } catch {}
    }, [format.isJson, schema, componentsSchemas]);
    useEffect(() => {
        setErrorFeedback(validateBodyText(value, mediaType));
    }, [value, mediaType]);
    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const model = editor?.getModel?.();
        if (!editor || !monaco || !model || model.getLanguageId() === editorLanguage) return;
        monaco.editor.setModelLanguage(model, editorLanguage);
    }, [editorLanguage]);
    const handleFormat = () => {
        const formatted = formatBodyText(value, mediaType);
        if (formatted.error) {
            setErrorFeedback(formatted.error);
            return;
        }
        onChange(formatted.text);
        editorRef.current?.focus();
    };
    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        if (onCtrlEnter) {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onCtrlEnter());
        }
        if (format.isJson && schema) {
            try {
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    schemas: [
                        {
                            uri: 'schemas://openapi/schema.json',
                            fileMatch: ['*'],
                            schema: {...schema, definitions: componentsSchemas || {}},
                        },
                    ],
                });
            } catch {}
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
        editorRef.current?.focus();
        editorRef.current?.getAction('actions.find')?.run();
    };
    return (
        <div className="flex flex-col w-full min-w-0 rounded-xl border border-[var(--border)] overflow-hidden shadow-sm bg-[var(--background)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 select-none">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                        <i className="ph-fill ph-brackets-curly text-[16px]" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate font-mono text-[10px] font-black uppercase tracking-wider text-[var(--text-heading)]">
                            {editorLanguage} request body
                        </div>
                        <div
                            className={`mt-0.5 flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest ${errorFeedback ? 'text-[var(--method-delete)]' : 'text-[var(--method-get)]'}`}
                        >
                            <span
                                className={`size-1.5 rounded-full ${errorFeedback ? 'bg-[var(--method-delete)]' : 'bg-[var(--method-get)]'}`}
                            />
                            {errorFeedback ? 'Needs attention' : 'Syntax valid'}
                        </div>
                    </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                    <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--background)] p-0.5">
                        <Tip content="Search in editor (Ctrl+F)">
                            <SchemaEditorToolButton onClick={triggerFind} icon="ph-magnifying-glass" label="Find" />
                        </Tip>
                        <Tip content="Toggle line wrapping">
                            <SchemaEditorToolButton
                                toggle
                                active={wordWrapEnabled}
                                onClick={toggleWordWrap}
                                icon="ph-text-t"
                                label="Wrap"
                            />
                        </Tip>
                        <Tip content="Toggle line numbers">
                            <SchemaEditorToolButton
                                toggle
                                active={lineNumbersEnabled}
                                onClick={toggleLineNumbers}
                                icon="ph-list-numbers"
                                label="Lines"
                            />
                        </Tip>
                        <Tip content="Toggle code minimap">
                            <SchemaEditorToolButton
                                toggle
                                active={minimapEnabled}
                                onClick={toggleMinimap}
                                icon="ph-map-trifold"
                                label="Map"
                            />
                        </Tip>
                    </div>
                    <Tip content={`Format ${editorLanguage.toUpperCase()} body`}>
                        <button
                            type="button"
                            onClick={handleFormat}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--primary)]/10 px-3 text-[10px] font-extrabold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/15 active:scale-[0.98] cursor-pointer"
                        >
                            <i className="ph-fill ph-magic-wand text-[14px]" />
                            <span>Prettify</span>
                        </button>
                    </Tip>
                </div>
            </div>

            <div className="flex flex-col relative w-full min-w-0 animate-in fade-in" style={{height: 380}}>
                <Editor
                    height="100%"
                    language={editorLanguage}
                    defaultLanguage={editorLanguage}
                    value={value}
                    onChange={val => onChange(val || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    onMount={handleEditorDidMount}
                    loading={
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-[var(--text-muted)]">
                            <i className="ph ph-spinner animate-spin text-lg text-[var(--primary)]"></i>
                            <span>Loading editor…</span>
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
                        quickSuggestions: {other: true, comments: false, strings: true},
                        snippetSuggestions: 'top',
                        scrollbar: {
                            verticalScrollbarSize: 8,
                            horizontalScrollbarSize: 8,
                            useShadows: false,
                            alwaysConsumeMouseWheel: false,
                        },
                        fixedOverflowWidgets: true,
                    }}
                />
            </div>

            {errorFeedback && (
                <div className="px-3 py-2 border-t border-[var(--method-delete)]/20 bg-[var(--method-delete)]/5 text-[11px] font-mono text-[var(--method-delete)] break-all leading-normal">
                    <i className="ph ph-warning mr-1.5 text-[var(--method-delete)]/80"></i>
                    {errorFeedback}
                </div>
            )}
        </div>
    );
}
