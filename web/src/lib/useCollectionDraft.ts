import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCollection, useCollectionStatus, useSaveCollection } from './queries';
import { withDraftOwned } from './cardStatus';
import { ApiError } from './api';
import type { CardStatusBreakdown } from './types';

export const COLLECTION_AUTOSAVE_MS = 30_000;

export interface CollectionDraft {
  /** Owned copies including the local draft. */
  ownedOf: (productId: string) => number;
  /** Server breakdown re-derived against the local draft. */
  statusOf: (productId: string) => CardStatusBreakdown | undefined;
  setOwned: (productId: string, quantity: number) => void;
  /** Printings edited but not saved yet. */
  pendingCount: number;
  /** Copies shown across the collection, draft included. */
  totalDisplayCopies: number;
  isSaving: boolean;
  error: string | null;
  save: () => void;
  /**
   * Persist the draft and resolve when the collection is in sync. Await it before any
   * action that reads owned copies server-side (loans), so both sides agree.
   */
  flushNow: () => Promise<void>;
  discard: () => void;
}

/**
 * Local-first collection editing: +/- only touches a draft map, which is flushed to
 * /collection/bulk every 30s, on demand, and when leaving the page. One request per
 * batch instead of one PUT per click.
 */
export function useCollectionDraft(): CollectionDraft {
  const collection = useCollection();
  const statusMap = useCollectionStatus();
  const saveCollection = useSaveCollection();
  const qc = useQueryClient();

  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const serverOwnedRef = useRef(collection.data);
  serverOwnedRef.current = collection.data;
  const saveRef = useRef(saveCollection.mutateAsync);
  saveRef.current = saveCollection.mutateAsync;
  const inflightRef = useRef<Promise<void> | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    // Chain onto any in-flight request so awaiting callers get a fully persisted collection.
    if (inflightRef.current) await inflightRef.current;

    const snapshot = pendingRef.current;
    if (snapshot.size === 0) return;

    const run: Promise<void> = saveRef
      .current([...snapshot].map(([productId, quantity]) => ({ productId, quantity })))
      .then(() => {
        // Seed the cache so quantities don't flicker back while the refetch is in flight.
        applySavedToCache(qc, snapshot);
        // Drop only what this request covered; anything edited mid-flight stays pending.
        setPending((current) => {
          const next = new Map(current);
          for (const [productId, quantity] of snapshot) {
            if (next.get(productId) === quantity) next.delete(productId);
          }
          return next;
        });
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios');
      })
      .finally(() => {
        if (inflightRef.current === run) inflightRef.current = null;
      });

    inflightRef.current = run;
    await run;
  }, [qc]);

  const hasPending = pending.size > 0;

  useEffect(() => {
    if (!hasPending) return;
    const handle = window.setInterval(() => void flush(), COLLECTION_AUTOSAVE_MS);
    return () => window.clearInterval(handle);
  }, [flush, hasPending]);

  useEffect(() => {
    if (!hasPending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasPending]);

  // Navigating away still persists the draft; the request outlives this component.
  useEffect(() => () => void flush(), [flush]);

  const setOwned = useCallback((productId: string, quantity: number) => {
    const next = Math.max(0, Math.floor(quantity));
    setPending((current) => {
      const draft = new Map(current);
      if (next === (serverOwnedRef.current?.[productId] ?? 0)) draft.delete(productId);
      else draft.set(productId, next);
      return draft;
    });
  }, []);

  const ownedOf = useCallback(
    (productId: string) => pending.get(productId) ?? collection.data?.[productId] ?? 0,
    [collection.data, pending],
  );

  const statusOf = useCallback(
    (productId: string) => {
      const status = statusMap.data?.[productId];
      const draftOwned = pending.get(productId);
      if (draftOwned == null) return status;
      return withDraftOwned(status, productId, draftOwned);
    },
    [pending, statusMap.data],
  );

  const totalDisplayCopies = useMemo(() => {
    const statuses = statusMap.data ?? {};
    let total = 0;
    for (const [productId, status] of Object.entries(statuses)) {
      const draftOwned = pending.get(productId);
      total +=
        draftOwned == null
          ? status.displayQty
          : (withDraftOwned(status, productId, draftOwned)?.displayQty ?? 0);
    }
    for (const [productId, draftOwned] of pending) {
      if (!(productId in statuses)) total += draftOwned;
    }
    return total;
  }, [pending, statusMap.data]);

  const discard = useCallback(() => {
    setPending(new Map());
    setError(null);
  }, []);

  return {
    ownedOf,
    statusOf,
    setOwned,
    pendingCount: pending.size,
    totalDisplayCopies,
    isSaving: saveCollection.isPending,
    error,
    save: () => void flush(),
    flushNow: flush,
    discard,
  };
}

function applySavedToCache(qc: QueryClient, saved: Map<string, number>) {
  qc.setQueryData<Record<string, number>>(['collection'], (current) => {
    if (!current) return current;
    const next = { ...current };
    for (const [productId, quantity] of saved) {
      if (quantity > 0) next[productId] = quantity;
      else delete next[productId];
    }
    return next;
  });
  qc.setQueryData<Record<string, CardStatusBreakdown>>(['collection-status'], (current) => {
    if (!current) return current;
    const next = { ...current };
    for (const [productId, quantity] of saved) {
      const status = withDraftOwned(current[productId], productId, quantity);
      if (status) next[productId] = status;
      else delete next[productId];
    }
    return next;
  });
}
