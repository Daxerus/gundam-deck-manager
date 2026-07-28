import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/hud';
import { CardTile, CardImage } from '../components/CardTile';
import { Filters } from '../components/Filters';
import {
  useAcceptFriend,
  useCreateCardRequest,
  useCreateLoan,
  useFriendCollection,
  useFriends,
  useRemoveFriend,
  useRequestFriend,
  useSearchUsers,
  useSets,
  type CardFilters,
} from '../lib/queries';
import { ApiError } from '../lib/api';
import type { Card, CardStatusBreakdown } from '../lib/types';

export function Friends() {
  const [search, setSearch] = useState('');
  const [viewFriendId, setViewFriendId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const friends = useFriends();
  const searchResults = useSearchUsers(search);
  const requestFriend = useRequestFriend();
  const acceptFriend = useAcceptFriend();
  const removeFriend = useRemoveFriend();

  const accepted = useMemo(
    () => (friends.data ?? []).filter((f) => f.status === 'accepted'),
    [friends.data],
  );
  const incoming = useMemo(
    () => (friends.data ?? []).filter((f) => f.isIncoming),
    [friends.data],
  );
  const outgoing = useMemo(
    () => (friends.data ?? []).filter((f) => f.isOutgoing),
    [friends.data],
  );

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

      {search.trim() && (
        <Panel title="Resultados">
          {searchResults.isLoading && <p className="font-mono text-sm text-muted">Buscando…</p>}
          {(searchResults.data ?? []).length === 0 && !searchResults.isLoading && (
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

function matchesFriendFilters(
  card: Card,
  status: CardStatusBreakdown | undefined,
  filters: CardFilters,
): boolean {
  if (filters.name) {
    const q = filters.name.trim().toLowerCase();
    const hay = `${card.name} ${card.cardNumber}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filters.effect) {
    const q = filters.effect.trim().toLowerCase();
    if (!(card.effect ?? '').toLowerCase().includes(q)) return false;
  }
  if (filters.set_code && card.setCode.toLowerCase() !== filters.set_code.toLowerCase()) {
    return false;
  }
  if (filters.color && card.color !== filters.color) return false;
  if (filters.card_type && (card.cardType ?? '').toLowerCase() !== filters.card_type.toLowerCase()) {
    return false;
  }
  if (filters.level !== undefined && filters.level !== '' && Number.isFinite(Number(filters.level))) {
    if (card.level !== Number(filters.level)) return false;
  }
  if (filters.status_color) {
    if (!status || status.statusColor !== filters.status_color) return false;
  }
  if (filters.source_title && card.sourceTitle !== filters.source_title) {
    return false;
  }
  if (filters.traits) {
    const selected = filters.traits
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (selected.length > 0) {
      const cardTraits = (card.traits ?? []).map((t) => t.toLowerCase());
      if (!selected.some((t) => cardTraits.includes(t))) return false;
    }
  }
  return true;
}

function FriendCollectionView({
  friendUserId,
  onBack,
}: {
  friendUserId: number;
  onBack: () => void;
}) {
  const friendCol = useFriendCollection(friendUserId);
  const sets = useSets();
  const [filters, setFilters] = useState<CardFilters>({});
  const [actionCard, setActionCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const username = friendCol.data?.user.username ?? '…';
  const statusMap = friendCol.data?.status ?? {};
  const cards = friendCol.data?.cards ?? [];

  const filtered = useMemo(
    () => cards.filter((card) => matchesFriendFilters(card, statusMap[card.productId], filters)),
    [cards, statusMap, filters],
  );

  const totalCopies = filtered.reduce((sum, card) => {
    const st = statusMap[card.productId];
    return sum + (st?.displayQty ?? st?.owned ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      <Panel
        title={`Colección // ${username}`}
        subtitle={`${filtered.length} cartas distintas · ${totalCopies} copias · solo lectura`}
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
          onChange={setFilters}
          sets={sets.data ?? []}
          showStatusColor
        />
        {toast && <p className="mt-2 font-mono text-[12px] text-hud">{toast}</p>}
      </Panel>

      {friendCol.isLoading && <p className="font-mono text-sm text-muted">Cargando colección…</p>}
      {friendCol.isError && (
        <p className="font-mono text-sm text-alert">No se pudo cargar la colección del amigo.</p>
      )}

      {!friendCol.isLoading && cards.length === 0 && (
        <Panel tone="amber">
          <p className="font-ui text-ink">Este piloto no tiene cartas en colección.</p>
        </Panel>
      )}

      {!friendCol.isLoading && cards.length > 0 && filtered.length === 0 && (
        <Panel tone="amber">
          <p className="font-ui text-ink">Ningún resultado con esos filtros.</p>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {filtered.map((card) => {
          const st = statusMap[card.productId];
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
      </div>

      {actionCard && (
        <FriendCardActionModal
          card={actionCard}
          status={statusMap[actionCard.productId]}
          friendUserId={friendUserId}
          friendUsername={username}
          onClose={() => setActionCard(null)}
          onDone={(message) => {
            setToast(message);
            setActionCard(null);
            void friendCol.refetch();
          }}
        />
      )}
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
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const busy = createLoan.isPending || createRequest.isPending;

  async function lend() {
    setError(null);
    try {
      await createLoan.mutateAsync({
        borrowerId: friendUserId,
        items: [{ productId: card.productId, quantity: qty }],
      });
      onDone(`Prestado x${qty} a ${friendUsername}`);
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
                  disabled={busy}
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
