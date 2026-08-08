import Markdown from '../../../common/Markdown';
import {Tip} from '../../../common/Tooltip';

export default function DescriptionTip({description}: { description?: string }) {
    if (!description?.trim()) return null;
    return (
        <Tip interactive variant="surface" closable content={<div className="max-w-[300px]"><Markdown text={description}
                                                                                                      className="text-[11px] leading-relaxed"/>
        </div>}>
            <button
                type="button"
                aria-label="Show field description"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--primary)]/75 hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
            >
                <i className="ph ph-info text-[13px]"/>
            </button>
        </Tip>
    );
}
