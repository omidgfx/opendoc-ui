import clsx from 'clsx';
import {Tip} from './Tooltip';
import type {CombinatorMeta} from '../../utils/schema/combinators';

interface CombinatorLabelProps {
    meta: CombinatorMeta;
    /** Inline captions keep the longer wording used inside type cells. */
    variant?: 'caption' | 'inline';
    className?: string;
}

/** The coloured name of a polymorphism keyword, identical wherever it appears. */
export default function CombinatorLabel({meta, variant = 'caption', className}: CombinatorLabelProps) {
    return (
        <Tip content={meta.hint}>
            <span
                className={clsx(
                    'inline-flex cursor-help items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wider',
                    className,
                )}
                style={{color: meta.color}}
            >
                <i className={clsx(meta.icon, 'text-[11px]')} />
                {variant === 'inline' ? meta.inlineLabel : meta.label}
            </span>
        </Tip>
    );
}
