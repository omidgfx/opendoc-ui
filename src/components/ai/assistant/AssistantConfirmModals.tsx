import type {AIConversation} from '@/src/types';

interface RunnerTarget {
    path: string;
    method: string;
}

interface AssistantConfirmModalsProps {
    deleteConversationTarget: AIConversation | null;
    deleteVisible: boolean;
    deleteBackdropClassName: string;
    onCancelDelete: () => void;
    onDelete: (id: string) => void;
    runnerTarget: RunnerTarget | null;
    runnerVisible: boolean;
    runnerBackdropClassName: string;
    onCancelRunner: () => void;
    onOpenRunner: (path: string, method: string) => void;
}

export default function AssistantConfirmModals(props: AssistantConfirmModalsProps) {
    const {
        deleteConversationTarget,
        deleteVisible,
        deleteBackdropClassName,
        onCancelDelete,
        onDelete,
        runnerTarget,
        runnerVisible,
        runnerBackdropClassName,
        onCancelRunner,
        onOpenRunner,
    } = props;
    return (
        <>
            {deleteVisible && deleteConversationTarget && (
                <div
                    className={`${deleteBackdropClassName} fixed inset-0 z-[6000] bg-black/55 backdrop-blur-[2px]`}
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) onCancelDelete();
                    }}
                >
                    <section className="modal-surface modal-confirm-surface w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--method-delete)]/10 text-[var(--method-delete)]">
                                <i className="ph ph-trash text-[18px]" />
                            </span>
                            <h3 className="text-sm font-extrabold text-[var(--text-heading)]">Delete conversation?</h3>
                        </header>
                        <div className="px-4 py-4">
                            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                                “{deleteConversationTarget.title}” and all of its saved messages will be removed from
                                this specification.
                            </p>
                        </div>
                        <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                            <button
                                type="button"
                                onClick={onCancelDelete}
                                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onDelete(deleteConversationTarget.id);
                                    onCancelDelete();
                                }}
                                className="whitespace-nowrap rounded-xl bg-[var(--method-delete)] px-4 py-2 text-xs font-bold text-[var(--method-delete-contrast)] hover:brightness-110 cursor-pointer"
                            >
                                Delete conversation
                            </button>
                        </footer>
                    </section>
                </div>
            )}
            {runnerVisible && runnerTarget && (
                <div
                    className={`${runnerBackdropClassName} fixed inset-0 z-[6000] bg-black/55 backdrop-blur-[2px]`}
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) onCancelRunner();
                    }}
                >
                    <section className="modal-surface modal-confirm-surface w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                <i className="ph ph-flask text-[18px]" />
                            </span>
                            <h3 className="text-sm font-extrabold text-[var(--text-heading)]">Prepare API Runner?</h3>
                        </header>
                        <div className="px-4 py-4">
                            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                                This opens the existing Runner for{' '}
                                <strong>
                                    {runnerTarget.method.toUpperCase()} {runnerTarget.path}
                                </strong>
                                . No request will be sent until you press Run.
                            </p>
                        </div>
                        <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                            <button
                                type="button"
                                onClick={onCancelRunner}
                                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onOpenRunner(runnerTarget.path, runnerTarget.method);
                                    onCancelRunner();
                                }}
                                className="whitespace-nowrap rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                            >
                                Open Runner
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </>
    );
}
