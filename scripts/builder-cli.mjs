#!/usr/bin/env node
/**
 * OpenDoc UI Builder — `npm run make`
 *
 * Guided, cross-platform production build/deployment CLI.
 *
 * Design rules:
 * - `npm run build` itself is never modified.
 * - VITE_* variables are injected only into the child build process.
 * - Runtime secrets live only in `.env` (never in builder.config.json).
 * - All child processes run from the OpenDoc project root.
 * - Configuration is validated both when collected and when loaded.
 * - Build happens first; configuration is committed only after verification.
 * - Builder-managed `.env` entries are removed when no longer applicable.
 * - Existing unrelated `.env` entries and formatting are preserved.
 *
 * Usage: npm run make
 */
import {createInterface} from 'node:readline/promises';
import {
    existsSync,
    readFileSync,
    writeFileSync,
    renameSync,
    copyFileSync,
    mkdirSync,
    chmodSync,
    statSync,
    readdirSync,
} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stdin as input, stdout as output} from 'node:process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {rm} from 'node:fs/promises';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const CONFIG_PATH = join(ROOT, 'builder.config.json');
const ENV_PATH = join(ROOT, '.env');
const DIST_PATH = join(ROOT, 'dist');

const MIN_NODE_MAJOR = 18;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const supportsColor =
    output.isTTY && !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0' && process.env.TERM !== 'dumb';
const paint = (code, text) => (supportsColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));
const ui = {
    cyan: text => paint('96', text),
    green: text => paint('92', text),
    yellow: text => paint('93', text),
    red: text => paint('91', text),
    magenta: text => paint('95', text),
    dim: text => paint('2', text),
    bold: text => paint('1', text),
};
const symbols =
    process.platform === 'win32'
        ? {ok: '+', fail: 'x', warn: '!', bullet: '*', empty: 'o', q: '?'}
        : {ok: '✔', fail: '✖', warn: '⚠', bullet: '●', empty: '○', q: '?'};
const ok = text => console.log(paint('92', `${symbols.ok} ${text}`));
const fail = text => console.log(paint('91', `${symbols.fail} ${text}`));
const warning = text => console.log(paint('93', `${symbols.warn} ${text}`));
const success = text => console.log(`\n${paint('92', `${symbols.ok} ${text}`)}`);

