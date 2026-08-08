import type {AppTheme} from '../../../types';
import {alpha} from './themeSelectorUtils';

export default function ThemeNamePreview({theme, mode}: { theme: AppTheme; mode: 'light' | 'dark' }) {
    const palette = theme[mode];
    return (
        <div className="relative h-full overflow-hidden rounded-lg border p-3"
             style={{
                 background: `linear-gradient(145deg, ${palette.surface}, ${palette.background})`,
                 borderColor: palette.border
             }}>
            <span className="absolute rounded-full"
                  style={{width: 54, height: 54, right: -12, top: -18, backgroundColor: alpha(palette.primary, '18')}}/>
            <span className="absolute rounded-full" style={{
                width: 30,
                height: 30,
                right: 22,
                bottom: -13,
                backgroundColor: alpha(palette.accent, '1f')
            }}/>
            <div className="relative flex h-full flex-col justify-between">
                <span className="text-[8px] font-bold uppercase tracking-widest"
                      style={{color: palette.textMuted}}>Theme</span>
                <div>
                    <div className="text-[13px] font-extrabold leading-tight"
                         style={{color: palette.primary}}>{theme.name}</div>
                    <div className="mt-1 flex items-center gap-1">
                        {[palette.primary, palette.accent, palette.textHeading].map((color) =>
                            <span key={color} className="h-1.5 w-5 rounded-full" style={{backgroundColor: color}}/>)}
                    </div>
                </div>
            </div>
        </div>
    );
}
