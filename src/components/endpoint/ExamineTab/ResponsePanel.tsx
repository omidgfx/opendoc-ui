import CodeViewer from '../../common/CodeViewer';
import type { ExamineResponse } from '../../../types';

interface ResponsePanelProps {
    method: string;
    selectedServer: string;
    path: string;
    isRunning: boolean;
    response: ExamineResponse | null;
    onExecute: () => void;
    onClear: () => void;
}

function formatJson(text: string) {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

export default function ResponsePanel({ method, selectedServer, path, isRunning, response, onExecute, onClear }: ResponsePanelProps) {
    const hasResponse = response && response.status !== null;
    return (
        <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Response Outcome</label>
            <div className="p-2 rounded-xl border my-3 font-mono text-xs w-full flex items-center justify-between gap-2 sm:gap-4 bg-[var(--surface)] border-[var(--border)] text-[var(--text-heading)] flex-wrap sm:flex-nowrap">
                <div className="flex items-center grow gap-1.5 ps-2 min-w-0 overflow-hidden">
                    <span className="uppercase font-bold opacity-60 hidden sm:inline text-[9px] tracking-widest shrink-0">URL</span>
                    <span className="opacity-85 truncate select-all text-[11px]">{selectedServer}{path}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 select-none">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: isRunning ? '#ef4444' : '#10b981' }}></span>
                    <span className="text-[10px] font-sans font-bold uppercase opacity-60 tracking-wider">{isRunning ? 'running' : 'ready'}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {hasResponse && !isRunning && (
                        <button
                            type="button"
                            onClick={onClear}
                            title="Clear last response"
                            className="py-2 px-2.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--method-delete)] hover:bg-[var(--surface-hover)] rounded-lg transition-all cursor-pointer select-none"
                        >
                            <i className="ph ph-trash text-[16px]"></i>
                        </button>
                    )}
                    <button
                        onClick={onExecute}
                        disabled={isRunning}
                        id="examine-send-btn"
                        className="py-2 px-3 text-sm font-bold text-[var(--primary-contrast)] bg-[var(--method-get)] hover:brightness-110 rounded-lg shadow-md transition-all shrink-0 flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 select-none"
                    >
                        {isRunning ? (
                            <>
                                <span className="hidden sm:inline">Executing...</span>
                                <span className="sm:hidden">Run</span>
                                <i className="ph ph-spinner animate-spin text-[18px]"></i>
                            </>
                        ) : (
                            <>
                                <span className="hidden sm:inline">Send API Request</span>
                                <span className="sm:hidden">Send</span>
                                <i className="ph-fill ph-play text-[18px]"></i>
                            </>
                        )}
                    </button>
                </div>
            </div>
            <div className="space-y-3">
                <div className="border rounded-xl overflow-hidden flex flex-col min-h-[200px] bg-[var(--surface)] border-[var(--border)]">
                    {hasResponse ? (
                        <>
                            <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 border-[var(--border)] bg-[var(--background)]">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs uppercase font-bold text-[var(--text-heading)]">Status:</span>
                                    <span className="px-2.5 py-1 text-[11px] font-mono leading-none rounded-full font-bold bg-black/10">
                                        {response!.status === 0 ? 'Network Error' : response!.status}
                                    </span>
                                    {response!.timestamp && (
                                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                            {new Date(response!.timestamp).toLocaleTimeString()}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[10px] font-mono select-none text-[var(--text-muted)]">Response log console</span>
                            </div>
                            <div className="p-4 flex-1 h-full space-y-4">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">Response Headers</p>
                                    <CodeViewer
                                        code={response!.headers && Object.keys(response!.headers).length > 0
                                            ? Object.entries(response!.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
                                            : 'No response headers returned'}
                                        language="http"
                                        maxHeight="none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--text-muted)]">Response Payload</label>
                                    <CodeViewer
                                        code={response!.body ? (response!.isJson ? formatJson(response!.body) : response!.body) : 'Empty response body'}
                                        language={response!.isJson ? 'json' : 'text'}
                                        maxHeight="none"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none opacity-60">
                            <span className="w-12 h-12 rounded-full flex items-center justify-center text-lg mb-3 bg-[var(--background)] text-[var(--text-muted)]">
                                <i className="ph ph-terminal"></i>
                            </span>
                            <p className="text-sm font-semibold text-[var(--text-heading)]">No console transactions yet</p>
                            <p className="text-xs max-w-xs mt-1 text-[var(--text-muted)]">Adjust inputs, click run or press Ctrl/⌘+Enter. Transactions result details appear here — and they stay when you switch endpoints.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
