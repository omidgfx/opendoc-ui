/** Runtime environment handling: .env read/write and child-process spawning. */
import {copyFileSync, existsSync, readFileSync, renameSync, writeFileSync, chmodSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {ENV_PATH, ROOT} from './paths.mjs';
import {note} from './ui.mjs';

/** Builder-owned .env keys. Removed when no longer applicable so stale
 *  secrets (e.g. an old AI_API_KEY) can never survive a new configuration. */
export const MANAGED_ENV_KEYS = [
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

export const readEnv = () => {
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
export const writeEnv = updates => {
    const header = '# --- OpenDoc UI Builder managed ---';
    const footer = '# --- End OpenDoc UI Builder managed ---';
    const quote = value =>
        /[\s#"]|\\/.test(String(value))
            ? `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : String(value);

    if (existsSync(ENV_PATH)) {
        copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);
    }

    const managedKeys = new Set(MANAGED_ENV_KEYS);
    const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
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
        note(`backed up previous ${ENV_PATH.replace(ROOT, '.')} → .env.bak`);
};

export const npmCmd = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

/** Drop undefined/null env values, which can crash spawn on Windows. */
export const sanitizeEnv = env =>
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== null));

/** Quote an argument for cmd.exe when it contains characters beyond a safe set. */
export const shellQuote = arg => {
    const text = String(arg);
    return /[^A-Za-z0-9_\-./:=@+%]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

export const isWindows = process.platform === 'win32';

/**
 * Spawn a child process. On Windows, .cmd/.bat files (npm.cmd) cannot be
 * launched directly since the CVE-2024-27980 security fix - Node throws
 * EINVAL unless shell: true is set. All arguments here are constant strings
 * authored by this CLI (never user input), so shell: true is safe. On POSIX
 * the direct spawn is kept so signals propagate normally.
 */
export const spawnChild = (command, args, options) =>
    isWindows
        ? spawn(`${command} ${args.map(shellQuote).join(' ')}`, {...options, shell: true})
        : spawn(command, args, options);

export const runCmd = (command, args = [], env = {}) =>
    new Promise(resolve => {
        const child = spawnChild(command, args, {
            stdio: 'inherit',
            env: sanitizeEnv({...process.env, ...env}),
            cwd: ROOT,
        });
        child.on('error', error => {
            console.log(`   Failed to start ${command}: ${error.message}`);
            resolve(1);
        });
        child.on('close', code => resolve(code ?? 1));
    });

export const spawnProbe = (command, args) => {
    const options = {encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'pipe']};
    return isWindows
        ? spawnSync(`${command} ${args.map(shellQuote).join(' ')}`, {...options, shell: true})
        : spawnSync(command, args, options);
};
