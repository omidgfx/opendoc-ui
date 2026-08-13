import type {ReferenceIssue, ReferenceResolution} from '../../utils/openapi';

interface ReferenceStatusNoticeProps {
    resolution?: ReferenceResolution;
    issue?: ReferenceIssue;
    onAddFiles?: () => void;
    compact?: boolean;
}

export default function ReferenceStatusNotice({
    resolution,
    issue,
    onAddFiles,
    compact = false,
}: ReferenceStatusNoticeProps) {
    const status = issue?.status || resolution?.status;
    const ref = issue?.ref || resolution?.ref || '';
    if (!status || status === 'resolved') return null;
    const title =
        status === 'unresolved'
            ? 'Referenced schema is unavailable'
            : status === 'circular'
              ? 'Circular reference preserved'
              : 'Reference depth limit reached';
    const file = !ref.startsWith('#') ? ref.split('#', 1)[0] : '';
    return (
        <div
            data-reference-status={status}
            className="rounded-xl border border-[var(--method-put)]/30 bg-[var(--method-put)]/5 p-3 text-xs"
        >
            <div className="flex items-start gap-2.5">
                <i className="ph ph-link-break mt-0.5 shrink-0 text-[16px] text-[var(--method-put)]" />
                <div className="min-w-0 flex-1">
                    <strong className="text-[var(--text-heading)]">{title}</strong>
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                        OpenDoc keeps the original reference unchanged and disables only features that require the
                        missing schema.
                    </p>
                    {ref && (
                        <code className="mt-2 block overflow-x-auto rounded-lg bg-[var(--background)] px-2 py-1.5 text-[9px] text-[var(--text)]">
                            {ref}
                        </code>
                    )}
                    {!compact && file && (
                        <p className="mt-1.5 text-[9px] text-[var(--text-muted)]">
                            Required document: <span className="font-mono font-semibold">{file}</span>
                        </p>
                    )}
                    {onAddFiles && status === 'unresolved' && (
                        <button
                            type="button"
                            onClick={onAddFiles}
                            className="mt-2 rounded-lg border border-[var(--primary)]/30 bg-[var(--surface)] px-3 py-1.5 text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
                        >
                            <i className="ph ph-files me-1" /> Add referenced files
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
