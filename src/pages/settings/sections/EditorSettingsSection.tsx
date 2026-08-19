import clsx from 'clsx';
import {usePreferences} from '@/src/contexts/PreferencesContext';
import {INDICATOR_ICON_KINDS, type IndicatorIconKind} from '@/src/utils/storage/preferences';
import {
    BINARY_ICON,
    BRANCH_ICON,
    DEPRECATED_ICON,
    DEPTH_LIMIT_ICON,
    DIFF_ICON,
    ENUM_ICON,
    PATTERN_ICON,
    READ_ONLY_ICON,
    REFERENCED_SCHEMA_ICON,
    TRUNCATED_ICON,
} from '@/src/utils/lineMarkers';
import {RECURSIVE_SCHEMA_ICON} from '@/src/utils/schemaProperties';
import SettingsGroup from '../controls/SettingsGroup';
import SettingRow from '../controls/SettingRow';
import SettingToggle from '../controls/SettingToggle';

const INDICATOR_META: Record<IndicatorIconKind, {label: string; icon: string; description: string}> = {
    recursive: {
        label: 'Recursion',
        icon: RECURSIVE_SCHEMA_ICON,
        description: 'Expansion stopped at a cycle',
    },
    depth: {label: 'Depth limit', icon: DEPTH_LIMIT_ICON, description: 'Nesting limit reached'},
    reference: {label: 'Referenced schema', icon: REFERENCED_SCHEMA_ICON, description: 'Generated from a $ref'},
    branch: {label: 'Combinator branch', icon: BRANCH_ICON, description: 'oneOf / anyOf alternative'},
    deprecated: {label: 'Deprecated', icon: DEPRECATED_ICON, description: 'Deprecated property'},
    access: {label: 'Read-only / write-only', icon: READ_ONLY_ICON, description: 'Usage-aware access locks'},
    enum: {label: 'Enum and const', icon: ENUM_ICON, description: 'Allowed value lists'},
    format: {label: 'Format', icon: 'ph ph-calendar-blank', description: 'date-time, uuid, email …'},
    pattern: {label: 'Pattern', icon: PATTERN_ICON, description: 'Opens the pattern tester'},
    required: {label: 'Required', icon: 'ph ph-asterisk', description: 'Required property dot'},
    truncation: {label: 'Truncation', icon: TRUNCATED_ICON, description: 'Response cut at the size bound'},
    binary: {label: 'Encoded binary', icon: BINARY_ICON, description: 'Base64-looking payload'},
    diff: {label: 'Changed lines', icon: DIFF_ICON, description: 'Difference against the previous run'},
};

/** Code viewer and tab behavior — the reading surface of the application. */
export default function EditorSettingsSection() {
    const {preferences, setPreference, toggleIndicatorIcon} = usePreferences();
    const iconsDisabled = !preferences.codeGutterEnabled || !preferences.indicatorIconsEnabled;
    return (
        <div className="space-y-4">
            <SettingsGroup
                title="Code viewer"
                description="How examples, schemas and responses are rendered."
                icon="ph-fill ph-code"
            >
                <SettingRow
                    label="Show gutter"
                    description="Line numbers beside every code block."
                    icon="ph ph-list-numbers"
                    control={
                        <SettingToggle
                            checked={preferences.codeGutterEnabled}
                            onChange={value => setPreference('codeGutterEnabled', value)}
                            ariaLabel="Show code gutter"
                        />
                    }
                />
                <SettingRow
                    label="Use indicator icons"
                    description="Annotate lines with schema and response indicators."
                    icon="ph ph-shapes"
                    nested
                    disabled={!preferences.codeGutterEnabled}
                    control={
                        <SettingToggle
                            checked={preferences.indicatorIconsEnabled}
                            onChange={value => setPreference('indicatorIconsEnabled', value)}
                            ariaLabel="Use indicator icons"
                            disabled={!preferences.codeGutterEnabled}
                        />
                    }
                >
                    <div
                        className={clsx(
                            'grid gap-1.5 sm:grid-cols-2',
                            iconsDisabled && 'pointer-events-none opacity-50',
                        )}
                    >
                        {INDICATOR_ICON_KINDS.map(kind => {
                            const meta = INDICATOR_META[kind];
                            const checked = !preferences.disabledIndicatorIcons.includes(kind);
                            return (
                                <button
                                    key={kind}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={checked}
                                    onClick={() => toggleIndicatorIcon(kind, !checked)}
                                    className="flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors border-[var(--border)] hover:bg-[var(--surface-hover)]"
                                >
                                    <span
                                        className={clsx(
                                            'flex size-4 shrink-0 items-center justify-center rounded border',
                                            checked
                                                ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-contrast)]'
                                                : 'border-[var(--border)] text-transparent',
                                        )}
                                    >
                                        <i className="ph ph-check text-[11px]" />
                                    </span>
                                    <i className={clsx(meta.icon, 'shrink-0 text-[13px] text-[var(--text-muted)]')} />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[11px] font-bold text-[var(--text-heading)]">
                                            {meta.label}
                                        </span>
                                        <span className="block truncate text-[10px] text-[var(--text-muted)]">
                                            {meta.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </SettingRow>
            </SettingsGroup>

            <SettingsGroup
                title="Tabs"
                description="How opened views behave in the tab bar."
                icon="ph-fill ph-browsers"
            >
                <SettingRow
                    label="Enable preview tabs"
                    description="Single click opens an italic preview tab that the next one replaces. Switch it off to always open permanent tabs."
                    icon="ph ph-browser"
                    control={
                        <SettingToggle
                            checked={preferences.previewTabsEnabled}
                            onChange={value => setPreference('previewTabsEnabled', value)}
                            ariaLabel="Enable preview tabs"
                        />
                    }
                />
            </SettingsGroup>
        </div>
    );
}
