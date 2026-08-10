interface AIProfileRequiredStateProps {
    onOpenSettings: () => void;
}

export default function AIProfileRequiredState({onOpenSettings}: AIProfileRequiredStateProps) {
    return (
        <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-[var(--surface)] p-6">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] p-7 text-center shadow-sm">
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]">
                    <i className="ph-fill ph-sparkle text-[26px]" />
                </span>
                <h1 className="mt-5 text-lg font-extrabold text-[var(--text-heading)]">Create an AI profile</h1>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                    The AI Assistant needs a provider profile before it can answer questions. Choose a provider, model,
                    and transport to get started.
                </p>
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="mt-5 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer"
                >
                    <i className="ph ph-plus me-1.5" />
                    Create profile
                </button>
            </div>
        </div>
    );
}
