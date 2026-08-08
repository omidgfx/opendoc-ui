import { useEffect, useState } from 'react';
import { specStorage, uiStorage } from '../utils/storage';
export function useSidebarController(selectedSpecKey: string, isMobile: boolean) {
    const [sidebarDisplayRoutes, setSidebarDisplayRoutes] = useState(true);
    const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => uiStorage.get('sidebar_collapsed') === 'true');
    const [mobileOpen, setMobileOpen] = useState(false);
    useEffect(() => {
        if (!selectedSpecKey) {
            setSidebarDisplayRoutes(true);
            return;
        }
        const saved = specStorage.getJSON<{
            displayRoutes?: boolean;
        }>(selectedSpecKey, 'sidebar_config', {}, value => !!value && typeof value === 'object' && !Array.isArray(value));
        setSidebarDisplayRoutes(saved.displayRoutes !== false);
    }, [selectedSpecKey]);
    useEffect(() => {
        if (!isMobile)
            uiStorage.set('sidebar_collapsed', String(desktopCollapsed));
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
