import clsx from 'clsx';
import type {ViewTabKind} from '@/src/types/tabs';
import {Tip} from '@/src/components/common/Tooltip';
import {useEndpointNotes} from '@/src/contexts/EndpointNotesContext';

export type SidebarContextTarget =
    | {
          type: 'endpoint';
          path: string;
          method: string;
      }
    | {
          type: 'view';
          view: ViewTabKind;
      };

interface SidebarContextMenuProps {
    x: number;
    y: number;
    target: SidebarContextTarget;
    hasAIProfile: boolean;
    onAction: (
        action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai',
        target: SidebarContextTarget,
    ) => void;
    onClose: () => void;
}

export default function SidebarContextMenu({x, y, target, hasAIProfile, onAction, onClose}: SidebarContextMenuProps) {
    const {noteCountForEndpoint, openCreateNote, openEndpointNotes, isEndpointHidden, hideEndpoint, unhideEndpoint} =
        useEndpointNotes();
    const endpointNoteCount = target.type === 'endpoint' ? noteCountForEndpoint(target.path, target.method) : 0;
    const endpointHidden = target.type === 'endpoint' && isEndpointHidden(target.path, target.method);
    const act = (action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai') => {
        onAction(action, target);
        onClose();
    };
    const endpointAct = (action: 'create-note' | 'list-notes' | 'toggle-hidden') => {
        if (target.type !== 'endpoint') return;
        if (action === 'create-note') openCreateNote(target.path, target.method);
        else if (action === 'list-notes') openEndpointNotes(target.path, target.method);
        else if (endpointHidden) unhideEndpoint(target.path, target.method);
        else hideEndpoint(target.path, target.method);
        onClose();
    };
    const button =
        'w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2';
    return (
        <div
            className="fixed z-[5000] min-w-[200px] rounded-xl border shadow-xl py-1 bg-[var(--surface)] border-[var(--border)] animate-fade-in"
            style={{top: y, left: x}}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => event.preventDefault()}
        >
            <button className={button} onClick={() => act('open-new-tab')}>
                <i className="ph ph-plus-square text-[12px] text-[var(--primary)]" />
                Open in new tab
            </button>
            <button className={button} onClick={() => act('open-browser')}>
                <i className="ph ph-arrow-square-out text-[12px] text-[var(--text-muted)]" />
                Open in new browser tab
            </button>
            <button className={button} onClick={() => act('copy-link')}>
                <i className="ph ph-link text-[12px] text-[var(--text-muted)]" />
                Copy link
            </button>
            {target.type === 'endpoint' && (
                <>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <button className={button} onClick={() => endpointAct('create-note')}>
                        <i className="ph ph-note-pencil text-[13px] text-[var(--primary)]" />
                        Create local note
                    </button>
                    <button className={button} onClick={() => endpointAct('list-notes')}>
                        <i className="ph ph-notebook text-[13px] text-[var(--accent)]" />
                        <span className="min-w-0 flex-1">Endpoint notes</span>
                        <span className="rounded-full bg-[var(--primary)]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--primary)]">
                            {endpointNoteCount}
                        </span>
                    </button>
                    <button className={button} onClick={() => endpointAct('toggle-hidden')}>
                        <i
                            className={`ph ${endpointHidden ? 'ph-eye' : 'ph-eye-slash'} text-[13px] text-[var(--text-muted)]`}
                        />
                        {endpointHidden ? 'Unhide endpoint' : 'Hide endpoint'}
                    </button>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <Tip content={hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile first'} fullWidth>
                        <button
                            type="button"
                            disabled={!hasAIProfile}
                            className={clsx(
                                button,
                                hasAIProfile ? '' : 'cursor-not-allowed text-[var(--text-muted)] opacity-50',
                            )}
                            onClick={() => hasAIProfile && act('ask-ai')}
                        >
                            <i className="ph-fill ph-sparkle text-[12px] text-[var(--primary)]" />
                            {hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile to use AI'}
                        </button>
                    </Tip>
                </>
            )}
            <div className="my-1 border-t border-[var(--border)]" />
            <button className={button} onClick={() => act('share')}>
                <i className="ph ph-share-network text-[12px] text-[var(--method-get)]" />
                Share
            </button>
        </div>
    );
}
