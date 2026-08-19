import {uiStorage} from './index';

/** Which representation a schema/example switch shows. The choice is a
 *  preference, not per-endpoint state: it never changes with the endpoint. */
export type RepresentationMode = 'example' | 'schema';

/** Gutter indicator families the code viewer can annotate lines with. */
export const INDICATOR_ICON_KINDS = [
    'combinator',
    'deprecated',
    'access',
    'enum',
    'format',
    'pattern',
    'truncation',
    'binary',
    'diff',
] as const;
export type IndicatorIconKind = (typeof INDICATOR_ICON_KINDS)[number];

export interface AppPreferences {
    /** Representation shared by every endpoint documentation view. */
    endpointRepresentation: RepresentationMode;
    /** Representation used by the schema modal, kept apart from the endpoints. */
    modalRepresentation: RepresentationMode;
    /** Single-click tabs open in preview (italic) mode when enabled. */
    previewTabsEnabled: boolean;
    /** Line numbers column of the code viewer. */
    codeGutterEnabled: boolean;
    /** Annotation icons inside the gutter, nested under the gutter itself. */
    indicatorIconsEnabled: boolean;
    /** Indicator families the user turned off individually. */
    disabledIndicatorIcons: IndicatorIconKind[];
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
    endpointRepresentation: 'example',
    modalRepresentation: 'example',
    previewTabsEnabled: true,
    codeGutterEnabled: true,
    indicatorIconsEnabled: true,
    disabledIndicatorIcons: [],
};

const PREFERENCES_NAME = 'preferences';
/** Broadcast so every mounted consumer re-reads the store, including the
 *  copies rendered inside modals and the sidebar. */
export const APP_PREFERENCES_EVENT = 'opendoc:preferences-changed';

const isRepresentation = (value: unknown): value is RepresentationMode => value === 'example' || value === 'schema';
const isIndicatorIconKind = (value: unknown): value is IndicatorIconKind =>
    INDICATOR_ICON_KINDS.includes(value as IndicatorIconKind);

export const normalizeAppPreferences = (value: any): AppPreferences => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {...DEFAULT_APP_PREFERENCES};
    return {
        endpointRepresentation: isRepresentation(value.endpointRepresentation)
            ? value.endpointRepresentation
            : DEFAULT_APP_PREFERENCES.endpointRepresentation,
        modalRepresentation: isRepresentation(value.modalRepresentation)
            ? value.modalRepresentation
            : DEFAULT_APP_PREFERENCES.modalRepresentation,
        previewTabsEnabled:
            typeof value.previewTabsEnabled === 'boolean'
                ? value.previewTabsEnabled
                : DEFAULT_APP_PREFERENCES.previewTabsEnabled,
        codeGutterEnabled:
            typeof value.codeGutterEnabled === 'boolean'
                ? value.codeGutterEnabled
                : DEFAULT_APP_PREFERENCES.codeGutterEnabled,
        indicatorIconsEnabled:
            typeof value.indicatorIconsEnabled === 'boolean'
                ? value.indicatorIconsEnabled
                : DEFAULT_APP_PREFERENCES.indicatorIconsEnabled,
        disabledIndicatorIcons: Array.isArray(value.disabledIndicatorIcons)
            ? Array.from(new Set(value.disabledIndicatorIcons.filter(isIndicatorIconKind)))
            : [],
    };
};

export const readAppPreferences = (): AppPreferences =>
    normalizeAppPreferences(uiStorage.getJSON<AppPreferences>(PREFERENCES_NAME, DEFAULT_APP_PREFERENCES));

export const writeAppPreferences = (preferences: AppPreferences): void => {
    uiStorage.setJSON(PREFERENCES_NAME, preferences);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<AppPreferences>(APP_PREFERENCES_EVENT, {detail: preferences}));
    }
};

export const resetAppPreferences = (): AppPreferences => {
    const defaults = {...DEFAULT_APP_PREFERENCES};
    writeAppPreferences(defaults);
    return defaults;
};

export const isIndicatorIconEnabled = (preferences: AppPreferences, kind: IndicatorIconKind): boolean =>
    preferences.codeGutterEnabled &&
    preferences.indicatorIconsEnabled &&
    !preferences.disabledIndicatorIcons.includes(kind);
