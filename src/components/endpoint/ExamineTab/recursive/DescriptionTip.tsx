import Markdown from '../../../common/Markdown';
import {Tip} from '../../../common/Tooltip';

export interface FieldDescriptionDocument {
    label?: string;
    text: string;
}

interface DescriptionTipProps {
    documents: FieldDescriptionDocument[];
    schemaName?: string | null;
    externalDocs?: {
        description?: string;
        url?: string;
    } | null;
    onOpenSchema?: (schemaName: string) => void;
    fieldLabel: string;
}

export default function DescriptionTip({
    documents,
    schemaName,
    externalDocs,
    onOpenSchema,
    fieldLabel,
}: DescriptionTipProps) {
    const usableDocuments = documents.filter(document => document.text.trim());
    const hasSchemaAction = !!schemaName && !!onOpenSchema;
    const hasExternalDocs = !!externalDocs?.url;
    if (usableDocuments.length === 0 && !hasSchemaAction && !hasExternalDocs) return null;
    return (
        <Tip
            interactive
            variant="surface"
            closable
            placement="right"
            content={
                <div className="w-[min(390px,calc(100vw-64px))] max-w-full select-text space-y-3 text-[var(--text)]">
                    {usableDocuments.map((document, index) => (
                        <div
                            key={`${document.label || 'description'}:${index}`}
                            className={index > 0 ? 'border-t border-[var(--border)] pt-2.5' : ''}
                        >
                            {document.label && (
                                <div className="mb-1 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    {document.label}
                                </div>
                            )}
                            <Markdown text={document.text} className="text-[11px] leading-relaxed" />
                        </div>
                    ))}
                    {(hasSchemaAction || hasExternalDocs) && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2.5">
                            {hasSchemaAction && (
                                <button
                                    type="button"
                                    onClick={() => onOpenSchema?.(schemaName!)}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[var(--primary)]/10 px-2.5 text-[9px] font-extrabold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/15 cursor-pointer"
                                >
                                    <i className="ph ph-diamonds-four text-[12px]" />
                                    Inspect {schemaName}
                                </button>
                            )}
                            {hasExternalDocs && (
                                <a
                                    href={externalDocs!.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[var(--surface-hover)] px-2.5 text-[9px] font-extrabold text-[var(--text-heading)] transition-colors hover:text-[var(--primary)]"
                                >
                                    <i className="ph ph-arrow-square-out text-[12px]" />
                                    {externalDocs?.description || 'External documentation'}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            }
        >
            <button
                type="button"
                aria-label={`Show ${fieldLabel} description`}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/8 text-[var(--primary)]/75 transition-colors hover:bg-[var(--primary)]/13 hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/30 cursor-help"
            >
                <i className="ph ph-info text-[13px]" />
            </button>
        </Tip>
    );
}
