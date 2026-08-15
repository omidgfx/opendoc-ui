import emojiData from 'emoji-datasource-apple/emoji.json';

// emoji-datasource-apple v16 packs 20 px glyphs into 22 px cells with a one-pixel gutter.
const SPRITE_EMOJI_SIZE = 20;
const SPRITE_CELL_SIZE = 22;
const DISPLAY_SIZE_EM = 1.12;
const SHORTCODE_PATTERN = ':[a-zA-Z0-9_+\\-]+:';

interface EmojiSpriteRecord {
    unified: string;
    non_qualified?: string | null;
    sheet_x: number;
    sheet_y: number;
    short_name?: string;
    short_names?: string[];
    has_img_apple?: boolean;
    skin_variations?: Record<string, EmojiSpriteRecord>;
}

interface EmojiSprite {
    native: string;
    sheetX: number;
    sheetY: number;
}

const nativeEmojiSprites = new Map<string, EmojiSprite>();
const shortcodeEmojiSprites = new Map<string, EmojiSprite>();

const nativeFromUnified = (unified: string): string =>
    String.fromCodePoint(...unified.split('-').map(codepoint => Number.parseInt(codepoint, 16)));

const registerNative = (record: EmojiSpriteRecord): EmojiSprite | null => {
    if (
        record.has_img_apple === false ||
        !record.unified ||
        !Number.isFinite(record.sheet_x) ||
        !Number.isFinite(record.sheet_y)
    ) {
        return null;
    }
    const native = nativeFromUnified(record.unified);
    const sprite = {native, sheetX: record.sheet_x, sheetY: record.sheet_y};
    nativeEmojiSprites.set(native, sprite);
    if (record.non_qualified) nativeEmojiSprites.set(nativeFromUnified(record.non_qualified), sprite);
    return sprite;
};

for (const entry of emojiData as EmojiSpriteRecord[]) {
    const sprite = registerNative(entry);
    if (sprite) {
        const shortcodes = new Set([entry.short_name, ...(entry.short_names || [])].filter(Boolean) as string[]);
        shortcodes.forEach(shortcode => shortcodeEmojiSprites.set(shortcode.toLowerCase(), sprite));
    }
    Object.values(entry.skin_variations || {}).forEach(registerNative);
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nativeEmojiPattern = [...nativeEmojiSprites.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
const emojiTokenPattern = new RegExp(`(${nativeEmojiPattern}|${SHORTCODE_PATTERN})`, 'gu');

const spriteForToken = (token: string): EmojiSprite | undefined => {
    if (token.startsWith(':') && token.endsWith(':')) {
        return shortcodeEmojiSprites.get(token.slice(1, -1).toLowerCase());
    }
    return nativeEmojiSprites.get(token);
};

const escapeHtmlAttribute = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const spriteOffset = (coordinate: number): string => {
    const offset = -(((coordinate * SPRITE_CELL_SIZE + 1) / SPRITE_EMOJI_SIZE) * DISPLAY_SIZE_EM);
    return `${Number(offset.toFixed(4))}em`;
};

const spriteStyle = (sprite: EmojiSprite): string =>
    `--emoji-sheet-left:${spriteOffset(sprite.sheetX)};--emoji-sheet-top:${spriteOffset(sprite.sheetY)}`;

const emojiSpriteHtml = (sprite: EmojiSprite, label: string): string =>
    `<span class="emoji" role="img" aria-label="${escapeHtmlAttribute(label)}" data-apple-emoji="true" style="${spriteStyle(sprite)}"></span>`;

export function parseEmojis(text: string): string {
    if (!text) return '';
    emojiTokenPattern.lastIndex = 0;
    return text.replace(emojiTokenPattern, token => {
        const sprite = spriteForToken(token);
        return sprite ? emojiSpriteHtml(sprite, token) : token;
    });
}

/** Replace supported emoji text nodes without changing code/preformatted content. */
export function applyAppleEmojiImages(root: ParentNode): void {
    const documentNode = root instanceof Document ? root : root.ownerDocument;
    if (!documentNode || !nativeEmojiPattern) return;
    const walker = documentNode.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
        const parent = current.parentElement;
        if (
            current.nodeValue &&
            parent &&
            !parent.closest('code, pre, script, style, textarea, [data-native-emoji], [data-apple-emoji]')
        ) {
            emojiTokenPattern.lastIndex = 0;
            if (emojiTokenPattern.test(current.nodeValue)) textNodes.push(current as Text);
        }
        current = walker.nextNode();
    }

    textNodes.forEach(textNode => {
        const text = textNode.nodeValue || '';
        const fragment = documentNode.createDocumentFragment();
        let offset = 0;
        emojiTokenPattern.lastIndex = 0;
        for (const match of text.matchAll(emojiTokenPattern)) {
            const token = match[0];
            const index = match.index || 0;
            const sprite = spriteForToken(token);
            if (!sprite) continue;
            if (index > offset) fragment.append(documentNode.createTextNode(text.slice(offset, index)));
            const image = documentNode.createElement('span');
            image.className = 'emoji';
            image.setAttribute('role', 'img');
            image.setAttribute('aria-label', token);
            image.dataset.appleEmoji = 'true';
            image.style.setProperty('--emoji-sheet-left', spriteOffset(sprite.sheetX));
            image.style.setProperty('--emoji-sheet-top', spriteOffset(sprite.sheetY));
            fragment.append(image);
            offset = index + token.length;
        }
        if (offset < text.length) fragment.append(documentNode.createTextNode(text.slice(offset)));
        textNode.replaceWith(fragment);
    });
}
