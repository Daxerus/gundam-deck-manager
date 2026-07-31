import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Panel } from '../components/hud';
import { CardTile, CardImage } from '../components/CardTile';
import { Filters } from '../components/Filters';
import { ScrollToTopButton } from '../components/ScrollToTopButton';
import {
  useAcceptFriend,
  useCreateCardRequest,
  useCreateLoan,
  useCreateLoanContact,
  useDeleteLoanContact,
  useFriendCollectionStatus,
  useFriends,
  useInfiniteFriendCards,
  useLoanContacts,
  useOwnedByCardNumber,
  useRemoveFriend,
  useRequestFriend,
  useSearchUsers,
  useSets,
  type CardFilters,
} from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import { ApiError } from '../lib/api';
import type { Card, CardStatusBreakdown } from '../lib/types';

const PAGE = 60;
const SEARCH_DEBOUNCE_MS = 350;

export function Friends() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewFriendId, setViewFriendId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newNick, setNewNick] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search]);

  const friends = useFriends();
  const contacts = useLoanContacts();
  const createContact = useCreateLoanContact();
  const deleteContact = useDeleteLoanContact();
  const searchResults = useSearchUsers(debouncedSearch);
  const requestFriend = useRequestFriend();
  const acceptFriend = useAcceptFriend();
  const removeFriend = useRemoveFriend();

  const accepted = (friends.data ?? []).filter((f) => f.status === 'accepted');
  const incoming = (friends.data ?? []).filter((f) => f.isIncoming);
  const outgoing = (friends.data ?? []).filter((f) => f.isOutgoing);
  const external = contacts.data ?? [];

  async function run(action: () => Promise<unknown>, okMsg: string) {
    setMsg(null);
    try {
      await action();
      setMsg(okMsg);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error');
    }
  }

  if (viewFriendId != null) {
    return <FriendCollectionView friendUserId={viewFriendId} onBack={() => setViewFriendId(null)} />;
  }

  return (
    <div className="space-y-4">
      <Panel title="Amigos" subtitle="Buscar pilotos · solicitudes · colecciones">
        <label className="flex flex-col gap-1">
          <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
            Buscar usuario
          </span>
          <input
            className="hud-input w-64"
            placeholder="username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {msg && <p className="mt-2 font-mono text-[12px] text-hud">{msg}</p>}
      </Panel>

      {debouncedSearch && (
        <Panel title="Resultados">
          {(searchResults.isLoading || search !== debouncedSearch) && (
            <p className="font-mono text-sm text-muted">Buscando…</p>
          )}
          {(searchResults.data ?? []).length === 0 &&
            !searchResults.isLoading &&
            search === debouncedSearch && (
              <p className="font-mono text-sm text-muted">Sin resultados.</p>
            )}
          <ul className="divide-y divide-line/60">
            {(searchResults.data ?? []).map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-ui text-ink">{u.username}</span>
                {u.friendshipStatus === 'accepted' ? (
                  <button
                    type="button"
                    className="border border-hud/40 px-2 py-0.5 font-display text-[10px] uppercase text-hud"
                    onClick={() => setViewFriendId(u.id)}
                  >
                    Colección
                  </button>
                ) : u.friendshipStatus === 'pending' ? (
                  <span className="font-mono text-[11px] text-amber">Pendiente</span>
                ) : (
                  <button
                    type="button"
                    disabled={requestFriend.isPending}
                    className="border border-ok/40 px-2 py-0.5 font-display text-[10px] uppercase text-ok hover:bg-ok/10"
                    onClick={() =>
                      void run(() => requestFriend.mutateAsync(u.id), `Solicitud enviada a ${u.username}`)
                    }
                  >
                    Añadir
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {incoming.length > 0 && (
        <Panel title="Solicitudes entrantes" tone="amber">
          <ul className="divide-y divide-line/60">
            {incoming.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-ui text-ink">{f.otherUsername}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="border border-ok/40 px-2 py-0.5 font-display text-[10px] uppercase text-ok"
                    onClick={() => void run(() => acceptFriend.mutateAsync(f.id), 'Ahora sois amigos')}
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className="border border-alert/40 px-2 py-0.5 font-display text-[10px] uppercase text-alert"
                    onClick={() => void run(() => removeFriend.mutateAsync(f.id), 'Rechazada')}
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {outgoing.length > 0 && (
        <Panel title="Solicitudes enviadas">
          <ul className="divide-y divide-line/60">
            {outgoing.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-ui text-ink">{f.otherUsername}</span>
                <button
                  type="button"
                  className="border border-line px-2 py-0.5 font-display text-[10px] uppercase text-muted"
                  onClick={() => void run(() => removeFriend.mutateAsync(f.id), 'Cancelada')}
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Amigos" subtitle={`${accepted.length} conexiones`}>
        {friends.isLoading && <p className="font-mono text-sm text-muted">Cargando…</p>}
        {accepted.length === 0 && !friends.isLoading && (
          <p className="font-mono text-sm text-muted">Todavía no tienes amigos.</p>
        )}
        <ul className="divide-y divide-line/60">
          {accepted.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-ui text-ink">{f.otherUsername}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="border border-hud/40 px-2 py-0.5 font-display text-[10px] uppercase text-hud"
                  onClick={() => setViewFriendId(f.otherUserId)}
                >
                  Colección
                </button>
                <button
                  type="button"
                  className="border border-alert/40 px-2 py-0.5 font-display text-[10px] uppercase text-alert"
                  onClick={() =>
                    void run(() => removeFriend.mutateAsync(f.id), `${f.otherUsername} eliminado`)
                  }
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="No registrados"
        subtitle={`${external.length} nicks · préstamos sin confirmación`}
      >
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
              Nuevo nick
            </span>
            <input
              className="hud-input w-48"
              placeholder="ej. Pedro"
              value={newNick}
              onChange={(e) => setNewNick(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={createContact.isPending || !newNick.trim()}
            className="border border-ok/40 px-2 py-1 font-display text-[10px] uppercase text-ok hover:bg-ok/10 disabled:opacity-40"
            onClick={() =>
              void run(async () => {
                await createContact.mutateAsync(newNick.trim());
                setNewNick('');
              }, `Nick guardado`)
            }
          >
            Guardar
          </button>
        </div>
        {contacts.isLoading && <p className="font-mono text-sm text-muted">Cargando…</p>}
        {external.length === 0 && !contacts.isLoading && (
          <p className="font-mono text-sm text-muted">
            Aún no hay nicks. Guarda uno aquí o créalo al prestar / registrar una carta recibida.
          </p>
        )}
        <ul className="divide-y divide-line/60">
          {external.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-ui text-ink">{c.nick}</span>
              <button
                type="button"
                className="border border-alert/40 px-2 py-0.5 font-display text-[10px] uppercase text-alert"
                disabled={deleteContact.isPending}
                onClick={() =>
                  void run(() => deleteContact.mutateAsync(c.id), `${c.nick} eliminado`)
                }
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <p className="font-mono text-[10px] text-muted">
        Historial de préstamos en{' '}
        <Link className="text-hud" to="/loans">
          Préstamos
        </Link>
        .
      </p>
    </div>
  );
}

function FriendCollectionView({
  friendUserId,
  onBack,
}: {
  friendUserId: number;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<CardFilters>({
    limit: PAGE,
    owned_only: '1',
  });
  const [actionCard, setActionCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sets = useSets();
  const meta = useFriendCollectionStatus(friendUserId);
  const cards = useInfiniteFriendCards(friendUserId, filters, PAGE);

  const username = meta.data?.user.username ?? '…';
  const statusMap = meta.data?.status ?? {};
  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const totalCopies = Object.values(statusMap).reduce((s, st) => s + st.displayQty, 0);
  const status = (pid: string) => statusMap[pid];

  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!cards.hasNextPage,
    isFetchingNextPage: cards.isFetchingNextPage,
    fetchNextPage: cards.fetchNextPage,
  });

  const updateFilters = (next: CardFilters) => {
    const { offset: _offset, ...rest } = next;
    setFilters({ ...rest, owned_only: '1' });
  };

  return (
    <div className="space-y-4">
      <Panel
        title={`Colección // ${username}`}
        subtitle={`${total} cartas distintas · ${totalCopies} copias · solo lectura`}
        className="z-20"
      >
        <div className="mb-3">
          <button
            type="button"
            onClick={onBack}
            className="border border-line px-3 py-1 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink"
          >
            ← Volver
          </button>
        </div>
        <Filters
          filters={filters}
          onChange={updateFilters}
          sets={sets.data ?? []}
          showStatusColor
        />
        {toast && <p className="mt-2 font-mono text-[12px] text-hud">{toast}</p>}
      </Panel>

      {cards.isLoading && <p className="font-mono text-sm text-muted">Cargando colección…</p>}
      {cards.isError && (
        <p className="font-mono text-sm text-alert">No se pudo cargar la colección del amigo.</p>
      )}

      {!cards.isLoading && items.length === 0 && (
        <Panel tone="amber">
          <p className="font-ui text-ink">
            {meta.data && Object.keys(statusMap).length === 0
              ? 'Este piloto no tiene cartas en colección.'
              : 'Ningún resultado con esos filtros.'}
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((card) => {
          const st = status(card.productId);
          return (
            <CardTile
              key={card.productId}
              card={card}
              owned={st?.owned ?? 0}
              status={st}
              readOnly
              onClick={() => setActionCard(card)}
            />
          );
        })}
        <div ref={loadMoreRef} className="col-span-full h-1" />
      </div>

      {!cards.isLoading && items.length > 0 && (
        <p className="text-center font-mono text-[10px] text-muted">
          {cards.isFetchingNextPage ? 'Cargando más…' : `${items.length} / ${total}`}
        </p>
      )}

      {actionCard && (
        <FriendCardActionModal
          card={actionCard}
          status={status(actionCard.productId)}
          friendUserId={friendUserId}
          friendUsername={username}
          onClose={() => setActionCard(null)}
          onDone={(message) => {
            setToast(message);
            setActionCard(null);
            void qc.invalidateQueries({ queryKey: ['friend-collection', friendUserId] });
            void qc.invalidateQueries({ queryKey: ['friend-cards'] });
          }}
        />
      )}
      <ScrollToTopButton />
    </div>
  );
}

function FriendCardActionModal({
  card,
  status,
  friendUserId,
  friendUsername,
  onClose,
  onDone,
}: {
  card: Card;
  status: CardStatusBreakdown | undefined;
  friendUserId: number;
  friendUsername: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const createLoan = useCreateLoan();
  const createRequest = useCreateCardRequest();
  const ownedByCard = useOwnedByCardNumber();
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const busy = createLoan.isPending || createRequest.isPending;
  // Copies are counted per card_number: any printing of the card can be lent.
  const myCopies = ownedByCard.data?.[card.cardNumber] ?? 0;
  const canLend = myCopies >= qty;

  async function lend() {
    setError(null);
    try {
      const result = await createLoan.mutateAsync({
        borrowerId: friendUserId,
        items: [{ productId: card.productId, quantity: qty }],
      });
      const broken = result.deckImpacts.map((d) => `"${d.name}"`).join(', ');
      onDone(
        broken
          ? `Prestado x${qty} a ${friendUsername} · se ha desmontado ${broken}`
          : `Prestado x${qty} a ${friendUsername}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo prestar');
    }
  }

  async function request() {
    setError(null);
    try {
      await createRequest.mutateAsync({
        toUserId: friendUserId,
        productId: card.productId,
        quantity: qty,
      });
      onDone(`Solicitud enviada: x${qty} ${card.cardNumber}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo solicitar');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4" onClick={onClose}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Panel title={card.name} subtitle={`${card.cardNumber} · ${friendUsername}`}>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="mx-auto w-36 shrink-0 overflow-hidden border border-line sm:mx-0">
              <div className="aspect-[5/7]">
                <CardImage card={card} />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-mono text-[12px] text-muted">
                Tiene <span className="text-ink">x{status?.displayQty ?? status?.owned ?? 0}</span>
                {status?.statusColor ? (
                  <>
                    {' '}
                    · estado <span className="uppercase text-ink">{status.statusColor}</span>
                  </>
                ) : null}
              </p>
              <p className="font-mono text-[12px] text-muted">
                Tú tienes <span className={myCopies > 0 ? 'text-ok' : 'text-alert'}>x{myCopies}</span>{' '}
                (todas las ediciones)
              </p>
              <label className="flex flex-col gap-1">
                <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
                  Cantidad
                </span>
                <input
                  type="number"
                  min={1}
                  className="hud-input w-24"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              {error && <p className="font-mono text-[12px] text-alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !canLend}
                  title={canLend ? undefined : `Solo tienes x${myCopies} de esta carta`}
                  onClick={() => void lend()}
                  className="border border-loan/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-loan hover:bg-loan/10 disabled:opacity-40"
                >
                  Prestarle x{qty}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void request()}
                  className="border border-borrow/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-borrow hover:bg-borrow/10 disabled:opacity-40"
                >
                  Solicitar x{qty}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-line px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
              <p className="font-mono text-[10px] text-muted">
                Prestarle usa copias tuyas. Solicitar pide que te preste las suyas.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
