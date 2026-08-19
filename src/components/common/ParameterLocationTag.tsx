import clsx from 'clsx';
import type {ParameterGroupMeta} from '../../utils/endpoint/parameterGroups';
import {Tip} from './Tooltip';

interface ParameterLocationTagProps {
    group: ParameterGroupMeta;
    /** Section headings use the full title; inline tags use the short one. */
    variant?: 'tag' | 'heading';
    className?: string;
}

/**
 * The location of a parameter, always with the same icon and hue: path, query,
 * header and cookie are told apart at a glance in the documentation tables,
 * the Runner and anywhere else they are named.
 */
export default function ParameterLocationTag({group, variant = 'tag', className}: ParameterLocationTagProps) {
    if (variant === 'heading') {
        return (
            <span className={clsx('inline-flex items-center gap-2', className)}>
                <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-lg border text-[13px]"
                    style={{
                        color: group.color,
                        backgroundColor: `color-mix(in srgb, ${group.color} 12%, transparent)`,
                        borderColor: `color-mix(in srgb, ${group.color} 30%, transparent)`,
                    }}
                >
                    <i className={group.icon} />
                </span>
                {group.title}
            </span>
        );
    }
    return (
        <Tip content={group.description}>
            <span
                className={clsx(
                    'inline-flex cursor-help items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase',
                    className,
                )}
                style={{
                    color: group.color,
                    backgroundColor: `color-mix(in srgb, ${group.color} 10%, transparent)`,
                    borderColor: `color-mix(in srgb, ${group.color} 28%, transparent)`,
                }}
            >
                <i className={clsx(group.icon, 'text-[11px]')} />
                {group.shortTitle}
            </span>
        </Tip>
    );
}
