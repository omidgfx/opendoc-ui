import type {MouseEvent} from 'react';
import clsx from 'clsx';
import type {OpenApiSpec} from '@/src/types';
import type {ViewTabKind} from '@/src/types/tabs';
import {Tip} from '@/src/components/common/Tooltip';

interface SidebarPageNavigationProps {
    spec: OpenApiSpec | null;
    overviewActive: boolean;
    aboutActive: boolean;
    schemasActive: boolean;
    onOpenHome: () => void;
    onOpenAbout: () => void;
    onOpenSchemas: () => void;
    onOpenPermanent: (view: ViewTabKind) => void;
    onContextMenu: (event: MouseEvent, view: ViewTabKind) => void;
}

interface PageButtonProps {
    id: string;
    label: string;
    tip: string;
    icon: string;
    active: boolean;
    inactiveClass?: string;
    count?: number;
    onOpen: () => void;
    onPermanent: () => void;
    onContextMenu: (event: MouseEvent) => void;
}

function PageButton(props: PageButtonProps) {
    const {
        id,
        label,
        tip,
        icon,
        active,
        inactiveClass = 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]',
        count,
        onOpen,
        onPermanent,
        onContextMenu,
    } = props;
    return (
        <Tip content={tip} fullWidth>
            <button
                data-nav-view={id}
                aria-current={active ? 'page' : undefined}
                onClick={onOpen}
                onContextMenu={onContextMenu}
                onDoubleClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPermanent();
                }}
                onMouseDown={event => {
                    if (event.button === 1) {
                        event.preventDefault();
                        onPermanent();
                    }
                }}
                className={clsx(
                    'flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer select-none font-medium',
                    active ? 'text-[var(--primary-contrast)] bg-[var(--primary)]' : inactiveClass,
                )}
            >
                <i className={`${icon} text-[14px]`} />
                <span>{label}</span>
                {count !== undefined && (
                    <span
                        className={clsx(
                            'ml-auto text-[10px] font-mono font-bold',
                            active ? 'text-[var(--primary-contrast)]' : 'text-[var(--text-muted)]',
                        )}
                    >
                        ({count})
                    </span>
                )}
            </button>
        </Tip>
    );
}

export default function SidebarPageNavigation({
    spec,
    overviewActive,
    aboutActive,
    schemasActive,
    onOpenHome,
    onOpenAbout,
    onOpenSchemas,
    onOpenPermanent,
    onContextMenu,
}: SidebarPageNavigationProps) {
    return (
        <>
            <PageButton
                id="view:home"
                label="Overview"
                tip="Specification overview"
                icon="ph-fill ph-house"
                active={overviewActive}
                onOpen={onOpenHome}
                onPermanent={() => onOpenPermanent('home')}
                onContextMenu={event => onContextMenu(event, 'home')}
            />
            <PageButton
                id="view:about"
                label="About OpenDoc UI"
                tip="About OpenDoc UI"
                icon="ph-fill ph-info"
                active={aboutActive}
                onOpen={onOpenAbout}
                onPermanent={() => onOpenPermanent('about')}
                onContextMenu={event => onContextMenu(event, 'about')}
            />
            <PageButton
                id="view:schemas"
                label="Schema Explorer"
                tip="Browse all schemas and models"
                icon="ph-fill ph-diamonds-four"
                active={schemasActive}
                inactiveClass="text-[var(--sidebar-text)] hover:bg-[var(--surface-hover)]"
                count={spec?.components?.schemas ? Object.keys(spec.components.schemas).length : 0}
                onOpen={onOpenSchemas}
                onPermanent={() => onOpenPermanent('schemas')}
                onContextMenu={event => onContextMenu(event, 'schemas')}
            />
        </>
    );
}
