import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './api';
import type {
  ActivationPlan,
  CardLocation,
  CardRequest,
  CardStatusBreakdown,
  CatalogStatus,
  DeckDetail,
  DeckSummary,
  Friendship,
  InviteCode,
  LoanHistoryEntry,
  OpenLoan,
  Paginated,
  PullPreference,
  SetInfo,
} from './types';
import type { Card } from './types';

export interface CardFilters {
  set_code?: string;
  color?: string; // Comma-separated; OR match (any of the selected colors).
  card_type?: string;
  exclude_card_type?: string;
  rarity?: string;
  name?: string;
  effect?: string;
  cost?: string;
  level?: string;
  owned_only?: string;
  group_variants?: string;
  status_color?: string;
  source_title?: string;
  /** Comma-separated traits; OR match (any of the selected traits). */
  traits?: string;
  /** Comma-separated link targets; OR match against unit link_refs (pilot name/traits). */
  link_ref?: string;
  limit?: number;
  offset?: number;
}

function invalidateCollectionSideEffects(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['collection'] });
  qc.invalidateQueries({ queryKey: ['collection-status'] });
  qc.invalidateQueries({ queryKey: ['cards'] });
  qc.invalidateQueries({ queryKey: ['decks'] });
  qc.invalidateQueries({ queryKey: ['deck'] });
  qc.invalidateQueries({ queryKey: ['locations'] });
  qc.invalidateQueries({ queryKey: ['shopping'] });
  qc.invalidateQueries({ queryKey: ['loans'] });
  qc.invalidateQueries({ queryKey: ['friend-collection'] });
  qc.invalidateQueries({ queryKey: ['friend-cards'] });
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

export function useSourceTitles() {
  return useQuery({
    queryKey: ['source-titles'],
    queryFn: () =>
      api
        .get<{ data: { sourceTitle: string; count: number }[] }>('/source-titles')
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useTraits() {
  return useQuery({
    queryKey: ['traits'],
    queryFn: () =>
      api.get<{ data: { trait: string; count: number }[] }>('/traits').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useRarities() {
  return useQuery({
    queryKey: ['rarities'],
    queryFn: () =>
      api.get<{ data: { rarity: string; count: number }[] }>('/rarities').then((r) => r.data),
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

/** Owned copies summed across all printings, keyed by cardNumber (deck composition key). */
export function useOwnedByCardNumber() {
  return useQuery({
    queryKey: ['collection', 'owned-by-card'],
    queryFn: () =>
      api.get<{ data: Record<string, number> }>('/collection/owned-by-card').then((r) => r.data),
  });
}

export function useCollectionStatus() {
  return useQuery({
    queryKey: ['collection-status'],
    queryFn: () =>
      api.get<{ data: Record<string, CardStatusBreakdown> }>('/collection/status').then((r) => r.data),
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
      invalidateCollectionSideEffects(qc);
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
    mutationFn: ({ cardNumber, quantity }: { cardNumber: string; quantity: number }) =>
      api.put(`/decks/${deckId}/cards`, { cardNumber, quantity }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck', deckId] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['shopping'] });
    },
  });
}

/** Replace the full deck composition in a single request (client-side draft save). */
export function useSaveDeckCards(deckId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cards: { cardNumber: string; quantity: number }[]) =>
      api.put(`/decks/${deckId}/cards/bulk`, { cards }),
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
      qc.invalidateQueries({ queryKey: ['collection-status'] });
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
      qc.invalidateQueries({ queryKey: ['collection-status'] });
    },
  });
}

export interface ShoppingRow {
  cardNumber: string;
  name: string;
  imageUrl: string | null;
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

export function useInfiniteLocations(query = '', pageSize = 60) {
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: ['locations', { q, limit: pageSize }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<CardLocation>>(
        `/locations${qs({ limit: pageSize, offset: pageParam, q: q || undefined })}`,
      ),
    getNextPageParam: (last) => {
      const next = last._meta.offset + last._meta.count;
      return next < last._meta.total ? next : undefined;
    },
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
      qc.invalidateQueries({ queryKey: ['collection-status'] });
    },
  });
}

export function useSyncCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; version: string | null; cardCount: number; upserted: number }>(
        '/admin/sync',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['sets'] });
      qc.invalidateQueries({ queryKey: ['source-titles'] });
      qc.invalidateQueries({ queryKey: ['traits'] });
      qc.invalidateQueries({ queryKey: ['rarities'] });
      qc.invalidateQueries({ queryKey: ['cards'] });
    },
  });
}

