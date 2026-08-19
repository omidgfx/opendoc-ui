import {useMemo, useState} from 'react';
import {Tip} from '../common/Tooltip';
import CodeViewer from '../common/CodeViewer';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import {useModalTransition} from '../../hooks/useModalTransition';
import {
    describeParameterSerialization,
    previewParameterSerialization,
} from '../../utils/endpoint/parameterSerialization';

interface SerializerPlaygroundModalProps {
    parameter: any;
    /** Seed value, so the playground opens on what the field already holds. */
    initialValue?: string;
    /**
     * Sends the tested value back to the field it came from. Only the Runner
     * passes this, and only a value the serializer accepted can be used.
     */
    onUseValue?: (value: string) => void;
    onClose: () => void;
}

/**
 * A playground for parameter serialization, in the shape of the pattern
 * tester: type a value, watch the fragments that will actually be sent, and
 * push the value back into the Runner field when it holds up.
 */
export default function SerializerPlaygroundModal({
    parameter,
    initialValue = '',
    onUseValue,
    onClose,
}: SerializerPlaygroundModalProps) {
    const [testValue, setTestValue] = useState(initialValue);
    const {requestClose, backdropClassName} = useModalTransition(true, onClose);
    const descriptor = useMemo(() => describeParameterSerialization(parameter), [parameter]);
    const preview = useMemo(() => previewParameterSerialization(parameter, testValue), [parameter, testValue]);
    const canUseValue = !!onUseValue && !preview.error && testValue.trim().length > 0;
    useModalShortcuts({
        isOpen: true,
        onClose: requestClose,
        onSubmit: () => {
            if (!onUseValue) return;
            onUseValue(testValue);
            requestClose();
        },
        canSubmit: canUseValue,
    });
    const name = String(parameter?.name || 'parameter');
    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[9999] backdrop-blur-[2px]`}
            style={{backgroundColor: 'rgba(0,0,0,0.5)'}}
            onClick={requestClose}
        >
            <div
                className="modal-surface w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl bg-[var(--surface)] border-[var(--border)]"
                onClick={event => event.stopPropagation()}
            >
                <div className="modal-header-mobile-pad flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-5 sm:py-4 border-[var(--border)] bg-[var(--background)]">
                    <span className="text-sm font-bold tracking-wide text-[var(--text-heading)]">
                        <i className="ph ph-arrows-split mr-1.5 text-[var(--accent)]" /> Serializer playground
                    </span>
                    <Tip content="Close">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-sm transition-colors text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                            aria-label="Close serializer playground"
                        >
                            <i className="ph ph-x" />
                        </button>
                    </Tip>
                </div>

                <div className="space-y-4 p-6 font-sans text-xs">
                    <div className="space-y-1.5">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Encoding
                        </span>
                        <p className="rounded-xl border px-3 py-2 leading-relaxed border-[var(--border)] bg-[var(--background)] text-[var(--text)]">
                            <span className="font-mono font-bold text-[var(--text-heading)]">
                                {name} · in {String(parameter?.in || 'query')} · {descriptor.label}
                            </span>
                            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{descriptor.hint}</span>
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="serializer-test-input"
                            className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                        >
                            Test value
                        </label>
                        <input
                            id="serializer-test-input"
                            type="text"
                            autoFocus
                            placeholder='Plain text, or JSON such as ["eu","us"] or {"plan":"pro"}'
                            value={testValue}
                            onChange={event => setTestValue(event.target.value)}
                            className="w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none transition-colors border-[var(--border)] bg-[var(--background)] text-[var(--text)] focus:border-[var(--primary)]"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            {preview.target || 'Result'}
                        </span>
                        {preview.error ? (
                            <div className="flex items-center gap-2 rounded-xl border p-3 animate-in fade-in border-[var(--method-delete)]/20 bg-[var(--method-delete)]/10 text-[var(--method-delete)]">
                                <i className="ph ph-warning text-sm" />
                                <span className="text-xs font-semibold">{preview.error}</span>
                            </div>
                        ) : testValue.trim() ? (
                            <CodeViewer code={preview.output || '(empty)'} language="http" maxHeight="180px" />
                        ) : (
                            <div className="select-none rounded-xl border p-3 text-center border-[var(--text-muted)]/20 bg-[var(--text-muted)]/10 text-[var(--text-muted)]">
                                Enter a value to see what is sent.
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t px-5 py-3 border-[var(--border)] bg-[var(--background)]">
                    {onUseValue && (
                        <Tip
                            content={
                                canUseValue
                                    ? 'Put this value into the field'
                                    : 'Only a value the serializer accepted can be used'
                            }
                        >
                            <button
                                type="button"
                                disabled={!canUseValue}
                                onClick={() => {
                                    onUseValue(testValue);
                                    requestClose();
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs font-semibold transition-all border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer"
                            >
                                <i className="ph ph-arrow-line-down text-[13px]" />
                                Use
                            </button>
                        </Tip>
                    )}
                    <button
                        type="button"
                        onClick={requestClose}
                        className="select-none rounded-lg px-4 py-1.5 text-xs font-semibold shadow-sm transition-all cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] hover:opacity-90"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
