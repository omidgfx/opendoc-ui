import type {RefObject} from 'react';
import {useEffect, useRef, useState} from 'react';
import {storage} from '../utils/storage';

export function useResizableSplit(containerRef: RefObject<HTMLElement | null>, storageKey: string, minPx = 320) {
    const [leftWidth, setLeftWidth] = useState<number>(() => {
        const saved = storage.get(storageKey);
        const parsed = saved ? parseInt(saved, 10) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : -1;
    });
    useEffect(() => {
        if (leftWidth >= 0) {
            storage.set(storageKey, String(Math.round(leftWidth)));
        }
    }, [leftWidth, storageKey]);
    const isResizing = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const onMouseMove = (e: MouseEvent) => {
        if (!isResizing.current || !containerRef.current)
            return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clamped = Math.max(minPx, Math.min(rect.width - minPx, x));
        setLeftWidth(clamped);
    };
    const onMouseUp = () => {
        isResizing.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    const onMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        setIsDragging(true);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
    const onKeyDown = (event: React.KeyboardEvent) => {
        const container = containerRef.current;
        if (!container)
            return;
        const maxPx = Math.max(minPx, container.getBoundingClientRect().width - minPx);
        const current = leftWidth >= 0 ? leftWidth : container.getBoundingClientRect().width / 2;
        const step = event.shiftKey ? 48 : 16;
        let next = current;
        if (event.key === 'ArrowLeft')
            next = current - step;
        else if (event.key === 'ArrowRight')
            next = current + step;
        else if (event.key === 'Home')
            next = minPx;
        else if (event.key === 'End')
            next = maxPx;
        else
            return;
        event.preventDefault();
        setLeftWidth(Math.max(minPx, Math.min(maxPx, next)));
    };
    const containerWidth = containerRef.current?.clientWidth || 0;
    return {
        leftWidth,
        isDragging,
        onMouseDown,
        onKeyDown,
        separatorMin: minPx,
        separatorMax: Math.max(minPx, containerWidth - minPx),
        separatorNow: leftWidth >= 0 ? leftWidth : Math.max(minPx, containerWidth / 2 || minPx),
    };
}
