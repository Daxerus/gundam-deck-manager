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
  /**
   * Write absolute owned quantities and persist them. Resolves false when the save fails.
   * Used by the external-collection import, which has to land before the owned list refetches.
   */
  applyOwned: (entries: { productId: string; quantity: number }[]) => Promise<boolean>;
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
  flushNow: () => Promise<boolean>;
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
  const inflightRef = useRef<Promise<boolean> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    // Chain onto any in-flight request so awaiting callers get a fully persisted collection.
    if (inflightRef.current) await inflightRef.current;

    const snapshot = pendingRef.current;
    if (snapshot.size === 0) return true;

    const entries = [...snapshot].map(([productId, quantity]) => ({ productId, quantity }));
    const run: Promise<boolean> = saveInChunks(entries, (part) => saveRef.current(part))
      .then(() => {
        // Seed the cache so quantities don't flicker back while the refetch is in flight.
        applySavedToCache(qc, snapshot);
        // Drop only what this request covered; anything edited mid-flight stays pending.
        setPending((current) => {
          const next = new Map(current);
          for (const [productId, quantity] of snapshot) {
            if (next.get(productId) === quantity) next.delete(productId);
          }
          pendingRef.current = next;
          return next;
        });
        setError(null);
        return true;
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios');
        return false;
      })
      .finally(() => {
        if (inflightRef.current === run) inflightRef.current = null;
      });

    inflightRef.current = run;
    return run;
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
      pendingRef.current = draft;
      return draft;
    });
  }, []);

  const applyOwned = useCallback(
    async (entries: { productId: string; quantity: number }[]) => {
      if (!serverOwnedRef.current) {
        setError('La colección aún se está cargando');
        return false;
      }
      if (inflightRef.current) await inflightRef.current;

      const server = serverOwnedRef.current;
      const draft = new Map(pendingRef.current);
      for (const { productId, quantity } of entries) {
        const next = Math.max(0, Math.floor(quantity));
        if (next === (server[productId] ?? 0)) draft.delete(productId);
        else draft.set(productId, next);
      }
      pendingRef.current = draft;
      setPending(draft);
      return flush();
    },
    [flush],
  );

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
    applyOwned,
    pendingCount: pending.size,
    totalDisplayCopies,
    isSaving: saveCollection.isPending,
    error,
    save: () => void flush(),
    flushNow: flush,
    discard,
  };
}

/** Worker rejects a bulk write above 500 rows. */
const BULK_CHUNK = 400;

async function saveInChunks(
  entries: { productId: string; quantity: number }[],
  save: (part: { productId: string; quantity: number }[]) => Promise<unknown>,
) {
  for (let i = 0; i < entries.length; i += BULK_CHUNK) {
    await save(entries.slice(i, i + BULK_CHUNK));
  }
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
