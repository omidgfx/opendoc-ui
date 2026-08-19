import {useEffect, useMemo, useRef} from 'react';
import clsx from 'clsx';
import {Tip} from '@/src/components/common/Tooltip';
import GeneralSettingsSection from './sections/GeneralSettingsSection';
import AppearanceSettingsSection, {type AppearanceSettingsProps} from './sections/AppearanceSettingsSection';
import AISettingsSection, {type AISettingsSectionProps} from '@/src/components/ai/settings/AISettingsSection';
import {
    resolveSettingsSection,
    SETTINGS_SECTIONS,
    type SettingsSectionId,
    type SettingsSectionMeta,
} from './settingsSections';

interface SettingsPageProps {
    /** Section addressed by the deep link, e.g. /#/parsable/<spec>/settings#ai. */
    section: string | null;
    onSelectSection: (section: SettingsSectionId) => void;
    appearance: AppearanceSettingsProps;
    ai: AISettingsSectionProps;
}

export default function SettingsPage({section, onSelectSection, appearance, ai}: SettingsPageProps) {
    const activeSection = resolveSettingsSection(section);
    const scrollRef = useRef<HTMLDivElement>(null);
    const sections = useMemo<SettingsSectionMeta[]>(() => SETTINGS_SECTIONS, []);
    useEffect(() => {
        scrollRef.current?.scrollTo({top: 0});
    }, [activeSection]);
    const activeMeta = sections.find(item => item.id === activeSection) || sections[0];
    return (
        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden animate-in fade-in duration-200 select-text font-sans">
            <header className="shrink-0 border-b px-3 py-3 sm:px-6 sm:py-4 bg-[var(--surface)] border-[var(--border)]">
                <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border text-[17px] bg-[var(--primary)]/10 border-[var(--primary)]/25 text-[var(--primary)]">
                        <i className="ph-fill ph-gear-six" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-extrabold tracking-tight text-[var(--text-heading)]">
                            Settings
                        </h2>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                            Every preference of OpenDoc UI, in one deep-linkable place
                        </p>
                    </div>
                </div>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-hidden px-3 py-4 sm:px-6 md:flex-row">
                    <nav
                        aria-label="Settings sections"
                        className="flex shrink-0 gap-1.5 overflow-x-auto scrollbar-thin md:w-52 md:flex-col md:overflow-x-visible md:overflow-y-auto"
                    >
                        {sections.map(item => {
                            const isActive = item.id === activeSection;
                            return (
                                <Tip key={item.id} content={item.description} placement="bottom">
                                    <button
                                        type="button"
                                        aria-current={isActive ? 'page' : undefined}
                                        onClick={() => onSelectSection(item.id)}
                                        className={clsx(
                                            'flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition-all md:w-full',
                                            isActive
                                                ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]'
                                                : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                                        )}
                                    >
                                        <i className={clsx(item.icon, 'text-[14px]')} />
                                        <span className="truncate">{item.label}</span>
                                    </button>
                                </Tip>
                            );
                        })}
                    </nav>
                    <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin pb-6">
                        <h3 className="sr-only">{activeMeta.label}</h3>
                        {activeSection === 'general' && <GeneralSettingsSection />}
                        {activeSection === 'appearance' && <AppearanceSettingsSection {...appearance} />}
                        {activeSection === 'ai' && <AISettingsSection {...ai} />}
                    </div>
                </div>
            </div>
        </div>
    );
}
