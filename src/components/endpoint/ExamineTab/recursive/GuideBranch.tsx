import {Children, isValidElement, type ReactNode} from 'react';
import type {FieldProps, PathPart} from '@/src/types/recursiveBody';

const isPathPrefix = (candidate: PathPart[], target: PathPart[] | null): boolean =>
    !!target && candidate.length <= target.length && candidate.every((part, index) => part === target[index]);
const childPath = (child: ReactNode): PathPart[] | null => {
    if (!isValidElement(child)) return null;
    const props = child.props as Partial<FieldProps>;
    return Array.isArray(props.path) ? props.path : null;
};

export default function GuideBranch({children, focusedPath}: {children: ReactNode; focusedPath?: PathPart[] | null}) {
    const rows = Children.toArray(children);
    const activeRowIndex = rows.findIndex(child => {
        const path = childPath(child);
        return path ? isPathPrefix(path, focusedPath || null) : false;
    });
    return (
        <div className="relative ms-2 min-w-0 ps-4">
            {rows.map((child, index) => {
                const isLast = index === rows.length - 1;
                const elbowY = childPath(child) ? 22 : 18;
                const active = activeRowIndex >= 0 && index <= activeRowIndex;
                const activeThroughRow = activeRowIndex >= 0 && index < activeRowIndex;
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
                        {active && (
                            <span
                                aria-hidden="true"
                                data-runner-guide-active="true"
                                className="pointer-events-none absolute -start-4 top-0 w-px bg-[var(--primary)]"
                                style={activeThroughRow ? {bottom: 0} : {height: elbowY + 1}}
                            />
                        )}
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -start-4 h-px w-3 bg-[var(--text)]/25"
                            style={{top: elbowY}}
                        />
                        {index === activeRowIndex && (
                            <span
                                aria-hidden="true"
                                data-runner-guide-active="true"
                                className="pointer-events-none absolute -start-4 h-px w-3 bg-[var(--primary)]"
                                style={{top: elbowY}}
                            />
                        )}
                        {child}
                    </div>
                );
            })}
        </div>
    );
}
