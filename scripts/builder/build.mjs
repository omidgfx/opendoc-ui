/** Build execution and output verification. */
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {DIST_PATH} from './paths.mjs';
import {fail, note, section, success, ui} from './ui.mjs';
import {npmCmd, runCmd} from './env.mjs';
import {lifecycle} from './lifecycle.mjs';

export const distSnapshot = () => {
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
export const verifyDist = (beforeSnapshot, buildStartMs) => {
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

export const formatBytes = bytes => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
};

export async function runBuild(config) {
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
