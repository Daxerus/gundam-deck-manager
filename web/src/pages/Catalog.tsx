import { useState } from 'react';
import { Panel } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardTile } from '../components/CardTile';
import { CardDetailModal } from '../components/CardDetailModal';
import { useCollection, useInfiniteCards, useSets, useSetCollection, type CardFilters } from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import type { Card } from '../lib/types';

const PAGE = 60;

export function Catalog() {
  const [filters, setFilters] = useState<CardFilters>({ limit: PAGE });
  const [detail, setDetail] = useState<Card | null>(null);

  const sets = useSets();
  const cards = useInfiniteCards(filters, PAGE);
  const collection = useCollection();
  const setColl = useSetCollection();

  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const owned = (pid: string) => collection.data?.[pid] ?? 0;

  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!cards.hasNextPage,
    isFetchingNextPage: cards.isFetchingNextPage,
    fetchNextPage: cards.fetchNextPage,
  });

  const updateFilters = (next: CardFilters) => {
    const { offset: _offset, ...rest } = next;
    setFilters(rest);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Collection // Database"
        subtitle={cards.data ? `${total} resultados` : 'consultando base de datos…'}
      >
        <Filters filters={filters} onChange={updateFilters} sets={sets.data ?? []} />
      </Panel>

      {cards.isLoading && <p className="font-mono text-sm text-muted">Cargando cartas…</p>}
      {cards.isError && <p className="font-mono text-sm text-alert">Error al cargar el catálogo.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((card) => (
          <CardTile
            key={card.productId}
            card={card}
            owned={owned(card.productId)}
            onChangeOwned={(qty) => setColl.mutate({ productId: card.productId, quantity: qty })}
            onClick={() => setDetail(card)}
          />
        ))}
        <div ref={loadMoreRef} className="col-span-full h-1" />
      </div>

      {!cards.isLoading && items.length > 0 && (
        <p className="text-center font-mono text-[10px] text-muted">
          {cards.isFetchingNextPage ? 'Cargando más…' : `${items.length} / ${total}`}
        </p>
      )}

      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
