import {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import {generateAndDownloadZip, generateSingleSchemaFile} from '../../utils/schemaExport';
import ShareModal from '@/src/components/modals/ShareModal';
import {useEscClose} from '../../hooks/useEscClose';
import {Tip} from '@/src/components/common/Tooltip';
import {toCleanRouteHref} from '@/src/utils/routing';
import SearchHighlightedText from '@/src/components/layout/Sidebar/SearchHighlightedText';

interface SchemaExplorerProps {
    schemas:
        | {
              [key: string]: any;
          }
        | undefined;
    onSelectSchema: (schemaName: string) => void;
    parsableKey?: string;
}

export default function SchemaExplorer({schemas = {}, onSelectSchema, parsableKey = 'API'}: SchemaExplorerProps) {
    const humanizeName = (name: string) =>
        name
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .trim();
    const [searchTerm, setSearchTerm] = useState('');
    const [letterFilter, setLetterFilter] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setLoading(false), 350);
        return () => clearTimeout(t);
    }, []);
    const availableKeys = useMemo(() => {
        const set = new Set<string>();
        Object.keys(schemas || {}).forEach(name => {
            const first = (name[0] || '').toUpperCase();
            if (/[0-9]/.test(first)) set.add('#');
            else if (/[A-Z]/.test(first)) set.add(first);
            else set.add('&');
        });
        return set;
    }, [schemas]);
    const hasSchemas = !!schemas && Object.keys(schemas).length > 0;
    const [shareModal, setShareModal] = useState<{
        url: string;
        title: string;
        description?: string;
    } | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    useEscClose(!!shareModal, () => setShareModal(null), !!shareModal);
    const getSchemaShareUrl = (schemaName: string) => {
        if (typeof window === 'undefined') return '';
        const encodedKey = encodeURIComponent(parsableKey);
        const encodedSchema = encodeURIComponent(schemaName);
        return new URL(
            toCleanRouteHref(`#/parsable/${encodedKey}/schema-explorer?schemas=${encodedSchema}`),
            window.location.origin,
        ).href;
    };
    const handleShareSchema = (schemaName: string, schema: any) => {
        const url = getSchemaShareUrl(schemaName);
        setShareModal({
            url,
            title: `${schemaName} - Schema`,
            description: schema?.description?.slice(0, 160) || `Check out ${schemaName} schema in ${parsableKey}`,
        });
    };
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
        if (schema === undefined || schema === null) {
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
        const matchesText = matchesName || matchesDesc;
        if (!matchesText) return false;
        if (letterFilter) {
            const first = (name[0] || '').toUpperCase();
            if (letterFilter === '#') return /[0-9]/.test(first);
            if (letterFilter === '&') return !/[A-Z0-9]/.test(first);
            return first === letterFilter;
        }
        return true;
    });
    return (
        <div className="flex-1 h-full flex flex-col p-4 md:p-8 w-full space-y-3 animate-in fade-in duration-200 select-text font-sans overflow-hidden min-w-0">
            <div className="flex flex-col min-[1320px]:flex-row min-[1320px]:items-center justify-between gap-4 border-b pb-6 shrink-0 border-[var(--border)]">
                <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-heading)]">
                        Schema Explorer
                    </h1>
                    <p className="text-xs mt-1 text-[var(--text-muted)]">
                        Review, inspect, and drill-down into raw schema models, data types, and inheritances.
                    </p>
                </div>

                <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 min-[1320px]:w-auto min-[1320px]:grid-cols-[auto_20rem]">
                    <Tip content="Export all schemas as a zip of TypeScript models" wrapperClassName="shrink-0">
                        <button
                            onClick={() => generateAndDownloadZip(schemas as any, parsableKey)}
                            className="h-8 px-3 sm:px-4 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer select-none shrink-0 bg-[var(--method-get)] text-[var(--method-get-contrast)] border-[var(--method-get)] hover:opacity-90"
                        >
                            <i className="ph ph-download-simple text-[14px]"></i>
                            <span className="hidden sm:inline">Export TS (ZIP)</span>
                            <span className="sm:hidden">TS ZIP</span>
                        </button>
                    </Tip>

                    <div className="relative min-w-0 w-full min-[1320px]:w-80">
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search schemas (Ctrl+K)..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-14 h-8 text-xs rounded-lg border outline-none focus:border-[var(--primary)] transition-all font-sans bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
                        />

                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                            <i className="ph ph-magnifying-glass text-xs"></i>
                        </div>
                        {searchTerm ? (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs hover:opacity-80 cursor-pointer text-[var(--text-muted)]"
                            >
                                <i className="ph ph-x"></i>
                            </button>
                        ) : (
                            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none select-none">
                                <kbd className="px-1.5 py-0.5 text-[9px] font-sans font-extrabold rounded border select-none transition-colors bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]">
                                    Ctrl+K
                                </kbd>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="hidden md:flex items-center gap-0.5 flex-wrap shrink-0 select-none">
                <button
                    type="button"
                    onClick={() => setLetterFilter(null)}
                    className={clsx(
                        'px-2 h-6 rounded-md text-[10px] font-bold transition-all cursor-pointer',
                        letterFilter === null
                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]',
                    )}
                >
                    All
                </button>
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(ch => {
                    const available = availableKeys.has(ch);
                    return (
                        <button
                            key={ch}
                            type="button"
                            disabled={!available}
                            onClick={() => setLetterFilter(letterFilter === ch ? null : ch)}
                            className={clsx(
                                'px-1.5 h-6 min-w-[18px] rounded-md text-[10px] font-bold transition-all cursor-pointer',
                                letterFilter === ch
                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                    : available
                                      ? 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]'
                                      : 'text-[var(--text-muted)]/30 cursor-not-allowed',
                            )}
                        >
                            {ch}
                        </button>
                    );
                })}
                <button
                    type="button"
                    disabled={!availableKeys.has('#')}
                    onClick={() => setLetterFilter(letterFilter === '#' ? null : '#')}
                    className={clsx(
                        'px-1.5 h-6 min-w-[18px] rounded-md text-[10px] font-bold transition-all cursor-pointer',
                        letterFilter === '#'
                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                            : availableKeys.has('#')
                              ? 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]'
                              : 'text-[var(--text-muted)]/30 cursor-not-allowed',
                    )}
                >
                    #
                </button>
                <button
                    type="button"
                    disabled={!availableKeys.has('&')}
                    onClick={() => setLetterFilter(letterFilter === '&' ? null : '&')}
                    className={clsx(
                        'px-1.5 h-6 min-w-[18px] rounded-md text-[10px] font-bold transition-all cursor-pointer',
                        letterFilter === '&'
                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                            : availableKeys.has('&')
                              ? 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]'
                              : 'text-[var(--text-muted)]/30 cursor-not-allowed',
                    )}
                >
                    &amp;
                </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-row">
                <div className="md:hidden min-h-0 shrink-0 self-stretch flex flex-col justify-start overflow-hidden py-1">
                    <div className="mobile-letter-index flex h-full min-h-0 flex-col items-center gap-0.5 select-none overflow-y-scroll scrollbar-none pr-0.5">
                        <button
                            type="button"
                            onClick={() => setLetterFilter(null)}
                            className={clsx(
                                'h-5 w-6 shrink-0 rounded-md text-[9px] font-bold transition-all cursor-pointer flex items-center justify-center',
                                letterFilter === null
                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                    : 'text-[var(--text-muted)]',
                            )}
                        >
                            All
                        </button>
                        {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(ch => {
                            const available = availableKeys.has(ch);
                            return (
                                <button
                                    key={ch}
                                    type="button"
                                    disabled={!available}
                                    onClick={() => setLetterFilter(letterFilter === ch ? null : ch)}
                                    className={clsx(
                                        'h-5 w-6 shrink-0 rounded-md text-[9px] font-bold transition-all cursor-pointer flex items-center justify-center',
                                        letterFilter === ch
                                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                            : available
                                              ? 'text-[var(--text-muted)]'
                                              : 'text-[var(--text-muted)]/30 cursor-not-allowed',
                                    )}
                                >
                                    {ch}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            disabled={!availableKeys.has('#')}
                            onClick={() => setLetterFilter(letterFilter === '#' ? null : '#')}
                            className={clsx(
                                'h-5 w-6 shrink-0 rounded-md text-[9px] font-bold transition-all cursor-pointer flex items-center justify-center',
                                letterFilter === '#'
                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                    : availableKeys.has('#')
                                      ? 'text-[var(--text-muted)]'
                                      : 'text-[var(--text-muted)]/30 cursor-not-allowed',
                            )}
                        >
                            #
                        </button>
                        <button
                            type="button"
                            disabled={!availableKeys.has('&')}
                            onClick={() => setLetterFilter(letterFilter === '&' ? null : '&')}
                            className={clsx(
                                'h-5 w-6 shrink-0 rounded-md text-[9px] font-bold transition-all cursor-pointer flex items-center justify-center',
                                letterFilter === '&'
                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                    : availableKeys.has('&')
                                      ? 'text-[var(--text-muted)]'
                                      : 'text-[var(--text-muted)]/30 cursor-not-allowed',
                            )}
                        >
                            &amp;
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 pb-4">
                    {!hasSchemas ? (
                        <div className="text-center py-20 animate-in fade-in duration-200 border-[var(--border)]">
                            <span className="w-12 h-12 rounded-full flex items-center justify-center text-lg mx-auto mb-3 bg-[var(--background)] text-[var(--text-muted)]">
                                <i className="ph ph-diamonds-four text-[48px]"></i>
                            </span>
                            <p className="text-sm font-semibold text-[var(--text-heading)]">No schemas found</p>
                            <p className="text-xs mt-1 text-[var(--text-muted)]">
                                This specification does not define any schemas.
                            </p>
                        </div>
                    ) : loading ? (
                        <div className="text-center py-20 animate-in fade-in duration-200 border-[var(--border)]">
                            <span className="w-12 h-12 rounded-full flex items-center justify-center text-lg mx-auto mb-3 bg-[var(--background)] text-[var(--text-muted)]">
                                <i className="ph ph-spinner animate-spin text-[22px]"></i>
                            </span>
                            <p className="text-sm font-semibold text-[var(--text-heading)]">Loading schemas</p>
                            <p className="text-xs mt-1 text-[var(--text-muted)]">Preparing the schema models…</p>
                        </div>
                    ) : filteredSchemas.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {filteredSchemas.map(([name, schema]) => {
                                const propsCount = getPropertiesCount(schema);
                                const isObject = schema.type === 'object' || !!schema.properties || !!schema.allOf;
                                const textHighlight = searchTerm.trim() || (letterFilter ? name.slice(0, 1) : '');
                                const highlightStartOnly = !searchTerm.trim() && !!letterFilter;
                                return (
                                    <div
                                        key={name}
                                        onClick={() => onSelectSchema(name)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onSelectSchema(name);
                                            }
                                        }}
                                        className="p-3 rounded-xl border flex flex-col cursor-pointer justify-between transition-all group overflow-hidden bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
                                                <Tip content={name} wrapperClassName="min-w-0 flex-1">
                                                    <div className="min-w-0">
                                                        <h3 className="font-medium text-xs tracking-tight transition-colors line-clamp-2 text-[var(--text-heading)] whitespace-normal break-words">
                                                            <SearchHighlightedText
                                                                text={humanizeName(name)}
                                                                query={textHighlight}
                                                                startOnly={highlightStartOnly}
                                                            />
                                                        </h3>
                                                        <p className="mt-0.5 truncate text-[10px] font-mono text-[var(--text-muted)]">
                                                            <SearchHighlightedText
                                                                text={name}
                                                                query={textHighlight}
                                                                startOnly={highlightStartOnly}
                                                            />
                                                        </p>
                                                    </div>
                                                </Tip>
                                                <span className="px-1 py-0.5 rounded text-[9px] uppercase select-none shrink-0 bg-[var(--background)] text-[var(--text-muted)]">
                                                    {schema === true
                                                        ? 'any'
                                                        : schema === false
                                                          ? 'never'
                                                          : schema.type || (isObject ? 'object' : 'any')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between border-t pt-4 border-[var(--border)]">
                                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                                {propsCount > 0 ? `${propsCount} Properties` : 'No Properties'}
                                            </span>

                                            <div className="flex items-center gap-1.5">
                                                <Tip content="Share this schema">
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            handleShareSchema(name, schema);
                                                        }}
                                                        className="w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5"
                                                    >
                                                        <i className="ph ph-share-network text-[11px]"></i>
                                                    </button>
                                                </Tip>
                                                <Tip content="Export this schema as TypeScript">
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            if (schemas)
                                                                generateSingleSchemaFile(
                                                                    name,
                                                                    schema,
                                                                    schemas as any,
                                                                    parsableKey,
                                                                );
                                                        }}
                                                        className="text-[10px] font-bold px-2 h-7 rounded-lg border flex items-center gap-1 transition-all cursor-pointer bg-[var(--background)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30"
                                                    >
                                                        <i className="ph ph-download-simple text-[10px]"></i>
                                                        TS
                                                    </button>
                                                </Tip>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-20 animate-in fade-in duration-200 border-[var(--border)]">
                            <span className="w-12 h-12 rounded-full flex items-center justify-center text-lg mx-auto mb-3 bg-[var(--background)] text-[var(--text-muted)]">
                                <i className="ph ph-diamonds-four text-[48px]"></i>
                            </span>
                            <p className="text-sm font-semibold text-[var(--text-heading)]">No schemas found</p>
                            <p className="text-xs mt-1 text-[var(--text-muted)]">
                                No components match "{searchTerm}". Try another search.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {shareModal && (
                <ShareModal
                    isOpen={!!shareModal}
                    onClose={() => setShareModal(null)}
                    url={shareModal.url}
                    title={shareModal.title}
                    description={shareModal.description}
                />
            )}
        </div>
    );
}
