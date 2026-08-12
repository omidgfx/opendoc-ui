import {readdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadEnv} from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distUrl = new URL('../dist/', import.meta.url);
const files = await readdir(distUrl, {recursive: true});
const javascript = files.filter(file => file.endsWith('.js'));
if (javascript.length !== 1 || javascript[0] !== 'index.js') {
    throw new Error(`Expected exactly one JavaScript bundle named index.js; found: ${javascript.join(', ') || 'none'}`);
}
const sourceMaps = files.filter(file => file.endsWith('.map'));
if (sourceMaps.length > 0) {
    throw new Error(`Production source maps are forbidden; found: ${sourceMaps.join(', ')}`);
}
const emittedImages = files.filter(file => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file));
if (emittedImages.length > 0) {
    throw new Error(`Expected image assets to be inlined; found: ${emittedImages.join(', ')}`);
}
const [bundle, stylesheet] = await Promise.all([
    readFile(new URL('index.js', distUrl), 'utf8'),
    readFile(new URL('index.css', distUrl), 'utf8'),
]);
if (/sourceMappingURL\s*=/.test(`${bundle}\n${stylesheet}`)) {
    throw new Error('Production assets contain a sourceMappingURL reference.');
}
const env = {...loadEnv('production', projectRoot, ''), ...process.env};
const appleEmojisDisabled = String(env.VITE_DISABLE_APPLE_EMOJIS || 'true').toLowerCase() !== 'false';
const hasEmbeddedAppleSprite =
    stylesheet.includes('.emoji[data-apple-emoji]') && stylesheet.includes('data:image/png;base64,');
const hasAppleEmojiMetadata = bundle.includes('face_with_bags_under_eyes') || bundle.includes('female-technologist');
if (appleEmojisDisabled && (hasEmbeddedAppleSprite || hasAppleEmojiMetadata)) {
    throw new Error('Apple emojis are disabled, but their metadata or embedded sprite remains in production assets.');
}
if (!appleEmojisDisabled && (!hasEmbeddedAppleSprite || !hasAppleEmojiMetadata)) {
    throw new Error('Apple emojis are enabled, but their metadata or embedded sprite is missing.');
}
console.log('✓ single JavaScript bundle: dist/index.js');
console.log('✓ production source maps disabled');
console.log(
    appleEmojisDisabled
        ? '✓ Apple emoji metadata and sprite excluded'
        : '✓ Apple emoji metadata and sprite embedded with no emitted image assets',
);
