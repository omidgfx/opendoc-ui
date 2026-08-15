import {actionLabel, type OpenDocUIAction, parseOpenDocUIActions} from '../../../utils/ai/bridge';

interface AssistantActionsProps {
    text: string;
    onExecute: (action: OpenDocUIAction) => void;
}

export default function AssistantActions({text, onExecute}: AssistantActionsProps) {
    const actions = parseOpenDocUIActions(text);
    if (actions.length === 0) return null;
    return (
        <div className="mt-3 space-y-2 border-t border-[var(--border)]/70 pt-2.5">
            <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                <i className="ph ph-lightning text-[12px] text-[var(--primary)]" />
                OpenDoc UI actions
            </div>
            {actions.map((action, index) => (
                <button
                    key={`${action.action}-${index}`}
                    type="button"
                    onClick={() => onExecute(action)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-3 py-2 text-left text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
                >
                    <span className="min-w-0 truncate">{actionLabel(action)}</span>
                    <i className="ph ph-arrow-up-right shrink-0 text-[13px]" />
                </button>
            ))}
            <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
                Actions are proposals. Clicking one is required; filling Runner fields does not send a request unless
                you explicitly choose a Run action.
            </p>
        </div>
    );
}
