import {useState} from 'react';
import Field from './recursive/Field';
import type {BodyValue, PathPart, RecursiveBodyFormProps} from '@/src/types/recursiveBody';
import {setAtPath} from '@/src/utils/runner/recursiveBody';

export type {BodyValue} from '@/src/types/recursiveBody';
export {
    DESCRIPTION_TOOLTIP_THRESHOLD, defaultBodyValue, usesDescriptionTooltip
} from '@/src/utils/runner/recursiveBody';
export default function RecursiveBodyForm({
                                              schema,
                                              spec,
                                              value,
                                              onChange,
                                              setPatternToTest,
                                              selectedFiles,
                                              setSelectedFiles
                                          }: RecursiveBodyFormProps) {
    const [focusedPath, setFocusedPath] = useState<PathPart[] | null>(null);
    const update = (path: PathPart[], nextValue: unknown) => onChange(setAtPath(value, path, nextValue));
    return (<div className="min-w-0 overflow-x-auto scrollbar-thin pb-2" onBlurCapture={event => {
        const next = event.relatedTarget;
        if (!next || typeof Node === 'undefined' || !(next instanceof Node) || !event.currentTarget.contains(next))
            setFocusedPath(null);
    }}>
        <div className="min-w-0 space-y-0 animate-in fade-in">
            <Field schema={schema} spec={spec} value={value} label="Request body" path={[]} depth={0} onChange={update}
                   setPatternToTest={setPatternToTest} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles}
                   focusedPath={focusedPath} setFocusedPath={setFocusedPath}/>
        </div>
    </div>);
}
