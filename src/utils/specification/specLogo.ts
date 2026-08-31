import type {LogoDefinition, OpenApiSpec} from '../../types';

/**
 * Extracts the specification's own logo/icon (`info.x-logo`) when usable.
 * Accepts the ReDoc-style object and a plain string URL; returns null when
 * the specification carries no usable logo so callers can fall back to the
 * OpenDoc mark.
 */
export const getSpecLogo = (spec: OpenApiSpec | null | undefined): LogoDefinition | null => {
    const logo = (spec?.info as any)?.['x-logo'] as LogoDefinition | string | undefined;
    if (!logo) return null;
    if (typeof logo === 'string') return logo.trim() ? {url: logo.trim()} : null;
    if (typeof logo === 'object' && typeof (logo as LogoDefinition).url === 'string' && (logo as LogoDefinition).url)
        return {...(logo as LogoDefinition), url: (logo as LogoDefinition).url.trim()};
    return null;
};
