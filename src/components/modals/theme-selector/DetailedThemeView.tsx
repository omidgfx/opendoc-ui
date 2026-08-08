import {useState} from 'react';
import clsx from 'clsx';
import type {AppTheme, ThemeMode} from '../../../types';
import {THEME_LIST} from '../../../data/themes';
import MethodColorsPreview from './MethodColorsPreview';
import MiniPagePreview from './MiniPagePreview';
import ThemeIdentityPanel from './ThemeIdentityPanel';
import {alpha} from './themeSelectorUtils';

export default function DetailedThemeView({
                                              selectedTheme,
                                              selectedThemeName,
                                              currentThemeMode,
                                              resolvedThemeMode,
                                              onSelectTheme,
                                              onClose,
                                              mobileSidebarOpen,
                                              onCloseMobileSidebar
                                          }: {
    selectedTheme: AppTheme;
    selectedThemeName: string;
    currentThemeMode: ThemeMode;
    resolvedThemeMode: 'light' | 'dark';
    onSelectTheme: (themeName: string) => void;
    onClose: () => void;
    mobileSidebarOpen: boolean;
    onCloseMobileSidebar: () => void;
}) {
    return (
        <div className="flex h-full min-h-0 relative">
            {/* Mobile theme picker drawer */}
            {mobileSidebarOpen && (
                <>
                    <div className="absolute inset-0 z-40 bg-black/40 md:hidden"
                         onClick={onCloseMobileSidebar}/>
                    <aside
                        className="absolute left-0 top-0 bottom-0 z-50 w-[78vw] max-w-[280px] overflow-y-auto border-r p-3 md:hidden scrollbar-thin bg-[var(--background)] border-[var(--border)] animate-in slide-in-from-left duration-200">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                            <span
                                className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">All
                                themes · {THEME_LIST.length}</span>
                            <button onClick={onCloseMobileSidebar}
                                    className="size-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                                <i className="ph ph-x text-[14px]"/>
                            </button>
                        </div>
                        <div className="space-y-1">
                            {THEME_LIST.map((theme) => {
                                const selected = theme.name === selectedThemeName;
                                const palette = theme[resolvedThemeMode];
                                return (
                                    <button type="button" key={theme.name} onClick={() => {
                                        onSelectTheme(theme.name);
                                        onCloseMobileSidebar();
                                    }} aria-pressed={selected}
                                            className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer',
                                                selected ? 'font-semibold' : 'border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}
                                            style={{
                                                color: selected ? palette.primary : undefined,
                                                backgroundColor: selected ? alpha(palette.primary, '14') : undefined,
                                                borderColor: selected ? alpha(palette.primary, '55') : undefined
                                            }}>
                                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border"
                                              style={{borderColor: palette.border}}>
                                            <span className="absolute inset-y-0 left-0 w-1/2"
                                                  style={{backgroundColor: theme.light.surface}}/>
                                            <span className="absolute inset-y-0 right-0 w-1/2"
                                                  style={{backgroundColor: theme.dark.surface}}/>
                                            <span
                                                className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                                                style={{
                                                    backgroundColor: palette.primary,
                                                    borderColor: palette.surface
                                                }}/>
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-xs font-bold">{theme.name}</span>
                                        {selected && <i className="ph ph-check text-[11px]"/>}
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                </>
            )}

            <aside
                className="hidden md:block w-60 shrink-0 overflow-y-auto border-r p-3 scrollbar-thin bg-[var(--background)] border-[var(--border)]"
                aria-label="Themes">
                <div
                    className="px-2 pb-2 pt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">All
                    themes · {THEME_LIST.length}</div>
                <div className="space-y-1">
                    {THEME_LIST.map((theme) => {
                        const selected = theme.name === selectedThemeName;
                        const palette = theme[resolvedThemeMode];
                        return (
                            <button type="button" key={theme.name} onClick={() => onSelectTheme(theme.name)}
                                    aria-pressed={selected}
                                    className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer',
                                        selected ? 'font-semibold' : 'border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}
                                    style={{
                                        color: selected ? palette.primary : undefined,
                                        backgroundColor: selected ? alpha(palette.primary, '14') : undefined,
                                        borderColor: selected ? alpha(palette.primary, '55') : undefined
                                    }}>
                                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border"
                                      style={{borderColor: palette.border}}>
                                    <span className="absolute inset-y-0 left-0 w-1/2"
                                          style={{backgroundColor: theme.light.surface}}/>
                                    <span className="absolute inset-y-0 right-0 w-1/2"
                                          style={{backgroundColor: theme.dark.surface}}/>
                                    <span
                                        className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                                        style={{backgroundColor: palette.primary, borderColor: palette.surface}}/>
                                </span>
                                <span className="min-w-0 flex-1 truncate text-xs font-bold">{theme.name}</span>
                                {selected && <i className="ph ph-check text-[11px]"/>}
                            </button>
                        );
                    })}
                </div>
            </aside>

            <main className="modal-scroll-region min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 scrollbar-thin">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Selected
                                theme</p>
                            <h2 className="mt-1 text-base sm:text-lg font-extrabold truncate text-[var(--text-heading)]">{selectedTheme.name}</h2>
                        </div>
                    </div>
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold shrink-0"
                        style={{
                            color: selectedTheme[resolvedThemeMode].primary,
                            borderColor: alpha(selectedTheme[resolvedThemeMode].primary, '4d'),
                            backgroundColor: alpha(selectedTheme[resolvedThemeMode].primary, '12')
                        }}>
                        <span className="h-1.5 w-1.5 rounded-full"
                              style={{backgroundColor: selectedTheme[resolvedThemeMode].primary}}/>
                        Active
                        in {currentThemeMode === 'system' ? `system (${resolvedThemeMode})` : currentThemeMode} mode
                    </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                    <ThemeIdentityPanel theme={selectedTheme} mode={resolvedThemeMode}/>
                    <MethodColorsPreview palette={selectedTheme[resolvedThemeMode]} roomy/>
                    <MiniPagePreview palette={selectedTheme.light} mode="light" roomy/>
                    <MiniPagePreview palette={selectedTheme.dark} mode="dark" roomy/>
                </div>
            </main>
        </div>
    );
}
