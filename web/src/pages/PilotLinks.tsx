import { useState } from 'react';
import { motion } from 'framer-motion';
import { Panel, HudButton } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardTile } from '../components/CardTile';
import { CardDetailModal } from '../components/CardDetailModal';
import { ScrollToTopButton } from '../components/ScrollToTopButton';
import {
  useCollection,
  useCollectionStatus,
  useInfiniteCards,
  useSets,
  useSetCollection,
  type CardFilters,
} from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import type { Card, CardStatusBreakdown } from '../lib/types';

const PAGE = 60;

/** Build OR-match refs: pilot name + traits (units can link by name or trait). */
function pilotLinkRefs(pilot: Card): string {
  const refs = [pilot.name, ...(pilot.traits ?? [])]
    .map((r) => r.trim())
    .filter(Boolean);
  return [...new Set(refs)].join(',');
}

export function PilotLinks() {
  const [filters, setFilters] = useState<CardFilters>({
    limit: PAGE,
    card_type: 'PILOT',
    group_variants: '1',
  });
  const [selectedPilot, setSelectedPilot] = useState<Card | null>(null);

  const sets = useSets();
  const cards = useInfiniteCards(filters, PAGE);

  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];

  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!cards.hasNextPage,
    isFetchingNextPage: cards.isFetchingNextPage,
    fetchNextPage: cards.fetchNextPage,
  });

  const updateFilters = (next: CardFilters) => {
    const { offset: _offset, ...rest } = next;
    setFilters({ ...rest, card_type: 'PILOT', group_variants: '1' });
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Pilot Links // Pairing"
        subtitle={cards.data ? `${total} pilotos` : 'consultando base de datos…'}
        className="z-20"
      >
        <Filters
          filters={filters}
          onChange={updateFilters}
          sets={sets.data ?? []}
          cardTypes={['PILOT']}
        />
      </Panel>

      {cards.isLoading && <p className="font-mono text-sm text-muted">Cargando pilotos…</p>}
      {cards.isError && <p className="font-mono text-sm text-alert">Error al cargar pilotos.</p>}
      {!cards.isLoading && !cards.isError && total === 0 && (
        <p className="font-mono text-sm text-muted">Ningún piloto con esos filtros.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((card) => (
          <PilotTile key={card.cardNumber} card={card} onSelect={setSelectedPilot} />
        ))}
        <div ref={loadMoreRef} className="col-span-full h-1" />
      </div>

      {!cards.isLoading && items.length > 0 && (
        <p className="text-center font-mono text-[10px] text-muted">
          {cards.isFetchingNextPage ? 'Cargando más…' : `${items.length} / ${total}`}
        </p>
      )}

      {selectedPilot && (
        <PilotLinkedUnitsModal pilot={selectedPilot} onClose={() => setSelectedPilot(null)} />
      )}
      <ScrollToTopButton />
    </div>
  );
}

function PilotTile({ card, onSelect }: { card: Card; onSelect: (card: Card) => void }) {
  const variants = card.variants?.length ? card.variants : [card];
  const [variantIndex, setVariantIndex] = useState(0);
  const selected = variants[Math.min(variantIndex, variants.length - 1)] ?? card;
  const hasAlternates = variants.length > 1;

  return (
    <CardTile
      card={selected}
      readOnly
      onClick={() => onSelect(selected)}
      footer={
        hasAlternates ? (
          <button
            type="button"
            onClick={() => setVariantIndex((current) => (current + 1) % variants.length)}
            className="flex w-full items-center justify-between border-t border-line px-2 py-1 font-mono text-[10px] uppercase text-amber hover:bg-amber/10"
            title="Cambiar entre impresión normal y versiones alter"
          >
            <span>Versión</span>
            <span>
              {variantLabel(selected)} →{' '}
              {variantLabel(variants[(variantIndex + 1) % variants.length] ?? card)}
            </span>
          </button>
        ) : undefined
      }
    />
  );
}

