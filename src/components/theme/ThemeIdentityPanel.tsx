import {useEffect, useState} from 'react';
import type {AppTheme} from '../../types';
import {alpha} from '@/src/utils/theme/selector';
import {Tip} from '@/src/components/common/Tooltip';

export default function ThemeIdentityPanel({theme, mode}: {theme: AppTheme; mode: 'light' | 'dark'}) {
    const palette = theme[mode];
    const [copied, setCopied] = useState(false);
    const colors = [
        {label: 'Primary', value: palette.primary},
        {label: 'Accent', value: palette.accent},
        {label: 'Surface', value: palette.surface},
        {label: 'Border', value: palette.border},
    ];

    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 1600);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const copyTag = async () => {
        try {
            await navigator.clipboard.writeText(theme.id);
            setCopied(true);
        } catch {
            /* ignore */
        }
    };

    return (
        <div
            className="relative min-h-[168px] overflow-hidden rounded-2xl border p-4 sm:p-5"
            style={{
                background: `linear-gradient(145deg, ${palette.surface}, ${palette.background})`,
                borderColor: palette.border,
                color: palette.text,
            }}
        >
            <div
                className="absolute rounded-full"
                style={{
                    width: 150,
                    height: 150,
                    right: -48,
                    top: -70,
                    backgroundColor: alpha(palette.primary, '1c'),
                }}
            />
            <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{color: palette.textMuted}}>
                Active theme · {mode}
            </p>
            <div className="relative mt-2 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-2xl font-black tracking-tight" style={{color: palette.primary}}>
                        {theme.name}
                    </h3>
                    <p className="mt-1 text-[11px]" style={{color: palette.textMuted}}>
                        Current palette for this documentation.
                    </p>
                </div>
                <Tip content={copied ? 'Copied!' : 'Copy theme tag'} placement="top">
                    <button
                        type="button"
                        onClick={copyTag}
                        className="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
                        style={{
                            backgroundColor: alpha(palette.background, 'd0'),
                            borderColor: copied ? palette.methodGet : palette.border,
                            color: copied ? palette.methodGet : palette.textHeading,
                        }}
                        aria-label={`Copy theme tag ${theme.id}`}
                    >
                        <i className={`ph ${copied ? 'ph-check' : 'ph-copy-simple'} text-[13px]`} />
                        {theme.id}
                    </button>
                </Tip>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {colors.map(color => (
                    <div
                        key={color.label}
                        className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                        style={{
                            backgroundColor: alpha(palette.background, 'b8'),
                            borderColor: palette.border,
                        }}
                    >
                        <span
                            className="h-5 w-5 shrink-0 rounded-md shadow-sm"
                            style={{backgroundColor: color.value}}
                        />
                        <span className="min-w-0">
                            <span
                                className="block text-[8px] font-bold uppercase tracking-wide"
                                style={{color: palette.textMuted}}
                            >
                                {color.label}
                            </span>
                            <span className="block truncate font-mono text-[9px]" style={{color: palette.textHeading}}>
                                {color.value.toUpperCase()}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