const boxChars =
    process.platform === 'win32'
        ? {tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|'}
        : {tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│'};

/** Strip ANSI escape sequences so banner padding uses the visible length. */
const visibleLength = text => String(text).replace(/\u001b\[[0-9;]*m/g, '').length;

const banner = () => {
    const width = 56;
    const line = boxChars.h.repeat(width);
    const center = text => {
        const pad = Math.max(0, width - visibleLength(text));
        const left = Math.floor(pad / 2);
        return `${boxChars.v}${' '.repeat(left)}${text}${' '.repeat(pad - left)}${boxChars.v}`;
    };
    console.log(`\n${ui.cyan(`${boxChars.tl}${line}${boxChars.tr}`)}`);
    console.log(ui.cyan(center('OpenDoc UI Builder')));
    console.log(ui.cyan(center(ui.dim(`npm run make · v${pkg.version}`))));
    console.log(ui.cyan(center(ui.dim('guided clean build'))));
    console.log(ui.cyan(`${boxChars.bl}${line}${boxChars.br}\n`));
};

const section = title => console.log(`\n${ui.bold(ui.cyan(`── ${title}`))}`);
const note = text => console.log(ui.dim(`   ${text}`));
// success defined above
const hline = () => console.log(ui.dim(boxChars.h.repeat(56)));

// ---------------------------------------------------------------------------
// Lifecycle state (used by the SIGINT handler)
// ---------------------------------------------------------------------------

const lifecycle = {
    artifactsWritten: false,
    buildStarted: false,
    children: new Set(),
};

const trackChild = child => {
    lifecycle.children.add(child);
    child.on('close', () => lifecycle.children.delete(child));
    child.on('error', () => lifecycle.children.delete(child));
};

process.on('SIGINT', () => {
    console.log('');
    for (const child of lifecycle.children) {
        try {
            child.kill();
        } catch {
            // already gone
        }
    }
    if (lifecycle.artifactsWritten)
        console.log(ui.yellow(`${symbols.warn} Aborted. Configuration and build output were already written.`));
    else if (lifecycle.buildStarted)
        console.log(ui.yellow(`${symbols.warn} Aborted. The build was interrupted; configuration was not written.`));
    else console.log(ui.dim('Aborted by user. Nothing was changed.'));
    process.exit(130);
});

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

let rl = null;

const question = text => `${ui.cyan(`${symbols.q}`)} ${text} `;

// Piped-input fallback: Node readline/promises answers only one question when
// stdin is a pipe (the interface closes before the next question subscribes).
// For non-TTY input we read lines from a buffered queue instead, so the CLI
// stays scriptable. If the pipe ends early, prompts fail with a clear error.
const piped = !input.isTTY;
let pipedBuffer = '';
const pipedQueue = [];
const pipedWaiters = [];
if (piped) {
    input.setEncoding('utf8');
    input.on('data', chunk => {
        pipedBuffer += chunk;
        let index;
        while ((index = pipedBuffer.indexOf('\n')) >= 0) {
            pipedQueue.push(pipedBuffer.slice(0, index).replace(/\r$/, ''));
            pipedBuffer = pipedBuffer.slice(index + 1);
            const waiter = pipedWaiters.shift();
            if (waiter) waiter(pipedQueue.shift() ?? null);
        }
    });
    input.on('end', () => {
        if (pipedBuffer) pipedQueue.push(pipedBuffer);
        pipedBuffer = '';
        while (pipedWaiters.length > 0) {
            const waiter = pipedWaiters.shift();
            waiter(pipedQueue.shift() ?? null);
        }
    });
}

const readPipedLine = () =>
    new Promise(resolve => {
        if (pipedQueue.length > 0) resolve(pipedQueue.shift());
        else pipedWaiters.push(resolve);
    });

const readInputLine = async promptText => {
    output.write(promptText);
    if (piped) return (await readPipedLine())?.trim() ?? null;
    return (await rl.question(promptText)).trim();
};

async function ask(text, {default: dflt, validate} = {}) {
    const suffix = dflt !== undefined ? ui.dim(` [${dflt}]`) : '';
    for (;;) {
        const raw = await readInputLine(`${question(text)}${suffix}`);
        if (raw === null) throw new Error('Input closed before all questions were answered.');
        const value = raw === '' && dflt !== undefined ? String(dflt) : raw;
        if (value === '' && dflt !== '') {
            console.log(ui.red('   Please enter a value.'));
            continue;
        }
        if (validate) {
            const result = validate(value);
            if (result !== true) {
                console.log(ui.red(`   ${result}`));
                continue;
            }
        }
        return value;
    }
}

async function confirm(text, dflt = false) {
    const suffix = dflt ? ui.green('[Y/n]') : ui.dim('[y/N]');
    for (;;) {
        const raw = await readInputLine(`${question(text)}${suffix} `);
        if (raw === null) throw new Error('Input closed before all questions were answered.');
        const answer = raw.toLowerCase();
        if (answer === '') return dflt;
        if (answer === 'y' || answer === 'yes') return true;
        if (answer === 'n' || answer === 'no') return false;
        console.log(ui.red('   Please answer y or n.'));
    }
}

async function select(text, choices, {defaultIndex = 0} = {}) {
    console.log(`\n${question(text)}`);
    choices.forEach((choice, index) => {
        const marker = index === defaultIndex ? ui.green(symbols.bullet) : symbols.empty;
        const hint = choice.hint ? ui.dim(` — ${choice.hint}`) : '';
        console.log(`   ${marker} ${index + 1}) ${choice.label}${hint}`);
    });
    for (;;) {
        const raw = await readInputLine(`   ${ui.dim('Select')} [${defaultIndex + 1}]: `);
        if (raw === null) throw new Error('Input closed before all questions were answered.');
        const value = raw === '' ? String(defaultIndex + 1) : raw;
        const index = Number(value) - 1;
        if (Number.isInteger(index) && choices[index]) return choices[index].value;
        console.log(ui.red(`   Invalid choice. Enter a number between 1 and ${choices.length}.`));
    }
}

/** Read a secret without echoing it (raw-mode masking on a TTY; plain prompt on pipes). */
async function askHidden(text, {validate} = {}) {
    if (piped) return ask(text, {validate});
    const suffix = ui.dim(' (input hidden)');
    for (;;) {
        const value = await new Promise(resolve => {
            rl?.pause();
            output.write(`${question(text)}${suffix} `);
            const wasRaw = input.isRaw;
            input.setRawMode(true);
            input.resume();
            input.setEncoding('utf8');
            let collected = '';
            const onData = chunk => {
                for (const char of chunk) {
                    if (char === '\r' || char === '\n') {
                        input.removeListener('data', onData);
                        input.setRawMode(wasRaw);
                        input.pause();
                        output.write('\n');
                        resolve(collected);
                        return;
                    }
                    if (char === '\u0003') {
                        process.emit('SIGINT');
                        return;
                    }
                    if (char === '\u007f' || char === '\b') collected = collected.slice(0, -1);
                    else collected += char;
                }
            };
            input.on('data', onData);
        });
        rl?.resume();
        if (validate) {
            const result = validate(value);
            if (result !== true) {
                console.log(ui.red(`   ${result}`));
                continue;
            }
        }
        return value;
    }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const isPort = value => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 65535;
};

/** A strict http(s) origin: scheme + host only, no path/query/hash/credentials. */
const isOrigin = value => {
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

const toOrigin = value => {
    try {
        const url = new URL(value);
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname)
            return `${url.protocol}//${url.host}`;
    } catch {
        // fall through
    }
    return null;
};

const validateOrigins = value => {
    const origins = String(value)
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    if (origins.length === 0) return 'Enter at least one origin.';
    const invalid = origins.find(origin => !isOrigin(origin));
    return invalid ? `"${invalid}" is not a valid origin (scheme://host only, no path).` : true;
};

const normalizeBasePath = value => {
    let path = String(value).trim();
    if (path === '' || path === '/') return '/';
    if (!path.startsWith('/')) path = `/${path}`;
    if (!path.endsWith('/')) path = `${path}/`;
    return path;
};

const validateBasePath = value => {
    const path = normalizeBasePath(value);
    if (path !== '/' && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/$/.test(path))
        return 'The base path may only contain URL-safe path segments (no spaces, ?, #, \\, or "..").';
    return true;
};

const validateToken = value => {
    if (!/^[A-Za-z0-9._~-]{16,}$/.test(String(value)))
        return 'The token must be at least 16 characters using only letters, digits, and . _ ~ -.';
    return true;
};

const validateDownloaderTemplate = value => {
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

const isDockerImageName = value => /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(String(value));
const isDockerContainerName = value => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(String(value));

const validateModel = value =>
    /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(String(value))
        ? true
        : 'Enter a plain model identifier (letters, digits, and . _ : / @ + -).';

// ---------------------------------------------------------------------------
// Config schema (defaults + validation)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = () => ({
    version: 1,
    profile: 'both',
    clean: true,
    disableAppleEmojis: true,
    basePath: '/',
    loadFromUrl: false,
    downloaderTemplate: null,
    proxyExample: 'none',
    deploymentOrigin: null,
    aiGateway: {
        enabled: false,
        provider: 'openrouter',
        model: '',
        baseUrl: '',
        origins: 'http://localhost:3000,http://127.0.0.1:3000',
        port: 8787,
        rateLimit: 30,
        maxConcurrent: 4,
        maxMessages: 24,
        maxMessageChars: 40000,
        maxContextChars: 250000,
        maxOutputTokens: 2048,
        upstreamTimeoutMs: 60000,
        aiProxyExample: 'none',
    },
    docker: {
        imageName: 'opendoc-ui',
        containerName: 'opendoc-ui',
        port: 3000,
        restartPolicy: 'unless-stopped',
    },
});

const cloneConfig = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG()));

