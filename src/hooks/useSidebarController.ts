import {useEffect, useState} from 'react';
import {uiStorage} from '../utils/storage';
import {readSidebarConfig} from '../utils/sidebar/tree';

export function useSidebarController(selectedSpecKey: string, isMobile: boolean) {
    const [sidebarDisplayRoutes, setSidebarDisplayRoutes] = useState(
        () => readSidebarConfig(selectedSpecKey).displayRoutes,
    );
    const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(
        () => uiStorage.get('sidebar_collapsed') === 'true',
    );
    const [mobileOpen, setMobileOpen] = useState(false);
    useEffect(() => {
        setSidebarDisplayRoutes(readSidebarConfig(selectedSpecKey).displayRoutes);
    }, [selectedSpecKey]);
    useEffect(() => {
        if (!isMobile) uiStorage.set('sidebar_collapsed', String(desktopCollapsed));
    }, [desktopCollapsed, isMobile]);
    return {
        sidebarDisplayRoutes,
        setSidebarDisplayRoutes,
        desktopCollapsed,
        setDesktopCollapsed,
        mobileOpen,
        setMobileOpen,
    };
}
