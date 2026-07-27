import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/hud';
import { CardTile } from '../components/CardTile';
import {
  useAcceptFriend,
  useCreateCardRequest,
  useCreateLoan,
  useFriendCollection,
  useFriends,
  useRemoveFriend,
  useRequestFriend,
  useSearchUsers,
} from '../lib/queries';
import { ApiError } from '../lib/api';

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

function FriendCollectionView({
  friendUserId,
  onBack,
}: {
  friendUserId: number;
  onBack: () => void;
}) {
  const friendCol = useFriendCollection(friendUserId);
  const createLoan = useCreateLoan();
  const createRequest = useCreateCardRequest();
  const [msg, setMsg] = useState<string | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const username = friendCol.data?.user.username ?? '…';
  const status = friendCol.data?.status ?? {};
  const cards = friendCol.data?.cards ?? [];

  async function lend(productId: string) {
    const quantity = Math.max(1, qtyByProduct[productId] ?? 1);
    setMsg(null);
    try {
      await createLoan.mutateAsync({
        borrowerId: friendUserId,
        items: [{ productId, quantity }],
      });
      setMsg(`Prestado x${quantity}`);
      void friendCol.refetch();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo prestar');
    }
  }

  async function request(productId: string) {
    const quantity = Math.max(1, qtyByProduct[productId] ?? 1);
    setMsg(null);
    try {
      await createRequest.mutateAsync({ toUserId: friendUserId, productId, quantity });
      setMsg(`Solicitud enviada: x${quantity}`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo solicitar');
    }
  }

  return (
    <div className="space-y-4">
      <Panel title={`Colección // ${username}`} subtitle="Solo lectura · prestar / solicitar">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="border border-line px-3 py-1 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink"
          >
            ← Volver
          </button>
          {selected && (
            <>
              <input
                type="number"
                min={1}
                className="hud-input w-16"
                value={qtyByProduct[selected] ?? 1}
                onChange={(e) =>
                  setQtyByProduct((prev) => ({
                    ...prev,
                    [selected]: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
              />
              <button
                type="button"
                className="border border-loan/50 px-2 py-1 font-display text-[10px] uppercase text-loan"
                onClick={() => void lend(selected)}
              >
                Prestarle
              </button>
              <button
                type="button"
                className="border border-borrow/50 px-2 py-1 font-display text-[10px] uppercase text-borrow"
                onClick={() => void request(selected)}
              >
                Solicitar
              </button>
              <span className="font-mono text-[11px] text-muted">{selected}</span>
            </>
          )}
        </div>
        {msg && <p className="mt-2 font-mono text-[12px] text-hud">{msg}</p>}
      </Panel>

      {friendCol.isLoading && <p className="font-mono text-sm text-muted">Cargando colección…</p>}
      {friendCol.isError && (
        <p className="font-mono text-sm text-alert">No se pudo cargar la colección del amigo.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {cards.map((card) => {
          const st = status[card.productId];
          const active = selected === card.productId;
          return (
            <div
              key={card.productId}
              className={active ? 'ring-1 ring-hud shadow-hud' : undefined}
              onClick={() => setSelected(card.productId)}
            >
              <CardTile card={card} owned={st?.owned ?? 0} status={st} readOnly />
            </div>
          );
        })}
      </div>

      {!friendCol.isLoading && cards.length === 0 && (
        <Panel tone="amber">
          <p className="font-ui text-ink">Este piloto no tiene cartas en colección.</p>
        </Panel>
      )}
    </div>
  );
}
