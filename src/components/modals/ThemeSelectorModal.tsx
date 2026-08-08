import React, {useEffect, useMemo, useState} from 'react';
import {AppTheme, ThemeItem, ThemeMode} from '../../types';
import {THEME_LIST} from '../../data/themes';
import clsx from 'clsx';
import {Tip} from '../common/Tooltip';

type ThemeSelectorView = 'gallery' | 'detail';

type ThemeSelectorModalProps = {
    isOpen: boolean;
    selectedThemeName: string;
    currentThemeMode: ThemeMode;
    resolvedThemeMode: 'light' | 'dark';
    onSelectTheme: (themeName: string) => void;
    onToggleThemeMode: () => void;
    onSetThemeMode: (mode: ThemeMode) => void;
    onClose: () => void;
};

import DetailedThemeView from './theme-selector/DetailedThemeView';
import ThemePreviewCard from './theme-selector/ThemePreviewCard';
import {alpha} from './theme-selector/themeSelectorUtils';

export default function ThemeSelectorModal({
                                               isOpen,
                                               selectedThemeName,
                                               currentThemeMode,
                                               resolvedThemeMode,
                                               onSelectTheme,
                                               onClose,
                                               onToggleThemeMode,
                                               onSetThemeMode
                                           }: ThemeSelectorModalProps) {
    const [view, setView] = useState<ThemeSelectorView>('gallery');

    const selectedTheme = useMemo(() => THEME_LIST.find((theme) => theme.name === selectedThemeName) || THEME_LIST[0], [selectedThemeName]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-2 sm:p-3 md:p-6 animate-fade-in"
             style={{backgroundColor: 'rgba(7, 10, 18, .64)', backdropFilter: 'blur(6px)'}}
             onMouseDown={(event) => {
                 if (event.target === event.currentTarget) onClose();
             }}>

            <section role="dialog" aria-modal="true" aria-labelledby="theme-selector-title"
                     className="flex h-[92vh] sm:h-[86vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border shadow-2xl animate-zoom-in bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">

                <header
                    className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4 sm:py-3 md:px-5 modal-header-mobile-pad bg-[var(--background)] border-[var(--border)]">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <span
                            className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border text-[16px] sm:text-[18px]"
                            style={{
                                color: selectedTheme[resolvedThemeMode].primary,
                                backgroundColor: alpha(selectedTheme[resolvedThemeMode].primary, '14'),
                                borderColor: alpha(selectedTheme[resolvedThemeMode].primary, '3d')
                            }}>
                            <i className="ph-fill ph-palette"/>
                        </span>
                        <div className="min-w-0">
                            <h2 id="theme-selector-title"
                                className="truncate text-sm font-extrabold tracking-tight text-[var(--text-heading)]">Choose
                                your theme</h2>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)] hidden sm:block">Preview
                                every palette in light and dark before choosing</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <Tip content={`Switch to ${view === 'gallery' ? 'focus' : 'gallery'} view`}>
                            <button type="button"
                                    onClick={() => setView((current) => current === 'gallery' ? 'detail' : 'gallery')}
                                    className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border px-2 sm:px-3 text-[10px] font-bold transition-all cursor-pointer hover:bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-heading)] bg-[var(--surface)]">
                                <i className={`ph ${view === 'gallery' ? 'ph-sidebar' : 'ph-squares-four'} text-[14px]`}/>
                                <span className="hidden sm:inline">View</span>
                                <span
                                    className="rounded-md px-1.5 py-0.5 uppercase tracking-wider bg-[var(--surface-hover)] text-[var(--text-muted)]"
                                    style={{fontSize: 8}}>
                                    {view === 'gallery' ? 'Gallery' : 'Focus'}
                                </span>
                            </button>
                        </Tip>

                        <div
                            className="flex p-0.5 gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--background)]">
                            {([
                                ['system', 'ph ph-monitor', `Follow system (${resolvedThemeMode})`],
                                ['light', 'ph-fill ph-sun', 'Light mode'],
                                ['dark', 'ph-fill ph-moon', 'Dark mode'],
                            ] as [ThemeMode, string, string][]).map(([mode, icon, tip]) => (
                                <Tip key={mode} content={tip}>
                                    <button type="button" onClick={() => onSetThemeMode(mode)}
                                            aria-pressed={currentThemeMode === mode}
                                            className={clsx('size-8 sm:size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer',
                                                currentThemeMode === mode
                                                    ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                                                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-heading)]')}>
                                        <i className={`${icon} text-[15px]`}></i>
                                    </button>
                                </Tip>
                            ))}
                        </div>

                        <Tip content="Close">
                            <button type="button" onClick={onClose} autoFocus
                                    className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border text-[14px] transition-all cursor-pointer hover:bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]"
                                    aria-label="Close theme selector">
                                <i className="ph ph-x"/>
                            </button>
                        </Tip>
                    </div>
                </header>

                <div className="min-h-0 flex-1">
                    {view === 'gallery' ? (
                        <div className="h-full overflow-y-auto p-3 sm:p-4 md:p-5 scrollbar-thin">
                            <div className="mb-4 flex items-end justify-between gap-3">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Theme
                                        gallery</p>
                                    <p className="mt-1 text-xs text-[var(--text)]">Select a card to apply its palette
                                        instantly.</p>
                                </div>
                                <span
                                    className="rounded-full border px-2.5 py-1 text-[9px] font-bold border-[var(--border)] text-[var(--text-muted)] shrink-0">{THEME_LIST.length} themes</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                {THEME_LIST.map((theme) =>
                                    <ThemePreviewCard key={theme.name} theme={theme}
                                                      selected={theme.name === selectedThemeName}
                                                      resolvedThemeMode={resolvedThemeMode}
                                                      onSelect={() => onSelectTheme(theme.name)}/>)}
                            </div>
                        </div>
                    ) : (
                        <DetailedThemeView selectedTheme={selectedTheme} selectedThemeName={selectedThemeName}
                                           currentThemeMode={currentThemeMode} resolvedThemeMode={resolvedThemeMode}
                                           onSelectTheme={onSelectTheme} onClose={onClose}/>
                    )}
                </div>

                <footer
                    className="flex shrink-0 items-center justify-between gap-4 border-t px-3 py-2.5 sm:px-4 sm:py-3 md:px-5 modal-header-mobile-pad bg-[var(--background)] border-[var(--border)]">
                    <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        <i className="ph ph-check-circle text-[14px]"
                           style={{color: selectedTheme[resolvedThemeMode].primary}}/>
                        <span className="truncate"><strong>{selectedTheme.name}</strong> is selected</span>
                    </div>
                    <button type="button" onClick={onClose}
                            className="rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all cursor-pointer hover:opacity-90 active:scale-[0.98]"
                            style={{backgroundColor: selectedTheme[resolvedThemeMode].primary}}>
                        Done
                    </button>
                </footer>
            </section>
        </div>
    );
}
