import { useState } from 'react';
import { Panel } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardTile } from '../components/CardTile';
import { CardDetailModal } from '../components/CardDetailModal';
import { LendCardDialog } from '../components/LendCardDialog';
import { ReturnLoanDialog } from '../components/ReturnLoanDialog';
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
import type { Card } from '../lib/types';

const PAGE = 60;

export function Collection() {
  const [filters, setFilters] = useState<CardFilters>({
    limit: PAGE,
    owned_only: '1',
  });
  const [detail, setDetail] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [returnDlg, setReturnDlg] = useState<{
    loanId: number;
    productId: string;
    maxQty: number;
    username: string;
  } | null>(null);
  const [lendDlg, setLendDlg] = useState<{ card: Card; maxQty: number } | null>(null);

  const sets = useSets();
  const cards = useInfiniteCards(filters, PAGE);
  const collection = useCollection();
  const statusMap = useCollectionStatus();
  const setColl = useSetCollection();

  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const owned = (pid: string) => collection.data?.[pid] ?? 0;
  const status = (pid: string) => statusMap.data?.[pid];
  const totalCopies = Object.values(statusMap.data ?? {}).reduce((s, st) => s + st.displayQty, 0);

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
        className="z-20"
      >
        <Filters
          filters={filters}
          onChange={updateFilters}
          sets={sets.data ?? []}
          showStatusColor
        />
        {toast && <p className="mt-2 font-mono text-[12px] text-hud">{toast}</p>}
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
            status={status(card.productId)}
            onChangeOwned={(qty) => setColl.mutate({ productId: card.productId, quantity: qty })}
            onClick={() => setDetail(card)}
            onReturnLoan={(loanId, productId, maxQty, username) =>
              setReturnDlg({ loanId, productId, maxQty, username })
            }
            onLend={(maxQty) => setLendDlg({ card, maxQty })}
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
      {returnDlg && (
        <ReturnLoanDialog
          {...returnDlg}
          onClose={() => setReturnDlg(null)}
        />
      )}
      {lendDlg && (
        <LendCardDialog
          {...lendDlg}
          onClose={() => setLendDlg(null)}
          onDone={(message) => {
            setToast(message);
            setLendDlg(null);
          }}
        />
      )}
      <ScrollToTopButton />
    </div>
  );
}
