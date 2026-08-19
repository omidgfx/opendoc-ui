import {usePreferences} from '@/src/contexts/PreferencesContext';
import type {
    EndpointRepresentationScope,
    ModalRepresentationScope,
    NarrowTableLayout,
    ParameterTableLayout,
} from '@/src/utils/storage/preferences';
import SettingsGroup from '../controls/SettingsGroup';
import SettingRow from '../controls/SettingRow';
import SettingChoice from '../controls/SettingChoice';

const ENDPOINT_SCOPE_OPTIONS: {value: EndpointRepresentationScope; label: string; icon: string}[] = [
    {value: 'endpoint', label: 'Per endpoint', icon: 'ph ph-plugs-connected'},
    {value: 'global', label: 'Globally', icon: 'ph ph-globe-simple'},
];
const PARAMETER_TABLE_OPTIONS: {value: ParameterTableLayout; label: string; icon: string}[] = [
    {value: 'separated', label: 'Separated', icon: 'ph ph-rows'},
    {value: 'unified', label: 'Unified', icon: 'ph ph-table'},
];
const NARROW_TABLE_OPTIONS: {value: NarrowTableLayout; label: string; icon: string}[] = [
    {value: 'cards', label: 'Cards', icon: 'ph ph-cards'},
    {value: 'table', label: 'Table', icon: 'ph ph-table'},
];
const MODAL_SCOPE_OPTIONS: {value: ModalRepresentationScope; label: string; icon: string}[] = [
    {value: 'schema', label: 'Per schema', icon: 'ph ph-diamonds-four'},
    {value: 'global', label: 'Globally', icon: 'ph ph-globe-simple'},
];

/** General application defaults. The first one decides how far the
 *  schema/example switches carry the reader's choice. */
export default function GeneralSettingsSection() {
    const {preferences, setPreference} = usePreferences();
    return (
        <div className="space-y-4">
            <SettingsGroup
                title="Schema and example switches"
                description="Switching between schema and example is a reading habit, not endpoint state. Choose how far that choice travels."
                icon="ph-fill ph-swap"
            >
                <SettingRow
                    label="Documentation"
                    description="Per endpoint keeps a choice for each endpoint. Globally makes one choice apply to every endpoint, request body, response and parameter table."
                    icon="ph ph-book-open-text"
                    control={
                        <SettingChoice
                            value={preferences.endpointRepresentationScope}
                            options={ENDPOINT_SCOPE_OPTIONS}
                            onChange={value => setPreference('endpointRepresentationScope', value)}
                            ariaLabel="Where the documentation remembers the schema or example choice"
                        />
                    }
                />
                <SettingRow
                    label="Schema modal"
                    description="Per schema keeps a choice for each inspected schema. Globally makes one choice apply to every schema in the modal."
                    icon="ph ph-cards"
                    control={
                        <SettingChoice
                            value={preferences.modalRepresentationScope}
                            options={MODAL_SCOPE_OPTIONS}
                            onChange={value => setPreference('modalRepresentationScope', value)}
                            ariaLabel="Where the schema modal remembers the schema or example choice"
                        />
                    }
                />
            </SettingsGroup>

            <SettingsGroup
                title="Request matrix"
                description="How the documentation lays out the parameters of an endpoint."
                icon="ph-fill ph-table"
            >
                <SettingRow
                    label="Parameter tables"
                    description="Separated gives path, query, header and cookie parameters a table each, matching the Runner. Unified keeps one matrix with a location column. The request body always keeps its own section."
                    icon="ph ph-rows"
                    control={
                        <SettingChoice
                            value={preferences.parameterTableLayout}
                            options={PARAMETER_TABLE_OPTIONS}
                            onChange={value => setPreference('parameterTableLayout', value)}
                            ariaLabel="Parameter table layout"
                        />
                    }
                />
                <SettingRow
                    label="Narrow panes"
                    description="On a phone, or in a narrowed split pane, a parameter table can become one card per row instead of a table that scrolls sideways."
                    icon="ph ph-device-mobile"
                    control={
                        <SettingChoice
                            value={preferences.narrowTableLayout}
                            options={NARROW_TABLE_OPTIONS}
                            onChange={value => setPreference('narrowTableLayout', value)}
                            ariaLabel="Narrow pane table layout"
                        />
                    }
                />
            </SettingsGroup>
        </div>
    );
}
