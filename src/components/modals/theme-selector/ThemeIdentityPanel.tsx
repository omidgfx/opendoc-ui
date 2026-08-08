import type {AppTheme} from '../../../types';
import {alpha} from './themeSelectorUtils';

export default function ThemeIdentityPanel({theme, mode}: { theme: AppTheme; mode: 'light' | 'dark' }) {
    const palette = theme[mode];
    const colors = [
        {label: 'Primary', value: palette.primary},
        {label: 'Accent', value: palette.accent},
        {label: 'Surface', value: palette.surface},
        {label: 'Border', value: palette.border},
    ];
    return (
        <div className="relative min-h-[190px] overflow-hidden rounded-2xl border p-4 sm:p-5"
             style={{
                 background: `linear-gradient(145deg, ${palette.surface}, ${palette.background})`,
                 borderColor: palette.border,
                 color: palette.text
             }}>
            <div className="absolute rounded-full" style={{
                width: 150,
                height: 150,
                right: -48,
                top: -70,
                backgroundColor: alpha(palette.primary, '1c')
            }}/>
            <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{color: palette.textMuted}}>Theme
                identity · {mode}</p>
            <h3 className="relative mt-3 text-2xl font-black tracking-tight"
                style={{color: palette.primary}}>{theme.name}</h3>
            <p className="relative mt-1 text-[11px]" style={{color: palette.textMuted}}>Core colors at a glance</p>
            <div className="relative mt-5 grid grid-cols-2 gap-2">
                {colors.map((color) =>
                    <div key={color.label} className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                         style={{backgroundColor: alpha(palette.background, 'b8'), borderColor: palette.border}}>
                        <span className="h-5 w-5 shrink-0 rounded-md shadow-sm" style={{backgroundColor: color.value}}/>
                        <span className="min-w-0">
                            <span className="block text-[8px] font-bold uppercase tracking-wide"
                                  style={{color: palette.textMuted}}>{color.label}</span>
                            <span className="block truncate font-mono text-[9px]"
                                  style={{color: palette.textHeading}}>{color.value.toUpperCase()}</span>
                        </span>
                    </div>)}
            </div>
        </div>
    );
}
