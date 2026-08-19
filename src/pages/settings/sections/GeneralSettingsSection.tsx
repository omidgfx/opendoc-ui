import {usePreferences} from '@/src/contexts/PreferencesContext';
import type {EndpointRepresentationScope, ModalRepresentationScope} from '@/src/utils/storage/preferences';
import SettingsGroup from '../controls/SettingsGroup';
import SettingRow from '../controls/SettingRow';
import SettingChoice from '../controls/SettingChoice';

const ENDPOINT_SCOPE_OPTIONS: {value: EndpointRepresentationScope; label: string; icon: string}[] = [
    {value: 'endpoint', label: 'Per endpoint', icon: 'ph ph-plugs-connected'},
    {value: 'global', label: 'Globally', icon: 'ph ph-globe-simple'},
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
        </div>
    );
}
