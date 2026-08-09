import {readdir} from 'node:fs/promises';

const files = await readdir(new URL('../dist', import.meta.url));
const javascript = files.filter(file => file.endsWith('.js'));
if (javascript.length !== 1 || javascript[0] !== 'index.js') {
    throw new Error(`Expected exactly one JavaScript bundle named index.js; found: ${javascript.join(', ') || 'none'}`);
}
console.log('✓ single JavaScript bundle: dist/index.js');
