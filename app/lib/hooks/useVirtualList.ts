/**
 * useVirtualList.ts
 *
 * A zero-dependency virtual-list hook. Renders only the rows that are
 * currently visible in the scroll container, plus an overscan buffer.
 *
 * Works with the FileTree and any large list without adding react-window.
 *
 * Usage:
 *   const { containerProps, innerStyle, visibleItems, totalHeight } =
 *     useVirtualList({ items, itemHeight: 24, containerHeight: 400 });
 *
 *   <div {...containerProps} style={{ height: containerHeight, overflow: 'auto' }}>
 *     <div style={{ ...innerStyle }}>
 *       {visibleItems.map(({ item, index, offsetTop }) => (
 *         <div key={index} style={{ position: 'absolute', top: offsetTop, width: '100%' }}>
 *           <Row item={item} />
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseVirtualListOptions<T> {
  items: T[];
  /** Height of each row in pixels (uniform). */
  itemHeight: number;
  /** Visible height of the scroll container. */
  containerHeight: number;
  /** Extra rows to render above/below the visible area. Default: 3 */
  overscan?: number;
  /** Minimum items before virtualization kicks in. Default: 50 */
  threshold?: number;
}

interface VirtualItem<T> {
  item: T;
  index: number;
  offsetTop: number;
}

interface UseVirtualListResult<T> {
  /** Spread onto the scroll container element. */
  containerProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    style: React.CSSProperties;
  };
  /** Apply to the inner wrapper div (positions the virtual rows). */
  innerStyle: React.CSSProperties;
  /** The currently visible (+ overscanned) items with their absolute positions. */
  visibleItems: VirtualItem<T>[];
  /** Total height of all items combined. */
  totalHeight: number;
  /** True when virtual mode is active. */
  isVirtual: boolean;
}

export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
  threshold = 50,
}: UseVirtualListOptions<T>): UseVirtualListResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const isVirtual = items.length >= threshold;

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Reset scroll position when items change significantly
  useEffect(() => {
    setScrollTop(0);
  }, [items.length]);

  const visibleItems: VirtualItem<T>[] = [];

  if (isVirtual) {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
    );

    for (let i = startIndex; i <= endIndex; i++) {
      visibleItems.push({
        item: items[i],
        index: i,
        offsetTop: i * itemHeight,
      });
    }
  } else {
    items.forEach((item, index) => {
      visibleItems.push({ item, index, offsetTop: index * itemHeight });
    });
  }

  return {
    containerProps: {
      ref: containerRef,
      onScroll: handleScroll,
      style: { height: containerHeight, overflowY: 'auto' as const },
    },
    innerStyle: isVirtual
      ? { position: 'relative' as const, height: totalHeight }
      : {},
    visibleItems,
    totalHeight,
    isVirtual,
  };
}
