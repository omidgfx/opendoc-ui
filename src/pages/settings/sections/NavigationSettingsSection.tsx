import {useEndpointNotes} from '@/src/contexts/EndpointNotesContext';
import {useSidebarConfig} from '@/src/hooks/useSidebarConfig';
import type {SidebarFolderBehavior, SidebarSortBy, SidebarSortDirection} from '@/src/utils/sidebar/tree';
import CustomDropdown from '@/src/components/common/CustomDropdown';
import SettingsGroup from '../controls/SettingsGroup';
import SettingRow from '../controls/SettingRow';
import SettingToggle from '../controls/SettingToggle';
import SettingChoice from '../controls/SettingChoice';

export interface NavigationSettingsProps {
    specKey: string;
}

const FOLDER_BEHAVIOR_OPTIONS: {value: SidebarFolderBehavior; label: string; icon: string}[] = [
    {value: 'multiple', label: 'Multiple', icon: 'ph ph-folders'},
    {value: 'single', label: 'One at a time', icon: 'ph ph-folder-open'},
];
const SORT_BY_OPTIONS: {value: SidebarSortBy; label: string}[] = [
    {value: 'name', label: 'Name'},
    {value: 'method', label: 'Method'},
    {value: 'route', label: 'Route'},
];
const SORT_DIRECTION_OPTIONS: {value: SidebarSortDirection; label: string; icon: string}[] = [
    {value: 'asc', label: 'Ascending', icon: 'ph ph-sort-ascending'},
    {value: 'desc', label: 'Descending', icon: 'ph ph-sort-descending'},
];

/** The sidebar settings menu, mirrored here in full. Both write the same
 *  per-specification navigation configuration and update each other live. */
export default function NavigationSettingsSection({specKey}: NavigationSettingsProps) {
    const {config, updateConfig} = useSidebarConfig(specKey);
    const {hiddenEndpointKeys, unhideAllEndpoints} = useEndpointNotes();
    return (
        <div className="space-y-4">
            <SettingsGroup
                title="Endpoint list"
                description="What the API navigation tree shows for each entry."
                icon="ph-fill ph-tree-structure"
            >
                <SettingRow
                    label="Show endpoint routes"
                    description="Print the path under every endpoint summary."
                    icon="ph ph-path"
                    control={
                        <SettingToggle
                            checked={config.displayRoutes}
                            onChange={value => updateConfig({displayRoutes: value})}
                            ariaLabel="Show endpoint routes"
                        />
                    }
                />
                <SettingRow
                    label="Compact method names"
                    description="Abbreviate method badges, for example DELETE as DEL."
                    icon="ph ph-text-aa"
                    control={
                        <SettingToggle
                            checked={config.compactMethodNames}
                            onChange={value => updateConfig({compactMethodNames: value})}
                            ariaLabel="Compact method names"
                        />
                    }
                />
                <SettingRow
                    label="Hide endpoint counts"
                    description="Drop the number badge next to tag folders."
                    icon="ph ph-hash"
                    control={
                        <SettingToggle
                            checked={config.hideEndpointCount}
                            onChange={value => updateConfig({hideEndpointCount: value})}
                            ariaLabel="Hide endpoint counts"
                        />
                    }
                />
                <SettingRow
                    label="Hide protected icon"
                    description="Stop marking operations that declare a security requirement."
                    icon="ph ph-lock-key"
                    control={
                        <SettingToggle
                            checked={config.hideProtectedIcon}
                            onChange={value => updateConfig({hideProtectedIcon: value})}
                            ariaLabel="Hide protected icon"
                        />
                    }
                />
                <SettingRow
                    label="Hide deprecated endpoints"
                    description="Keep deprecated operations out of the navigation tree."
                    icon="ph ph-warning-circle"
                    control={
                        <SettingToggle
                            checked={config.hideDeprecatedEndpoints}
                            onChange={value => updateConfig({hideDeprecatedEndpoints: value})}
                            ariaLabel="Hide deprecated endpoints"
                        />
                    }
                />
            </SettingsGroup>

            <SettingsGroup
                title="Grouping and order"
                description="How tags, pages and endpoints are arranged."
                icon="ph-fill ph-folders"
            >
                <SettingRow
                    label="Flatten tag folders"
                    description="Render nested tag groups as a single level."
                    icon="ph ph-arrows-out-line-horizontal"
                    control={
                        <SettingToggle
                            checked={config.flattenTags}
                            onChange={value => updateConfig({flattenTags: value})}
                            ariaLabel="Flatten tag folders"
                        />
                    }
                />
                <SettingRow
                    label="Pages first"
                    description="List the specification pages above the tag folders."
                    icon="ph ph-stack"
                    control={
                        <SettingToggle
                            checked={config.pagesFirst}
                            onChange={value => updateConfig({pagesFirst: value})}
                            ariaLabel="Pages first"
                        />
                    }
                />
                <SettingRow
                    label="Tag folder behavior"
                    description="Allow several tag folders open, or only the current one."
                    icon="ph ph-folder-open"
                    control={
                        <SettingChoice
                            value={config.folderBehavior}
                            options={FOLDER_BEHAVIOR_OPTIONS}
                            onChange={value => updateConfig({folderBehavior: value})}
                            ariaLabel="Tag folder behavior"
                        />
                    }
                />
                <SettingRow
                    label="Sort by"
                    description={
                        config.displayRoutes
                            ? 'Ordering applied inside every tag folder.'
                            : 'Ordering applied inside every tag folder. Route is unavailable while endpoint routes are hidden.'
                    }
                    icon="ph ph-sort-ascending"
                    control={
                        <div className="flex items-center gap-2">
                            <CustomDropdown
                                value={config.sortBy}
                                onChange={value => updateConfig({sortBy: value as SidebarSortBy})}
                                options={SORT_BY_OPTIONS.map(option => ({
                                    ...option,
                                    disabled: option.value === 'route' && !config.displayRoutes,
                                }))}
                                className="min-w-[130px]"
                                ariaLabel="Sort API navigation"
                            />
                            <SettingChoice
                                value={config.sortDirection}
                                options={SORT_DIRECTION_OPTIONS.map(option => ({
                                    value: option.value,
                                    label: '',
                                    icon: option.icon,
                                }))}
                                onChange={value => updateConfig({sortDirection: value})}
                                ariaLabel="Sort direction"
                            />
                        </div>
                    }
                />
            </SettingsGroup>

            <SettingsGroup
                title="Hidden endpoints"
                description="Endpoints moved out of the navigation without touching the specification."
                icon="ph-fill ph-eye-slash"
            >
                <SettingRow
                    label="Hidden endpoints"
                    description={
                        hiddenEndpointKeys.length
                            ? `${hiddenEndpointKeys.length} endpoint${hiddenEndpointKeys.length === 1 ? '' : 's'} are currently hidden.`
                            : 'Nothing is hidden right now.'
                    }
                    icon="ph ph-eye-closed"
                    control={
                        <button
                            type="button"
                            disabled={hiddenEndpointKeys.length === 0}
                            onClick={unhideAllEndpoints}
                            className="rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer"
                        >
                            Unhide all endpoints
                        </button>
                    }
                />
            </SettingsGroup>
        </div>
    );
}
