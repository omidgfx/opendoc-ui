import clsx from 'clsx';

export type SettingsConfirmKind = 'save' | 'delete' | 'all';

interface SettingsConfirmModalProps {
    visible: boolean;
    backdropClassName: string;
    kind: SettingsConfirmKind | null;
    onClose: () => void;
    onConfirm: () => void;
}

const presentation = (kind: SettingsConfirmKind | null) =>
    kind === 'save'
        ? {
              icon: 'ph-floppy-disk',
              tone: 'primary',
              label: 'Save changes',
              title: 'Save profile changes?',
              body: 'The current provider, model, key, gateway, and skill settings will replace the saved profile.',
          }
        : kind === 'delete'
          ? {
                icon: 'ph-trash',
                tone: 'danger',
                label: 'Delete profile',
                title: 'Delete profile?',
                body: 'This profile and its saved credentials will be removed.',
            }
          : {
                icon: 'ph-trash-simple',
                tone: 'danger',
                label: 'Remove all',
                title: 'Remove all profiles?',
                body: 'All global AI profiles and saved credentials will be removed.',
            };
export default function SettingsConfirmModal({
    visible,
    backdropClassName,
    kind,
    onClose,
    onConfirm,
}: SettingsConfirmModalProps) {
    if (!visible || !kind) return null;
    const item = presentation(kind);
    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[6000] bg-black/55 backdrop-blur-[2px]`}
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section className="modal-surface modal-confirm-surface w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <span
                        className={clsx(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl',
                            item.tone === 'danger'
                                ? 'bg-[var(--method-delete)]/10 text-[var(--method-delete)]'
                                : 'bg-[var(--primary)]/10 text-[var(--primary)]',
                        )}
                    >
                        <i className={`ph ${item.icon} text-[18px]`} />
                    </span>
                    <h3 className="text-sm font-extrabold text-[var(--text-heading)]">{item.title}</h3>
                </header>
                <div className="px-4 py-4">
                    <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{item.body}</p>
                </div>
                <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={clsx(
                            'whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold hover:brightness-110 cursor-pointer',
                            item.tone === 'danger'
                                ? 'bg-[var(--method-delete)] text-[var(--method-delete-contrast)]'
                                : 'bg-[var(--primary)] text-[var(--primary-contrast)]',
                        )}
                    >
                        {item.label}
                    </button>
                </footer>
            </section>
        </div>
    );
}
