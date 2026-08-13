import {useMemo, useState} from 'react';
import type {OpenApiSpec, ParsableConfig} from '../../types';
import CustomDropdown from '../../components/common/CustomDropdown';

interface ApiCatalogPageProps {
    parsables: ParsableConfig;
    selectedKey: string;
    activeSpec: OpenApiSpec;
    onSelect: (key: string) => void;
}

type CatalogItem = {
    key: string;
    title: string;
    description: string;
    version: string;
    group: string;
    categories: string[];
    tags: string[];
    operationCount?: number;
    schemaCount?: number;
    icon?: string;
};

const rawMetadata = (
    raw: string | undefined,
): Partial<Pick<CatalogItem, 'title' | 'description' | 'version' | 'operationCount' | 'schemaCount'>> => {
    if (!raw?.trim().startsWith('{')) return {};
    try {
        const value = JSON.parse(raw);
        const operations = (Object.values(value.paths || {}) as any[]).reduce<number>(
            (total, pathItem) =>
                total +
                Object.keys(pathItem || {}).filter(method =>
                    ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'].includes(
                        method.toLowerCase(),
                    ),
                ).length,
            0,
        );
        return {
            title: value.info?.title,
            description: value.info?.description,
            version: value.info?.version,
            operationCount: operations,
            schemaCount: Object.keys(value.components?.schemas || value.definitions || {}).length,
        };
    } catch {
        return {};
    }
};

export default function ApiCatalogPage({parsables, selectedKey, activeSpec, onSelect}: ApiCatalogPageProps) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
    const items = useMemo<CatalogItem[]>(() => {
        const configured = Object.entries(parsables).filter(([, source]) => !source.hiddenFromCatalog);
        if (selectedKey && !parsables[selectedKey]) {
            configured.push([
                selectedKey,
                {
                    title: activeSpec.info?.title || selectedKey,
                    description: activeSpec.info?.description || '',
                    version: activeSpec.info?.version || '',
                    group: activeSpec.info?.title || selectedKey,
                    categories: ['Local'],
                    tags: [],
                    theme: 'Default Slate',
                    url: '',
                },
            ]);
        }
        return configured.map(([key, source]) => {
            const metadata = rawMetadata(source.rawSpec);
            const isActive = key === selectedKey;
            return {
                key,
                title: (isActive ? activeSpec.info?.title : metadata.title) || source.title || key,
                description:
                    (isActive ? activeSpec.info?.description : metadata.description) || source.description || '',
                version: (isActive ? activeSpec.info?.version : metadata.version) || source.version || '',
                group: source.group || source.title || key,
                categories: source.categories || [],
                tags: source.tags || [],
                operationCount: isActive
                    ? Object.values(activeSpec.paths || {}).reduce(
                          (total, pathItem: any) =>
                              total +
                              Object.keys(pathItem || {}).filter(method =>
                                  [
                                      'get',
                                      'put',
                                      'post',
                                      'delete',
                                      'options',
                                      'head',
                                      'patch',
                                      'trace',
                                      'query',
                                  ].includes(method.toLowerCase()),
                              ).length,
                          0,
                      )
                    : metadata.operationCount,
                schemaCount: isActive ? Object.keys(activeSpec.components?.schemas || {}).length : metadata.schemaCount,
                icon: source.icon,
            };
        });
    }, [parsables, selectedKey, activeSpec]);
    const groups = useMemo(() => {
        const map = new Map<string, CatalogItem[]>();
        items.forEach(item => map.set(item.group, [...(map.get(item.group) || []), item]));
        return Array.from(map.entries()).map(([name, versions]) => ({name, versions}));
    }, [items]);
    const categories = Array.from(new Set(items.flatMap(item => item.categories))).sort();
    const visible = groups.filter(group => {
        const selectedKeyForGroup = selectedVersions[group.name];
        const item = group.versions.find(version => version.key === selectedKeyForGroup) || group.versions[0];
        const needle = query.trim().toLowerCase();
        return (
            (category === 'all' || item.categories.includes(category)) &&
            (!needle ||
                [item.title, item.description, item.version, ...item.categories, ...item.tags]
                    .join(' ')
                    .toLowerCase()
                    .includes(needle))
        );
    });
    return (
        <div className="flex-1 h-full overflow-y-auto p-4 sm:p-6 md:p-8 scrollbar-thin">
            <div className="space-y-5">
                <header>
                    <h1 className="text-2xl font-extrabold text-[var(--text-heading)]">API Catalog</h1>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Browse {groups.length} API {groups.length === 1 ? 'product' : 'products'} and {items.length}{' '}
                        configured specification {items.length === 1 ? 'version' : 'versions'}.
                    </p>
                </header>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                        <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-xs text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search APIs, descriptions, categories, and tags…"
                            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-xs outline-none focus:border-[var(--primary)]"
                        />
                    </div>
                    <CustomDropdown
                        value={category}
                        onChange={setCategory}
                        ariaLabel="Filter API catalog category"
                        options={[
                            {value: 'all', label: 'All categories'},
                            ...categories.map(value => ({value, label: value})),
                        ]}
                        className="w-full sm:w-56"
                    />
                </div>
                {visible.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map(group => {
                            const selected =
                                group.versions.find(item => item.key === selectedVersions[group.name]) ||
                                group.versions[0];
                            const labels = Array.from(new Set([...selected.categories, ...selected.tags]));
                            return (
                                <article
                                    key={group.name}
                                    className="flex min-h-48 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-lg font-black text-[var(--primary)]">
                                            {selected.icon ? (
                                                <i className={selected.icon} />
                                            ) : (
                                                selected.title.trim().charAt(0).toUpperCase() || '?'
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="truncate text-sm font-extrabold text-[var(--text-heading)]">
                                                {selected.title}
                                            </h2>
                                            {group.versions.length > 1 ? (
                                                <CustomDropdown
                                                    value={selected.key}
                                                    onChange={key =>
                                                        setSelectedVersions(current => ({
                                                            ...current,
                                                            [group.name]: key,
                                                        }))
                                                    }
                                                    ariaLabel={`Select ${selected.title} version`}
                                                    options={group.versions.map(version => ({
                                                        value: version.key,
                                                        label: version.version || version.title,
                                                    }))}
                                                    className="mt-1 w-full"
                                                />
                                            ) : (
                                                selected.version && (
                                                    <span className="mt-1 inline-flex rounded-md bg-[var(--background)] px-2 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                                                        v{selected.version.replace(/^v/i, '')}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
                                        {selected.description || 'No API description is available.'}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {labels.slice(0, 5).map(label => (
                                            <span
                                                key={label}
                                                className="rounded-md bg-[var(--background)] px-2 py-1 text-[8px] font-semibold text-[var(--text-muted)]"
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-3 text-[9px] text-[var(--text-muted)]">
                                        <span>
                                            {selected.operationCount ?? '—'} operations · {selected.schemaCount ?? '—'}{' '}
                                            schemas
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onSelect(selected.key)}
                                            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[10px] font-bold text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer"
                                        >
                                            Open API
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-xs text-[var(--text-muted)]">
                        No APIs match these filters.
                    </div>
                )}
            </div>
        </div>
    );
}
