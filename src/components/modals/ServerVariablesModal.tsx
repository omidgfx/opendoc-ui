import {useEffect, useMemo, useState} from 'react';
import type {ServerDefinition} from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import {Tip} from '../common/Tooltip';

interface ServerVariablesModalProps {
    server: ServerDefinition;
    initialValues: Record<string, string>;
    onApply: (values: Record<string, string>) => void;
    onClose: () => void;
}

const expandUrl = (server: ServerDefinition, values: Record<string, string>): string =>
    String(server.url || '').replace(/\{([^{}]+)}/g, (placeholder, name: string) => {
        const variable = server.variables?.[name];
        const value = values[name] ?? variable?.default;
        return value !== undefined && value !== '' ? String(value) : placeholder;
    });

export default function ServerVariablesModal({server, initialValues, onApply, onClose}: ServerVariablesModalProps) {
    const variables = server.variables || {};
    const entries = useMemo(() => Object.entries(variables), [variables]);
    const [draft, setDraft] = useState<Record<string, string>>(() =>
        Object.fromEntries(
            entries.map(([name, variable]) => [name, initialValues[name] ?? String(variable.default ?? '')]),
        ),
    );
    useEffect(() => {
        setDraft(
            Object.fromEntries(
                entries.map(([name, variable]) => [name, initialValues[name] ?? String(variable.default ?? '')]),
            ),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server.url]);

    const previewUrl = expandUrl(server, draft);
    const apply = () => {
        const applied: Record<string, string> = {};
        entries.forEach(([name, variable]) => {
            const value = draft[name]?.trim();
            if (value !== undefined && value !== '') applied[name] = value;
            else if (variable.default !== undefined) applied[name] = String(variable.default);
        });
        onApply(applied);
        onClose();
    };

    return (
        <div
            className="modal-backdrop fixed inset-0 z-[1000] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-label={`Server variables for ${server.url}`}
                className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
            >
                <div className="px-5 pt-4 pb-3 border-b border-[var(--border)] flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-extrabold text-[var(--text-heading)]">Server Variables</h2>
                        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)] truncate select-text">
                            {server.url}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close server variables"
                        className="shrink-0 h-7 w-7 grid place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)] transition-colors cursor-pointer"
                    >
                        <i className="ph ph-x text-[15px]"></i>
                    </button>
                </div>

                <div className="px-5 py-4 max-h-[52vh] overflow-y-auto space-y-4">
                    {entries.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">This server defines no variables.</p>
                    ) : (
                        entries.map(([name, variable]) => (
                            <div key={name}>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-mono text-[11px] font-bold text-[var(--text-heading)]">
                                        &#123;{name}&#125;
                                    </span>
                                    {variable.default !== undefined && (
                                        <span className="text-[9px] text-[var(--text-muted)] font-mono">
                                            default: {String(variable.default)}
                                        </span>
                                    )}
                                </div>
                                {variable.description && (
                                    <p className="mb-1.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                        {variable.description}
                                    </p>
                                )}
                                {Array.isArray(variable.enum) && variable.enum.length > 0 ? (
                                    <CustomDropdown
                                        value={draft[name] ?? String(variable.default ?? '')}
                                        onChange={value => setDraft(current => ({...current, [name]: value}))}
                                        options={variable.enum.map(value => ({
                                            value: String(value),
                                            label: String(value),
                                        }))}
                                        className="w-full"
                                    />
                                ) : (
                                    <input
                                        value={draft[name] ?? ''}
                                        onChange={event =>
                                            setDraft(current => ({...current, [name]: event.target.value}))
                                        }
                                        placeholder={
                                            variable.default !== undefined ? String(variable.default) : 'Variable value'
                                        }
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-heading)] outline-none focus:border-[var(--primary)]"
                                    />
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--background)]">
                    <Tip content={previewUrl} fullWidth>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                            <i className="ph ph-globe text-[11px]"></i>
                            <span className="font-mono truncate select-text">{previewUrl}</span>
                        </div>
                    </Tip>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={apply}
                            disabled={entries.length === 0}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--primary)] text-[var(--primary-contrast)] hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