/** Validate a fully-loaded configuration object. Returns an error string or null. */
const validateConfig = config => {
    if (!config || typeof config !== 'object') return 'Configuration is not an object.';
    if (!['static', 'docker', 'both'].includes(config.profile)) return `Unknown profile "${config.profile}".`;
    if (typeof config.clean !== 'boolean') return 'clean must be a boolean.';
    if (typeof config.disableAppleEmojis !== 'boolean') return 'disableAppleEmojis must be a boolean.';
    if (typeof config.basePath !== 'string' || validateBasePath(config.basePath) !== true)
        return `Invalid base path "${config.basePath}".`;
    if (typeof config.loadFromUrl !== 'boolean') return 'loadFromUrl must be a boolean.';
    if (config.downloaderTemplate !== null && validateDownloaderTemplate(config.downloaderTemplate) !== true)
        return 'Invalid downloader template.';
    if (config.deploymentOrigin !== null && !isOrigin(config.deploymentOrigin))
        return `Invalid deployment origin "${config.deploymentOrigin}".`;
    const gateway = config.aiGateway;
    if (!gateway || typeof gateway !== 'object') return 'aiGateway configuration is missing.';
    if (typeof gateway.enabled !== 'boolean') return 'aiGateway.enabled must be a boolean.';
    if (gateway.enabled) {
        if (!['openai', 'anthropic', 'ollama', 'openrouter', 'custom'].includes(gateway.provider))
            return `Unknown AI provider "${gateway.provider}".`;
        if (!gateway.model) return 'aiGateway.model is required when the gateway is enabled.';
        if (gateway.baseUrl && !isOrigin(gateway.baseUrl) && !/^https?:\/\/.+\..+/.test(gateway.baseUrl))
            return `Invalid AI base URL "${gateway.baseUrl}".`;
        if (validateOrigins(gateway.origins) !== true) return 'Invalid AI gateway origins.';
        if (!isPort(gateway.port)) return `Invalid AI gateway port "${gateway.port}".`;
    }
    const docker = config.docker;
    if (!docker || typeof docker !== 'object') return 'docker configuration is missing.';
    if (!isDockerImageName(docker.imageName)) return `Invalid Docker image name "${docker.imageName}".`;
    if (!isDockerContainerName(docker.containerName)) return `Invalid Docker container name "${docker.containerName}".`;
    if (!isPort(docker.port)) return `Invalid Docker host port "${docker.port}".`;
    if (!['unless-stopped', 'always', 'on-failure', 'no'].includes(docker.restartPolicy))
        return `Unknown restart policy "${docker.restartPolicy}".`;
    return null;
};

// ---------------------------------------------------------------------------
// Config load / save
// ---------------------------------------------------------------------------

const loadLastConfig = () => {
    if (!existsSync(CONFIG_PATH)) return null;
    try {
        return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return null;
    }
};

/** Merge a possibly-old config onto defaults and validate. Secrets come from .env, never from JSON. */
const normalizeLoadedConfig = last => {
    const env = readEnv();
    const config = cloneConfig();
    if (last && typeof last === 'object') {
        if (last.profile) config.profile = last.profile;
        if (typeof last.clean === 'boolean') config.clean = last.clean;
        if (typeof last.disableAppleEmojis === 'boolean') config.disableAppleEmojis = last.disableAppleEmojis;
        else if (typeof last.appleEmojis === 'boolean') config.disableAppleEmojis = !last.appleEmojis; // v0 migration
        if (last.basePath) config.basePath = last.basePath;
        if (typeof last.loadFromUrl === 'boolean') config.loadFromUrl = last.loadFromUrl;
        if (last.downloaderTemplate) config.downloaderTemplate = last.downloaderTemplate;
        if (last.proxyExample) config.proxyExample = last.proxyExample;
        if (last.deploymentOrigin) config.deploymentOrigin = last.deploymentOrigin;
        else if (last.deploymentUrl) config.deploymentOrigin = toOrigin(last.deploymentUrl);
        if (last.aiGateway && typeof last.aiGateway === 'object') {
            Object.assign(config.aiGateway, last.aiGateway);
        }
        if (last.docker && typeof last.docker === 'object') {
            Object.assign(config.docker, last.docker);
        }
    }
    // Secrets always come from .env (never persisted in the JSON config).
    config.aiGateway.token = env.AI_GATEWAY_TOKEN || '';
    config.aiGateway.apiKey = env.AI_API_KEY || '';
    const error = validateConfig(config);
    if (error) throw new Error(`Stored configuration is invalid: ${error}`);
    return config;
};

const saveConfig = config => {
    // Never persist secrets in the JSON config.
    const {token: _token, apiKey: _apiKey, ...safeGateway} = config.aiGateway;
    const safe = {...config, aiGateway: safeGateway};
    writeFileSync(CONFIG_PATH, `${JSON.stringify(safe, null, 2)}\n`);
};

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/** Builder-owned .env keys. Removed when no longer applicable so stale
 *  secrets (e.g. an old AI_API_KEY) can never survive a new configuration. */
const MANAGED_ENV_KEYS = [
    'AI_GATEWAY_TOKEN',
    'AI_GATEWAY_ORIGIN',
    'AI_GATEWAY_PORT',
    'AI_PROVIDER',
    'AI_MODEL',
    'AI_BASE_URL',
    'AI_API_KEY',
    'AI_GATEWAY_RATE_LIMIT',
    'AI_GATEWAY_MAX_CONCURRENT',
    'AI_GATEWAY_MAX_MESSAGES',
    'AI_GATEWAY_MAX_MESSAGE_CHARS',
    'AI_GATEWAY_MAX_CONTEXT_CHARS',
    'AI_GATEWAY_MAX_OUTPUT_TOKENS',
    'AI_GATEWAY_UPSTREAM_TIMEOUT_MS',
    'OPENDOC_IMAGE_NAME',
    'OPENDOC_CONTAINER_NAME',
    'OPENDOC_PORT',
    'OPENDOC_RESTART_POLICY',
];

const readEnv = () => {
    const values = {};
    if (!existsSync(ENV_PATH)) return values;
    let inManagedSection = false;
    readFileSync(ENV_PATH, 'utf8')
        .split(/\r?\n/)
        .forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('# --- OpenDoc UI Builder managed ---')) inManagedSection = true;
            else if (trimmed.startsWith('# --- End OpenDoc UI Builder managed ---')) inManagedSection = false;
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (match) values[match[1]] = match[2].trim().replace(/^"|"$/g, '');
        });
    return values;
};

/**
 * Rewrite `.env` surgically: a single managed section carries every
 * builder-owned key; unrelated lines keep their exact formatting. Backs up
 * the previous file, writes atomically, and restricts permissions on Unix.
 */
