import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  ActivationPlan,
  CardLocation,
  CatalogStatus,
  DeckDetail,
  DeckSummary,
  Paginated,
  PullPreference,
  SetInfo,
} from './types';
import type { Card } from './types';

export interface CardFilters {
  set_code?: string;
  color?: string;
  card_type?: string;
  exclude_card_type?: string;
  rarity?: string;
  name?: string;
  effect?: string;
  cost?: string;
  level?: string;
  owned_only?: string;
  limit?: number;
  offset?: number;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function useStatus() {
  return useQuery({ queryKey: ['status'], queryFn: () => api.get<CatalogStatus>('/status') });
}

export function useSets() {
  return useQuery({
    queryKey: ['sets'],
    queryFn: () => api.get<{ data: SetInfo[] }>('/sets').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useInfiniteCards(filters: CardFilters, pageSize = 60) {
  const { offset: _offset, limit: _limit, ...stable } = filters;
  return useInfiniteQuery({
    queryKey: ['cards', 'infinite', { ...stable, limit: pageSize }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Card>>(
        `/cards${qs({ ...stable, limit: pageSize, offset: pageParam } as Record<string, unknown>)}`,
      ),
    getNextPageParam: (last) => {
      const next = last._meta.offset + last._meta.count;
      return next < last._meta.total ? next : undefined;
    },
  });
}

export function useCollection() {
  return useQuery({
    queryKey: ['collection'],
    queryFn: () => api.get<{ data: Record<string, number> }>('/collection').then((r) => r.data),
  });
}

export function useSetCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api.put<{ productId: string; quantity: number }>(`/collection/${encodeURIComponent(productId)}`, {
        quantity,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['shopping'] });
    },
  });
}

export function useDecks() {
  return useQuery({
    queryKey: ['decks'],
    queryFn: () => api.get<{ data: DeckSummary[] }>('/decks').then((r) => r.data),
  });
}

export function useDeck(id: number | null) {
  return useQuery({
    queryKey: ['deck', id],
    enabled: id != null,
    queryFn: () => api.get<{ data: DeckDetail }>(`/decks/${id}`).then((r) => r.data),
  });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.post<{ data: DeckSummary }>('/decks', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decks'] }),
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; notes?: string; resourceDeckSize?: number }) =>
      api.put(`/decks/${id}`, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck', v.id] });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/decks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useSetDeckCard(deckId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api.put(`/decks/${deckId}/cards`, { productId, quantity }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck', deckId] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['shopping'] });
    },
  });
}

export function useActivationPlan() {
  return useMutation({
    mutationFn: ({ deckId, allowBox = true }: { deckId: number; allowBox?: boolean }) =>
      api
        .post<{ data: ActivationPlan }>(`/decks/${deckId}/activation-plan`, { allowBox })
        .then((r) => r.data),
  });
}

export function useActivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deckId,
      preferences,
      allowBox = true,
    }: {
      deckId: number;
      preferences: PullPreference[];
      allowBox?: boolean;
    }) =>
      api
        .post<{ data: ActivationPlan }>(`/decks/${deckId}/activate`, { preferences, allowBox })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useDeactivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deckId: number) => api.post(`/decks/${deckId}/deactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export interface ShoppingRow {
  productId: string;
  cardNumber: string;
  name: string;
  owned: number;
  maxRequired: number;
  missing: number;
  decks: { deckId: number; name: string; required: number }[];
}

export function useShopping() {
  return useQuery({
    queryKey: ['shopping'],
    queryFn: () => api.get<{ data: ShoppingRow[] }>('/shopping').then((r) => r.data),
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<{ data: CardLocation[] }>('/locations').then((r) => r.data),
  });
}

export function useSetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      decks,
    }: {
      productId: string;
      decks: { deckId: number; qty: number }[];
    }) =>
      api
        .put<{ data: CardLocation }>(`/locations/${encodeURIComponent(productId)}`, { decks })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
    },
  });
}
