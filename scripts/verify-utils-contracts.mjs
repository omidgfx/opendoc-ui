import {readdir, readFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Enforces the utils contract: modules below src/utils implement logic and must
 * stay clear of the presentation layer. They may not import components, and
 * they may not import React except in the allowlisted presentation-typing
 * module (themeCss returns React.CSSProperties).
 */
const repoRootPath = fileURLToPath(new URL('../', import.meta.url));
const utilsRootUrl = new URL('../src/utils/', import.meta.url);
const utilsRootPath = fileURLToPath(utilsRootUrl);
const reactAllowlist = new Set(['theme/themeCss.ts']);
const reactSpecifiers = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']);

const specifierPattern = /(?:from|import\s*\(?\s*|require\s*\()\s*['"]([^'"]+)['"]/g;
const violations = [];

const resolveRepoRelative = (file, specifier) => {
    if (specifier.startsWith('@/')) return normalize(join(repoRootPath, specifier.slice(2))).replace(/\\/g, '/');
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
    const dir = join(utilsRootPath, dirname(file));
    return normalize(join(dir, specifier)).replace(/\\/g, '/');
};

async function walk(url, prefix) {
    for (const entry of await readdir(url, {withFileTypes: true})) {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
        if (entry.isDirectory()) {
            await walk(child, `${prefix}${entry.name}/`);
            continue;
        }
        if (!['.ts', '.tsx'].includes(extname(entry.name))) continue;
        const text = await readFile(child, 'utf8');
        const file = `${prefix}${entry.name}`;
        text.split('\n').forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
            for (const match of line.matchAll(specifierPattern)) {
                const specifier = match[1];
                if (reactSpecifiers.has(specifier) && !reactAllowlist.has(file)) {
                    violations.push(
                        `${file}:${index + 1}: imports React ('${specifier}') — src/utils must stay below the presentation layer`,
                    );
                }
                const target = resolveRepoRelative(file, specifier);
                if (target && target.startsWith(`${repoRootPath}src/components/`)) {
                    violations.push(
                        `${file}:${index + 1}: imports component module '${specifier}' — src/utils must stay below the presentation layer`,
                    );
                }
            }
        });
    }
}

await walk(utilsRootUrl, '');
if (violations.length) throw new Error(`src/utils contract violations:\n${violations.join('\n')}`);
console.log('✓ utils contract: no src/utils module imports components');
console.log('✓ utils contract: no React imports outside the themeCss allowlist');
