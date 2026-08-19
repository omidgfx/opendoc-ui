import clsx from 'clsx';
import {Tip} from './Tooltip';
import type {SerializationDescriptor} from '../../utils/endpoint/parameterSerialization';

interface SerializationTagProps {
    descriptor: SerializationDescriptor;
    /** Opens the serializer playground; omitted where there is nothing to play with. */
    onOpenPlayground?: () => void;
    className?: string;
}

/**
 * Announces that a value is not sent verbatim. It looks the same in the
 * documentation table, the Runner field and the schema view, and opens the
 * serializer playground where one is available.
 */
export default function SerializationTag({descriptor, onOpenPlayground, className}: SerializationTagProps) {
    if (!descriptor.isSerialized) return null;
    const content = (
        <>
            <i className={clsx(descriptor.icon, 'text-[11px]')} />
            <span className="truncate">{descriptor.label}</span>
        </>
    );
    const shared =
        'inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold lowercase border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]';
    return (
        <Tip content={`${descriptor.hint}${onOpenPlayground ? ' Click to open the serializer playground.' : ''}`}>
            {onOpenPlayground ? (
                <button
                    type="button"
                    onClick={onOpenPlayground}
                    aria-label="Open the serializer playground"
                    className={clsx(shared, 'cursor-pointer transition-colors hover:bg-[var(--accent)]/20', className)}
                >
                    {content}
                </button>
            ) : (
                <span className={clsx(shared, 'cursor-help', className)}>{content}</span>
            )}
        </Tip>
    );
}
