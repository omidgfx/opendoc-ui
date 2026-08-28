import type {ThemeItem} from '../../types';
import {alpha, METHOD_ITEMS} from '@/src/utils/theme/selector';

export default function MethodColorsPreview({
    palette,
    roomy = false,
    compact = false,
}: {
    palette: ThemeItem;
    roomy?: boolean;
    compact?: boolean;
}) {
    if (compact) {
        return (
            <div className="flex flex-wrap gap-1 rounded-lg px-0.5 py-0.5">
                {METHOD_ITEMS.map(method => {
                    const color = palette[method.key];
                    return (
                        <span
                            key={method.label}
                            className="inline-flex items-center justify-center rounded font-black tracking-wide"
                            style={{
                                padding: '2px 4px',
                                fontSize: 5.5,
                                color,
                                backgroundColor: alpha(color, '18'),
                            }}
                        >
                            {method.label}
                        </span>
                    );
                })}
            </div>
        );
    }

    return (
        <div
            className="h-full overflow-hidden rounded-lg border"
            style={{padding: roomy ? 16 : 10, backgroundColor: palette.surface, borderColor: palette.border}}
        >
            <div className="flex items-center justify-between">
                <span
                    className="font-bold uppercase tracking-widest"
                    style={{fontSize: roomy ? 9 : 6.5, color: palette.textMuted}}
                >
                    Methods
                </span>
                <span className="rounded-full" style={{width: 6, height: 6, backgroundColor: palette.accent}} />
            </div>
            <div className={roomy ? 'mt-5 grid grid-cols-2 gap-2.5' : 'mt-2.5 flex flex-wrap gap-1.5'}>
                {METHOD_ITEMS.map(method => {
                    const color = palette[method.key];
                    return (
                        <span
                            key={method.label}
                            className="inline-flex items-center justify-center rounded-md border font-black tracking-wide"
                            style={{
                                minWidth: roomy ? 74 : undefined,
                                padding: roomy ? '7px 9px' : '3px 5px',
                                fontSize: roomy ? 9 : 5.5,
                                color,
                                borderColor: alpha(color, '48'),
                                backgroundColor: alpha(color, '16'),
                            }}
                        >
                            {method.label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
