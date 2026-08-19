import {usePreferences} from '@/src/contexts/PreferencesContext';
import type {RepresentationMode} from '@/src/utils/storage/preferences';
import SettingsGroup from '../controls/SettingsGroup';
import SettingRow from '../controls/SettingRow';
import SettingChoice from '../controls/SettingChoice';

const REPRESENTATION_OPTIONS: {value: RepresentationMode; label: string; icon: string}[] = [
    {value: 'example', label: 'Example', icon: 'ph-fill ph-brackets-curly'},
    {value: 'schema', label: 'Schema', icon: 'ph-fill ph-tree-structure'},
];

/** General application defaults, starting with the representation the
 *  schema/example switches open on. The choice never depended on the endpoint,
 *  so it is stored once for the documentation and once for the schema modal. */
export default function GeneralSettingsSection() {
    const {preferences, setPreference} = usePreferences();
    return (
        <div className="space-y-4">
            <SettingsGroup
                title="Representation"
                description="Schema and example are constant views of the same payload, so their switches remember one choice instead of resetting per endpoint."
                icon="ph-fill ph-swap"
            >
                <SettingRow
                    label="Endpoints"
                    description="Applied to every endpoint: request bodies, responses, parameters and query parameters."
                    icon="ph ph-plugs-connected"
                    control={
                        <SettingChoice
                            value={preferences.endpointRepresentation}
                            options={REPRESENTATION_OPTIONS}
                            onChange={value => setPreference('endpointRepresentation', value)}
                            ariaLabel="Representation used by every endpoint"
                        />
                    }
                />
                <SettingRow
                    label="Schema modal"
                    description="Kept apart from the endpoints, because inspecting a schema and reading an endpoint are different tasks."
                    icon="ph ph-cards"
                    control={
                        <SettingChoice
                            value={preferences.modalRepresentation}
                            options={REPRESENTATION_OPTIONS}
                            onChange={value => setPreference('modalRepresentation', value)}
                            ariaLabel="Representation used by the schema modal"
                        />
                    }
                />
            </SettingsGroup>
        </div>
    );
}
