import type {RefObject} from 'react';
import {useEffect, useRef, useState} from 'react';
import {storage} from '../utils/storage';

/**
 * Drag-to-resize behaviour for a horizontal split (two panes side-by-side),
 * mirroring the exact interaction pattern used by the app's resizable
 * sidebar (mousedown → track mousemove → clamp → mouseup, persisted to
 * localStorage as a pixel width for the left-hand pane).
 */
export function useResizableSplit(containerRef: RefObject<HTMLElement | null>, storageKey: string, minPx = 320) {
    const [leftWidth, setLeftWidth] = useState<number>(() => {
        const saved = storage.get(storageKey);
        const parsed = saved ? parseInt(saved, 10) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : -1; // -1 sentinel => 50/50 split
    });

    useEffect(() => {
        if (leftWidth >= 0) {
            storage.set(storageKey, String(Math.round(leftWidth)));
        }
    }, [leftWidth, storageKey]);

    const isResizing = useRef(false);
    const [isDragging, setIsDragging] = useState(false);

    const onMouseMove = (e: MouseEvent) => {
        if (!isResizing.current || !containerRef.current) return;
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

    return {leftWidth, isDragging, onMouseDown};
}
