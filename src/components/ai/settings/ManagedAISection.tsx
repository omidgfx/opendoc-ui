import type {AIManagedPolicy} from '../../../types';

interface ManagedAISectionProps {
    policy: AIManagedPolicy;
}

/** Read-only stand-in for the AI settings editor in managed mode. */
export default function ManagedAISection({policy}: ManagedAISectionProps) {
    return (
        <section className="px-1 pb-10 sm:px-2">
            <div className="mx-auto w-full max-w-3xl">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
                    <div className="flex items-start gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/10 text-[var(--primary)]">
                            <i className="ph-fill ph-sparkle text-[22px]" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-sm font-extrabold text-[var(--text-heading)]">{policy.displayName}</h3>
                            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
                                Provided by your organization
                            </p>
                        </div>
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
                        The AI assistant is configured and managed on your organization's backend. Provider, model, and
                        authorization details are owned server-side and are neither visible nor editable here — the
                        assistant is ready to use without any setup.
                    </p>
                    <dl className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3">
                            <dt className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                Status
                            </dt>
                            <dd className="mt-1 text-[11px] font-bold text-[var(--text-heading)]">
                                {policy.ready ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <i className="ph-fill ph-circle text-[8px] text-emerald-500" />
                                        Connected
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5">
                                        <i className="ph-fill ph-circle text-[8px] text-amber-500" />
                                        Starting up
                                    </span>
                                )}
                            </dd>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3">
                            <dt className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                Model
                            </dt>
                            <dd className="mt-1 truncate font-mono text-[11px] font-bold text-[var(--text-heading)]">
                                {policy.exposeModel && policy.model ? policy.model : 'Managed by your organization'}
                            </dd>
                        </div>
                        {policy.requestsPerMinute !== null && (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3">
                                <dt className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                    Rate limit
                                </dt>
                                <dd className="mt-1 text-[11px] font-bold text-[var(--text-heading)]">
                                    {policy.requestsPerMinute} requests / minute
                                </dd>
                            </div>
                        )}
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3">
                            <dt className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                Skills
                            </dt>
                            <dd className="mt-1 text-[11px] font-bold text-[var(--text-heading)]">
                                {policy.allowedSkillPacks.length} curated by your organization
                            </dd>
                        </div>
                    </dl>
                    <p className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
                        <i className="ph ph-shield-check mt-0.5 shrink-0 text-[14px] text-[var(--primary)]" />
                        Conversations stay in your browser. Questions about provider or model configuration should go to
                        your administrator.
                    </p>
                </div>
            </div>
        </section>
    );
}
