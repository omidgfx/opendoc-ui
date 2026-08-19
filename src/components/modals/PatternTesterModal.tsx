import {useEffect, useState} from 'react';
import {Tip} from '../common/Tooltip';
import {useModalShortcuts} from '../../hooks/useModalShortcuts';
import {useModalTransition} from '../../hooks/useModalTransition';

interface PatternTesterModalProps {
    pattern: string;
    /** Seed value, so the tester opens on what the field already holds. */
    initialValue?: string;
    /**
     * Sends the tested value back to the field it came from. Only the Runner
     * passes this — reading the documentation there is nothing to fill in — and
     * it stays disabled until the value actually matches the pattern.
     */
    onUseValue?: (value: string) => void;
    onClose: () => void;
}

export default function PatternTesterModal({pattern, initialValue = '', onUseValue, onClose}: PatternTesterModalProps) {
    const [testValue, setTestValue] = useState(initialValue);
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const {requestClose, backdropClassName} = useModalTransition(true, onClose);
    const canUseValue = !!onUseValue && isValid === true && !error;
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
    useEffect(() => {
        if (!pattern) {
            setError('No pattern provided');
            setIsValid(null);
            return;
        }
        try {
            const regex = new RegExp(pattern);
            setIsValid(regex.test(testValue));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Invalid regex pattern');
            setIsValid(null);
        }
    }, [testValue, pattern]);
    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[9999] backdrop-blur-[2px]`}
            style={{backgroundColor: 'rgba(0,0,0,0.5)'}}
            onClick={requestClose}
        >
            <div
                className="modal-surface w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden bg-[var(--surface)] border-[var(--border)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-4 sm:px-5 py-2.5 sm:py-4 border-b shrink-0 flex items-center justify-between gap-2 border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad">
                    <span className="font-bold text-sm tracking-wide text-[var(--text-heading)]">
                        <i className="ph ph-dna mr-1.5 text-[var(--primary)]"></i> Regex Pattern Tester
                    </span>
                    <Tip content="Close">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="w-8 h-8 rounded-lg hover:bg-[var(--surface-hover)] hover:text-[var(--primary-hover)] flex items-center justify-center text-sm cursor-pointer transition-colors text-[var(--text-muted)]"
                        >
                            <i className="ph ph-x"></i>
                        </button>
                    </Tip>
                </div>

                <div className="p-6 space-y-4 text-xs font-sans">
                    <div className="space-y-1.5">
                        <span className="font-semibold text-[var(--text-muted)] block uppercase tracking-wider text-[10px]">
                            Active Pattern
                        </span>
                        <code className="block px-3 py-2 rounded-xl border font-mono text-xs select-all break-all leading-relaxed bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]">
                            {pattern || '(empty)'}
                        </code>
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="regex-test-input"
                            className="font-semibold text-[var(--text-muted)] block uppercase tracking-wider text-[10px]"
                        >
                            Test Input Value
                        </label>
                        <input
                            id="regex-test-input"
                            type="text"
                            autoFocus
                            placeholder="Type a value to test…"
                            value={testValue}
                            onChange={e => setTestValue(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--primary)] transition-colors font-mono bg-[var(--background)] border-[var(--border)] text-[var(--text)]"
                        />
                    </div>

                    <div className="pt-2">
                        {error ? (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--method-delete)]/10 border border-[var(--method-delete)]/20 text-[var(--method-delete)] animate-in fade-in">
                                <i className="ph ph-warning text-sm"></i>
                                <span className="font-semibold text-xs">{error}</span>
                            </div>
                        ) : testValue ? (
                            isValid ? (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--method-get)]/10 border border-[var(--method-get)]/20 text-[var(--method-get)] animate-in fade-in">
                                    <i className="ph ph-check-circle text-sm"></i>
                                    <span className="font-semibold text-xs">Matches Pattern!</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--method-delete)]/10 border border-[var(--method-delete)]/20 text-[var(--method-delete)] animate-in fade-in">
                                    <i className="ph ph-x-circle text-sm"></i>
                                    <span className="font-semibold text-xs">Does not match pattern</span>
                                </div>
                            )
                        ) : (
                            <div className="p-3 rounded-xl bg-[var(--text-muted)]/10 border border-[var(--text-muted)]/20 text-[var(--text-muted)] text-center select-none">
                                Enter a value to test matching.
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-5 py-3 border-t flex justify-end gap-2 border-[var(--border)] bg-[var(--background)]">
                    {onUseValue && (
                        <Tip
                            content={
                                canUseValue
                                    ? 'Put this value into the field'
                                    : 'Only a value that matches the pattern can be used'
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
                        className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 transition-all shadow-sm select-none bg-[var(--primary)]"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
