import { useEffect } from 'react';

export function useEscClose(isOpen: boolean, onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!isOpen) return;
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Prevent parent handlers if this one handles
        // We stop immediate propagation to allow inner-most modal to win
        // Since listeners are in capture? We'll use capture phase trick:
        // Instead, we just call onClose; parent should check enabled.
        onClose();
      }
    };
    // Use capture to ensure inner modals registered later still run before? Actually order matters.
    // We'll add in bubbling phase but rely on enabled flag.
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, enabled]);
}

// Hook for modal stack: pop one on ESC, close all when only one
export function useEscStack(isOpen: boolean, stackLength: number, onPop: () => void, onCloseAll: () => void, enabled = true) {
  useEffect(() => {
    if (!isOpen) return;
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (stackLength > 1) {
          onPop();
        } else {
          onCloseAll();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, stackLength, onPop, onCloseAll, enabled]);
}
