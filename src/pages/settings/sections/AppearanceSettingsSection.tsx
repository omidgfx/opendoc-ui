import type {AppTheme, ThemeMode} from '@/src/types';
import {THEME_LIST} from '@/src/data/themes';
import ThemePreviewCard from '@/src/components/theme/ThemePreviewCard';
import ThemeIdentityPanel from '@/src/components/theme/ThemeIdentityPanel';
import SettingsGroup from '../controls/SettingsGroup';
import SettingRow from '../controls/SettingRow';
import SettingChoice from '../controls/SettingChoice';

export interface AppearanceSettingsProps {
    selectedThemeName: string;
    themeMode: ThemeMode;
    resolvedThemeMode: 'light' | 'dark';
    onSelectTheme: (themeName: string) => void;
    onSetThemeMode: (mode: ThemeMode) => void;
}

const MODE_OPTIONS: {value: ThemeMode; label: string; icon: string}[] = [
    {value: 'system', label: 'System', icon: 'ph ph-monitor'},
    {value: 'light', label: 'Light', icon: 'ph-fill ph-sun'},
    {value: 'dark', label: 'Dark', icon: 'ph-fill ph-moon'},
];

/** Themes live in the settings page now: the gallery replaces the theme modal,
 *  and the light/dark/system switch is mirrored in the top navbar. */
export default function AppearanceSettingsSection({
    selectedThemeName,
    themeMode,
    resolvedThemeMode,
    onSelectTheme,
    onSetThemeMode,
}: AppearanceSettingsProps) {
    const selectedTheme: AppTheme = THEME_LIST.find(theme => theme.name === selectedThemeName) || THEME_LIST[0];
    return (
        <div className="space-y-4">
            <SettingsGroup
                title="Mode"
                description="How the palette follows your device."
                icon="ph-fill ph-circle-half"
            >
                <SettingRow
                    label="Color mode"
                    description={`System currently resolves to ${resolvedThemeMode}. The same switch sits in the top navbar.`}
                    icon="ph ph-swatches"
                    control={
                        <SettingChoice
                            value={themeMode}
                            options={MODE_OPTIONS}
                            onChange={onSetThemeMode}
                            ariaLabel="Color mode"
                        />
                    }
                />
            </SettingsGroup>

            <SettingsGroup
                title="Theme"
                description={`${THEME_LIST.length} palettes, applied instantly and remembered per specification.`}
                icon="ph-fill ph-palette"
            >
                <div className="px-4 py-4 sm:px-5">
                    <ThemeIdentityPanel theme={selectedTheme} mode={resolvedThemeMode} />
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
                        {THEME_LIST.map(theme => (
                            <ThemePreviewCard
                                key={theme.name}
                                theme={theme}
                                selected={theme.name === selectedThemeName}
                                resolvedThemeMode={resolvedThemeMode}
                                onSelect={() => onSelectTheme(theme.name)}
                            />
                        ))}
                    </div>
                </div>
            </SettingsGroup>
        </div>
    );
}
