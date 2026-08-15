import type {CustomDropdownOption} from '../types/ui';

export const enumValueText = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

const tableCells = (line: string): string[] => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
};

const tableDivider = (line: string): boolean =>
    tableCells(line).every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));

const descriptionsFromMarkdownTable = (description: string): Map<string, string> => {
    const result = new Map<string, string>();
    const lines = description.split(/\r?\n/);
    for (let index = 0; index < lines.length - 2; index += 1) {
        const headers = tableCells(lines[index]);
        if (!tableDivider(lines[index + 1])) continue;
        const normalized = headers.map(header => header.toLowerCase().replace(/[*_`]/g, '').trim());
        const valueIndex = normalized.findIndex(header => ['value', 'enum', 'code'].includes(header));
        if (valueIndex < 0) continue;
        const detailIndexes = normalized
            .map((header, headerIndex) => ({header, headerIndex}))
            .filter(
                item =>
                    item.headerIndex !== valueIndex &&
                    ['case', 'label', 'name', 'description', 'meaning'].includes(item.header),
            );
        if (detailIndexes.length === 0) continue;
        for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
            if (!lines[rowIndex].trim().includes('|')) break;
            const cells = tableCells(lines[rowIndex]);
            const value = cells[valueIndex]?.replace(/^`|`$/g, '').trim();
            if (!value) continue;
            const detail = detailIndexes
                .map(({header, headerIndex}) => {
                    const cell = cells[headerIndex]?.replace(/^`|`$/g, '').trim();
                    if (!cell) return '';
                    return detailIndexes.length > 1 ? `${header}: ${cell}` : cell;
                })
                .filter(Boolean)
                .join(' · ');
            if (detail) result.set(value, detail);
        }
        index += 1;
    }
    return result;
};

const descriptionsFromAlternatives = (schema: any): Map<string, string> => {
    const result = new Map<string, string>();
    const alternatives = Array.isArray(schema?.oneOf) ? schema.oneOf : Array.isArray(schema?.anyOf) ? schema.anyOf : [];
    alternatives.forEach((alternative: any) => {
        const value = alternative?.const ?? (Array.isArray(alternative?.enum) ? alternative.enum[0] : undefined);
        if (value === undefined) return;
        const detail = String(alternative.title || alternative.description || '').trim();
        if (detail) result.set(enumValueText(value), detail);
    });
    return result;
};

export const enumValueDescriptions = (schema: any): Map<string, string> => {
    const result = descriptionsFromAlternatives(schema);
    if (typeof schema?.description === 'string') {
        descriptionsFromMarkdownTable(schema.description).forEach((description, value) => {
            if (!result.has(value)) result.set(value, description);
        });
    }
    return result;
};

export const enumDropdownOptions = (
    values: unknown[],
    schema: any,
    valueFor: (value: unknown, index: number) => string = (_value, index) => String(index),
): CustomDropdownOption[] => {
    const descriptions = enumValueDescriptions(schema);
    return values.map((value, index) => ({
        value: valueFor(value, index),
        label: enumValueText(value),
        description: descriptions.get(enumValueText(value)),
    }));
};
