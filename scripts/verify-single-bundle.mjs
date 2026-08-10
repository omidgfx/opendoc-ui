import {readdir, readFile} from 'node:fs/promises';

const files = await readdir(new URL('../dist', import.meta.url));
const javascript = files.filter(file => file.endsWith('.js'));
if (javascript.length !== 1 || javascript[0] !== 'index.js') {
    throw new Error(`Expected exactly one JavaScript bundle named index.js; found: ${javascript.join(', ') || 'none'}`);
}
const emittedImages = files.filter(file => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file));
if (emittedImages.length > 0) {
    throw new Error(`Expected image assets to be inlined; found: ${emittedImages.join(', ')}`);
}
const [bundle, stylesheet] = await Promise.all([
    readFile(new URL('../dist/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/index.css', import.meta.url), 'utf8'),
]);
if (!`${bundle}\n${stylesheet}`.includes('data:image/png;base64,')) {
    throw new Error('Expected the Apple emoji sprite to be embedded in dist/index.js or dist/index.css.');
}
console.log('✓ single JavaScript bundle: dist/index.js');
console.log('✓ emoji sprite embedded with no emitted image assets');
