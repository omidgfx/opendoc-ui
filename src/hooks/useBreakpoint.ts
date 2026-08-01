import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 639;
const TABLET_MAX = 1023;

export function getBreakpoint(width: number = typeof window !== 'undefined' ? window.innerWidth : 1280): Breakpoint {
    if (width <= MOBILE_MAX) return 'mobile';
    if (width <= TABLET_MAX) return 'tablet';
    return 'desktop';
}

export function useBreakpoint(): Breakpoint {
    const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint());
    useEffect(() => {
        const onResize = () => setBp(getBreakpoint());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return bp;
}
