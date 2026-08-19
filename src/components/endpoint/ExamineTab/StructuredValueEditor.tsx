import {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import * as jsYaml from 'js-yaml';
import CustomDropdown from '../../common/CustomDropdown';
import {Tip} from '../../common/Tooltip';

type EditorLanguage = 'json' | 'yaml';

interface StructuredValueEditorProps {
    /** JSON text, which is what the Runner sends for object parameters. */
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    placeholder?: string;
}

const LANGUAGE_OPTIONS = [
    {value: 'json', label: 'JSON'},
    {value: 'yaml', label: 'YAML'},
];

const toJsonText = (text: string, language: EditorLanguage): {json: string; error: string | null} => {
    const trimmed = text.trim();
    if (!trimmed) return {json: '', error: null};
    try {
        const parsed = language === 'json' ? JSON.parse(trimmed) : jsYaml.load(trimmed);
        if (parsed === undefined) return {json: '', error: null};
        return {json: JSON.stringify(parsed), error: null};
    } catch (error) {
        return {json: text, error: error instanceof Error ? error.message : 'The value could not be parsed.'};
    }
};

const fromJsonText = (json: string, language: EditorLanguage): string => {
    const trimmed = json.trim();
    if (!trimmed) return '';
    try {
        const parsed = JSON.parse(trimmed);
        return language === 'json' ? JSON.stringify(parsed, null, 2) : jsYaml.dump(parsed).trimEnd();
    } catch {
        return json;
    }
};

/**
 * A small structured editor for object-typed values. A single-line input is
 * the wrong tool for an object, and a full code editor is far too heavy to sit
 * inline in a form, so this stays a textarea with live validation, formatting
 * and a JSON/YAML switch, while the field itself keeps holding JSON.
 */
export default function StructuredValueEditor({value, onChange, ariaLabel, placeholder}: StructuredValueEditorProps) {
    const [language, setLanguage] = useState<EditorLanguage>('json');
    const [draft, setDraft] = useState(() => fromJsonText(value, 'json'));
    const lastEmitted = useRef(value);
    useEffect(() => {
        // Adopt values that arrived from elsewhere (reset, examples, the
        // serializer playground) without fighting what is being typed.
        if (value === lastEmitted.current) return;
        lastEmitted.current = value;
        setDraft(fromJsonText(value, language));
    }, [value, language]);
    const {error} = useMemo(() => toJsonText(draft, language), [draft, language]);
    const isEmpty = draft.trim().length === 0;
    const applyDraft = (next: string) => {
        setDraft(next);
        const {json, error: parseError} = toJsonText(next, language);
        if (parseError) return;
        lastEmitted.current = json;
        onChange(json);
    };
    const switchLanguage = (next: EditorLanguage) => {
        const {json, error: parseError} = toJsonText(draft, language);
        setLanguage(next);
        if (!parseError) setDraft(fromJsonText(json, next));
    };
    const format = () => {
        const {json, error: parseError} = toJsonText(draft, language);
        if (parseError) return;
        setDraft(fromJsonText(json, language));
    };
    const state = isEmpty ? 'idle' : error ? 'invalid' : 'valid';
    // A value that does not parse is a warning: the Runner still sends it.
    const stateColor =
        state === 'valid' ? 'var(--method-get)' : state === 'invalid' ? 'var(--method-put)' : 'var(--border)';
    return (
        <div
            className={clsx(
                'rounded-lg border transition-colors bg-[var(--background)]',
                state === 'idle' && 'focus-within:border-[var(--primary)]',
            )}
            // Inline, so focus can never contradict what the indicator says.
            style={state === 'idle' ? undefined : {borderColor: stateColor}}
        >
            <div className="flex items-center gap-1.5 border-b px-1.5 py-1 border-[var(--border)]">
                <CustomDropdown
                    value={language}
                    onChange={next => switchLanguage(next as EditorLanguage)}
                    options={LANGUAGE_OPTIONS}
                    ariaLabel={`${ariaLabel} editor language`}
                    className="w-[92px]"
                />
                <Tip content="Reformat the value">
                    <button
                        type="button"
                        onClick={format}
                        disabled={!!error || isEmpty}
                        aria-label={`Format ${ariaLabel}`}
                        className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] disabled:cursor-not-allowed disabled:opacity-40 enabled:cursor-pointer"
                    >
                        <i className="ph ph-magic-wand text-[13px]" />
                    </button>
                </Tip>
            </div>
            <div className="relative">
                <textarea
                    aria-label={ariaLabel}
                    aria-invalid={!!error}
                    value={draft}
                    spellCheck={false}
                    rows={Math.min(10, Math.max(3, draft.split('\n').length))}
                    placeholder={placeholder}
                    onChange={event => applyDraft(event.target.value)}
                    className="w-full resize-y bg-transparent py-2 ps-3 pe-8 font-mono text-xs text-[var(--text-heading)] outline-none"
                />
                {state !== 'idle' && (
                    <Tip
                        content={error || 'The value parses cleanly'}
                        // Inline, because the tooltip wrapper carries its own
                        // `relative` class and class order would decide the winner.
                        wrapperStyle={{position: 'absolute', insetInlineEnd: 4, top: 4}}
                        wrapperClassName="z-[1] cursor-help p-1 leading-none"
                    >
                        <span className="text-[13px] leading-none" style={{color: stateColor}}>
                            <i
                                className={
                                    state === 'invalid' ? 'ph-fill ph-warning-circle' : 'ph-fill ph-check-circle'
                                }
                            />
                        </span>
                    </Tip>
                )}
            </div>
            {error && <p className="px-3 pb-2 text-[10px] text-[var(--method-put)]">{error}</p>}
        </div>
    );
}
