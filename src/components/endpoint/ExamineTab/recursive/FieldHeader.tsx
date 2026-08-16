import type {ReactNode} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '@/src/types';
import {getRefName} from '@/src/utils/openapi';
import Markdown from '../../../common/Markdown';
import DescriptionTip, {type FieldDescriptionDocument} from './DescriptionTip';
import {
    containsMarkdown,
    DESCRIPTION_TOOLTIP_THRESHOLD,
    usesDescriptionTooltip,
} from '@/src/utils/runner/recursiveBody';

const mutedLineClass = 'text-[var(--text-muted)]';
export default function FieldHeader({
    label,
    required,
    description,
    typeLabel,
    actions,
    schema,
    resolvedSchema,
    spec,
    onOpenSchema,
}: {
    label: string;
    required?: boolean;
    description?: string;
    typeLabel?: string;
    actions?: ReactNode;
    schema?: any;
    resolvedSchema?: any;
    spec?: OpenApiSpec;
    onOpenSchema?: (schemaName: string) => void;
}) {
    const directDescription = String(description || schema?.description || '').trim();
    const schemaName =
        typeof schema?.$ref === 'string' && schema.$ref.startsWith('#/components/schemas/')
            ? getRefName(schema.$ref)
            : null;
    const referencedSchema = schemaName ? spec?.components?.schemas?.[schemaName] : null;
    const inheritedDescription = String(referencedSchema?.description || resolvedSchema?.description || '').trim();
    const canInspectSchema = !!schemaName && !!referencedSchema;
    const externalDocs = schema?.externalDocs?.url
        ? schema.externalDocs
        : referencedSchema?.externalDocs || resolvedSchema?.externalDocs;
    const documents: FieldDescriptionDocument[] = [];
    if (directDescription)
        documents.push({
            label: inheritedDescription && inheritedDescription !== directDescription ? 'Field description' : undefined,
            text: directDescription,
        });
    if (inheritedDescription && inheritedDescription !== directDescription)
        documents.push({label: schemaName ? `${schemaName} schema` : 'Schema description', text: inheritedDescription});
    const primaryDescription = directDescription || inheritedDescription;
    const markdownDescription = containsMarkdown(primaryDescription);
    const longDescription = !markdownDescription && primaryDescription.length > DESCRIPTION_TOOLTIP_THRESHOLD;
    /* long descriptions render only through the info tooltip — no inline
       preview text — so ≤ threshold shows the full text, above it nothing */
    const preview = markdownDescription || longDescription ? '' : primaryDescription;
    const showDescriptionTip =
        documents.some(document => usesDescriptionTooltip(document.text)) || canInspectSchema || !!externalDocs?.url;
    return (
        <>
            <div className="flex min-h-7 min-w-0 items-center gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-[var(--text-heading)]">
                        {label}
                        {required && <b className="ms-1 text-[var(--method-delete)]">*</b>}
                    </span>
                    {showDescriptionTip && (
                        <DescriptionTip
                            fieldLabel={label}
                            documents={documents}
                            schemaName={canInspectSchema ? schemaName : null}
                            externalDocs={externalDocs}
                            onOpenSchema={onOpenSchema}
                        />
                    )}
                    {typeLabel && (
                        <span className={clsx('shrink-0 font-mono text-[9px]', mutedLineClass)}>{typeLabel}</span>
                    )}
                </div>
                {actions && (
                    <>
                        <span
                            aria-hidden="true"
                            className="min-w-4 flex-1 border-t border-dashed border-[var(--text-muted)]/25"
                        />
                        <div className="flex shrink-0 items-center gap-1">{actions}</div>
                    </>
                )}
            </div>
            {preview && (
                <Markdown
                    text={preview}
                    className="mt-0.5 max-w-3xl text-[10px] leading-relaxed text-[var(--text-muted)]"
                />
            )}
        </>
    );
}
