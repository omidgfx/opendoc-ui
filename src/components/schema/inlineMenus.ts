import type {CodeInlineMenu} from '../common/CodeViewer';
import type {collectSchemaOneOfChoices} from '../../utils/schema/branchChoices';
import {readSchemaBranchSelections, writeSchemaBranchSelection} from '../../utils/schema/branchSelections';
import {codeSyntaxAdapterOf, fieldNameFromSchemaPath} from '../../utils/schema/codeSyntax';

/**
 * Build oneOf inline menus for a generated example. Locates each choice’s
 * field name through a format adapter so the same path works across JSON,
 * YAML, XML, language literals, etc. Source text is left untouched — the
 * viewer paints the caret handle on top of the field span.
 */
export const inlineMenusForCode = (
    code: string,
    selectionKey: string,
    choices: ReturnType<typeof collectSchemaOneOfChoices>,
    encodingOrLanguage = 'json',
): {code: string; menus: CodeInlineMenu[]} => {
    const selections = readSchemaBranchSelections(selectionKey);
    const adapter = codeSyntaxAdapterOf(encodingOrLanguage);
    const source = String(code ?? '');
    const menus: CodeInlineMenu[] = [];

    choices.forEach(choice => {
        const fieldName = fieldNameFromSchemaPath(choice.path);
        if (!fieldName) return;
        const hit = adapter.findField(source, fieldName);
        if (!hit) return;
        menus.push({
            id: `${selectionKey}:${choice.path}`,
            line: hit.line,
            column: hit.startColumn,
            endColumn: hit.endColumn,
            fieldName: hit.fieldName,
            tone: adapter.id === 'xml' ? 'xml' : adapter.id === 'yaml' ? 'property' : 'string',
            activeIndex: selections[choice.path] ?? 0,
            options: choice.options,
            onSelect: index => writeSchemaBranchSelection(selectionKey, choice.path, index),
            ariaLabel: `Select ${choice.title || fieldName} schema`,
        });
    });

    return {code: source, menus};
};
