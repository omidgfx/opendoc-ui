import clsx from 'clsx';
import type { AIConversation } from '@/src/types';
interface MobileConversationsModalProps {
    visible: boolean;
    backdropClassName: string;
    conversations: AIConversation[];
    activeId?: string;
    onClose: () => void;
    onCreate: () => void;
    onSelect: (id: string) => void;
    onDelete: (conversation: AIConversation) => void;
}
export default function MobileConversationsModal({ visible, backdropClassName, conversations, activeId, onClose, onCreate, onSelect, onDelete }: MobileConversationsModalProps) {
    if (!visible)
        return null;
    return (<div className={`${backdropClassName} fixed inset-0 z-[5900] bg-black/50 backdrop-blur-[2px] md:hidden`} onMouseDown={event => {
            if (event.target === event.currentTarget)
                onClose();
        }}>
            <aside className="modal-surface modal-surface-stable flex w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div><h2 className="text-sm font-extrabold text-[var(--text-heading)]">Conversations</h2><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Saved for this specification</p></div>
                    <div className="flex items-center gap-1.5"><button type="button" onClick={onCreate} className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer" aria-label="New conversation"><i className="ph ph-plus"/></button><button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer" aria-label="Close conversations"><i className="ph ph-x"/></button></div>
                </header>
                <div className="modal-scroll-region min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
                    {conversations.length === 0 && <p className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">No saved conversations yet.</p>}
                    {conversations.map(conversation => <div key={conversation.id} className={clsx('flex items-center gap-2 rounded-xl px-2 py-1.5', conversation.id === activeId ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--surface-hover)]')}><button type="button" onClick={() => onSelect(conversation.id)} className="min-w-0 flex-1 truncate px-1 py-2 text-left text-xs font-semibold text-[var(--text)] cursor-pointer"><i className="ph ph-chat-teardrop-text me-2 text-[var(--primary)]"/>{conversation.title}</button><button type="button" onClick={() => onDelete(conversation)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] cursor-pointer" aria-label={`Delete ${conversation.title}`}><i className="ph ph-trash"/></button></div>)}
                </div>
            </aside>
        </div>);
}
