import {useCallback, useEffect, useRef, useState} from 'react';
import type {TabItem} from '../components/endpoint/EndpointTabs';

interface UseTabSwitcherOptions {
    tabs: TabItem[];
    activeTabId: string | null;
    modalCount: number;
    onSelectTab: (id: string) => void;
}

export function useTabSwitcher({tabs, activeTabId, modalCount, onSelectTab}: UseTabSwitcherOptions) {
    const [open, setOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const tabsRef = useRef(tabs);
    const activeTabRef = useRef(activeTabId);
    const previousTabRef = useRef<string | null>(null);
    const selectRef = useRef(onSelectTab);
    tabsRef.current = tabs;
    activeTabRef.current = activeTabId;
    selectRef.current = onSelectTab;

    const commit = useCallback(() => {
        const list = tabsRef.current;
        const tab = list[Math.min(selectedIndex, list.length - 1)];
        setOpen(false);
        if (tab) selectRef.current(tab.id);
        previousTabRef.current = null;
    }, [selectedIndex]);

    const cancel = useCallback(() => {
        setOpen(false);
        if (previousTabRef.current) {
            const tab = tabsRef.current.find(item => item.id === previousTabRef.current);
            if (tab) selectRef.current(tab.id);
        }
        previousTabRef.current = null;
    }, []);

    const openSwitcher = useCallback(() => {
        const list = tabsRef.current;
        if (list.length < 2) return;
        const current = list.findIndex(tab => tab.id === activeTabRef.current);
        previousTabRef.current = activeTabRef.current;
        setSelectedIndex(current >= 0 ? current : 0);
        setOpen(true);
    }, []);

    useEffect(() => {
        const cycle = (event: KeyboardEvent, direction: number) => {
            event.preventDefault();
            const list = tabsRef.current;
            if (list.length < 2 || modalCount > 0) return;
            if (!open) {
                const current = list.findIndex(tab => tab.id === activeTabRef.current);
                previousTabRef.current = activeTabRef.current;
                setSelectedIndex(current >= 0 ? (current + direction + list.length) % list.length : 0);
                setOpen(true);
            } else {
                setSelectedIndex(index => (index + direction + list.length) % list.length);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && (event.key === '`' || event.key === '~' || event.key === 'Tab')) {
                cycle(event, event.shiftKey ? -1 : 1);
            } else if (event.key === 'Escape' && open) {
                event.preventDefault();
                cancel();
            } else if (event.key === 'Enter' && open) {
                event.preventDefault();
                commit();
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if ((event.key === 'Control' || event.key === 'Meta') && open) commit();
        };
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
        };
    }, [open, modalCount, cancel, commit]);

    return {
        switcherOpen: open,
        switcherIndex: selectedIndex,
        setSwitcherOpen: setOpen,
        cancelSwitcher: cancel,
        openSwitcher,
    };
}
