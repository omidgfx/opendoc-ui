import CodeViewer from '@/src/components/common/CodeViewer';

interface Content {
    title: string;
    content: string;
    isJson?: boolean;
}

interface SchemaExampleModalProps {
    visible: boolean;
    backdropClassName: string;
    value: Content | null;
    onClose: () => void;
}

export default function SchemaExampleModal({visible, backdropClassName, value, onClose}: SchemaExampleModalProps) {
    if (!visible || !value) return null;
    return (
        <div
            className={`${backdropClassName} fixed inset-0 z-[3000] backdrop-blur-[2px]`}
            style={{backgroundColor: 'rgba(0, 0, 0, 0.4)'}}
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="modal-surface modal-surface-no-safe-gap w-full max-w-lg rounded-2xl border flex flex-col max-h-[80vh] overflow-hidden shadow-2xl bg-[var(--surface)] border-[var(--border)]">
                <header className="px-4 sm:px-5 py-2.5 sm:py-4 border-b shrink-0 flex items-center justify-between gap-2 border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad">
                    <span className="font-bold text-sm tracking-wide text-[var(--text-heading)]">
                        <i
                            className={
                                value.isJson
                                    ? 'ph ph-eye mr-1.5 text-[var(--primary)]'
                                    : 'ph ph-info mr-1.5 text-[var(--primary)]'
                            }
                        />
                        {value.title}
                    </span>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg hover:bg-[var(--surface-hover)] flex items-center justify-center cursor-pointer text-[var(--text-muted)]"
                    >
                        <i className="ph ph-x" />
                    </button>
                </header>
                <div className="modal-scroll-region p-4 sm:p-6 overflow-y-auto space-y-4 text-xs leading-relaxed scrollbar-thin text-[var(--text)]">
                    {value.isJson ? (
                        <CodeViewer code={value.content} language="json" maxHeight="none" />
                    ) : (
                        <div className="whitespace-pre-wrap opacity-95">{value.content}</div>
                    )}
                </div>
                <footer className="px-5 py-3 border-t text-right border-[var(--border)] bg-[var(--background)]">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer bg-[var(--primary)]"
                    >
                        {value.isJson ? 'Close Example' : 'Close Help'}
                    </button>
                </footer>
            </div>
        </div>
    );
}
