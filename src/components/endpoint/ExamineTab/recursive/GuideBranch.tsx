import {Children, isValidElement, type ReactNode} from 'react';
import type {FieldProps} from '@/src/types/recursiveBody';

const childPath = (child: ReactNode): Array<string | number> | null => {
    if (!isValidElement(child)) return null;
    const props = child.props as Partial<FieldProps>;
    return Array.isArray(props.path) ? props.path : null;
};

export default function GuideBranch({children}: {children: ReactNode; focusedPath?: Array<string | number> | null}) {
    const rows = Children.toArray(children);
    return (
        <div className="relative ms-2 min-w-0 ps-4">
            {rows.map((child, index) => {
                const isLast = index === rows.length - 1;
                const elbowY = childPath(child) ? 22 : 18;
                return (
                    <div
                        key={isValidElement(child) && child.key != null ? String(child.key) : index}
                        className="relative min-w-0"
                    >
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -start-4 top-0 w-px bg-[var(--text)]/25"
                            style={isLast ? {height: elbowY + 1} : {bottom: 0}}
                        />
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -start-4 h-px w-3 bg-[var(--text)]/25"
                            style={{top: elbowY}}
                        />
                        {child}
                    </div>
                );
            })}
        </div>
    );
}
