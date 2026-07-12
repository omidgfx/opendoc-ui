import React, { useEffect, useMemo, useState } from 'react';
import { AppTheme, ThemeItem } from '../../types';
import { THEME_LIST } from '../../data/themes';
import clsx from 'clsx';
import { Tip } from '../common/Tooltip';

type ThemeSelectorView = 'gallery' | 'detail';

type ThemeSelectorModalProps = {
    isOpen: boolean;
    selectedThemeName: string;
    currentThemeMode: 'light' | 'dark';
    onSelectTheme: (themeName: string) => void;
    onToggleThemeMode: () => void;
    onClose: () => void;
};

const METHOD_ITEMS: Array<{ label: string; key: keyof ThemeItem }> = [
    { label: 'GET', key: 'methodGet' },
    { label: 'POST', key: 'methodPost' },
    { label: 'PUT', key: 'methodPut' },
    { label: 'PATCH', key: 'methodPatch' },
    { label: 'DELETE', key: 'methodDelete' },
];

const alpha = (color: string, opacity: string) => {
    return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${opacity}` : color;
};

function MiniPagePreview({ palette, mode, roomy = false }: { palette: ThemeItem; mode: 'light' | 'dark'; roomy?: boolean }) {
    return (
        <div
            className="h-full w-full overflow-hidden rounded-lg border"
            style={{ backgroundColor: palette.background, borderColor: palette.border, color: palette.text, minHeight: roomy ? 190 : 92 }}>
            <div className="flex items-center justify-between border-b"
                style={{ height: roomy ? 32 : 20, padding: roomy ? '0 10px' : '0 6px', backgroundColor: palette.navbar, borderColor: palette.border }}>
                <div className="flex items-center gap-1.5">
                    <span className="rounded-full" style={{ width: roomy ? 7 : 4, height: roomy ? 7 : 4, backgroundColor: palette.primary }} />
                    <span className="rounded-full" style={{ width: roomy ? 26 : 15, height: roomy ? 4 : 3, backgroundColor: palette.textHeading }} />
                </div>
                <span className="font-bold uppercase tracking-widest" style={{ fontSize: roomy ? 8 : 5.5, color: palette.textMuted }}>{mode}</span>
            </div>
            <div className="flex" style={{ height: `calc(100% - ${roomy ? 32 : 20}px)` }}>
                <div className="shrink-0 border-r"
                    style={{ width: roomy ? '25%' : '27%', padding: roomy ? '12px 8px' : '7px 4px', backgroundColor: palette.sidebar, borderColor: palette.border }}>
                    {[1, 0.72, 0.84, 0.6].map((width, index) =>
                        <div key={index} className="rounded-full"
                            style={{ width: `${width * 100}%`, height: roomy ? 5 : 3, marginBottom: roomy ? 9 : 5, backgroundColor: index === 0 ? palette.primary : palette.sidebarText, opacity: index === 0 ? 0.95 : 0.34 }} />)}
                </div>
                <div className="flex-1" style={{ padding: roomy ? 12 : 6 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: roomy ? 11 : 5 }}>
                        <div className="rounded-full" style={{ width: '42%', height: roomy ? 6 : 3, backgroundColor: palette.textHeading, opacity: 0.8 }} />
                        <div className="rounded-full" style={{ width: roomy ? 34 : 20, height: roomy ? 12 : 7, backgroundColor: palette.primary }} />
                    </div>
                    <div className="rounded border" style={{ padding: roomy ? 9 : 5, backgroundColor: palette.surface, borderColor: palette.border }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: roomy ? 10 : 5 }}>
                            <span className="rounded font-black" style={{ padding: roomy ? '2px 5px' : '1px 3px', backgroundColor: alpha(palette.methodGet, '20'), color: palette.methodGet, fontSize: roomy ? 7 : 4.5 }}>GET</span>
                            <span className="rounded-full" style={{ width: '47%', height: roomy ? 5 : 3, backgroundColor: palette.text, opacity: 0.45 }} />
                        </div>
                        <div className="rounded" style={{ height: roomy ? 35 : 17, backgroundColor: palette.surfaceHover, padding: roomy ? 7 : 4 }}>
                            <div className="rounded-full" style={{ width: '72%', height: roomy ? 4 : 2, backgroundColor: palette.textMuted, opacity: 0.5 }} />
                            <div className="rounded-full" style={{ width: '45%', height: roomy ? 4 : 2, marginTop: roomy ? 7 : 4, backgroundColor: palette.accent, opacity: 0.72 }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThemeNamePreview({ theme, mode }: { theme: AppTheme; mode: 'light' | 'dark' }) {
    const palette = theme[mode];
    return (
        <div className="relative h-full overflow-hidden rounded-lg border p-3"
            style={{ background: `linear-gradient(145deg, ${palette.surface}, ${palette.background})`, borderColor: palette.border }}>
            <span className="absolute rounded-full" style={{ width: 54, height: 54, right: -12, top: -18, backgroundColor: alpha(palette.primary, '18') }} />
            <span className="absolute rounded-full" style={{ width: 30, height: 30, right: 22, bottom: -13, backgroundColor: alpha(palette.accent, '1f') }} />
            <div className="relative flex h-full flex-col justify-between">
                <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: palette.textMuted }}>Theme</span>
                <div>
                    <div className="text-[13px] font-extrabold leading-tight" style={{ color: palette.primary }}>{theme.name}</div>
                    <div className="mt-1 flex items-center gap-1">
                        {[palette.primary, palette.accent, palette.textHeading].map((color) =>
                            <span key={color} className="h-1.5 w-5 rounded-full" style={{ backgroundColor: color }} />)}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MethodColorsPreview({ palette, roomy = false }: { palette: ThemeItem; roomy?: boolean }) {
    return (
        <div className="h-full overflow-hidden rounded-lg border" style={{ padding: roomy ? 16 : 10, backgroundColor: palette.surface, borderColor: palette.border }}>
            <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-widest" style={{ fontSize: roomy ? 9 : 6.5, color: palette.textMuted }}>Methods</span>
                <span className="rounded-full" style={{ width: 6, height: 6, backgroundColor: palette.accent }} />
            </div>
            <div className={roomy ? 'mt-5 grid grid-cols-2 gap-2.5' : 'mt-2.5 flex flex-wrap gap-1.5'}>
                {METHOD_ITEMS.map((method) => {
                    const color = palette[method.key];
                    return (
                        <span key={method.label}
                            className="inline-flex items-center justify-center rounded-md border font-black tracking-wide"
                            style={{ minWidth: roomy ? 74 : undefined, padding: roomy ? '7px 9px' : '3px 5px', fontSize: roomy ? 9 : 5.5, color, borderColor: alpha(color, '48'), backgroundColor: alpha(color, '16') }}>
                            {method.label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

function ThemePreviewCard({ theme, selected, currentThemeMode, onSelect }: { theme: AppTheme; selected: boolean; currentThemeMode: 'light' | 'dark'; onSelect: () => void }) {
    const activePalette = theme[currentThemeMode];
    return (
        <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`Select ${theme.name} theme`}
            className="group relative w-full rounded-2xl border bg-[var(--surface)] p-2 text-left transition-all duration-200 cursor-pointer focus:outline-none"
            style={{ backgroundColor: selected ? alpha(activePalette.primary, '12') : undefined, borderColor: selected ? activePalette.primary : 'var(--border)', boxShadow: selected ? `0 0 0 2px ${alpha(activePalette.primary, '30')}, 0 16px 34px rgba(0,0,0,.13)` : '0 6px 20px rgba(0,0,0,.06)' }}>
            {selected && <span className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-[var(--primary-contrast)] shadow-md"
                style={{ right: 14, top: 14, backgroundColor: activePalette.primary }}>
                <i className="ph ph-check text-[12px]" /></span>}
            <span className="pointer-events-none grid grid-cols-2 gap-1.5 rounded-xl" style={{ height: 210 }}>
                <ThemeNamePreview theme={theme} mode={currentThemeMode} />
                <MethodColorsPreview palette={activePalette} />
                <MiniPagePreview palette={theme.light} mode="light" />
                <MiniPagePreview palette={theme.dark} mode="dark" />
            </span>
        </button>
    );
}

function ThemeIdentityPanel({ theme, mode }: { theme: AppTheme; mode: 'light' | 'dark' }) {
    const palette = theme[mode];
    const colors = [
        { label: 'Primary', value: palette.primary },
        { label: 'Accent', value: palette.accent },
        { label: 'Surface', value: palette.surface },
        { label: 'Border', value: palette.border },
    ];
    return (
        <div className="relative min-h-[190px] overflow-hidden rounded-2xl border p-4 sm:p-5"
            style={{ background: `linear-gradient(145deg, ${palette.surface}, ${palette.background})`, borderColor: palette.border, color: palette.text }}>
            <div className="absolute rounded-full" style={{ width: 150, height: 150, right: -48, top: -70, backgroundColor: alpha(palette.primary, '1c') }} />
            <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: palette.textMuted }}>Theme identity · {mode}</p>
            <h3 className="relative mt-3 text-2xl font-black tracking-tight" style={{ color: palette.primary }}>{theme.name}</h3>
            <p className="relative mt-1 text-[11px]" style={{ color: palette.textMuted }}>Core colors at a glance</p>
            <div className="relative mt-5 grid grid-cols-2 gap-2">
                {colors.map((color) =>
                    <div key={color.label} className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                        style={{ backgroundColor: alpha(palette.background, 'b8'), borderColor: palette.border }}>
                        <span className="h-5 w-5 shrink-0 rounded-md shadow-sm" style={{ backgroundColor: color.value }} />
                        <span className="min-w-0">
                            <span className="block text-[8px] font-bold uppercase tracking-wide" style={{ color: palette.textMuted }}>{color.label}</span>
                            <span className="block truncate font-mono text-[9px]" style={{ color: palette.textHeading }}>{color.value.toUpperCase()}</span>
                        </span>
                    </div>)}
            </div>
        </div>
    );
}

function DetailedThemeView({ selectedTheme, selectedThemeName, currentThemeMode, onSelectTheme, onClose }: {
    selectedTheme: AppTheme;
    selectedThemeName: string;
    currentThemeMode: 'light' | 'dark';
    onSelectTheme: (themeName: string) => void;
    onClose: () => void;
}) {
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    return (
        <div className="flex h-full min-h-0 relative">
            {/* Mobile theme picker drawer */}
            {showMobileSidebar && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setShowMobileSidebar(false)} />
                    <aside className="fixed left-0 top-0 bottom-0 z-50 w-[78vw] max-w-[280px] overflow-y-auto border-r p-3 md:hidden scrollbar-thin bg-[var(--background)] border-[var(--border)] animate-in slide-in-from-left duration-200">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">All themes · {THEME_LIST.length}</span>
                            <button onClick={() => setShowMobileSidebar(false)} className="size-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                                <i className="ph ph-x text-[14px]" />
                            </button>
                        </div>
                        <div className="space-y-1">
                            {THEME_LIST.map((theme) => {
                                const selected = theme.name === selectedThemeName;
                                const palette = theme[currentThemeMode];
                                return (
                                    <button type="button" key={theme.name} onClick={() => { onSelectTheme(theme.name); setShowMobileSidebar(false); }} aria-pressed={selected}
                                        className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer',
                                            selected ? 'font-semibold' : 'border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}
                                        style={{ color: selected ? palette.primary : undefined, backgroundColor: selected ? alpha(palette.primary, '14') : undefined, borderColor: selected ? alpha(palette.primary, '55') : undefined }}>
                                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: palette.border }}>
                                            <span className="absolute inset-y-0 left-0 w-1/2" style={{ backgroundColor: theme.light.surface }} />
                                            <span className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundColor: theme.dark.surface }} />
                                            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border" style={{ backgroundColor: palette.primary, borderColor: palette.surface }} />
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-xs font-bold">{theme.name}</span>
                                        {selected && <i className="ph ph-check text-[11px]" />}
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                </>
            )}

            <aside className="hidden md:block w-60 shrink-0 overflow-y-auto border-r p-3 scrollbar-thin bg-[var(--background)] border-[var(--border)]" aria-label="Themes">
                <div className="px-2 pb-2 pt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">All themes · {THEME_LIST.length}</div>
                <div className="space-y-1">
                    {THEME_LIST.map((theme) => {
                        const selected = theme.name === selectedThemeName;
                        const palette = theme[currentThemeMode];
                        return (
                            <button type="button" key={theme.name} onClick={() => onSelectTheme(theme.name)} aria-pressed={selected}
                                className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer',
                                    selected ? 'font-semibold' : 'border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]')}
                                style={{ color: selected ? palette.primary : undefined, backgroundColor: selected ? alpha(palette.primary, '14') : undefined, borderColor: selected ? alpha(palette.primary, '55') : undefined }}>
                                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: palette.border }}>
                                    <span className="absolute inset-y-0 left-0 w-1/2" style={{ backgroundColor: theme.light.surface }} />
                                    <span className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundColor: theme.dark.surface }} />
                                    <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border" style={{ backgroundColor: palette.primary, borderColor: palette.surface }} />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-xs font-bold">{theme.name}</span>
                                {selected && <i className="ph ph-check text-[11px]" />}
                            </button>
                        );
                    })}
                </div>
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 scrollbar-thin">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <button onClick={() => setShowMobileSidebar(true)}
                            className="md:hidden size-9 rounded-xl border flex items-center justify-center text-[var(--text-heading)] border-[var(--border)] hover:bg-[var(--surface-hover)]">
                            <i className="ph ph-list text-[16px]" />
                        </button>
                        <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Selected theme</p>
                            <h2 className="mt-1 text-base sm:text-lg font-extrabold truncate text-[var(--text-heading)]">{selectedTheme.name}</h2>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold shrink-0"
                        style={{ color: selectedTheme[currentThemeMode].primary, borderColor: alpha(selectedTheme[currentThemeMode].primary, '4d'), backgroundColor: alpha(selectedTheme[currentThemeMode].primary, '12') }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: selectedTheme[currentThemeMode].primary }} />
                        Active in {currentThemeMode} mode
                    </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                    <ThemeIdentityPanel theme={selectedTheme} mode={currentThemeMode} />
                    <MethodColorsPreview palette={selectedTheme[currentThemeMode]} roomy />
                    <MiniPagePreview palette={selectedTheme.light} mode="light" roomy />
                    <MiniPagePreview palette={selectedTheme.dark} mode="dark" roomy />
                </div>
            </main>
        </div>
    );
}

export default function ThemeSelectorModal({ isOpen, selectedThemeName, currentThemeMode, onSelectTheme, onClose, onToggleThemeMode }: ThemeSelectorModalProps) {
    const [view, setView] = useState<ThemeSelectorView>('gallery');

    const selectedTheme = useMemo(() => THEME_LIST.find((theme) => theme.name === selectedThemeName) || THEME_LIST[0], [selectedThemeName]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-2 sm:p-3 md:p-6 animate-fade-in"
            style={{ backgroundColor: 'rgba(7, 10, 18, .64)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>

            <section role="dialog" aria-modal="true" aria-labelledby="theme-selector-title"
                className="flex h-[92vh] sm:h-[86vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border shadow-2xl animate-zoom-in bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">

                <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4 sm:py-3 md:px-5 modal-header-mobile-pad bg-[var(--background)] border-[var(--border)]">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <span className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border text-[16px] sm:text-[18px]"
                            style={{ color: selectedTheme[currentThemeMode].primary, backgroundColor: alpha(selectedTheme[currentThemeMode].primary, '14'), borderColor: alpha(selectedTheme[currentThemeMode].primary, '3d') }}>
                            <i className="ph-fill ph-palette" />
                        </span>
                        <div className="min-w-0">
                            <h2 id="theme-selector-title" className="truncate text-sm font-extrabold tracking-tight text-[var(--text-heading)]">Choose your theme</h2>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)] hidden sm:block">Preview every palette in light and dark before choosing</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <Tip content={`Switch to ${view === 'gallery' ? 'focus' : 'gallery'} view`}>
                            <button type="button" onClick={() => setView((current) => current === 'gallery' ? 'detail' : 'gallery')}
                                className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border px-2 sm:px-3 text-[10px] font-bold transition-all cursor-pointer hover:bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-heading)] bg-[var(--surface)]">
                                <i className={`ph ${view === 'gallery' ? 'ph-sidebar' : 'ph-squares-four'} text-[14px]`} />
                                <span className="hidden sm:inline">View</span>
                                <span className="rounded-md px-1.5 py-0.5 uppercase tracking-wider bg-[var(--surface-hover)] text-[var(--text-muted)]" style={{ fontSize: 8 }}>
                                    {view === 'gallery' ? 'Gallery' : 'Focus'}
                                </span>
                            </button>
                        </Tip>

                        <Tip content="Toggle light/dark preview">
                            <button onClick={onToggleThemeMode}
                                className="size-8 sm:size-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]">
                                {currentThemeMode === 'dark'
                                    ? <i className="ph ph-sun text-[var(--method-put)] text-[16px]"></i>
                                    : <i className="ph-fill ph-moon text-[var(--primary)] text-[16px]"></i>}
                            </button>
                        </Tip>

                        <Tip content="Close">
                            <button type="button" onClick={onClose} autoFocus
                                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border text-[14px] transition-all cursor-pointer hover:bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]"
                                aria-label="Close theme selector">
                                <i className="ph ph-x" />
                            </button>
                        </Tip>
                    </div>
                </header>

                <div className="min-h-0 flex-1">
                    {view === 'gallery' ? (
                        <div className="h-full overflow-y-auto p-3 sm:p-4 md:p-5 scrollbar-thin">
                            <div className="mb-4 flex items-end justify-between gap-3">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Theme gallery</p>
                                    <p className="mt-1 text-xs text-[var(--text)]">Select a card to apply its palette instantly.</p>
                                </div>
                                <span className="rounded-full border px-2.5 py-1 text-[9px] font-bold border-[var(--border)] text-[var(--text-muted)] shrink-0">{THEME_LIST.length} themes</span>
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {THEME_LIST.map((theme) =>
                                    <ThemePreviewCard key={theme.name} theme={theme} selected={theme.name === selectedThemeName}
                                        currentThemeMode={currentThemeMode} onSelect={() => onSelectTheme(theme.name)} />)}
                            </div>
                        </div>
                    ) : (
                        <DetailedThemeView selectedTheme={selectedTheme} selectedThemeName={selectedThemeName}
                            currentThemeMode={currentThemeMode} onSelectTheme={onSelectTheme} onClose={onClose} />
                    )}
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-3 py-2.5 sm:px-4 sm:py-3 md:px-5 modal-header-mobile-pad bg-[var(--background)] border-[var(--border)]">
                    <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        <i className="ph ph-check-circle text-[14px]" style={{ color: selectedTheme[currentThemeMode].primary }} />
                        <span className="truncate"><strong>{selectedTheme.name}</strong> is selected</span>
                    </div>
                    <button type="button" onClick={onClose}
                        className="rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all cursor-pointer hover:opacity-90 active:scale-[0.98]"
                        style={{ backgroundColor: selectedTheme[currentThemeMode].primary }}>
                        Done
                    </button>
                </footer>
            </section>
        </div>
    );
}
