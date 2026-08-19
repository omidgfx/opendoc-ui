import type {ThemeItem} from '../../types';
import {alpha} from '@/src/utils/theme/selector';

export default function MiniPagePreview({
    palette,
    mode,
    roomy = false,
}: {
    palette: ThemeItem;
    mode: 'light' | 'dark';
    roomy?: boolean;
}) {
    return (
        <div
            className="h-full w-full overflow-hidden rounded-lg border"
            style={{
                backgroundColor: palette.background,
                borderColor: palette.border,
                color: palette.text,
                minHeight: roomy ? 190 : 92,
            }}
        >
            <div
                className="flex items-center justify-between border-b"
                style={{
                    height: roomy ? 32 : 20,
                    padding: roomy ? '0 10px' : '0 6px',
                    backgroundColor: palette.navbar,
                    borderColor: palette.border,
                }}
            >
                <div className="flex items-center gap-1.5">
                    <span
                        className="rounded-full"
                        style={{width: roomy ? 7 : 4, height: roomy ? 7 : 4, backgroundColor: palette.primary}}
                    />
                    <span
                        className="rounded-full"
                        style={{
                            width: roomy ? 26 : 15,
                            height: roomy ? 4 : 3,
                            backgroundColor: palette.textHeading,
                        }}
                    />
                </div>
                <span
                    className="font-bold uppercase tracking-widest"
                    style={{fontSize: roomy ? 8 : 5.5, color: palette.textMuted}}
                >
                    {mode}
                </span>
            </div>
            <div className="flex" style={{height: `calc(100% - ${roomy ? 32 : 20}px)`}}>
                <div
                    className="shrink-0 border-r"
                    style={{
                        width: roomy ? '25%' : '27%',
                        padding: roomy ? '12px 8px' : '7px 4px',
                        backgroundColor: palette.sidebar,
                        borderColor: palette.border,
                    }}
                >
                    {[1, 0.72, 0.84, 0.6].map((width, index) => (
                        <div
                            key={index}
                            className="rounded-full"
                            style={{
                                width: `${width * 100}%`,
                                height: roomy ? 5 : 3,
                                marginBottom: roomy ? 9 : 5,
                                backgroundColor: index === 0 ? palette.primary : palette.sidebarText,
                                opacity: index === 0 ? 0.95 : 0.34,
                            }}
                        />
                    ))}
                </div>
                <div className="flex-1" style={{padding: roomy ? 12 : 6}}>
                    <div className="flex items-center justify-between" style={{marginBottom: roomy ? 11 : 5}}>
                        <div
                            className="rounded-full"
                            style={{
                                width: '42%',
                                height: roomy ? 6 : 3,
                                backgroundColor: palette.textHeading,
                                opacity: 0.8,
                            }}
                        />
                        <div
                            className="rounded-full"
                            style={{
                                width: roomy ? 34 : 20,
                                height: roomy ? 12 : 7,
                                backgroundColor: palette.primary,
                            }}
                        />
                    </div>
                    <div
                        className="rounded border"
                        style={{
                            padding: roomy ? 9 : 5,
                            backgroundColor: palette.surface,
                            borderColor: palette.border,
                        }}
                    >
                        <div className="flex items-center gap-1.5" style={{marginBottom: roomy ? 10 : 5}}>
                            <span
                                className="rounded font-black"
                                style={{
                                    padding: roomy ? '2px 5px' : '1px 3px',
                                    backgroundColor: alpha(palette.methodGet, '20'),
                                    color: palette.methodGet,
                                    fontSize: roomy ? 7 : 4.5,
                                }}
                            >
                                GET
                            </span>
                            <span
                                className="rounded-full"
                                style={{
                                    width: '47%',
                                    height: roomy ? 5 : 3,
                                    backgroundColor: palette.text,
                                    opacity: 0.45,
                                }}
                            />
                        </div>
                        <div
                            className="rounded"
                            style={{
                                height: roomy ? 35 : 17,
                                backgroundColor: palette.surfaceHover,
                                padding: roomy ? 7 : 4,
                            }}
                        >
                            <div
                                className="rounded-full"
                                style={{
                                    width: '72%',
                                    height: roomy ? 4 : 2,
                                    backgroundColor: palette.textMuted,
                                    opacity: 0.5,
                                }}
                            />
                            <div
                                className="rounded-full"
                                style={{
                                    width: '45%',
                                    height: roomy ? 4 : 2,
                                    marginTop: roomy ? 7 : 4,
                                    backgroundColor: palette.accent,
                                    opacity: 0.72,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
