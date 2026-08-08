import clsx from 'clsx';
import {Tip} from './Tooltip';

interface PatternPreviewProps {
    pattern: string;
    onTest?: () => void;
    showLabel?: boolean;
    className?: string;
}

/** A bounded regex preview with a full-value tooltip when the text is clipped. */
export default function PatternPreview({pattern, onTest, showLabel = false, className}: PatternPreviewProps) {
    return (
        <div className={clsx('flex min-w-0 items-center gap-2 py-1 text-[9px] font-mono', className)}>
            {showLabel && <span className="shrink-0">pattern:</span>}
            <Tip
                wrapperClassName="min-w-0 w-full max-w-[min(100%,420px)]"
                content={<code className="font-mono text-[10px]">/{pattern}/</code>}
            >
                <code className="block min-w-0 max-w-full truncate overflow-hidden whitespace-nowrap text-ellipsis text-[var(--method-put)]">/{pattern}/</code>
            </Tip>
            {onTest && (
                <Tip content="Test this regex pattern">
                    <button
                        type="button"
                        onClick={onTest}
                        className="shrink-0 rounded border border-[var(--primary)]/30 px-1.5 py-0.5 text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
                    >
                        Test
                    </button>
                </Tip>
            )}
        </div>
    );
}
