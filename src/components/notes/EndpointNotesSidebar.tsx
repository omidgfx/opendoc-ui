import {useEffect, useRef, useState, type KeyboardEvent, type MouseEvent} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '../../types';
import {useEndpointNotes} from '../../contexts/EndpointNotesContext';
import {
    endpointNoteColor,
    endpointNoteTitle,
    readExpandedEndpointNoteIds,
    writeExpandedEndpointNoteIds,
} from '../../utils/notes/index';
import {uiStorage} from '../../utils/storage/index';
import {getOperation} from '../../utils/openapi';
import Markdown from '../common/Markdown';
import MethodBadge from '../common/MethodBadge';
import {Tip} from '../common/Tooltip';

const MIN_PANEL_WIDTH = 260;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 336;
const PANEL_WIDTH_STORAGE_NAME = 'endpoint_notes_sidebar_width';

interface EndpointNotesSidebarProps {
    spec: OpenApiSpec;
    specKey: string;
    path: string;
    method: string;
    overlay?: boolean;
    open?: boolean;
    onClose: () => void;
}

export default function EndpointNotesSidebar({
    spec,
    specKey,
    path,
    method,
    overlay = false,
    open = true,
    onClose,
}: EndpointNotesSidebarProps) {
    const {notesForEndpoint, canAddNote, openCreateNote, openNote, requestToggleTodo, isEndpointHidden} =
        useEndpointNotes();
    const endpointNotes = notesForEndpoint(path, method);
    const operation = getOperation(spec, path, method);
    const [expandedIds, setExpandedIds] = useState<string[]>(() => readExpandedEndpointNoteIds(specKey));
    const [width, setWidth] = useState(() => {
        const saved = uiStorage.getJSON<number>(PANEL_WIDTH_STORAGE_NAME, DEFAULT_PANEL_WIDTH, value =>
            Number.isFinite(value),
        );
        return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, saved));
    });
    const panelRef = useRef<HTMLElement | null>(null);
    const [dragging, setDragging] = useState(false);

    useEffect(() => setExpandedIds(readExpandedEndpointNoteIds(specKey)), [specKey]);
    useEffect(() => {
        if (!overlay) uiStorage.setJSON(PANEL_WIDTH_STORAGE_NAME, Math.round(width));
    }, [width, overlay]);
    useEffect(() => {
        if (!dragging || overlay) return;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        const onResizeMove = (event: globalThis.MouseEvent) => {
            const right = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth;
            setWidth(Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, right - event.clientX)));
        };
        const onResizeUp = () => setDragging(false);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeUp);
        return () => {
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeUp);
        };
    }, [dragging, overlay]);
    const onResizeMouseDown = (event: MouseEvent) => {
        if (overlay) return;
        event.preventDefault();
        setDragging(true);
    };
    const onResizeKeyDown = (event: KeyboardEvent) => {
        if (overlay) return;
        const step = event.shiftKey ? 48 : 16;
        let next = width;
        if (event.key === 'ArrowLeft') next += step;
        else if (event.key === 'ArrowRight') next -= step;
        else if (event.key === 'Home') next = MIN_PANEL_WIDTH;
        else if (event.key === 'End') next = MAX_PANEL_WIDTH;
        else return;
        event.preventDefault();
        setWidth(Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, next)));
    };
    const toggleExpanded = (noteId: string) => {
        setExpandedIds(current => {
            const next = current.includes(noteId) ? current.filter(id => id !== noteId) : [...current, noteId];
            writeExpandedEndpointNoteIds(specKey, next);
            return next;
        });
    };

    return (
        <>
            {overlay && (
                <button
                    type="button"
                    aria-label="Close endpoint notes"
                    className={clsx(
                        'absolute inset-0 z-20 bg-black/30 transition-opacity duration-300',
                        open ? 'opacity-100' : 'opacity-0',
                    )}
                    onClick={onClose}
                />
            )}
            <aside
                ref={panelRef}
                data-endpoint-notes-sidebar
                aria-label="Endpoint notes sidebar"
                // Drawn over the endpoint content, inside the pane it belongs
                // to: opening notes must not squeeze the documentation. It
                // slides in and out like the mobile sidebar does.
                className={clsx(
                    'absolute inset-y-0 right-0 z-30 flex h-full min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] transition-transform duration-300 ease-out',
                    overlay && 'max-w-[86vw]',
                    open ? 'translate-x-0 shadow-[-12px_0_28px_rgba(0,0,0,0.18)]' : 'translate-x-full shadow-none',
                )}
                aria-hidden={!open}
                style={{width: overlay ? `min(${width}px, 86vw)` : width}}
            >
                {!overlay && (
                    <div
                        role="separator"
                        aria-label="Resize endpoint notes sidebar"
                        aria-orientation="vertical"
                        aria-valuemin={MIN_PANEL_WIDTH}
                        aria-valuemax={MAX_PANEL_WIDTH}
                        aria-valuenow={Math.round(width)}
                        tabIndex={0}
                        onMouseDown={onResizeMouseDown}
                        onKeyDown={onResizeKeyDown}
                        className={clsx(
                            'absolute inset-y-0 -left-[2px] z-40 w-[4px] cursor-col-resize transition-colors select-none outline-none focus:bg-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30',
                            dragging ? 'bg-[var(--primary)]' : 'bg-transparent hover:bg-[var(--primary)]',
                        )}
                    />
                )}
                <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <i className="ph-fill ph-note text-[16px] text-[#f59e0b]" />
                            <h2 className="truncate text-xs font-extrabold text-[var(--text-heading)]">
                                Endpoint Notes
                            </h2>
                            <span className="text-[10px] font-bold text-[var(--text-muted)]">
                                {endpointNotes.length}
                            </span>
                        </div>
                        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                            <MethodBadge method={method} size="xs" />
                            <span className="truncate text-[9px] text-[var(--text-muted)]">
                                {operation?.summary || path}
                            </span>
                        </div>
                    </div>
                    <Tip content="Close endpoint notes">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close endpoint notes sidebar"
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"
                        >
                            <i className="ph ph-x text-[14px]" />
                        </button>
                    </Tip>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
                    {endpointNotes.length > 0 ? (
                        <div className="space-y-2">
                            {endpointNotes.map(note => {
                                const expanded = expandedIds.includes(note.id);
                                const color = endpointNoteColor(note.color);
                                return (
                                    <article
                                        key={note.id}
                                        data-endpoint-note-panel-card
                                        className="overflow-hidden rounded-lg border"
                                        style={{
                                            backgroundColor: color.background,
                                            borderColor: color.border,
                                            color: color.text,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={expanded}
                                            onClick={() => toggleExpanded(note.id)}
                                            className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
                                        >
                                            {note.type === 'todo' ? (
                                                <span
                                                    className="flex size-4 shrink-0 items-center justify-center rounded-full border"
                                                    style={{
                                                        borderColor: color.text,
                                                        backgroundColor: note.done ? color.dot : 'transparent',
                                                    }}
                                                >
                                                    {note.done && <i className="ph ph-check text-[10px] text-white" />}
                                                </span>
                                            ) : (
                                                <i className="ph-fill ph-note shrink-0 text-[14px] text-[#f59e0b]" />
                                            )}
                                            <strong
                                                className={`min-w-0 flex-1 truncate text-[10px] ${
                                                    note.done ? 'line-through opacity-60' : ''
                                                }`}
                                            >
                                                {endpointNoteTitle(note)}
                                            </strong>
                                            <i
                                                className={`ph ph-caret-down shrink-0 text-[11px] transition-transform ${
                                                    expanded ? 'rotate-180' : ''
                                                }`}
                                            />
                                        </button>
                                        {expanded && (
                                            <div data-endpoint-note-expanded className="px-3 pb-3">
                                                <div className="border-t pt-3" style={{borderColor: color.border}}>
                                                    {note.content.trim() ? (
                                                        <Markdown
                                                            text={note.content}
                                                            className={`!text-[10px] !text-inherit ${
                                                                note.done ? 'line-through decoration-1' : ''
                                                            }`}
                                                        />
                                                    ) : (
                                                        <div className="flex min-h-20 items-center justify-center text-[var(--text-muted)]">
                                                            <i
                                                                className="ph-fill ph-note text-2xl opacity-35"
                                                                aria-label="Empty note"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="mt-3 flex items-center justify-end gap-1.5">
                                                        {note.type === 'todo' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => requestToggleTodo(note.id)}
                                                                className="h-7 rounded-lg bg-[var(--surface)]/40 px-2 text-[9px] font-bold hover:bg-[var(--surface)]/65 cursor-pointer"
                                                            >
                                                                {note.done ? 'Mark not done' : 'Mark done'}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            aria-label="Open full note"
                                                            onClick={() => openNote(note.id)}
                                                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--surface)]/40 px-2 text-[9px] font-bold hover:bg-[var(--surface)]/65 cursor-pointer"
                                                        >
                                                            <i className="ph ph-arrows-out text-[11px]" />
                                                            Open
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">
                            <i className="ph-fill ph-note text-3xl text-[#f59e0b]/45" />
                            <p className="mt-2 text-xs font-bold text-[var(--text-heading)]">No endpoint notes</p>
                            <p className="mt-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
                                Add a note without leaving this endpoint.
                            </p>
                        </div>
                    )}
                </div>

                <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] p-3">
                    <button
                        type="button"
                        disabled={!canAddNote(path, method)}
                        onClick={() => openCreateNote(path, method)}
                        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-[10px] font-bold text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                        <i className="ph-fill ph-note text-[13px]" />
                        Add note
                    </button>
                    {isEndpointHidden(path, method) && (
                        <p className="mt-2 text-center text-[8px] text-[var(--text-muted)]">This endpoint is hidden.</p>
                    )}
                </footer>
            </aside>
        </>
    );
}
