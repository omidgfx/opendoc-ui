import type {CodeInlineMenu} from '../common/CodeViewer';
import type {SchemaBranchChoice} from '../../utils/schema/branchChoices';
import {
    readSchemaAllOfFocus,
    readSchemaAnyOfSelections,
    readSchemaBranchSelections,
    toggleSchemaAnyOfSelection,
    writeSchemaAllOfFocus,
    writeSchemaAnyOfSelection,
    writeSchemaBranchSelection,
} from '../../utils/schema/branchSelections';
import {fieldNameFromSchemaPath, findFieldBySchemaPath} from '../../utils/schema/codeSyntax';

/**
 * Build oneOf + anyOf + allOf + not inline menus for a generated example. Locates
 * each choice through its **full schema path** so nested fields that share a leaf
 * name (e.g. venue.cover_photo vs venue.vendor.cover_photo) bind correctly across
 * JSON, YAML, XML, language literals, etc. Source text is left untouched —
 * the viewer paints the caret handle on top of the field span.
 *
 * oneOf: selecting a branch collapses the field schema (mock + table update).
 * anyOf: multi-select merge (All / individual branches), same as body anyOf rail.
 * allOf: selecting a part only focuses/dims sibling fields; composition stays
 * fully applied (same semantics as the body-level allOf rail). Single-part allOf
 * is inspection-only (no Combined control).
 * not: inspection-only (shows the negated schema; no selection change).
 */
export const inlineMenusForCode = (
    code: string,
    selectionKey: string,
    choices: SchemaBranchChoice[],
    encodingOrLanguage = 'json',
): {code: string; menus: CodeInlineMenu[]} => {
    const oneOfSelections = readSchemaBranchSelections(selectionKey);
    const allOfFocus = readSchemaAllOfFocus(selectionKey);
    const anyOfSelections = readSchemaAnyOfSelections(selectionKey);
    const source = String(code ?? '');
    const menus: CodeInlineMenu[] = [];

    choices.forEach(choice => {
        const fieldName = fieldNameFromSchemaPath(choice.path);
        if (!fieldName) return;
        // Prefer full path so sibling keys with the same leaf name resolve correctly.
        const hit = findFieldBySchemaPath(source, choice.path, encodingOrLanguage);
        if (!hit) return;
        const kind = choice.kind || 'oneOf';
        if (kind === 'allOf') {
            const branchCount = choice.options.filter(option => option.index >= 0).length;
            const singlePart = branchCount <= 1;
            const focus = allOfFocus[choice.path];
            menus.push({
                id: `${selectionKey}:allOf:${choice.path}`,
                kind: 'allOf',
                line: hit.line,
                column: hit.startColumn,
                endColumn: hit.endColumn,
                fieldName: hit.fieldName,
                tone: encodingOrLanguage.toLowerCase().includes('xml')
                    ? 'xml'
                    : encodingOrLanguage.toLowerCase().includes('yaml') || encodingOrLanguage.toLowerCase() === 'yml'
                      ? 'property'
                      : 'string',
                // -1 = Combined (matches option index for the Combined entry).
                // Single-part allOf has no Combined — keep the only branch active.
                activeIndex: singlePart ? 0 : focus === null || focus === undefined ? -1 : focus,
                options: choice.options,
                onSelect: index => {
                    if (singlePart) return;
                    writeSchemaAllOfFocus(selectionKey, choice.path, index < 0 ? null : index);
                },
                ariaLabel: singlePart
                    ? `allOf for ${choice.title || fieldName} (single composed schema)`
                    : `Focus allOf part for ${choice.title || fieldName}`,
            });
            return;
        }
        if (kind === 'anyOf') {
            const selected = anyOfSelections[choice.path];
            const branchCount = choice.options.filter(option => option.index >= 0).length;
            const allSelected = !selected || selected.length === 0;
            menus.push({
                id: `${selectionKey}:anyOf:${choice.path}`,
                kind: 'anyOf',
                line: hit.line,
                column: hit.startColumn,
                endColumn: hit.endColumn,
                fieldName: hit.fieldName,
                tone: encodingOrLanguage.toLowerCase().includes('xml')
                    ? 'xml'
                    : encodingOrLanguage.toLowerCase().includes('yaml') || encodingOrLanguage.toLowerCase() === 'yml'
                      ? 'property'
                      : 'string',
                // Multi-select: activeIndices drives checkboxes; activeIndex unused.
                activeIndex: allSelected ? -1 : (selected[0] ?? 0),
                activeIndices: allSelected ? choice.options.filter(o => o.index >= 0).map(o => o.index) : selected,
                multiSelect: true,
                options: choice.options,
                onSelect: index => {
                    if (index < 0) {
                        writeSchemaAnyOfSelection(selectionKey, choice.path, []);
                        return;
                    }
                    toggleSchemaAnyOfSelection(selectionKey, choice.path, index, branchCount);
                },
                ariaLabel: `Select anyOf branches for ${choice.title || fieldName}`,
            });
            return;
        }
        if (kind === 'not') {
            menus.push({
                id: `${selectionKey}:not:${choice.path}`,
                kind: 'not',
                line: hit.line,
                column: hit.startColumn,
                endColumn: hit.endColumn,
                fieldName: hit.fieldName,
                tone: encodingOrLanguage.toLowerCase().includes('xml')
                    ? 'xml'
                    : encodingOrLanguage.toLowerCase().includes('yaml') || encodingOrLanguage.toLowerCase() === 'yml'
                      ? 'property'
                      : 'string',
                activeIndex: 0,
                options: choice.options,
                // Inspection only — clicking does not change selection state.
                onSelect: () => undefined,
                ariaLabel: `Negated schema for ${choice.title || fieldName}`,
            });
            return;
        }
        menus.push({
            id: `${selectionKey}:oneOf:${choice.path}`,
            kind: 'oneOf',
            line: hit.line,
            column: hit.startColumn,
            endColumn: hit.endColumn,
            fieldName: hit.fieldName,
            tone: encodingOrLanguage.toLowerCase().includes('xml')
                ? 'xml'
                : encodingOrLanguage.toLowerCase().includes('yaml') || encodingOrLanguage.toLowerCase() === 'yml'
                  ? 'property'
                  : 'string',
            activeIndex: oneOfSelections[choice.path] ?? 0,
            options: choice.options,
            onSelect: index => writeSchemaBranchSelection(selectionKey, choice.path, index),
            ariaLabel: `Select oneOf schema for ${choice.title || fieldName}`,
        });
    });

    return {code: source, menus};
};
