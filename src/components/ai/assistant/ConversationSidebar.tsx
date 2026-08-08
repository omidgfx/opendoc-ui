import clsx from 'clsx';
import type { AIConversation, AISettings } from '@/src/types';
import { Tip } from '@/src/components/common/Tooltip';
interface ConversationSidebarProps {
    open: boolean;
    conversations: AIConversation[];
    activeId?: string;
    settings: AISettings;
    onCreate: () => void;
    onSelect: (id: string) => void;
    onDelete: (conversation: AIConversation) => void;
    onOpenSettings: () => void;
}
export default function ConversationSidebar({ open, conversations, activeId, settings, onCreate, onSelect, onDelete, onOpenSettings }: ConversationSidebarProps) {
    return <aside className={clsx('hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--background)] transition-all duration-300 md:flex', open ? 'w-64 opacity-100' : 'w-0 overflow-hidden border-r-0 opacity-0')}><div className="flex h-14 min-h-14 items-center justify-between gap-2 border-b border-[var(--border)] px-3"><span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]"><i className="ph-fill ph-chats-circle text-[15px] text-[var(--primary)]"/>Conversations</span><Tip content="New conversation"><button type="button" onClick={onCreate} className="flex size-7 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--surface-hover)] cursor-pointer"><i className="ph ph-plus text-[14px]"/></button></Tip></div><div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">{conversations.length === 0 && <p className="px-2 py-4 text-[10px] leading-relaxed text-[var(--text-muted)]">No saved conversations. Use the plus button or start typing below.</p>}{conversations.map(conversation => <button key={conversation.id} type="button" onClick={() => onSelect(conversation.id)} className={clsx('group mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer', conversation.id === activeId ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]')}><i className="ph ph-chat-teardrop-text shrink-0 text-[14px]"/><span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{conversation.title}</span><span role="button" tabIndex={0} aria-label={`Remove ${conversation.title}`} onClick={event => { event.stopPropagation(); onDelete(conversation); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onDelete(conversation);
    } }} className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--method-delete)]/10 hover:text-[var(--method-delete)] pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"><i className="ph ph-x text-[10px]"/></span></button>)}</div><div className="h-[76px] min-h-[76px] box-border flex flex-col justify-center gap-1 border-t border-[var(--border)] bg-[var(--background)] px-3"><div className="flex h-6 min-h-6 items-center justify-between gap-2 leading-[12px]"><span className="truncate text-[9px] font-black uppercase leading-[12px] tracking-wider text-[var(--text-muted)]">Assistant profile</span><Tip content="AI settings"><button type="button" onClick={onOpenSettings} className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] cursor-pointer"><i className="ph ph-gear-six text-[12px]"/></button></Tip></div><div className="h-[14px] min-h-[14px] truncate text-[10px] font-bold leading-[14px] text-[var(--text-heading)]">{settings.provider}</div><div className="h-[13px] min-h-[13px] truncate font-mono text-[9px] leading-[13px] text-[var(--text-muted)]" title={settings.model || 'No model selected'}>{settings.model || 'No model selected'}</div></div></aside>;
}
