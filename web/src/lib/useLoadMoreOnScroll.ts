import { useEffect, useRef, type RefObject } from 'react';

/** Observes a sentinel and loads the next page when it nears the scroll root (or viewport). */
export function useLoadMoreOnScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootRef,
  rootMargin = '240px 0px',
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  /** Scroll container; omit / null to use the viewport. */
  rootRef?: RefObject<Element | null>;
  rootMargin?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const root = rootRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootRef, rootMargin]);

  return sentinelRef;
}
