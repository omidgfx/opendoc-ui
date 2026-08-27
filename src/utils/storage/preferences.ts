import {uiStorage} from './index';

/** Which representation a schema/example switch currently shows. */
export type RepresentationMode = 'example' | 'schema';

/** How long the documentation remembers that choice: for the endpoint the
 *  reader made it on, or for every endpoint at once. */
export type EndpointRepresentationScope = 'endpoint' | 'global';

/** The same question for the schema modal: per schema, or for every schema. */
export type ModalRepresentationScope = 'schema' | 'global';

/** Whether the documentation prints one parameter matrix or one table per
 *  location. The request body always keeps its own section either way. */
export type ParameterTableLayout = 'separated' | 'unified';

/** What a parameter table turns into when its pane is too narrow for columns. */
export type NarrowTableLayout = 'cards' | 'table';

/** Gutter indicator families the code viewer can annotate lines with. */
export const INDICATOR_ICON_KINDS = [
    'recursive',
    'depth',
    'reference',
    'branch',
    'deprecated',
    'access',
    'enum',
    'format',
    'pattern',
    'required',
    'truncation',
    'binary',
    'diff',
] as const;
export type IndicatorIconKind = (typeof INDICATOR_ICON_KINDS)[number];

export interface AppPreferences {
    /** Where the documentation keeps its schema/example choice. */
    endpointRepresentationScope: EndpointRepresentationScope;
    /** Choice shared by every endpoint, used when the scope is global. */
    endpointRepresentation: RepresentationMode;
    /** Choice per endpoint key, used when the scope is per endpoint. */
    endpointRepresentations: Record<string, RepresentationMode>;
    /** Where the schema modal keeps its schema/example choice. */
    modalRepresentationScope: ModalRepresentationScope;
    /** Choice shared by every schema, used when the scope is global. */
    modalRepresentation: RepresentationMode;
    /** Choice per schema name, used when the scope is per schema. */
    modalRepresentations: Record<string, RepresentationMode>;
    /** Path, query, header and cookie parameters in their own tables, or merged. */
    parameterTableLayout: ParameterTableLayout;
    /** Cards per row on narrow panes, or a horizontally scrolling table. */
    narrowTableLayout: NarrowTableLayout;
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
    endpointRepresentationScope: 'endpoint',
    endpointRepresentation: 'example',
    endpointRepresentations: {},
    modalRepresentationScope: 'schema',
    modalRepresentation: 'example',
    modalRepresentations: {},
    parameterTableLayout: 'separated',
    narrowTableLayout: 'cards',
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
const representationMap = (value: unknown): Record<string, RepresentationMode> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, RepresentationMode] =>
            isRepresentation(entry[1]),
        ),
    );
};
const isIndicatorIconKind = (value: unknown): value is IndicatorIconKind =>
    INDICATOR_ICON_KINDS.includes(value as IndicatorIconKind);

export const normalizeAppPreferences = (value: any): AppPreferences => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {...DEFAULT_APP_PREFERENCES};
    return {
        endpointRepresentationScope:
            value.endpointRepresentationScope === 'endpoint' || value.endpointRepresentationScope === 'global'
                ? value.endpointRepresentationScope
                : DEFAULT_APP_PREFERENCES.endpointRepresentationScope,
        endpointRepresentation: isRepresentation(value.endpointRepresentation)
            ? value.endpointRepresentation
            : DEFAULT_APP_PREFERENCES.endpointRepresentation,
        endpointRepresentations: representationMap(value.endpointRepresentations),
        modalRepresentationScope:
            value.modalRepresentationScope === 'schema' || value.modalRepresentationScope === 'global'
                ? value.modalRepresentationScope
                : DEFAULT_APP_PREFERENCES.modalRepresentationScope,
        modalRepresentation: isRepresentation(value.modalRepresentation)
            ? value.modalRepresentation
            : DEFAULT_APP_PREFERENCES.modalRepresentation,
        modalRepresentations: representationMap(value.modalRepresentations),
        parameterTableLayout:
            value.parameterTableLayout === 'unified' || value.parameterTableLayout === 'separated'
                ? value.parameterTableLayout
                : DEFAULT_APP_PREFERENCES.parameterTableLayout,
        narrowTableLayout:
            value.narrowTableLayout === 'cards' || value.narrowTableLayout === 'table'
                ? value.narrowTableLayout
                : DEFAULT_APP_PREFERENCES.narrowTableLayout,
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

/** The representation a documentation switch must show for one endpoint. */
export const endpointRepresentationOf = (preferences: AppPreferences, endpointKey: string): RepresentationMode =>
    preferences.endpointRepresentationScope === 'endpoint'
        ? (preferences.endpointRepresentations[endpointKey] ?? preferences.endpointRepresentation)
        : preferences.endpointRepresentation;

/** The representation the schema modal must show for one schema. */
export const modalRepresentationOf = (preferences: AppPreferences, schemaName: string): RepresentationMode =>
    preferences.modalRepresentationScope === 'schema'
        ? (preferences.modalRepresentations[schemaName] ?? preferences.modalRepresentation)
        : preferences.modalRepresentation;

/** Records a documentation choice in whichever place the scope points at. */
export const withEndpointRepresentation = (
    preferences: AppPreferences,
    endpointKey: string,
    mode: RepresentationMode,
): AppPreferences =>
    preferences.endpointRepresentationScope === 'endpoint'
        ? {...preferences, endpointRepresentations: {...preferences.endpointRepresentations, [endpointKey]: mode}}
        : {...preferences, endpointRepresentation: mode};

/** Records a schema modal choice in whichever place the scope points at. */
export const withModalRepresentation = (
    preferences: AppPreferences,
    schemaName: string,
    mode: RepresentationMode,
): AppPreferences =>
    preferences.modalRepresentationScope === 'schema'
        ? {...preferences, modalRepresentations: {...preferences.modalRepresentations, [schemaName]: mode}}
        : {...preferences, modalRepresentation: mode};

export const isIndicatorIconEnabled = (preferences: AppPreferences, kind: IndicatorIconKind): boolean =>
    preferences.codeGutterEnabled &&
    preferences.indicatorIconsEnabled &&
    !preferences.disabledIndicatorIcons.includes(kind);
