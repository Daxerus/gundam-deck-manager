import { useState } from 'react';
import { Panel } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardTile } from '../components/CardTile';
import { CardDetailModal } from '../components/CardDetailModal';
import { useCollection, useInfiniteCards, useSets, useSetCollection, type CardFilters } from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import type { Card } from '../lib/types';

const PAGE = 60;

export function Collection() {
  const [filters, setFilters] = useState<CardFilters>({
    limit: PAGE,
    owned_only: '1',
  });
  const [detail, setDetail] = useState<Card | null>(null);

  const sets = useSets();
  const cards = useInfiniteCards(filters, PAGE);
  const collection = useCollection();
  const setColl = useSetCollection();

  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const owned = (pid: string) => collection.data?.[pid] ?? 0;
  const totalCopies = Object.values(collection.data ?? {}).reduce((s, n) => s + n, 0);

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
        title="My Collection // Box"
        subtitle={`${total} cartas distintas · ${totalCopies} copias`}
      >
        <Filters filters={filters} onChange={updateFilters} sets={sets.data ?? []} />
      </Panel>

      {cards.isLoading && <p className="font-mono text-sm text-muted">Cargando colección…</p>}
      {!cards.isLoading && items.length === 0 && (
        <Panel tone="amber">
          <p className="font-ui text-ink">
            Aún no has marcado ninguna carta. Ve al <span className="text-hud">Catálogo</span> y usa los
            botones <span className="text-ok">+ / −</span> para registrar tus copias.
          </p>
        </Panel>
      )}

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
