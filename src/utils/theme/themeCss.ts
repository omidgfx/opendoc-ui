import type React from 'react';
import type {ThemeItem} from '../../types';
import {getContrastColor} from '../color';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'connect', 'options', 'trace', 'query'] as const;
export const createThemeCssVariables = (theme: ThemeItem): React.CSSProperties => {
    const variables: Record<string, string> = {
        '--background': theme.background,
        '--surface': theme.surface,
        '--surface-hover': theme.surfaceHover,
        '--border': theme.border,
        '--text': theme.text,
        '--text-contrast': getContrastColor(theme.text),
        '--text-heading': theme.textHeading,
        '--text-muted': theme.textMuted,
        '--primary': theme.primary,
        '--primary-hover': theme.primaryHover,
        '--highlight': theme.highlight,
        '--select': theme.select,
        '--select-contrast': getContrastColor(theme.select),
        '--primary-contrast': getContrastColor(theme.primary),
        '--accent': theme.accent,
        '--sidebar': theme.sidebar,
        '--sidebar-text': theme.sidebarText,
        '--navbar': theme.navbar,
    };
    HTTP_METHODS.forEach(method => {
        const key = `method${method.charAt(0).toUpperCase()}${method.slice(1)}`;
        // Older custom themes may omit methodQuery; fall back to GET (closest safe-read hue).
        const color = (theme as any)[key] || (method === 'query' ? theme.methodGet || theme.primary : theme.primary);
        variables[`--method-${method}`] = color;
        variables[`--method-${method}-contrast`] = getContrastColor(color);
    });
    return variables as React.CSSProperties;
};
export const applyThemeCssVariables = (theme: ThemeItem, root: HTMLElement = document.documentElement): void => {
    const variables = createThemeCssVariables(theme) as Record<string, string>;
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
};

const PORTAL_THEME_VARIABLES = [
    '--background',
    '--surface',
    '--surface-hover',
    '--border',
    '--text',
    '--text-heading',
    '--text-muted',
    '--primary',
    '--primary-contrast',
    '--accent',
];

/**
 * Theme variables copied onto a portalled surface. Menus rendered into
 * document.body sit outside the themed subtree, so they have to carry the
 * palette of the element that opened them.
 */
export const readPortalThemeVariables = (anchor: HTMLElement | null): React.CSSProperties => {
    if (!anchor || typeof window === 'undefined') return {};
    const themedElement =
        anchor.closest('[style*="--background"]') || anchor.closest('body') || document.documentElement;
    const styles = getComputedStyle(themedElement);
    const variables: Record<string, string> = {};
    PORTAL_THEME_VARIABLES.forEach(name => {
        const property = styles.getPropertyValue(name);
        if (property) variables[name] = property;
    });
    return variables as React.CSSProperties;
};
