import {createPortal} from 'react-dom';
import {useState} from 'react';
import {useEscClose} from '../../hooks/useEscClose';
import {useModalTransition} from '../../hooks/useModalTransition';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
    onClose: () => void;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    const transition = useModalTransition(isOpen, onClose);
    const [confirming, setConfirming] = useState(false);
    useEscClose(isOpen && !confirming, transition.requestClose);
    if (!transition.shouldRender || typeof document === 'undefined') return null;
    return createPortal(
        <div
            data-confirm-modal-root
            className={`${transition.backdropClassName} fixed inset-0 z-[5000] bg-black/50 backdrop-blur-[2px]`}
            onMouseDown={event => {
                if (event.target === event.currentTarget) transition.requestClose();
            }}
        >
            <div className="modal-surface modal-confirm-surface w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <div className="border-b border-[var(--border)] px-5 py-4">
                    <h3 className="text-sm font-extrabold text-[var(--text-heading)]">{title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{message}</p>
                </div>
                <div className="flex justify-end gap-2 bg-[var(--background)] px-5 py-3">
                    <button
                        type="button"
                        disabled={confirming}
                        onClick={transition.requestClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        disabled={confirming}
                        onClick={() => {
                            setConfirming(true);
                            void (async () => {
                                try {
                                    await onConfirm();
                                } catch (error) {
                                    console.error('Confirmation action failed', error);
                                } finally {
                                    setConfirming(false);
                                    transition.requestClose();
                                }
                            })();
                        }}
                        className={`rounded-lg px-4 py-2 text-xs font-bold disabled:cursor-wait disabled:opacity-60 cursor-pointer ${
                            destructive
                                ? 'bg-[var(--method-delete)] text-[var(--method-delete-contrast)] hover:brightness-110'
                                : 'bg-[var(--primary)] text-[var(--primary-contrast)] hover:brightness-110'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
