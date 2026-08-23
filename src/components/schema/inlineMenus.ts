import type {CodeInlineMenu} from '../common/CodeViewer';
import type {collectSchemaOneOfChoices} from '../../utils/schema/branchChoices';
import {readSchemaBranchSelections, writeSchemaBranchSelection} from '../../utils/schema/branchSelections';

export const inlineMenusForCode = (
    code: string,
    selectionKey: string,
    choices: ReturnType<typeof collectSchemaOneOfChoices>,
): {code: string; menus: CodeInlineMenu[]} => {
    const selections = readSchemaBranchSelections(selectionKey);
    let nextCode = code;
    const menus = choices.map((choice, menuIndex) => {
        const tail =
            choice.path
                .split('.')
                .filter(Boolean)
                .at(-1)
                ?.replace(/\[[^\]]+\]/g, '')
                .replace(/\*/g, '') || choice.path;
        const escapedTail = tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const token = `__ODUI_MENU_${menuIndex}__`;
        const replacements = [
            {
                pattern: new RegExp(`(["'])(${escapedTail})(\\1)(\\s*:)`),
                replace: (_: string, q1: string, key: string, q2: string, suffix: string) =>
                    `${q1}${key}${q2} ${token}${suffix}`,
                tone: 'string' as const,
            },
            {
                pattern: new RegExp(`^(\\s*)(${escapedTail})(\\s*:)`, 'm'),
                replace: (_: string, indent: string, key: string, suffix: string) =>
                    `${indent}${key} ${token}${suffix}`,
                tone: 'property' as const,
            },
            {
                pattern: new RegExp(`<(\/?${escapedTail})(?=[>\\s])`),
                replace: (_: string, tag: string) => `<${tag} ${token}`,
                tone: 'xml' as const,
            },
        ];
        let tone: CodeInlineMenu['tone'] = 'default';
        let inserted = false;
        for (const replacement of replacements) {
            const updated = nextCode.replace(replacement.pattern, (...args: any[]) => {
                if (inserted) return args[0];
                inserted = true;
                tone = replacement.tone;
                return (replacement.replace as any)(...args);
            });
            nextCode = updated;
            if (inserted) break;
        }
        return {
            id: `${selectionKey}:${choice.path}`,
            line: 1,
            token,
            tone,
            activeIndex: selections[choice.path] ?? 0,
            options: choice.options,
            onSelect: index => writeSchemaBranchSelection(selectionKey, choice.path, index),
            ariaLabel: `Select ${choice.title} schema`,
        };
    });
    return {code: nextCode, menus};
};