export function useCard(productId: string | null) {
  return useQuery({
    queryKey: ['card', productId],
    enabled: !!productId,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api
        .get<{ data: Card }>(`/cards/${encodeURIComponent(productId!)}`)
        .then((r) => r.data),
  });
}

export function useFriends() {
  return useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<{ data: Friendship[] }>('/friends').then((r) => r.data),
  });
}

export function useSearchUsers(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ['users-search', query],
    enabled: query.length >= 1,
    queryFn: () =>
      api
        .get<{ data: { id: number; username: string; friendshipStatus: string | null; friendshipId: number | null }[] }>(
          `/friends/search${qs({ q: query })}`,
        )
        .then((r) => r.data),
  });
}

export function useRequestFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.post<{ data: Friendship }>('/friends/request', { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['users-search'] });
    },
  });
}

export function useAcceptFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<{ data: Friendship }>(`/friends/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/friends/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['users-search'] });
    },
  });
}

export function useFriendCollectionStatus(friendUserId: number | null) {
  return useQuery({
    queryKey: ['friend-collection', friendUserId, 'status'],
    enabled: friendUserId != null,
    queryFn: () =>
      api
        .get<{
          data: {
            user: { id: number; username: string };
            status: Record<string, CardStatusBreakdown>;
          };
        }>(`/friends/${friendUserId}/collection/status`)
        .then((r) => r.data),
  });
}

export function useInfiniteFriendCards(
  friendUserId: number | null,
  filters: CardFilters,
  pageSize = 60,
) {
  const { offset: _offset, limit: _limit, ...stable } = filters;
  return useInfiniteQuery({
    queryKey: ['friend-cards', 'infinite', friendUserId, { ...stable, limit: pageSize }],
    enabled: friendUserId != null,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Card>>(
        `/friends/${friendUserId}/cards${qs({ ...stable, limit: pageSize, offset: pageParam } as Record<string, unknown>)}`,
      ),
    getNextPageParam: (last) => {
      const next = last._meta.offset + last._meta.count;
      return next < last._meta.total ? next : undefined;
    },
  });
}

export function useOpenLoans() {
  return useQuery({
    queryKey: ['loans', 'open'],
    queryFn: () => api.get<{ data: OpenLoan[] }>('/loans/open').then((r) => r.data),
  });
}

export function useLoanHistory() {
  return useQuery({
    queryKey: ['loans', 'history'],
    queryFn: () => api.get<{ data: LoanHistoryEntry[] }>('/loans/history').then((r) => r.data),
  });
}

export function useCardRequests() {
  return useQuery({
    queryKey: ['loans', 'requests'],
    queryFn: () => api.get<{ data: CardRequest[] }>('/loans/requests').then((r) => r.data),
  });
}

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { borrowerId: number; items: { productId: string; quantity: number }[] }) =>
      api.post('/loans', body),
    onSuccess: () => invalidateCollectionSideEffects(qc),
  });
}

export function useReturnLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loanId,
      items,
    }: {
      loanId: number;
      items: { productId: string; quantity: number }[];
    }) => api.post(`/loans/${loanId}/returns`, { items }),
    onSuccess: () => invalidateCollectionSideEffects(qc),
  });
}

export function useCreateCardRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { toUserId: number; productId: string; quantity: number }) =>
      api.post('/loans/requests', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans', 'requests'] }),
  });
}

export function useAcceptCardRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/loans/requests/${id}/accept`),
    onSuccess: () => {
      invalidateCollectionSideEffects(qc);
      qc.invalidateQueries({ queryKey: ['loans', 'requests'] });
    },
  });
}

export function useRejectCardRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/loans/requests/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans', 'requests'] }),
  });
}

export function useCreateReturnRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { loanId: number; productId: string; quantity: number }) =>
      api.post('/loans/return-requests', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans'] }),
  });
}

export function useInviteCodes() {
  return useQuery({
    queryKey: ['admin', 'invite-codes'],
    queryFn: () => api.get<{ data: InviteCode[] }>('/admin/invite-codes').then((r) => r.data),
  });
}

export function useGenerateInviteCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (count: number) =>
      api.post<{ data: { codes: string[] } }>('/admin/invite-codes', { count }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'invite-codes'] }),
  });
}
