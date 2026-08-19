/** Sections are declared here as they land, so the rail, the deep link and the
 *  page body can never drift apart. */
export type SettingsSectionId = 'general' | 'appearance' | 'ai';

export interface SettingsSectionMeta {
    id: SettingsSectionId;
    label: string;
    description: string;
    icon: string;
}

/** Order of the rail, and of the sections stacked in the page body. */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
    {
        id: 'general',
        label: 'General',
        description: 'Defaults the whole application follows',
        icon: 'ph-fill ph-sliders-horizontal',
    },
    {
        id: 'appearance',
        label: 'Appearance',
        description: 'Themes and color mode',
        icon: 'ph-fill ph-palette',
    },
    {
        id: 'ai',
        label: 'AI assistant',
        description: 'Profiles, providers, models and skills',
        icon: 'ph-fill ph-sparkle',
    },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general';

export const isSettingsSectionId = (value: unknown): value is SettingsSectionId =>
    SETTINGS_SECTIONS.some(section => section.id === value);

export const resolveSettingsSection = (value: string | null | undefined): SettingsSectionId =>
    isSettingsSectionId(value) ? value : DEFAULT_SETTINGS_SECTION;
