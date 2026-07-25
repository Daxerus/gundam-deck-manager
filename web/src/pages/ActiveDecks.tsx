import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Panel, HudButton, StatusBadge } from '../components/hud';
import { CardImage } from '../components/CardTile';
import { MovePlanDialog } from '../components/MovePlanDialog';
import {
  useActivate,
  useActivationPlan,
  useDeactivate,
  useDecks,
  useInfiniteLocations,
  useSetLocation,
} from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import { MAIN_DECK_SIZE } from '../lib/rules';
import type {
  ActivationPlan,
  CardLocation,
  DeckSummary,
  PullPreference,
} from '../lib/types';

const LOCATIONS_PAGE = 60;

export function ActiveDecks() {
  const decks = useDecks();
  const planMut = useActivationPlan();
  const activate = useActivate();
  const deactivate = useDeactivate();

  const [pending, setPending] = useState<{ deckId: number; plan: ActivationPlan } | null>(null);

  async function openPlan(deckId: number) {
    const plan = await planMut.mutateAsync({ deckId, allowBox: true });
    setPending({ deckId, plan });
  }

  async function refreshPlan(allowBox: boolean) {
    if (!pending) return;
    const plan = await planMut.mutateAsync({ deckId: pending.deckId, allowBox });
    setPending({ deckId: pending.deckId, plan });
  }

  async function confirm(preferences: PullPreference[], allowBox: boolean) {
    if (!pending) return;
    await activate.mutateAsync({ deckId: pending.deckId, preferences, allowBox });
    setPending(null);
  }

  const active = decks.data?.filter((d) => d.isActive) ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Active Loadout // Swap Control" subtitle={`${active.length} decks activos`}>
        <p className="font-ui text-[13px] text-muted">
          Marca un deck como <span className="text-ok">activo</span> para ensamblarlo físicamente. Si una
          carta está en otro deck activo, el sistema te mostrará de dónde sacarla antes de confirmar.
        </p>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {decks.data?.map((d) => (
          <Panel
            key={d.id}
            tone={d.isActive ? 'ok' : d.complete ? 'hud' : 'amber'}
            title={d.name}
            right={
              d.isActive ? (
                <StatusBadge tone="ok" blink>
                  Activo
                </StatusBadge>
              ) : (
                <StatusBadge tone="muted">Inactivo</StatusBadge>
              )
            }
          >
            <div className="flex items-center justify-between font-mono text-[12px] text-muted">
              <span>
                Main <span className={d.mainCount === MAIN_DECK_SIZE ? 'text-ok' : 'text-amber'}>{d.mainCount}/{MAIN_DECK_SIZE}</span>
              </span>
              <span className={d.buildable ? 'text-ok' : 'text-alert'}>
                {d.buildable ? 'Construible' : 'Faltan copias'}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              {d.isActive ? (
                <HudButton variant="amber" onClick={() => deactivate.mutate(d.id)}>
                  Desactivar
                </HudButton>
              ) : (
                <HudButton variant="ok" onClick={() => openPlan(d.id)} disabled={planMut.isPending}>
                  Activar
                </HudButton>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <LocationsPanel decks={decks.data ?? []} />

      {pending && (
        <MovePlanDialog
          plan={pending.plan}
          busy={activate.isPending}
          onConfirm={confirm}
          onAllowBoxChange={refreshPlan}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function LocationsPanel({ decks }: { decks: DeckSummary[] }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [editing, setEditing] = useState<CardLocation | null>(null);
  const [preview, setPreview] = useState<CardLocation | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const loc = useInfiniteLocations(debouncedQuery, LOCATIONS_PAGE);
  const rows = loc.data?.pages.flatMap((page) => page.data) ?? [];
  const total = loc.data?.pages[0]?._meta.total ?? 0;
  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!loc.hasNextPage,
    isFetchingNextPage: loc.isFetchingNextPage,
    fetchNextPage: loc.fetchNextPage,
    rootRef: scrollRef,
  });

  const subtitle =
    total > 0
      ? `${rows.length} / ${total} impresiones`
      : loc.isLoading
        ? '…'
        : '0 impresiones';

  return (
    <Panel title="Card Tracking // Ubicación física" subtitle={subtitle}>
      {loc.isError ? (
        <p className="font-ui text-alert">
          Error al cargar ubicaciones. Recarga la página o vuelve a sincronizar sesión.
        </p>
      ) : (
        <div className="relative space-y-3">
          <input
            className="hud-input w-full max-w-sm font-mono text-[13px]"
            placeholder="filtrar por nombre, nº o deck…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPreview(null);
            }}
            autoComplete="off"
          />
          {loc.isLoading && rows.length === 0 ? (
            <p className="font-ui text-muted">Cargando ubicaciones…</p>
          ) : total === 0 ? (
            <p className="font-ui text-muted">
              {debouncedQuery
                ? `Ninguna carta coincide con “${debouncedQuery}”.`
                : 'Aún no tienes copias registradas.'}
            </p>
          ) : (
            <div className="relative">
              <div className="pointer-events-none absolute right-0 top-0 z-[40] w-44 sm:w-52">
                {preview && (
                  <div key={preview.productId} className="animate-card-preview-in border border-hud/50 bg-void p-1 shadow-hud-strong">
                    <div className="aspect-[5/7] w-full overflow-hidden">
                      <CardImage card={preview} width={500} />
                    </div>
                    <div className="px-1 py-1 font-mono text-[10px] text-muted">
                      {preview.cardNumber}
                      {preview.productId !== preview.cardNumber ? ` · ${preview.productId}` : ''}
                    </div>
                  </div>
                )}
              </div>
              <div ref={scrollRef} className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[760px] table-fixed font-mono text-[12px]">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[18%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                    <col className="w-[23%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1 pr-3">Carta</th>
                      <th className="px-3">Nº</th>
                      <th className="px-3">Total</th>
                      <th className="px-3">Colección</th>
                      <th className="px-3">En decks</th>
                      <th className="px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.productId}
                        className="border-t border-line/60 transition-colors hover:bg-hud/5"
                        onMouseEnter={() => setPreview(r)}
                        onMouseLeave={() => setPreview(null)}
                      >
                        <td className="truncate py-1 pr-3 text-ink" title={r.name}>{r.name}</td>
                        <td className="overflow-hidden px-3 text-muted">
                          <span className="block truncate">{r.cardNumber}</span>
                          {r.productId !== r.cardNumber && (
                            <span className="block truncate text-[10px] text-hud" title={r.productId}>
                              {r.productId}
                            </span>
                          )}
                        </td>
                        <td className="px-3 text-hud">{r.owned}</td>
                        <td className={`px-3 ${r.box > 0 ? 'text-ok' : 'text-muted'}`}>{r.box}</td>
                        <td className="truncate px-3 text-amber" title={r.decks.map((d) => `${d.name}×${d.qty}`).join(' · ')}>
                          {r.decks.length === 0
                            ? '—'
                            : r.decks.map((d) => `${d.name}×${d.qty}`).join('  ·  ')}
                        </td>
                        <td className="px-3 text-right">
                          <HudButton variant="ghost" className="!px-2 !py-0.5 !text-[10px]" onClick={() => setEditing(r)}>
                            Editar
                          </HudButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div ref={loadMoreRef} className="h-1" />
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted">
                {loc.isFetchingNextPage
                  ? 'Cargando más…'
                  : `${rows.length} / ${total}`}
              </p>
            </div>
          )}
        </div>
      )}

      {editing && (
        <LocationEditDialog
          location={editing}
          decks={decks}
          onClose={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}

function LocationEditDialog({
  location,
  decks,
  onClose,
}: {
  location: CardLocation;
  decks: DeckSummary[];
  onClose: () => void;
}) {
  const setLoc = useSetLocation();
  const [qtyByDeck, setQtyByDeck] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const d of decks) init[d.id] = 0;
    for (const d of location.decks) init[d.deckId] = d.qty;
    return init;
  });

  useEffect(() => {
    const init: Record<number, number> = {};
    for (const d of decks) init[d.id] = 0;
    for (const d of location.decks) init[d.deckId] = d.qty;
    setQtyByDeck(init);
  }, [location, decks]);

  const deckAllocated = useMemo(
    () => Object.values(qtyByDeck).reduce((s, n) => s + n, 0),
    [qtyByDeck],
  );
  const box = location.owned - deckAllocated;
  const valid = box >= 0 && deckAllocated <= location.owned;

  function bump(deckId: number, delta: number) {
    setQtyByDeck((prev) => {
      const cur = prev[deckId] ?? 0;
      const next = cur + delta;
      if (next < 0) return prev;
      const others = Object.entries(prev).reduce(
        (s, [id, q]) => s + (Number(id) === deckId ? 0 : q),
        0,
      );
      if (others + next > location.owned) return prev;
      return { ...prev, [deckId]: next };
    });
  }

  async function save() {
    if (!valid) return;
    await setLoc.mutateAsync({
      productId: location.productId,
      decks: Object.entries(qtyByDeck)
        .map(([deckId, qty]) => ({ deckId: Number(deckId), qty }))
        .filter((d) => d.qty > 0),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/85 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md border border-hud/40 bg-panel/95 p-4 shadow-hud-strong"
      >
        <h2 className="mb-1 font-display text-sm uppercase tracking-[0.2em] text-hud">
          // Reasignar ubicación
        </h2>
        <p className="font-mono text-[12px] text-ink">{location.name}</p>
        <p className="mb-4 font-mono text-[11px] text-muted">
          {location.cardNumber}
          {location.productId !== location.cardNumber ? ` · ${location.productId}` : ''}
          {' · '}
          {location.owned} copias
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between border border-line/60 bg-void/40 px-3 py-2">
            <span className="font-mono text-[12px] text-ok">Colección</span>
            <span className={`font-mono text-[13px] ${box > 0 ? 'text-ok' : 'text-muted'}`}>{box}</span>
          </div>

          {decks.length === 0 ? (
            <p className="font-ui text-[13px] text-muted">No tienes decks. Todas las copias quedan en colección.</p>
          ) : (
            decks.map((d) => {
              const qty = qtyByDeck[d.id] ?? 0;
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 border border-line/60 bg-void/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[12px] text-amber">Deck {d.name}</span>
                    {d.isActive && (
                      <span className="ml-2 font-display text-[9px] uppercase tracking-[0.16em] text-ok">
                        activo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <HudButton
                      variant="ghost"
                      className="!px-2 !py-0.5 !text-[11px]"
                      onClick={() => bump(d.id, -1)}
                      disabled={qty <= 0 || setLoc.isPending}
                    >
                      −
                    </HudButton>
                    <span className="w-6 text-center font-mono text-[13px] text-ink">{qty}</span>
                    <HudButton
                      variant="ghost"
                      className="!px-2 !py-0.5 !text-[11px]"
                      onClick={() => bump(d.id, 1)}
                      disabled={box <= 0 || setLoc.isPending}
                    >
                      +
                    </HudButton>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!valid && (
          <p className="mt-3 font-mono text-[11px] text-alert">
            La suma supera las copias en posesión.
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <HudButton variant="ghost" onClick={onClose} disabled={setLoc.isPending}>
            Cancelar
          </HudButton>
          <HudButton variant="ok" onClick={save} disabled={!valid || setLoc.isPending}>
            {setLoc.isPending ? 'Guardando…' : 'Guardar'}
          </HudButton>
        </div>
      </motion.div>
    </div>
  );
}
