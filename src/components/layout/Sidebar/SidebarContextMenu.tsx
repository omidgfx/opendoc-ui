import clsx from 'clsx';
import type { ViewTabKind } from '@/src/types/tabs';
export type SidebarContextTarget = {
    type: 'endpoint';
    path: string;
    method: string;
} | {
    type: 'view';
    view: ViewTabKind;
};
interface SidebarContextMenuProps {
    x: number;
    y: number;
    target: SidebarContextTarget;
    hasAIProfile: boolean;
    onAction: (action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai', target: SidebarContextTarget) => void;
    onClose: () => void;
}
export default function SidebarContextMenu({ x, y, target, hasAIProfile, onAction, onClose }: SidebarContextMenuProps) {
    const act = (action: 'open-new-tab' | 'open-browser' | 'share' | 'copy-link' | 'ask-ai') => { onAction(action, target); onClose(); };
    const button = 'w-full text-left px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-2';
    return <div className="fixed z-[5000] min-w-[200px] rounded-xl border shadow-xl py-1 bg-[var(--surface)] border-[var(--border)] animate-fade-in" style={{ top: y, left: x }} onClick={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}><button className={button} onClick={() => act('open-new-tab')}><i className="ph ph-plus-square text-[12px] text-[var(--primary)]"/>Open in new tab</button><button className={button} onClick={() => act('open-browser')}><i className="ph ph-arrow-square-out text-[12px] text-[var(--text-muted)]"/>Open in new browser tab</button><button className={button} onClick={() => act('copy-link')}><i className="ph ph-link text-[12px] text-[var(--text-muted)]"/>Copy link</button>{target.type === 'endpoint' && <button type="button" disabled={!hasAIProfile} title={hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile first'} className={clsx(button, hasAIProfile ? '' : 'cursor-not-allowed text-[var(--text-muted)] opacity-50')} onClick={() => hasAIProfile && act('ask-ai')}><i className="ph-fill ph-sparkle text-[12px] text-[var(--primary)]"/>{hasAIProfile ? 'Ask AI about this endpoint' : 'Create an AI profile to use AI'}</button>}<div className="my-1 border-t border-[var(--border)]"/><button className={button} onClick={() => act('share')}><i className="ph ph-share-network text-[12px] text-[var(--method-get)]"/>Share</button></div>;
}