const writeEnv = updates => {
    const header = '# --- OpenDoc UI Builder managed ---';
    const footer = '# --- End OpenDoc UI Builder managed ---';
    const quote = value =>
        /[\s#"]|\\/.test(String(value))
            ? `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : String(value);

    if (existsSync(ENV_PATH)) {
        copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);
    }

    const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
    const managedKeys = new Set(MANAGED_ENV_KEYS);
    const before = [];
    let inManaged = false;
    let sawManaged = false;
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed === header) {
            inManaged = true;
            sawManaged = true;
            return;
        }
        if (trimmed === footer) {
            inManaged = false;
            return;
        }
        if (inManaged) return; // managed section is rebuilt from scratch below
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (match && managedKeys.has(match[1])) return; // legacy builder-owned keys are never kept
        before.push(line);
    });

    const body = Object.entries(updates)
        .filter(([, value]) => value !== '' && value !== null && value !== undefined)
        .map(([key, value]) => `${key}=${quote(value)}`);
    const tail = before.length > 0 && before[before.length - 1].trim() !== '' ? [''] : [];
    const text = [...before, ...tail, header, ...body, footer, ''].join('\n');

    const tmp = `${ENV_PATH}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, ENV_PATH);
    if (process.platform !== 'win32') {
        try {
            chmodSync(ENV_PATH, 0o600);
        } catch {
            // permission change not supported
        }
    }
    if (!sawManaged && existsSync(`${ENV_PATH}.bak`))
        note(ui.dim(`backed up previous ${ENV_PATH.replace(ROOT, '.')} → .env.bak`));
};

const npmCmd = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

/** Drop undefined/null env values, which can crash spawn on Windows. */
const sanitizeEnv = env =>
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== null));

/** Quote an argument for cmd.exe when it contains characters beyond a safe set. */
const shellQuote = arg => {
    const text = String(arg);
    return /[^A-Za-z0-9_\-./:=@+%]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

const isWindows = process.platform === 'win32';

/**
 * Spawn a child process. On Windows, .cmd/.bat files (npm.cmd) cannot be
 * launched directly since the CVE-2024-27980 security fix - Node throws
 * EINVAL unless shell: true is set. All arguments here are constant strings
 * authored by this CLI (never user input), so shell: true is safe. On POSIX
 * the direct spawn is kept so signals propagate normally.
 */
const spawnChild = (command, args, options) =>
    isWindows
        ? spawn(`${command} ${args.map(shellQuote).join(' ')}`, {...options, shell: true})
        : spawn(command, args, options);

const runCmd = (command, args = [], env = {}) =>
    new Promise(resolve => {
        const child = spawnChild(command, args, {
            stdio: 'inherit',
            env: sanitizeEnv({...process.env, ...env}),
            cwd: ROOT,
        });
        trackChild(child);
        child.on('error', error => {
            console.log(ui.red(`   Failed to start ${command}: ${error.message}`));
            resolve(1);
        });
        child.on('close', code => resolve(code ?? 1));
    });

// ---------------------------------------------------------------------------
// Docker capability probe
// ---------------------------------------------------------------------------

const spawnProbe = (command, args) => {
    const options = {encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'pipe']};
    return isWindows
        ? spawnSync(`${command} ${args.map(shellQuote).join(' ')}`, {...options, shell: true})
        : spawnSync(command, args, options);
};

const probeDocker = () => {
    const result = {available: false, version: null, compose: false, reason: ''};
    const engine = spawnProbe('docker', ['info', '--format', '{{.ServerVersion}}']);
    if (engine.status !== 0) {
        result.reason = (engine.stderr || '').trim().split('\n')[0] || 'docker command failed';
        return result;
    }
    result.available = true;
    result.version = (engine.stdout || '').trim();
    const compose = spawnProbe('docker', ['compose', 'version']);
    result.compose = compose.status === 0;
    if (!result.compose) result.reason = 'docker compose plugin not found';
    return result;
};

/** Best-effort check whether a TCP port is already in use. */
const portInUse = port =>
    new Promise(resolve => {
        const socket = createServer();
        socket.once('error', () => resolve(true));
        socket.once('listening', () => socket.close(() => resolve(false)));
        socket.listen(port, '127.0.0.1');
    });

