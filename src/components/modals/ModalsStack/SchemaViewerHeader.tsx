import type {WheelEvent} from 'react';
import {Tip} from '@/src/components/common/Tooltip';
import {generateSingleSchemaFile} from '@/src/utils/schemaExport';

interface SchemaItem {
    schemaName: string;
    schema: any;
}

interface SchemaViewerHeaderProps {
    active: SchemaItem;
    stack: SchemaItem[];
    schemas?: Record<string, any>;
    specKey: string;
    onShare: (name: string) => void;
    onPop: () => void;
    onClose: () => void;
}

export default function SchemaViewerHeader({
                                               active,
                                               stack,
                                               schemas,
                                               specKey,
                                               onShare,
                                               onPop,
                                               onClose
                                           }: SchemaViewerHeaderProps) {
    const wheel = (event: WheelEvent<HTMLDivElement>) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX))
            return;
        if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth)
            return;
        event.preventDefault();
        event.currentTarget.scrollLeft += event.deltaY;
    };
    return <header
        className="px-4 sm:px-6 py-2.5 sm:py-4 flex flex-col gap-2 sm:gap-3 border-b shrink-0 border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad">
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0"><span
                className="size-9 sm:size-10 rounded-lg flex items-center justify-center shrink-0 text-[var(--primary)]"
                style={{backgroundColor: 'rgba(79, 70, 229, 0.1)'}}><i
                className="ph ph-diamonds-four text-[20px] sm:text-[24px]"/></span>
                <div className="min-w-0"><h3
                    className="font-semibold text-sm sm:text-base text-[var(--text-heading)] truncate">{active.schemaName}</h3>
                    <p className="text-[10px] sm:text-xs text-[var(--text-muted)] truncate">Schema Explorer</p></div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0"><Tip content="Share this schema link">
                <button onClick={() => onShare(active.schemaName)}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)]">
                    <i className="ph ph-share-network text-[14px]"/></button>
            </Tip><Tip content="Export this schema as TypeScript model">
                <button
                    onClick={() => schemas && generateSingleSchemaFile(active.schemaName, active.schema, schemas, specKey)}
                    className="h-8 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 text-[10px] sm:text-xs font-bold cursor-pointer bg-[var(--method-get)] text-[var(--method-get-contrast)] border-[var(--method-get)] hover:opacity-90">
                    <i className="ph ph-download-simple text-[12px]"/><span className="hidden sm:inline">Export
                    TS</span></button>
            </Tip><Tip content="Close schema viewer">
                <button onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-muted)]">
                    <i className="ph ph-x"/></button>
            </Tip></div>
        </div>
        <div
            className="schema-breadcrumb-scroll flex items-center gap-2 overflow-x-auto py-1.5 scrollbar-thin text-xs select-none"
            onWheel={wheel}><span
            className="text-[var(--text-muted)] font-semibold flex items-center shrink-0">Path:</span>{stack.map((item, index) => {
            const last = index === stack.length - 1;
            return <div key={`${item.schemaName}-${index}`} className="flex items-center gap-1.5 shrink-0">{index > 0 &&
                <i className="ph ph-caret-right text-[9px] text-[var(--text-muted)]"/>}
                <button disabled={last} onClick={() => {
                    for (let i = stack.length - 1; i > index; i--)
                        onPop();
                }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold truncate max-w-[140px] ${last ? 'bg-[var(--primary)] text-[var(--primary-contrast)] pointer-events-none' : 'bg-[var(--text-muted)]/10 hover:bg-[var(--text-muted)]/20 text-[var(--primary)] cursor-pointer'}`}>{item.schemaName}</button>
            </div>;
        })}</div>
        <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5"><i
            className="ph ph-keyboard"/><span>Press <kbd
            className="px-1 py-0.5 rounded border text-[9px] bg-[var(--surface-hover)] border-[var(--border)]">ESC</kbd> to {stack.length > 1 ? 'go back' : 'close'}
        </span></div>
    </header>;
}
