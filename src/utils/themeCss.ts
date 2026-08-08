import type React from 'react';
import type {ThemeItem} from '../types';
import {getContrastColor} from './color';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'connect', 'options', 'trace'] as const;

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
        const color = (theme as any)[`method${method.charAt(0).toUpperCase()}${method.slice(1)}`];
        variables[`--method-${method}`] = color;
        variables[`--method-${method}-contrast`] = getContrastColor(color);
    });
    return variables as React.CSSProperties;
};

export const applyThemeCssVariables = (theme: ThemeItem, root: HTMLElement = document.documentElement): void => {
    const variables = createThemeCssVariables(theme) as Record<string, string>;
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
};
