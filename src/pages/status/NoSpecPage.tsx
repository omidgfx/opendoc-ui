import React from 'react';

type NoSpecViewProps = {
    canOpenLocal: boolean;
    onOpenLocalFile: () => void;
    onOpenAbout: () => void;
};
export default function NoSpecView({canOpenLocal, onOpenLocalFile, onOpenAbout}: NoSpecViewProps) {
    return (
        <div className="flex-1 h-full overflow-y-auto scrollbar-thin">
            <div className="min-h-full flex items-center justify-center p-6 select-none">
                <div className="w-full max-w-md flex flex-col items-center text-center">
                    <span className="relative flex size-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] shadow-sm">
                        <i className="ph-fill ph-file-text text-[24px]"></i>
                        <span className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full border bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)]">
                            <i className="ph ph-question text-[12px] font-black"></i>
                        </span>
                    </span>

                    <h1 className="mt-5 text-xl font-extrabold tracking-tight text-[var(--text-heading)]">
                        No specification loaded
                    </h1>

                    {canOpenLocal ? (
                        <>
                            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)] max-w-sm">
                                Open a Swagger 2.x or OpenAPI 3.x descriptor — JSON or YAML — from your device to start
                                exploring. Nothing is uploaded anywhere; the file stays in your browser and is kept in
                                your local history for next time.
                            </p>
                            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={onOpenLocalFile}
                                    className="w-full sm:w-auto h-10 px-5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)] hover:opacity-90 shadow-sm active:scale-[0.98]"
                                >
                                    <i className="ph-fill ph-folder-open text-[15px]"></i>
                                    Open specification
                                </button>
                                <button
                                    type="button"
                                    onClick={onOpenAbout}
                                    className="w-full sm:w-auto h-10 px-5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)] active:scale-[0.98]"
                                >
                                    <i className="ph-fill ph-info text-[15px]"></i>
                                    About OpenDoc UI
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)] max-w-sm">
                                This deployment is configured to serve predefined specifications, but none are currently
                                available. Check the deployment&apos;s config.json or window.INITIAL_CONFIG.
                            </p>
                            <button
                                type="button"
                                onClick={onOpenAbout}
                                className="mt-6 h-10 px-5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                            >
                                <i className="ph-fill ph-info text-[15px]"></i>
                                About OpenDoc UI
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
