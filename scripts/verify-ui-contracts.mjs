import {readdir, readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import ts from 'typescript';

const root = new URL('../src/', import.meta.url);
const nativeSelects = [];
const nativeTooltips = [];

const inspectJsx = (file, text) => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName.getText(source);
            if (/^[a-z]/.test(tag)) {
                node.attributes.properties.forEach(attribute => {
                    if (!ts.isJsxAttribute(attribute) || attribute.name.getText(source) !== 'title') return;
                    const line = source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1;
                    nativeTooltips.push(`${file}:${line}`);
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
};

async function walk(url) {
    for (const entry of await readdir(url, {withFileTypes: true})) {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
        if (entry.isDirectory()) {
            await walk(child);
            continue;
        }
        if (!['.tsx', '.jsx'].includes(extname(entry.name))) continue;
        const text = await readFile(child, 'utf8');
        const file = join(child.pathname);
        if (text.includes('<select')) nativeSelects.push(file);
        inspectJsx(file, text);
    }
}
await walk(root);
if (nativeSelects.length)
    throw new Error(`Native <select> controls are not allowed; use CustomDropdown:\n${nativeSelects.join('\n')}`);
if (nativeTooltips.length)
    throw new Error(
        `Native title tooltips are not allowed; use the custom Tip component:\n${nativeTooltips.join('\n')}`,
    );
console.log('✓ UI select contract: all selects use custom dropdowns');
console.log('✓ UI tooltip contract: intrinsic elements use custom tooltips');
