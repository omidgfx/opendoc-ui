import clsx from 'clsx';
import {Tip} from './Tooltip';

interface PatternPreviewProps {
    pattern: string;
    onTest?: () => void;
    showLabel?: boolean;
    className?: string;
}

export default function PatternPreview({pattern, onTest, showLabel = false, className}: PatternPreviewProps) {
    return (<div
        className={clsx('flex max-w-full min-w-0 items-center gap-2 overflow-hidden py-1 text-[9px] font-mono', className)}>
        {showLabel && <span className="inline-block w-auto max-w-[160px] shrink-0 truncate">pattern:</span>}
        <Tip wrapperClassName="inline-flex w-auto min-w-0 max-w-[160px] shrink"
             content={<code className="font-mono text-[10px]">/{pattern}/</code>}>
            <code
                className="inline-block w-auto min-w-0 max-w-[160px] truncate overflow-hidden whitespace-nowrap text-ellipsis text-[var(--method-put)]">/{pattern}/</code>
        </Tip>
        {onTest && (<Tip content="Test this regex pattern">
            <button type="button" onClick={onTest}
                    className="shrink-0 rounded border border-[var(--primary)]/30 px-1.5 py-0.5 text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer">
                Test
            </button>
        </Tip>)}
    </div>);
}
