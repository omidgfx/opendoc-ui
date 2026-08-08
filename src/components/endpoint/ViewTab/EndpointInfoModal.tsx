import type {ReactNode} from 'react';
import {Tip} from '@/src/components/common/Tooltip';

interface EndpointInfoModalProps {
    visible: boolean;
    backdropClassName: string;
    title: string;
    icon: string;
    children: ReactNode;
    closeLabel: string;
    onClose: () => void;
    zIndex: string;
}

export default function EndpointInfoModal({
                                              visible,
                                              backdropClassName,
                                              title,
                                              icon,
                                              children,
                                              closeLabel,
                                              onClose,
                                              zIndex
                                          }: EndpointInfoModalProps) {
    if (!visible)
        return null;
    return <div className={`${backdropClassName} fixed inset-0 backdrop-blur-[2px] ${zIndex}`}
                style={{backgroundColor: 'rgba(0, 0, 0, 0.4)'}} onMouseDown={event => {
        if (event.target === event.currentTarget)
            onClose();
    }}>
        <div
            className="modal-surface w-full max-w-lg rounded-2xl border flex flex-col max-h-[80vh] overflow-hidden shadow-2xl bg-[var(--surface)] border-[var(--border)]">
            <header
                className="px-4 sm:px-5 py-3 sm:py-4 border-b flex items-center justify-between border-[var(--border)] bg-[var(--background)] modal-header-mobile-pad shrink-0">
                <span className="font-bold text-sm tracking-wide text-[var(--text-heading)] truncate"><i
                    className={`${icon} mr-1.5 text-[var(--primary)]`}/>{title}</span><Tip content="Close">
                <button onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                    <i className="ph ph-x"/></button>
            </Tip></header>
            <div
                className="modal-scroll-region p-4 sm:p-6 overflow-y-auto space-y-4 text-xs leading-relaxed scrollbar-thin text-[var(--text)]">{children}</div>
            <footer
                className="px-4 sm:px-5 py-3 border-t text-right border-[var(--border)] bg-[var(--background)] shrink-0">
                <button onClick={onClose}
                        className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer transition-colors shadow-sm select-none">{closeLabel}</button>
            </footer>
        </div>
    </div>;
}
