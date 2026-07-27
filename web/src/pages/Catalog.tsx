import { useState } from 'react';
import { Panel } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardTile } from '../components/CardTile';
import { CardDetailModal } from '../components/CardDetailModal';
import { useAuth } from '../lib/auth';
import {
  useCollection,
  useCollectionStatus,
  useInfiniteCards,
  useSets,
  useSetCollection,
  useStatus,
  useSyncCatalog,
  type CardFilters,
} from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import { ApiError } from '../lib/api';
import type { Card, CardStatusBreakdown } from '../lib/types';
import { ReturnLoanDialog } from '../components/ReturnLoanDialog';

const PAGE = 60;

export function Catalog() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<CardFilters>({
    limit: PAGE,
    group_variants: '1',
  });
  const [detail, setDetail] = useState<Card | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [returnDlg, setReturnDlg] = useState<{
    loanId: number;
    productId: string;
    maxQty: number;
    username: string;
  } | null>(null);

  const status = useStatus();
  const sets = useSets();
  const cards = useInfiniteCards(filters, PAGE);
  const collection = useCollection();
  const statusMap = useCollectionStatus();
  const setColl = useSetCollection();
  const sync = useSyncCatalog();

  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const owned = (pid: string) => collection.data?.[pid] ?? 0;
  const cardStatus = (pid: string) => statusMap.data?.[pid];
  const catalogCardCount = status.data?.cardCount ?? null;
  const emptyCatalog =
    !status.isLoading && catalogCardCount !== null && catalogCardCount === 0;
  const emptySearch =
    !emptyCatalog && !cards.isLoading && !cards.isError && total === 0;

  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!cards.hasNextPage,
    isFetchingNextPage: cards.isFetchingNextPage,
    fetchNextPage: cards.fetchNextPage,
  });

  const updateFilters = (next: CardFilters) => {
    const { offset: _offset, ...rest } = next;
    setFilters({ ...rest, group_variants: '1' });
  };

  async function runSync() {
    setSyncError(null);
    try {
      await sync.mutateAsync();
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : 'Sync falló');
    }
  }

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

      {emptyCatalog && (
        <Panel title="Catálogo vacío" tone="amber">
          <p className="font-mono text-sm text-muted">
            La base aún no tiene cartas. Hay que sincronizar el dataset de gcg-api.
          </p>
          {user?.isAdmin ? (
            <button
              type="button"
              onClick={() => void runSync()}
              disabled={sync.isPending}
              className="mt-3 border border-hud/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-hud hover:bg-hud/10 disabled:opacity-40"
            >
              {sync.isPending ? 'Sincronizando… (puede tardar ~30s)' : 'Sincronizar catálogo'}
            </button>
          ) : (
            <p className="mt-2 font-mono text-[12px] text-amber">
              Pide al admin que pulse Sync en la cabecera.
            </p>
          )}
          {syncError && <p className="mt-2 font-mono text-[12px] text-alert">{syncError}</p>}
        </Panel>
      )}

      {emptySearch && (
        <p className="font-mono text-sm text-muted">Ningún resultado con esos filtros.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((card) => (
          <CatalogCardTile
            key={card.cardNumber}
            card={card}
            owned={owned}
            cardStatus={cardStatus}
            onChangeOwned={(productId, quantity) => setColl.mutate({ productId, quantity })}
            onOpenDetail={setDetail}
            onReturnLoan={(loanId, productId, maxQty, username) =>
              setReturnDlg({ loanId, productId, maxQty, username })
            }
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
      {returnDlg && <ReturnLoanDialog {...returnDlg} onClose={() => setReturnDlg(null)} />}
    </div>
  );
}

function CatalogCardTile({
  card,
  owned,
  cardStatus,
  onChangeOwned,
  onOpenDetail,
  onReturnLoan,
}: {
  card: Card;
  owned: (productId: string) => number;
  cardStatus: (productId: string) => CardStatusBreakdown | undefined;
  onChangeOwned: (productId: string, quantity: number) => void;
  onOpenDetail: (card: Card) => void;
  onReturnLoan: (loanId: number, productId: string, maxQty: number, username: string) => void;
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
      onReturnLoan={onReturnLoan}
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
