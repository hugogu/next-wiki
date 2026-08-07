'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function readStoredWidth(storageKey: string, minWidth: number, maxWidth: number): number | null {
  if (typeof window === 'undefined') return null;
  const stored = Number(window.localStorage.getItem(storageKey));
  if (!Number.isFinite(stored) || stored <= 0) return null;
  return Math.min(maxWidth, Math.max(minWidth, stored));
}

/**
 * Drag-to-resize width for a docked panel, persisted to localStorage. Reads
 * the stored value in an effect (not the initial render) so the server- and
 * client-rendered markup match on hydration; the panel briefly shows
 * `defaultWidth` before snapping to the stored width on mount.
 */
export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  /** Which edge of the element the drag handle sits on. */
  side,
}: {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: 'left' | 'right';
}) {
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  });

  useEffect(() => {
    const stored = readStoredWidth(storageKey, minWidth, maxWidth);
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the persisted width once after mount so SSR/hydration render the SSR-safe default first
      setWidth(stored);
    }
  }, [storageKey, minWidth, maxWidth]);

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const signedDelta = side === 'right' ? delta : -delta;
        setWidth(Math.min(maxWidth, Math.max(minWidth, startWidth + signedDelta)));
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.localStorage.setItem(storageKey, String(widthRef.current));
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [side, minWidth, maxWidth, storageKey],
  );

  return { width, startResize };
}
