import {readdir, readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';

const root = new URL('../src/', import.meta.url);
const nativeSelects = [];
async function walk(url) {
    for (const entry of await readdir(url, {withFileTypes: true})) {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
        if (entry.isDirectory()) {
            await walk(child);
            continue;
        }
        if (!['.tsx', '.jsx'].includes(extname(entry.name))) continue;
        const text = await readFile(child, 'utf8');
        if (text.includes('<select')) nativeSelects.push(join(child.pathname));
    }
}
await walk(root);
if (nativeSelects.length)
    throw new Error(`Native <select> controls are not allowed; use CustomDropdown:\n${nativeSelects.join('\n')}`);
console.log('✓ UI select contract: all selects use custom dropdowns');
