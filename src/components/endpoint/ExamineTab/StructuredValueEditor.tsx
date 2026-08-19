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
    return (
        <div
            className={clsx(
                'rounded-lg border transition-colors bg-[var(--background)]',
                // The border keeps saying what the indicator says, so focus
                // never contradicts the validation state.
                state === 'invalid'
                    ? 'border-[var(--method-delete)]/60 focus-within:border-[var(--method-delete)]'
                    : state === 'valid'
                      ? 'border-[var(--method-get)]/50 focus-within:border-[var(--method-get)]'
                      : 'border-[var(--border)] focus-within:border-[var(--primary)]',
            )}
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
                    <Tip content={error || 'The value parses cleanly'}>
                        <span
                            className={clsx(
                                'absolute end-2 top-2 cursor-help text-[13px]',
                                state === 'invalid' ? 'text-[var(--method-delete)]' : 'text-[var(--method-get)]',
                            )}
                        >
                            <i
                                className={
                                    state === 'invalid' ? 'ph-fill ph-warning-circle' : 'ph-fill ph-check-circle'
                                }
                            />
                        </span>
                    </Tip>
                )}
            </div>
            {error && <p className="px-3 pb-2 text-[10px] text-[var(--method-delete)]">{error}</p>}
        </div>
    );
}
