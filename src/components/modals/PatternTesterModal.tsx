import {useEffect, useState} from 'react';
import { Tip } from '../common/Tooltip';

interface PatternTesterModalProps {
    pattern: string;
    onClose: () => void;
}

export default function PatternTesterModal({pattern, onClose}: PatternTesterModalProps) {
    const [testValue, setTestValue] = useState('');
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 z-[9999] backdrop-blur-[2px] animate-in fade-in duration-150"
            style={{backgroundColor: 'rgba(0,0,0,0.5)'}}
            onClick={onClose}>

            <div
                className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden bg-[var(--surface)] border-[var(--border)] animate-in zoom-in-95 duration-200"

                onClick={(e) => e.stopPropagation()}>

                <div
                    className="px-4 sm:px-5 py-2.5 sm:py-4 border-b shrink-0 flex items-center justify-between gap-2 border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad">


                    <span className="font-bold text-sm tracking-wide text-[var(--text-heading)]">
                        <i className="ph ph-dna mr-1.5 text-[var(--primary)]"></i> Regex Pattern Tester
                    </span>
                    <Tip content="Close">
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg hover:bg-[var(--surface-hover)] hover:text-[var(--primary-hover)] flex items-center justify-center text-sm cursor-pointer transition-colors text-[var(--text-muted)]">
                            <i className="ph ph-x"></i>
                        </button>
                    </Tip>
                </div>

                <div className="p-6 space-y-4 text-xs font-sans">
                    <div className="space-y-1.5">
                        <span
                            className="font-semibold text-[var(--text-muted)] block uppercase tracking-wider text-[10px]">Active
                            Pattern</span>
                        <code
                            className="block px-3 py-2 rounded-xl border font-mono text-xs select-all break-all leading-relaxed bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]">


                            {pattern || '(empty)'}
                        </code>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="regex-test-input"
                               className="font-semibold text-[var(--text-muted)] block uppercase tracking-wider text-[10px]">
                            Test Input Value
                        </label>
                        <input
                            id="regex-test-input"
                            type="text"
                            autoFocus
                            placeholder="Type a value to test…"
                            value={testValue}
                            onChange={(e) => setTestValue(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--primary)] transition-colors font-mono bg-[var(--background)] border-[var(--border)] text-[var(--text)]"/>


                    </div>

                    <div className="pt-2">
                        {error ?
                            <div
                                className="flex items-center gap-2 p-3 rounded-xl bg-[var(--method-delete)]/10 border border-[var(--method-delete)]/20 text-[var(--method-delete)] animate-in fade-in">
                                <i className="ph ph-warning text-sm"></i>
                                <span className="font-semibold text-xs">{error}</span>
                            </div> :
                            testValue ?
                                isValid ?
                                    <div
                                        className="flex items-center gap-2 p-3 rounded-xl bg-[var(--method-get)]/10 border border-[var(--method-get)]/20 text-[var(--method-get)] animate-in fade-in">
                                        <i className="ph ph-check-circle text-sm"></i>
                                        <span className="font-semibold text-xs">Matches Pattern!</span>
                                    </div> :

                                    <div
                                        className="flex items-center gap-2 p-3 rounded-xl bg-[var(--method-delete)]/10 border border-[var(--method-delete)]/20 text-[var(--method-delete)] animate-in fade-in">
                                        <i className="ph ph-x-circle text-sm"></i>
                                        <span className="font-semibold text-xs">Does not match pattern</span>
                                    </div> :


                                <div
                                    className="p-3 rounded-xl bg-[var(--text-muted)]/10 border border-[var(--text-muted)]/20 text-[var(--text-muted)] text-center select-none">
                                    Enter a value to test matching.
                                </div>
                        }
                    </div>
                </div>

                <div
                    className="px-5 py-3 border-t flex justify-end border-[var(--border)] bg-[var(--background)]">


                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 transition-all shadow-sm select-none bg-[var(--primary)]">


                        Done
                    </button>
                </div>
            </div>
        </div>);

}