const pollHealthz = async (port, timeoutMs = 60000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/healthz`, {signal: AbortSignal.timeout(2000)});
            if (response.ok) return true;
        } catch {
            // not up yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
};

// ---------------------------------------------------------------------------
// Build verification
// ---------------------------------------------------------------------------

const distSnapshot = () => {
    if (!existsSync(DIST_PATH)) return new Map();
    const snapshot = new Map();
    const walk = directory => {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const full = join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            const stat = statSync(full);
            snapshot.set(full.replace(DIST_PATH, '').replace(/\\/g, '/'), `${stat.size}:${Math.floor(stat.mtimeMs)}`);
        }
    };
    walk(DIST_PATH);
    return snapshot;
};

/**
 * Verify the build output beyond existence: entry files present and non-empty,
 * index.html references the actual JS entry, and dist changed since the build
 * started (so stale artifacts cannot produce a false success).
 */
const verifyDist = (beforeSnapshot, buildStartMs) => {
    const required = ['/index.html', '/index.js', '/404.html'];
    const missing = required.filter(file => !existsSync(join(DIST_PATH, file.slice(1))));
    if (missing.length > 0) return {ok: false, missing, size: 0, gzip: 0, stale: false};
    const empty = required.filter(file => statSync(join(DIST_PATH, file.slice(1))).size === 0);
    if (empty.length > 0)
        return {ok: false, missing: empty.map(file => `${file} (empty)`), size: 0, gzip: 0, stale: false};
    const html = readFileSync(join(DIST_PATH, 'index.html'), 'utf8');
    const referencesEntry = /(?:src|href)=["']([^"']*\/)?index\.js["']/.test(html);
    if (!referencesEntry)
        return {ok: false, missing: ['index.html does not reference index.js'], size: 0, gzip: 0, stale: false};
    const after = distSnapshot();
    const touched = Array.from(after.entries()).some(([file, stamp]) => {
        const before = beforeSnapshot.get(file);
        return before !== stamp;
    });
    const fresh = Array.from(after.entries()).some(([, stamp]) => {
        const size = Number(stamp.split(':')[0]);
        const mtime = Number(stamp.split(':')[1]) * 1000;
        return size > 0 && mtime >= buildStartMs - 5000;
    });
    if (!touched && !fresh) return {ok: false, missing: [], size: 0, gzip: 0, stale: true};
    const bytes = readFileSync(join(DIST_PATH, 'index.js'));
    return {ok: true, missing: [], size: bytes.byteLength, gzip: gzipSync(bytes).byteLength, stale: false};
};

const formatBytes = bytes => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
};

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function stepProfile(existing) {
    section('Deployment profile');
    const profile = await select(
        'What are you building for?',
        [
            {value: 'static', label: 'Static files only', hint: 'dist/ for GitHub Pages, Netlify, nginx, S3'},
            {value: 'docker', label: 'Docker image', hint: 'compose.yaml / docker build'},
            {value: 'both', label: 'Both', hint: 'static files + Docker image (recommended)'},
        ],
        {defaultIndex: ['static', 'docker', 'both'].indexOf(existing?.profile ?? 'both')},
    );
    const clean = await confirm('Clean the previous build output before building?', existing?.clean ?? true);
    const deploymentOrigin = await ask('Public application origin (used for gateway origins; empty to skip)', {
        default: existing?.deploymentOrigin || '',
        validate: value => (value === '' || isOrigin(value) ? true : 'Enter a valid origin (https://host, no path).'),
    });
    return {profile, clean, deploymentOrigin: deploymentOrigin || null};
}

async function stepFrontend(existing) {
    section('Frontend build options');
    const disableAppleEmojis =
        (await select(
            'Apple Emoji sprite?',
            [
                {value: true, label: 'Exclude', hint: 'leaner bundle (default)'},
                {value: false, label: 'Include', hint: 'consistent Apple rendering, larger bundle'},
            ],
            {defaultIndex: existing?.disableAppleEmojis === false ? 1 : 0},
        )) === true;
    const basePath = await ask('Base path', {default: existing?.basePath ?? '/', validate: validateBasePath});
    const loadFromUrl = await confirm(
        'Enable "Load from URL" for remote specifications?',
        existing?.loadFromUrl ?? false,
    );
    return {disableAppleEmojis, basePath, loadFromUrl};
}

async function stepDownloadProxy(existing) {
    const result = {
        downloaderTemplate: existing?.downloaderTemplate ?? null,
        proxyExample: existing?.proxyExample ?? 'none',
    };
    const wantsTemplate = result.downloaderTemplate
        ? await confirm(`Keep the downloader proxy template "${result.downloaderTemplate}"?`, true)
        : await confirm('Configure a downloader proxy template?', false);
    if (wantsTemplate && !result.downloaderTemplate) {
        result.downloaderTemplate = await ask(
            'Proxy URL template (exactly one {URL}, e.g. https://proxy.example.com/download?spec_url={URL})',
            {validate: validateDownloaderTemplate},
        );
    } else if (!wantsTemplate) {
        result.downloaderTemplate = null;
    }
    if (result.downloaderTemplate) {
        result.proxyExample = await select(
            'Copy an example proxy service configuration?',
            [
                {value: 'none', label: 'No'},
                {value: 'node', label: 'Node.js'},
                {value: 'python', label: 'Python (FastAPI)'},
                {value: 'php', label: 'PHP (Laravel)'},
                {value: 'go', label: 'Go'},
                {value: 'java', label: 'Java (Spring Boot)'},
                {value: 'dotnet', label: '.NET (ASP.NET Core)'},
            ],
            {
                defaultIndex: Math.max(
                    0,
                    ['none', 'node', 'python', 'php', 'go', 'java', 'dotnet'].indexOf(result.proxyExample),
                ),
            },
        );
        if (result.proxyExample !== 'none' && !existsSync(join(ROOT, 'proxy', 'config.env.example'))) {
            warning('No proxy/config.env.example found; skipping the example copy.');
            result.proxyExample = 'none';
        }
    } else {
        result.proxyExample = 'none';
    }
    return result;
}

async function stepAiGateway(existing, deploymentOrigin) {
    const gateway = {...cloneConfig().aiGateway, ...(existing?.aiGateway || {})};
    section('AI gateway');
    gateway.enabled = await confirm('Configure the server-side AI gateway?', gateway.enabled);
    if (!gateway.enabled) return gateway;
    gateway.provider = await select(
        'Provider',
        [
            {value: 'openrouter', label: 'OpenRouter'},
            {value: 'openai', label: 'OpenAI'},
            {value: 'anthropic', label: 'Anthropic'},
            {value: 'ollama', label: 'Ollama (local)'},
            {value: 'custom', label: 'Custom (OpenAI-compatible)'},
        ],
        {
            defaultIndex: Math.max(
                0,
                ['openrouter', 'openai', 'anthropic', 'ollama', 'custom'].indexOf(gateway.provider),
            ),
        },
    );
    gateway.model = await ask('Model (e.g. gpt-4o-mini, llama3.2)', {
        default: gateway.model || '',
        validate: validateModel,
    });
    gateway.baseUrl = await ask('Base URL (optional; provider default when empty)', {
        default: gateway.baseUrl || '',
        validate: value => (value === '' || /^https?:\/\/.+\..+/.test(value) ? true : 'Enter a valid http(s) URL.'),
    });
    const keepKey = gateway.apiKey ? await confirm('Keep the stored API key from .env?', true) : false;
    if (!keepKey) gateway.apiKey = await askHidden('API key (optional for local providers)', {validate: () => true});
    const token = await ask('Gateway token (Enter to auto-generate)', {
        default: gateway.token || randomBytes(24).toString('hex'),
        validate: validateToken,
    });
    gateway.token = token;
    const origins = [
        deploymentOrigin || (existing?.deploymentOrigin ?? null),
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]
        .filter(Boolean)
        .join(',');
    gateway.origins = await ask('Allowed browser origins (comma-separated)', {
        default: existing?.aiGateway?.origins || origins,
        validate: validateOrigins,
    });
    gateway.port = Number(
        await ask('Gateway port', {
            default: gateway.port || 8787,
            validate: value => (isPort(value) ? true : 'Enter a valid TCP port (1-65535).'),
        }),
    );
    if (await confirm('Adjust advanced gateway limits?', false)) {
        gateway.rateLimit = Number(
            await ask('Rate limit (requests per window)', {
                default: gateway.rateLimit,
                validate: value => (Number(value) >= 1 ? true : 'Must be at least 1.'),
            }),
        );
        gateway.maxConcurrent = Number(
            await ask('Max concurrent requests', {
                default: gateway.maxConcurrent,
                validate: value => (Number(value) >= 1 ? true : 'Must be at least 1.'),
            }),
        );
        gateway.maxMessages = Number(
            await ask('Max messages per conversation', {
                default: gateway.maxMessages,
                validate: value => (Number(value) >= 1 ? true : 'Must be at least 1.'),
            }),
        );
        gateway.maxMessageChars = Number(
            await ask('Max characters per message', {
                default: gateway.maxMessageChars,
                validate: value => (Number(value) >= 1000 ? true : 'Must be at least 1000.'),
            }),
        );
        gateway.maxContextChars = Number(
            await ask('Max context characters', {
                default: gateway.maxContextChars,
                validate: value => (Number(value) >= 10000 ? true : 'Must be at least 10000.'),
            }),
        );
        gateway.maxOutputTokens = Number(
            await ask('Max output tokens', {
                default: gateway.maxOutputTokens,
                validate: value => (Number(value) >= 256 ? true : 'Must be at least 256.'),
            }),
        );
        gateway.upstreamTimeoutMs = Number(
            await ask('Upstream timeout (ms)', {
                default: gateway.upstreamTimeoutMs,
                validate: value => (Number(value) >= 5000 ? true : 'Must be at least 5000.'),
            }),
        );
    }
    gateway.aiProxyExample = await select(
        'Copy an example AI gateway service for another framework?',
        [
            {value: 'none', label: 'No — use the built-in Node gateway (npm run ai-gateway)'},
            {value: 'express', label: 'Node.js (Express)'},
            {value: 'fastapi', label: 'Python (FastAPI)'},
            {value: 'django', label: 'Python (Django)'},
            {value: 'laravel', label: 'PHP (Laravel)'},
            {value: 'rails', label: 'Ruby (Rails)'},
            {value: 'spring-boot', label: 'Java (Spring Boot)'},
            {value: 'aspnet-core', label: '.NET (ASP.NET Core)'},
            {value: 'gin', label: 'Go (Gin)'},
            {value: 'axum', label: 'Rust (Axum)'},
        ],
        {
            defaultIndex: Math.max(
                0,
                [
                    'none',
                    'express',
                    'fastapi',
                    'django',
                    'laravel',
                    'rails',
                    'spring-boot',
                    'aspnet-core',
                    'gin',
                    'axum',
                ].indexOf(gateway.aiProxyExample),
            ),
        },
    );
    if (gateway.aiProxyExample !== 'none' && !existsSync(join(ROOT, 'ai-proxy', 'config.env.example'))) {
        warning('No ai-proxy/config.env.example found; skipping the example copy.');
        gateway.aiProxyExample = 'none';
    }
    return gateway;
}

async function stepDocker(profile, dockerInfo, existing) {
    section('Docker options');
    if (profile === 'static') {
        note('Static profile selected; skipping Docker-specific options.');
        return cloneConfig().docker;
    }
    if (!dockerInfo.available) {
        note(`Docker is not available (${dockerInfo.reason}); skipping Docker-specific options.`);
        return cloneConfig().docker;
    }
    note(
        `Docker engine ${dockerInfo.version} detected${dockerInfo.compose ? ' with compose' : ' (no compose plugin)'}.`,
    );
    const docker = {...cloneConfig().docker, ...(existing?.docker || {})};
    docker.imageName = await ask('Image name (may include registry/namespace)', {
        default: docker.imageName,
        validate: value => (isDockerImageName(value) ? true : 'Invalid Docker image reference.'),
    });
    docker.containerName = await ask('Container name', {
        default: docker.containerName,
        validate: value => (isDockerContainerName(value) ? true : 'Invalid Docker container name.'),
    });
    docker.port = Number(
        await ask('Host port', {
            default: docker.port,
            validate: value => (isPort(value) ? true : 'Enter a valid TCP port (1-65535).'),
        }),
    );
    if (await portInUse(docker.port))
        warning(`Port ${docker.port} appears to be in use already; pick a free port if the start step fails.`);
    docker.restartPolicy = await select(
        'Restart policy',
        [
            {value: 'unless-stopped', label: 'unless-stopped'},
            {value: 'always', label: 'always'},
            {value: 'on-failure', label: 'on-failure'},
            {value: 'no', label: 'no'},
        ],
        {defaultIndex: Math.max(0, ['unless-stopped', 'always', 'on-failure', 'no'].indexOf(docker.restartPolicy))},
    );
    return docker;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const getReviewRows = (config, dockerInfo) => {
    const rows = [
        ['Profile', config.profile],
        ['Clean before build', config.clean ? 'yes' : 'no'],
        ['Apple Emoji sprite', config.disableAppleEmojis ? 'excluded' : 'included'],
        ['Base path', config.basePath],
        ['Load from URL', config.loadFromUrl ? 'yes' : 'no'],
        ['Downloader proxy', config.downloaderTemplate || '—'],
        ['Proxy example', config.proxyExample !== 'none' ? config.proxyExample : '—'],
        ['Public origin', config.deploymentOrigin || '—'],
        [
            'AI gateway',
            config.aiGateway.enabled ? `${config.aiGateway.provider} · ${config.aiGateway.model}` : 'disabled',
        ],
    ];
    if (config.aiGateway.enabled) {
        rows.push(['Gateway port', String(config.aiGateway.port)]);
        rows.push(['Gateway origins', config.aiGateway.origins]);
        if (config.aiGateway.baseUrl) rows.push(['AI base URL', config.aiGateway.baseUrl]);
        rows.push([
            'AI proxy example',
            config.aiGateway.aiProxyExample !== 'none' ? config.aiGateway.aiProxyExample : '—',
        ]);
        rows.push(['API key', config.aiGateway.apiKey ? 'configured' : 'not set']);
        rows.push(['Gateway token', config.aiGateway.token ? 'generated/configured' : 'not set']);
    }
    if (config.profile !== 'static' && dockerInfo.available) {
        rows.push(['Docker engine', dockerInfo.version]);
        rows.push(['Docker image', config.docker.imageName]);
        rows.push(['Container', `${config.docker.containerName} on :${config.docker.port}`]);
        rows.push(['Restart policy', config.docker.restartPolicy]);
    } else if (config.profile !== 'static' && !dockerInfo.available) {
        rows.push(['Docker', `unavailable (${dockerInfo.reason})`]);
    }
    return rows;
};

const renderReview = rows => {
    const width = Math.max(...rows.map(([key]) => key.length));
    hline();
    rows.forEach(([key, value]) => console.log(`   ${ui.bold(key.padEnd(width))}  ${ui.dim('·')}  ${value}`));
    hline();
};

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

const ensureIgnored = file => {
    if (!existsSync(join(ROOT, '.gitignore'))) return;
    const patterns = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).filter(Boolean);
    const relative = file.replace(ROOT, '').replace(/^[\\/]/, '');
    const ignored = patterns.some(pattern => {
        const normalized = pattern.trim();
        if (!normalized || normalized.startsWith('#')) return false;
        if (normalized.startsWith('/')) return relative.startsWith(normalized.slice(1));
        return (
            relative === normalized ||
            relative.startsWith(`${normalized}/`) ||
            normalized === '.env*' ||
            (normalized.endsWith('*') && relative.includes(normalized.slice(0, -1)))
        );
    });
    if (!ignored) warning(`"${relative}" contains credentials but is not covered by .gitignore.`);
};

const writeExampleEnv = (targetDir, sourceExample, replacements) => {
    const example = join(ROOT, sourceExample);
    if (!existsSync(example)) {
        warning(`Example source ${sourceExample} is missing; skipping.`);
        return;
    }
    let text = readFileSync(example, 'utf8');
    Object.entries(replacements).forEach(([key, value]) => {
        text = text.replace(new RegExp(`^(${key}=).*$`, 'm'), `$1${value}`);
    });
    mkdirSync(targetDir, {recursive: true});
    const target = join(targetDir, '.env');
    writeFileSync(target, text);
    if (process.platform !== 'win32') {
        try {
            chmodSync(target, 0o600);
        } catch {
            // not supported
        }
    }
    ensureIgnored(target);
    note(ui.dim(`wrote ${target.replace(ROOT, '.')}`));
};

/** Called only after the build verified successfully. */
function writeArtifacts(config) {
    section('Writing configuration');
    const env = {};
    if (config.aiGateway.enabled) {
        Object.assign(env, {
            AI_GATEWAY_TOKEN: config.aiGateway.token,
            AI_GATEWAY_ORIGIN: config.aiGateway.origins,
            AI_GATEWAY_PORT: String(config.aiGateway.port),
            AI_PROVIDER: config.aiGateway.provider,
            AI_MODEL: config.aiGateway.model,
            AI_GATEWAY_RATE_LIMIT: String(config.aiGateway.rateLimit),
            AI_GATEWAY_MAX_CONCURRENT: String(config.aiGateway.maxConcurrent),
            AI_GATEWAY_MAX_MESSAGES: String(config.aiGateway.maxMessages),
            AI_GATEWAY_MAX_MESSAGE_CHARS: String(config.aiGateway.maxMessageChars),
            AI_GATEWAY_MAX_CONTEXT_CHARS: String(config.aiGateway.maxContextChars),
            AI_GATEWAY_MAX_OUTPUT_TOKENS: String(config.aiGateway.maxOutputTokens),
            AI_GATEWAY_UPSTREAM_TIMEOUT_MS: String(config.aiGateway.upstreamTimeoutMs),
        });
        if (config.aiGateway.baseUrl) env.AI_BASE_URL = config.aiGateway.baseUrl;
        if (config.aiGateway.apiKey) env.AI_API_KEY = config.aiGateway.apiKey;
    }
    if (config.profile !== 'static') {
        Object.assign(env, {
            OPENDOC_IMAGE_NAME: config.docker.imageName,
            OPENDOC_CONTAINER_NAME: config.docker.containerName,
            OPENDOC_PORT: String(config.docker.port),
            OPENDOC_RESTART_POLICY: config.docker.restartPolicy,
        });
    }
    // Build the desired managed map first, then remove every managed key that
    // is no longer applicable so stale secrets can never survive.
    writeEnv(env);
    note(ui.dim(`wrote ${ENV_PATH.replace(ROOT, '.')}`));
    ensureIgnored(ENV_PATH);
    saveConfig(config);
    note(ui.dim(`wrote ${CONFIG_PATH.replace(ROOT, '.')}`));
    if (config.proxyExample !== 'none' && config.downloaderTemplate) {
        const origin = [config.deploymentOrigin, 'http://localhost:3000'].filter(Boolean).join(',');
        writeExampleEnv(join(ROOT, 'proxy', config.proxyExample), 'proxy/config.env.example', {
            OPENDOC_ALLOWED_ORIGINS: origin,
        });
    }
    if (config.aiGateway.enabled && config.aiGateway.aiProxyExample !== 'none') {
        writeExampleEnv(join(ROOT, 'ai-proxy', config.aiGateway.aiProxyExample), 'ai-proxy/config.env.example', {
            AI_GATEWAY_TOKEN: config.aiGateway.token,
            AI_GATEWAY_ORIGINS: config.aiGateway.origins,
            AI_PROVIDER: config.aiGateway.provider,
            AI_MODEL: config.aiGateway.model,
            ...(config.aiGateway.apiKey ? {AI_API_KEY: config.aiGateway.apiKey} : {}),
            ...(config.aiGateway.baseUrl ? {AI_BASE_URL: config.aiGateway.baseUrl} : {}),
        });
    }
    if (config.aiGateway.enabled)
        note(ui.dim('gateway token, provider and limits saved to .env — the gateway reads them at runtime'));
    if (config.profile !== 'static')
        note(ui.dim('docker/config.json stays the specs source (Mode 1/2/3); edit it and reload the browser'));
}

// ---------------------------------------------------------------------------
// Build + start
// ---------------------------------------------------------------------------

async function runBuild(config) {
    section('Building');
    const beforeSnapshot = distSnapshot();
    const buildStartMs = Date.now();
    if (config.clean) {
        console.log(ui.dim('   Cleaning previous output…'));
        lifecycle.buildStarted = true;
        const cleanCode = await runCmd(npmCmd(), ['run', 'clean']);
        if (cleanCode !== 0) return null;
    }
    const buildEnv = {
        VITE_DISABLE_APPLE_EMOJIS: config.disableAppleEmojis ? 'true' : 'false',
        VITE_LOAD_FROM_URL: config.loadFromUrl ? 'true' : 'false',
        VITE_BASE_PATH: config.basePath,
    };
    if (config.downloaderTemplate) buildEnv.VITE_SPEC_DOWNLOADER = config.downloaderTemplate;
    console.log(ui.dim('   Build-time options (child process only — npm run build stays untouched):'));
    Object.entries(buildEnv).forEach(([key, value]) => console.log(ui.dim(`     ${key}=${value}`)));
    console.log('');
    lifecycle.buildStarted = true;
    const code = await runCmd(npmCmd(), ['run', 'build'], buildEnv);
    if (code !== 0) {
        console.log(fail(`Build failed (exit code ${code}).`));
        return null;
    }
    const verified = verifyDist(beforeSnapshot, buildStartMs);
    if (!verified.ok) {
        console.log(
            fail(
                verified.stale
                    ? 'Build verification failed: dist/ did not change (stale artifacts).'
                    : `Build output is incomplete; ${verified.missing.join(', ')}.`,
            ),
        );
        return null;
    }
    success('Build finished.');
    console.log(`   bundle ${formatBytes(verified.size)} (${formatBytes(verified.gzip)} gzip) · dist/index.js`);
    return verified;
}

async function startChoice(config, dockerInfo) {
    section('Start');
    const choices = [];
    if (config.profile !== 'static' && dockerInfo.available && dockerInfo.compose) {
        choices.push({value: 'docker', label: 'Docker container', hint: 'docker compose up --build -d'});
    }
    choices.push({
        value: 'preview',
        label: 'Local preview',
        hint: 'npm run preview · serves dist/ (local preview only, not a production server)',
    });
    choices.push({value: 'dev', label: 'Dev server', hint: 'npm run dev · port 3000 with HMR'});
    if (config.aiGateway.enabled) {
        choices.push({value: 'gateway', label: 'AI gateway only', hint: 'npm run ai-gateway'});
    }
    choices.push({value: 'none', label: 'No — show deployment notes'});
    const choice = await select('Build finished successfully. Start it now?', choices, {defaultIndex: 0});
    if (choice === 'none') {
        showDeploymentNotes(config, dockerInfo);
        return;
    }
    if (choice === 'docker') {
        console.log(ui.dim('   Starting Docker container (first build may take a while)…'));
        const code = await runCmd('docker', ['compose', 'up', '--build', '-d']);
        if (code === 0) {
            const healthy = await pollHealthz(config.docker.port);
            if (healthy) success(`OpenDoc UI is healthy at http://localhost:${config.docker.port}`);
            else
                warning(
                    `Compose started, but /healthz did not respond on port ${config.docker.port} yet. Check: docker compose ps`,
                );
            note('stop it with: docker compose down');
        }
        return;
    }
    if (choice === 'preview' || choice === 'dev') {
        await runCmd(npmCmd(), ['run', choice]);
        return;
    }
    if (choice === 'gateway') {
        console.log(ui.dim(`   Starting AI gateway on http://localhost:${config.aiGateway.port}…`));
        const gateway = spawnChild(npmCmd(), ['run', 'ai-gateway'], {
            stdio: 'inherit',
            env: sanitizeEnv({...process.env, ...readEnv()}),
            cwd: ROOT,
        });
        trackChild(gateway);
        await new Promise(resolve => gateway.on('close', resolve));
        return;
    }
}

