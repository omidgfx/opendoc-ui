import {copyFile} from 'node:fs/promises';

await copyFile(new URL('../dist/index.html', import.meta.url), new URL('../dist/404.html', import.meta.url));
console.log('✓ clean-route SPA fallback: dist/404.html');
