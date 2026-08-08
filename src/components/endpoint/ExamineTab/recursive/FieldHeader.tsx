import type { ReactNode } from 'react';
import clsx from 'clsx';
import Markdown from '../../../common/Markdown';
import DescriptionTip from './DescriptionTip';
import { DESCRIPTION_TOOLTIP_THRESHOLD, usesDescriptionTooltip } from '@/src/utils/runner/recursiveBody';
const mutedLineClass = 'text-[var(--text-muted)]';
export default function FieldHeader({ label, required, description, typeLabel, actions }: {
    label: string;
    required?: boolean;
    description?: string;
    typeLabel?: string;
    actions?: ReactNode;
}) {
    const longDescription = usesDescriptionTooltip(description);
    const preview = description?.trim()
        ? longDescription
            ? `${description.trim().slice(0, DESCRIPTION_TOOLTIP_THRESHOLD)}...`
            : description
        : '';
    return (<>
            <div className="flex min-h-7 min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-[var(--text-heading)]">
                        {label}{required && <b className="ms-1 text-[var(--method-delete)]">*</b>}
                    </span>
                    {longDescription && <DescriptionTip description={description}/>}
                    {typeLabel &&
            <span className={clsx('shrink-0 font-mono text-[9px]', mutedLineClass)}>{typeLabel}</span>}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
            </div>
            {preview && <Markdown text={preview} className="mt-0.5 max-w-3xl text-[10px] leading-relaxed text-[var(--text-muted)]"/>}
        </>);
}
