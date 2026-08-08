import clsx from 'clsx';
import {Tip} from '../../common/Tooltip';
import pkg from '../../../../package.json';

interface CollapsedSidebarRailProps {
    isOverview: boolean;
    showSchemaExplorer: boolean;
    showAbout: boolean;
    onOpenHome: () => void;
    onOpenSchemaExplorer: () => void;
    onOpenAbout: () => void;
}

export default function CollapsedSidebarRail({
                                                 isOverview,
                                                 showSchemaExplorer,
                                                 showAbout,
                                                 onOpenHome,
                                                 onOpenSchemaExplorer,
                                                 onOpenAbout,
                                             }: CollapsedSidebarRailProps) {
    return (<div
        className="h-full flex flex-col items-center border-r select-none shrink-0 bg-[var(--sidebar)] border-[var(--border)]"
        style={{width: 56}}>
        <div className="flex-1 flex flex-col gap-1.5 my-2 items-center">
            <Tip content="Overview">
                <button onClick={onOpenHome}
                        className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer', isOverview ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                    <i className="ph-fill ph-house text-[16px]"/>
                </button>
            </Tip>
            <Tip content="Schema Explorer">
                <button onClick={onOpenSchemaExplorer}
                        className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer', showSchemaExplorer ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                    <i className="ph-fill ph-diamonds-four text-[16px]"/>
                </button>
            </Tip>
            <Tip content="About">
                <button onClick={onOpenAbout}
                        className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer', showAbout ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]')}>
                    <i className="ph-fill ph-info text-[18px]"/>
                </button>
            </Tip>
        </div>
        <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
           className="text-[10px] text-[var(--text-muted)] flex flex-col items-center hover:text-[var(--primary)] transition-colors pointer-events-auto"
           style={{textDecoration: 'none'}}>
            <div className="flex flex-col items-start gap-0.125 select-none pointer-events-none"
                 style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)'}}>
                <div>Pejman Chatrrouz</div>
                <span className="text-[7px] text-[var(--text-muted)]/70 font-mono">{pkg.version}</span>
            </div>
            <div className="mb-2 mt-2 flex flex-col items-center gap-0.5">
                <Tip content="By Pejman Chatrrouz on GitHub">
                    <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer"
                       className="rounded-xl flex items-center justify-center transition-colors text-inherit">
                        <i className="ph-fill ph-github-logo text-[32px]"/>
                    </a>
                </Tip>
            </div>
        </a>
    </div>);
}
