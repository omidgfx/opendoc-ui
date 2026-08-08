import clsx from 'clsx';
interface TreeExpanderProps {
    collapsed: boolean;
    active: boolean;
}
export default function TreeExpander({ collapsed, active }: TreeExpanderProps) {
    return (<i className={clsx('ph ph-caret-right text-[12px] shrink-0 transition-transform duration-150', !collapsed && 'rotate-90', active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]')} aria-hidden="true"/>);
}
