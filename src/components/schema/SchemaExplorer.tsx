import {useEffect, useRef, useState} from 'react';
import { generateAndDownloadZip, generateSingleSchemaFile } from '../../utils/schemaExport';
import ShareModal from '../modals/ShareModal';
import { useEscClose } from '../../hooks/useEscClose';
import { Tip } from '../common/Tooltip';

interface SchemaExplorerProps {
    schemas: { [key: string]: any; } | undefined;
    onSelectSchema: (schemaName: string) => void;
    parsableKey?: string;
}

export default function SchemaExplorer({schemas = {}, onSelectSchema, parsableKey = 'API'}: SchemaExplorerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [shareModal, setShareModal] = useState<{ url: string; title: string; description?: string } | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEscClose(!!shareModal, () => setShareModal(null), !!shareModal);

    const getSchemaShareUrl = (schemaName: string) => {
        if (typeof window === 'undefined') return '';
        const encodedKey = encodeURIComponent(parsableKey);
        const encodedSchema = encodeURIComponent(schemaName);
        return `${window.location.origin}${window.location.pathname}#/parsable/${encodedKey}/schema-explorer?schemas=${encodedSchema}`;
    };

    const handleShareSchema = (schemaName: string, schema: any) => {
        const url = getSchemaShareUrl(schemaName);
        setShareModal({
            url,
            title: `${schemaName} - Schema`,
            description: schema?.description?.slice(0, 160) || `Check out ${schemaName} schema in ${parsableKey}`
        });
    };


    // Focus search input on Ctrl+K inside SchemaExplorer
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                const activeElem = document.activeElement;
                if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
                    return;
                }
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getPropertiesCount = (schema: any): number => {
        if (!schema) {
            return 0;
        }

        let count = 0;
        if (schema.properties) {
            count += Object.keys(schema.properties).length;
        }

        if (schema.allOf) {
            schema.allOf.forEach((sub: any) => {
                if (sub.properties) {
                    count += Object.keys(sub.properties).length;
                }
            });
        }

        return count;
    };

    const filteredSchemas = Object.entries(schemas).filter(([name, schema]) => {
        const term = searchTerm.toLowerCase();
        const matchesName = name.toLowerCase().includes(term);
        const matchesDesc = schema.description?.toLowerCase().includes(term) || false;
        return matchesName || matchesDesc;
    });

    return (
        <div
            className="flex-1 h-full flex flex-col p-4 md:p-8 w-full space-y-3 animate-in fade-in duration-200 select-text font-sans overflow-hidden min-w-0">
            {/* Search and Header - Sticky / Static at the top */}
            <div
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 shrink-0 border-[var(--border)]">

                <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-heading)]">
                        Schema Explorer
                    </h1>
                    <p className="text-xs mt-1 text-[var(--text-muted)]">
                        Review, inspect, and drill-down into raw schema models, data types, and inheritances.
                    </p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Tip content="Export all schemas as a zip of TypeScript models">
                        <button
                            onClick={() => generateAndDownloadZip(schemas as any, parsableKey)}
                            className="h-8 px-3 sm:px-4 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer select-none shrink-0 bg-[var(--method-get)] text-[var(--method-get-contrast)] border-[var(--method-get)] hover:opacity-90">
                            <i className="ph ph-download-simple text-[14px]"></i>
                            <span className="hidden sm:inline">Export TS (ZIP)</span><span className="sm:hidden">TS ZIP</span>
                        </button>
                    </Tip>

                    {/* Search */}
                    <div className="relative w-full md:w-80">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search schemas (Ctrl+K)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-14 h-8 text-xs rounded-lg border outline-none focus:border-[var(--primary)] transition-all font-sans bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"/>


                    <div
                        className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">

                        <i className="ph ph-magnifying-glass text-xs"></i>
                    </div>
                    {searchTerm ?
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs hover:opacity-80 cursor-pointer text-[var(--text-muted)]">


                            <i className="ph ph-x"></i>
                        </button> :

                        <div
                            className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none select-none">
                            <kbd
                                className="px-1.5 py-0.5 text-[9px] font-sans font-extrabold rounded border select-none transition-colors bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]">


                                Ctrl+K
                            </kbd>
                        </div>
                    }
                    </div>
                </div>
            </div>

            {/* Grid of Schemas - Scrollable container (content-only scrolling) */}
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 pb-4">
                {filteredSchemas.length > 0 ?
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredSchemas.map(([name, schema]) => {
                            const propsCount = getPropertiesCount(schema);
                            const isObject = schema.type === 'object' || !!schema.properties || !!schema.allOf;

                            return (
                                <div
                                    key={name}
                                    className="p-5 rounded-2xl border flex flex-col cursor-default justify-between transition-all group overflow-hidden bg-[var(--surface)] border-[var(--border)]">


                                    <div className="min-w-0">
                                        <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
                                            <h3 className="font-bold text-sm tracking-tight transition-colors truncate flex-1 text-[var(--text-heading)]"
                                                title={name}>
                                                {name}
                                            </h3>
                                            <span
                                                className="px-2 py-0.5 rounded text-[10px] uppercase font-bold select-none shrink-0 bg-[var(--background)] text-[var(--primary)]">

                                                {schema.type || (isObject ? 'object' : 'any')}
                                            </span>
                                        </div>

                                        {schema.description ?
                                            <p className="text-xs leading-relaxed mb-4 opacity-80 line-clamp-3 text-[var(--text-muted)]">

                                                {schema.description.length > 120 ?
                                                    schema.description.substring(0, 120) + '...' :
                                                    schema.description}
                                            </p> :

                                            <p className="text-xs italic leading-relaxed mb-4 opacity-50 text-[var(--text-muted)]">

                                                No description provided.
                                            </p>
                                        }
                                    </div>

                                    <div
                                        className="flex items-center justify-between border-t pt-4 border-[var(--border)]">

                                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                            {propsCount > 0 ? `${propsCount} Properties` : 'No Properties'}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                            <Tip content="Share this schema">
                                                <button
                                                    onClick={() => handleShareSchema(name, schema)}
                                                    className="w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5">
                                                    <i className="ph ph-share-network text-[11px]"></i>
                                                </button>
                                            </Tip>
                                            <Tip content="Export this schema as TypeScript">
                                                <button
                                                    onClick={() => {
                                                        if (schemas) generateSingleSchemaFile(name, schema, schemas as any, parsableKey);
                                                    }}
                                                    className="text-[10px] font-bold px-2 h-7 rounded-lg border flex items-center gap-1 transition-all cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30">
                                                    <i className="ph ph-download-simple text-[10px]"></i>
                                                    TS
                                                </button>
                                            </Tip>
                                            <Tip content="Inspect schema details">
                                                <button
                                                    onClick={() => onSelectSchema(name)}
                                                    className="h-7 px-2 rounded-lg border flex items-center gap-1 text-[10px] font-bold transition-all cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30">
                                                    <span>View</span>
                                                    <i className="ph ph-arrow-right text-[10px]"></i>
                                                </button>
                                            </Tip>
                                        </div>
                                    </div>
                                </div>);

                        })}
                    </div> :

                    <div className="text-center py-20 animate-in fade-in duration-200 border-[var(--border)]">

                        <span
                            className="w-12 h-12 rounded-full flex items-center justify-center text-lg mx-auto mb-3 bg-[var(--background)] text-[var(--text-muted)]">

                            <i className="ph ph-diamonds-four text-[48px]"></i>
                        </span>
                        <p className="text-sm font-semibold text-[var(--text-heading)]">No schemas found</p>
                        <p className="text-xs mt-1 text-[var(--text-muted)]">No components match
                            "{searchTerm}". Try another search.</p>
                    </div>
                }
            </div>
            {shareModal &&
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            }
        </div>);

}
