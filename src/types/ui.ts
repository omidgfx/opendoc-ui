export interface CustomDropdownOption {
    value: string;
    label: string;
    description?: string;
    /** Unavailable in the current configuration: shown greyed and not selectable. */
    disabled?: boolean;
}