function showDeploymentNotes(config, dockerInfo) {
    section('Deployment notes');
    console.log(
        `   dist/            ${ui.bold('static output')} — serve it from any static host (nginx, Netlify, S3…).`,
    );
    console.log(
        `                   base path "${config.basePath}"${config.basePath !== '/' ? ' (GitHub Pages project sites use /<repo>/).' : ''}`,
    );
    console.log(`   config           Mode 1 public/config.json · Mode 2 window.INITIAL_CONFIG · Mode 3 local-only.`);
    console.log(
        `   load-from-url    ${config.loadFromUrl ? 'enabled' : 'disabled'}${config.downloaderTemplate ? ` via ${config.downloaderTemplate}` : ''}`,
    );
    console.log(
        `   ai gateway       ${config.aiGateway.enabled ? `http://localhost:${config.aiGateway.port} (npm run ai-gateway)` : 'not configured (browser-direct provider mode)'}`,
    );
    if (config.profile !== 'static' && dockerInfo.available) {
        console.log(`   docker           docker compose up --build -d → http://localhost:${config.docker.port}`);
        console.log(`                   health check: http://localhost:${config.docker.port}/healthz`);
    }
    if (config.aiGateway.enabled) {
        console.log(`   gateway token    ${ui.dim('kept in .env only — the gateway rejects requests without it')}`);
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const printPreviousSummary = (config, dockerInfo) => {
    console.log('');
    renderReview(getReviewRows(config, dockerInfo));
};

async function main() {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor < MIN_NODE_MAJOR) {
        console.log(fail(`Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.versions.node}).`));
        process.exit(1);
    }

    const dockerInfo = probeDocker();
    if (dockerInfo.available && !dockerInfo.compose)
        warning('Docker engine detected but the compose plugin is missing; Docker start will not be offered.');

    let config = null;
    let collect = true;
    const last = loadLastConfig();
    if (last) {
        try {
            const loaded = normalizeLoadedConfig(last);
            console.log(ui.dim('\nPrevious configuration found:'));
            printPreviousSummary(loaded, dockerInfo);
            const mode = await select('What do you want to do?', [
                {value: 'use', label: 'Use this configuration', hint: 'rebuild with the same settings'},
                {value: 'edit', label: 'Edit it', hint: 'walk through the questions with these values as defaults'},
                {value: 'fresh', label: 'Start fresh'},
            ]);
            if (mode === 'use') {
                config = loaded;
                collect = false;
                success('Previous configuration loaded.');
            } else if (mode === 'edit') {
                config = loaded;
            }
        } catch (error) {
            warning(`${error.message} Starting fresh.`);
        }
    }

    if (collect) {
        for (;;) {
            const existing = config;
            const profile = await stepProfile(existing);
            const frontend = await stepFrontend(existing);
            const download = await stepDownloadProxy(existing);
            const aiGateway = await stepAiGateway(existing, profile.deploymentOrigin);
            const docker = await stepDocker(profile.profile, dockerInfo, existing);
            config = {...cloneConfig(), ...profile, ...frontend, ...download, aiGateway, docker};
            const error = validateConfig(config);
            if (error) {
                warning(error);
                continue;
            }
            section('Review');
            renderReview(getReviewRows(config, dockerInfo));
            const proceed = await confirm('Looks good — build with this configuration?', true);
            if (proceed) break;
            const again = await select('What now?', [
                {value: 'restart', label: 'Start the questions over'},
                {value: 'quit', label: 'Quit without building'},
            ]);
            if (again === 'quit') {
                console.log(ui.dim('\nNothing was written or built. Goodbye.'));
                process.exit(0);
            }
        }
    } else {
        // "Use previous configuration": confirm the review, then build.
        section('Review');
        renderReview(getReviewRows(config, dockerInfo));
        const proceed = await confirm('Build with this configuration?', true);
        if (!proceed) {
            console.log(ui.dim('\nNothing was written or built. Goodbye.'));
            process.exit(0);
        }
    }

    const verified = await runBuild(config);
    if (!verified) process.exit(1);

    lifecycle.artifactsWritten = true;
    writeArtifacts(config);
    await startChoice(config, dockerInfo);
    console.log(`\n${ui.dim('Thanks for using the OpenDoc UI builder.')}\n`);
}

let finished = false;
if (!piped) {
    rl = createInterface({input, output});
    rl.on('close', () => {
        if (!finished) {
            console.log(ui.red('\nInput closed unexpectedly. Run npm run make again in an interactive terminal.'));
            process.exit(1);
        }
    });
}

banner();
main()
    .catch(error => {
        console.log(ui.red(`\nUnexpected error: ${error?.message || error}`));
        process.exit(1);
    })
    .finally(() => {
        finished = true;
        try {
            rl?.close();
        } catch {
            // already closed
        }
    });
