/** Input validation helpers shared by the question steps and config loading. */

export const isPort = value => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 65535;
};

/** A strict http(s) origin: scheme + host only, no path/query/hash/credentials. */
export const isOrigin = value => {
    try {
        const url = new URL(value);
        return (
            (url.protocol === 'http:' || url.protocol === 'https:') &&
            !!url.hostname &&
            url.pathname === '/' &&
            url.search === '' &&
            url.hash === '' &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
};

export const toOrigin = value => {
    try {
        const url = new URL(value);
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname)
            return `${url.protocol}//${url.host}`;
    } catch {
        // fall through
    }
    return null;
};

export const validateOrigins = value => {
    const origins = String(value)
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    if (origins.length === 0) return 'Enter at least one origin.';
    const invalid = origins.find(origin => !isOrigin(origin));
    return invalid ? `"${invalid}" is not a valid origin (scheme://host only, no path).` : true;
};

export const normalizeBasePath = value => {
    let path = String(value).trim();
    if (path === '' || path === '/') return '/';
    if (!path.startsWith('/')) path = `/${path}`;
    if (!path.endsWith('/')) path = `${path}/`;
    return path;
};

export const validateBasePath = value => {
    const path = normalizeBasePath(value);
    if (path !== '/' && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/$/.test(path))
        return 'The base path may only contain URL-safe path segments (no spaces, ?, #, \\, or "..").';
    return true;
};

export const validateToken = value => {
    if (!/^[A-Za-z0-9._~-]{16,}$/.test(String(value)))
        return 'The token must be at least 16 characters using only letters, digits, and . _ ~ -.';
    return true;
};

/** Mirrors the validation vite.config.ts applies to VITE_SPEC_DOWNLOADER. */
export const validateDownloaderTemplate = value => {
    const template = String(value).trim();
    const matches = template.match(/\{URL\}/g) ?? [];
    if (matches.length !== 1) return 'The template must contain exactly one {URL} placeholder.';
    const normalized = template.replace(/^https?:\/\//i, '').replace(/^\/+/, '');
    try {
        const parsed = new URL(
            `https://${normalized.split('{URL}').join(encodeURIComponent('https://example.com/openapi.yaml'))}`,
        );
        if (parsed.username || parsed.password) return 'The template cannot contain embedded credentials.';
    } catch {
        return 'The template does not produce a valid downloader URL.';
    }
    return true;
};

export const isDockerImageName = value => /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(String(value));
export const isDockerContainerName = value => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(String(value));

export const validateModel = value =>
    /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(String(value))
        ? true
        : 'Enter a plain model identifier (letters, digits, and . _ : / @ + -).';
