/** Pick black vs white text for contrast against a hex color. */
export const getContrastColor = (hexColor: string): string => {
    const hex = hexColor.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
    const [r, g, b] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = [r, g, b].map(ch => (ch <= 0.03928 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4)));
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance > 0.40 ? '#111318' : '#ffffff';
};
