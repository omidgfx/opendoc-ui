import type {ThemeItem} from '@/src/types';

export const METHOD_ITEMS: Array<{
    label: string;
    key: keyof ThemeItem;
}> = [
    {label: 'GET', key: 'methodGet'},
    {label: 'POST', key: 'methodPost'},
    {label: 'PUT', key: 'methodPut'},
    {label: 'PATCH', key: 'methodPatch'},
    {label: 'DELETE', key: 'methodDelete'},
];
export const alpha = (color: string, opacity: string): string => /^#[0-9a-f]{6}$/i.test(color) ? `${color}${opacity}` : color;