function PilotLinkedUnitsModal({ pilot, onClose }: { pilot: Card; onClose: () => void }) {
  const linkRef = pilotLinkRefs(pilot);
  const [filters, setFilters] = useState<CardFilters>({
    limit: PAGE,
    card_type: 'UNIT',
    group_variants: '1',
    link_ref: linkRef,
  });
  const [detail, setDetail] = useState<Card | null>(null);

  const sets = useSets();
  const cards = useInfiniteCards(filters, PAGE);
  const collection = useCollection();
  const statusMap = useCollectionStatus();
  const setColl = useSetCollection();

  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const owned = (pid: string) => collection.data?.[pid] ?? 0;
  const cardStatus = (pid: string) => statusMap.data?.[pid];

  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!cards.hasNextPage,
    isFetchingNextPage: cards.isFetchingNextPage,
    fetchNextPage: cards.fetchNextPage,
  });

  const updateFilters = (next: CardFilters) => {
    const { offset: _offset, ...rest } = next;
    setFilters({
      ...rest,
      card_type: 'UNIT',
      group_variants: '1',
      link_ref: linkRef,
    });
  };

  const traitLabel =
    pilot.traits && pilot.traits.length > 0 ? pilot.traits.join(' · ') : pilot.trait;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-3 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden border border-hud/40 bg-panel/95 shadow-hud-strong"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="font-display text-[10px] uppercase tracking-[0.2em] text-hud">
                Link Targets // Units
              </p>
              <h2 className="truncate font-display text-xl text-ink sm:text-2xl">{pilot.name}</h2>
              <p className="font-mono text-sm text-muted">
                {pilot.cardNumber}
                {traitLabel ? ` · ${traitLabel}` : ''}
              </p>
            </div>
            <HudButton variant="ghost" className="!text-sm shrink-0" onClick={onClose}>
              Cerrar
            </HudButton>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            <Panel
              title="Filtros"
              subtitle={cards.data ? `${total} unidades con link` : 'buscando…'}
              className="z-20"
            >
              <Filters
                filters={filters}
                onChange={updateFilters}
                sets={sets.data ?? []}
                cardTypes={['UNIT']}
              />
            </Panel>

            {cards.isLoading && (
              <p className="font-mono text-sm text-muted">Cargando unidades…</p>
            )}
            {cards.isError && (
              <p className="font-mono text-sm text-alert">Error al cargar unidades enlazadas.</p>
            )}
            {!cards.isLoading && !cards.isError && total === 0 && (
              <p className="font-mono text-sm text-muted">
                Ninguna unidad recibe link de este piloto.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {items.map((card) => (
                <LinkedUnitTile
                  key={card.cardNumber}
                  card={card}
                  owned={owned}
                  cardStatus={cardStatus}
                  onChangeOwned={(productId, quantity) => setColl.mutate({ productId, quantity })}
                  onOpenDetail={setDetail}
                />
              ))}
              <div ref={loadMoreRef} className="col-span-full h-1" />
            </div>

            {!cards.isLoading && items.length > 0 && (
              <p className="text-center font-mono text-[10px] text-muted">
                {cards.isFetchingNextPage ? 'Cargando más…' : `${items.length} / ${total}`}
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function LinkedUnitTile({
  card,
  owned,
  cardStatus,
  onChangeOwned,
  onOpenDetail,
}: {
  card: Card;
  owned: (productId: string) => number;
  cardStatus: (productId: string) => CardStatusBreakdown | undefined;
  onChangeOwned: (productId: string, quantity: number) => void;
  onOpenDetail: (card: Card) => void;
}) {
  const variants = card.variants?.length ? card.variants : [card];
  const [variantIndex, setVariantIndex] = useState(0);
  const selected = variants[Math.min(variantIndex, variants.length - 1)] ?? card;
  const quantity = owned(selected.productId);
  const hasAlternates = variants.length > 1;

  return (
    <CardTile
      card={selected}
      owned={quantity}
      status={cardStatus(selected.productId)}
      onChangeOwned={(next) => onChangeOwned(selected.productId, next)}
      onClick={() => onOpenDetail(selected)}
      footer={
        hasAlternates ? (
          <button
            type="button"
            onClick={() => setVariantIndex((current) => (current + 1) % variants.length)}
            className="flex w-full items-center justify-between border-t border-line px-2 py-1 font-mono text-[10px] uppercase text-amber hover:bg-amber/10"
            title="Cambiar entre impresión normal y versiones alter"
          >
            <span>Versión</span>
            <span>
              {variantLabel(selected)} →{' '}
              {variantLabel(variants[(variantIndex + 1) % variants.length] ?? card)}
            </span>
          </button>
        ) : undefined
      }
    />
  );
}

function variantLabel(card: Card): string {
  if (card.rarity?.includes('+')) return card.rarity.replace(/\s+/g, '');
  return 'Normal';
}
