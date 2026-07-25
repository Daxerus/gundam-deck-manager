import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel, HudButton, StatusBadge } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardImage } from '../components/CardTile';
import {
  useInfiniteCards,
  useDeck,
  useDeleteDeck,
  useSetDeckCard,
  useSets,
  useUpdateDeck,
  type CardFilters,
} from '../lib/queries';
import { useLoadMoreOnScroll } from '../lib/useLoadMoreOnScroll';
import { MAIN_DECK_SIZE, RESOURCE_DECK_SIZE } from '../lib/rules';
import { colorClasses } from '../lib/colors';
import type { Card, DeckCardEntry, DeckValidation } from '../lib/types';

export function DeckEditor() {
  const { id } = useParams();
  const deckId = Number(id);
  const navigate = useNavigate();

  const deck = useDeck(deckId);
  const update = useUpdateDeck();
  const del = useDeleteDeck();
  const setCard = useSetDeckCard(deckId);

  const [name, setName] = useState('');
  const [preview, setPreview] = useState<{ card: Card; side: 'deck' | 'add' } | null>(null);
  useEffect(() => {
    if (deck.data) setName(deck.data.name);
  }, [deck.data?.name]);

  if (deck.isLoading) return <p className="font-mono text-sm text-muted">Cargando deck…</p>;
  if (!deck.data) return <p className="font-mono text-sm text-alert">Deck no encontrado.</p>;

  const d = deck.data;
  const v = d.validation;
  const qtyByProductId = new Map(d.cards.map((c) => [c.productId, c.quantity]));

  return (
    <div className="space-y-4">
      <Panel
        tone={d.isActive ? 'ok' : v.legal ? 'hud' : 'amber'}
        title="Deck Editor"
        right={
          <div className="flex items-center gap-2">
            {d.isActive && (
              <StatusBadge tone="ok" blink>
                Activo
              </StatusBadge>
            )}
            <HudButton variant="ghost" onClick={() => navigate('/decks')}>
              ◄ Volver
            </HudButton>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">Nombre</span>
            <input
              className="hud-input w-64"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== d.name && update.mutate({ id: deckId, name })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">Resource deck</span>
            <input
              className="hud-input w-24"
              type="number"
              min={0}
              defaultValue={d.resourceDeckSize}
              onBlur={(e) => update.mutate({ id: deckId, resourceDeckSize: Number(e.target.value) })}
            />
          </label>
          <HudButton
            variant="alert"
            className="mb-0.5"
            onClick={() => {
              if (confirm(`¿Eliminar el deck "${d.name}"?`)) {
                del.mutate(deckId);
                navigate('/decks');
              }
            }}
          >
            Eliminar deck
          </HudButton>
        </div>
      </Panel>

      {/* Validation summary */}
      <ValidationSummary validation={v} resourceDeckSize={d.resourceDeckSize} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Deck contents */}
        <Panel
          title="Composición"
          subtitle={`${v.mainCount}/${MAIN_DECK_SIZE} · colores: ${v.colors.join(', ') || '—'}`}
          tone={v.mainCount === MAIN_DECK_SIZE ? 'hud' : 'amber'}
        >
          {d.cards.length === 0 ? (
            <p className="font-ui text-muted">Deck vacío. Añade cartas desde el buscador de la derecha.</p>
          ) : (
            <DeckContents
              entries={d.cards}
              onSet={(productId, quantity) => setCard.mutate({ productId, quantity })}
              onPreview={(card) => setPreview(card ? { card, side: 'deck' } : null)}
            />
          )}
        </Panel>

        {/* Card search to add */}
        <div className="relative self-start lg:sticky lg:top-16">
          <div className="pointer-events-none absolute left-0 top-0 z-[100]">
            {preview?.side === 'deck' && (
              <div key={preview.card.productId} className="w-96">
                <DeckCardPreview card={preview.card} />
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute right-full top-0 z-[100] mr-3">
            {preview?.side === 'add' && (
              <div key={preview.card.productId} className="w-96">
                <DeckCardPreview card={preview.card} />
              </div>
            )}
          </div>
          <AddCards
            getQty={(productId) => qtyByProductId.get(productId) ?? 0}
            onAdd={(productId, q) => setCard.mutate({ productId, quantity: q })}
            onPreview={(card) => setPreview(card ? { card, side: 'add' } : null)}
          />
        </div>
      </div>
    </div>
  );
}

function ValidationSummary({
  validation,
  resourceDeckSize,
}: {
  validation: DeckValidation;
  resourceDeckSize: number;
}) {
  const v = validation;
  return (
    <Panel
      tone={v.legal ? 'ok' : 'alert'}
      title="Validación de reglas"
      right={
        v.legal ? <StatusBadge tone="ok">Legal</StatusBadge> : <StatusBadge tone="alert">Ilegal</StatusBadge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ul className="space-y-1 font-mono text-[12px]">
          <Rule ok={v.mainCount === MAIN_DECK_SIZE} label={`Main deck ${v.mainCount}/${MAIN_DECK_SIZE}`} />
          <Rule ok={v.colors.length <= 2} label={`Colores ${v.colors.length}/2 (${v.colors.join(', ') || '—'})`} />
          <Rule ok={resourceDeckSize === RESOURCE_DECK_SIZE} label={`Resource deck ${resourceDeckSize}/${RESOURCE_DECK_SIZE}`} />
          <Rule ok={!v.errors.some((e) => e.includes('copias'))} label="Máx. 4 copias por carta" />
        </ul>
        <div className="space-y-1">
          {v.errors.map((e, i) => (
            <p key={`e${i}`} className="font-mono text-[12px] text-alert">
              ✖ {e}
            </p>
          ))}
          {v.warnings.map((w, i) => (
            <p key={`w${i}`} className="font-mono text-[12px] text-amber">
              ▲ {w}
            </p>
          ))}
          {v.errors.length === 0 && v.warnings.length === 0 && (
            <p className="font-mono text-[12px] text-ok">Sin incidencias.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? 'text-ok' : 'text-alert'}>
      {ok ? '✓' : '✖'} {label}
    </li>
  );
}

function DeckContents({
  entries,
  onSet,
  onPreview,
}: {
  entries: DeckCardEntry[];
  onSet: (productId: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const units = entries.filter((entry) => entry.card?.cardType?.toUpperCase() === 'UNIT');
  const support = entries.filter((entry) => entry.card?.cardType?.toUpperCase() !== 'UNIT');

  return (
    <div className="space-y-5">
      <p className="font-mono text-[10px] text-muted">
        Clic <span className="text-ok">+1</span> · Shift+clic <span className="text-alert">−1</span>
      </p>
      <DeckTypeSection label="Units" entries={units} onSet={onSet} onPreview={onPreview} />
      <DeckTypeSection
        label="Pilots / Commands / Bases"
        entries={support}
        onSet={onSet}
        onPreview={onPreview}
      />
    </div>
  );
}

function DeckTypeSection({
  label,
  entries,
  onSet,
  onPreview,
}: {
  label: string;
  entries: DeckCardEntry[];
  onSet: (productId: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const count = entries.reduce((total, entry) => total + entry.quantity, 0);

  return (
    <section>
      <div className="mb-2 flex items-center gap-3 border-b border-line/80 pb-1.5">
        <h3 className="font-display text-[10px] uppercase tracking-[0.18em] text-hud">{label}</h3>
        <span className="font-mono text-[11px] text-ink">({count})</span>
        <span className="h-px flex-1 bg-gradient-to-r from-hud/30 to-transparent" />
      </div>
      {entries.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {entries.map((entry) => (
            <DeckCardTile
              key={entry.productId}
              entry={entry}
              onSet={onSet}
              onPreview={onPreview}
            />
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-line/70 px-3 py-4 text-center font-mono text-[10px] text-muted">
          Sin cartas
        </p>
      )}
    </section>
  );
}

function DeckCardTile({
  entry,
  onSet,
  onPreview,
}: {
  entry: DeckCardEntry;
  onSet: (productId: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const cc = colorClasses(entry.card?.color);
  const stock =
    entry.owned <= 0 ? 'none' : entry.owned < entry.quantity ? 'partial' : 'ok';
  const stockBorder =
    stock === 'none' ? 'border-alert/70' : stock === 'partial' ? 'border-amber/70' : cc.border;
  const stockBadge =
    stock === 'none'
      ? 'border-alert/50 text-alert'
      : stock === 'partial'
        ? 'border-amber/50 text-amber'
        : 'border-ok/50 text-ok';

  return (
    <button
      type="button"
      className={`group relative border ${stockBorder} bg-panel/50 outline-none transition hover:shadow-hud focus:shadow-hud`}
      title={`${entry.card?.name ?? entry.productId} — clic: +1 · shift+clic: −1`}
      onClick={(event) =>
        onSet(entry.productId, event.shiftKey ? Math.max(0, entry.quantity - 1) : entry.quantity + 1)
      }
      onMouseEnter={() => onPreview(entry.card)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(entry.card)}
      onBlur={() => onPreview(null)}
    >
      <div className="aspect-[5/7] w-full overflow-hidden">
        {entry.card ? (
          <CardImage card={entry.card} />
        ) : (
          <span className="flex h-full items-center justify-center p-2 font-mono text-[9px] text-muted">
            {entry.productId}
          </span>
        )}
      </div>
      <span className={`absolute right-0.5 top-0.5 border bg-void/90 px-1.5 font-mono text-[16px] ${stockBadge}`}>
        ×{entry.quantity}
      </span>
    </button>
  );
}

function DeckCardPreview({ card }: { card: Card }) {
  return (
    <div className="animate-card-preview-in border border-hud/50 bg-void p-1 shadow-hud-strong">
      <div className="aspect-[5/7] w-full overflow-hidden">
        <CardImage card={card} width={700} />
      </div>
      <div className="px-1 py-1 font-mono text-[10px] text-muted">
        {card.cardNumber} · {card.rarity ?? 'sin rareza'}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.14em] transition-colors ${
        active ? 'bg-hud/15 text-hud' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

const ADD_PAGE = 60;
const DECK_CARD_TYPES = ['UNIT', 'PILOT', 'COMMAND', 'BASE'];

function AddCards({
  getQty,
  onAdd,
  onPreview,
}: {
  getQty: (productId: string) => number;
  onAdd: (productId: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const [filters, setFilters] = useState<CardFilters>({
    limit: ADD_PAGE,
    exclude_card_type: 'RESOURCE',
  });
  const ownedOnly = filters.owned_only === '1';
  const sets = useSets();
  const cards = useInfiniteCards(filters, ADD_PAGE);
  const total = cards.data?.pages[0]?._meta.total ?? 0;
  const items = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useLoadMoreOnScroll({
    hasNextPage: !!cards.hasNextPage,
    isFetchingNextPage: cards.isFetchingNextPage,
    fetchNextPage: cards.fetchNextPage,
    rootRef: scrollRef,
  });

  const updateFilters = (next: CardFilters) => {
    const { offset: _offset, ...rest } = next;
    setFilters({ ...rest, exclude_card_type: 'RESOURCE' });
  };

  return (
    <Panel
      title="Añadir cartas"
      subtitle={cards.data ? `${total} resultados` : '…'}
      right={
        <div className="flex border border-line">
          <ToggleBtn
            active={!ownedOnly}
            onClick={() => updateFilters({ ...filters, owned_only: undefined })}
          >
            Todas
          </ToggleBtn>
          <ToggleBtn
            active={ownedOnly}
            onClick={() => updateFilters({ ...filters, owned_only: '1' })}
          >
            En colección
          </ToggleBtn>
        </div>
      }
    >
      <div className="mb-2">
        <Filters
          filters={filters}
          onChange={updateFilters}
          sets={sets.data ?? []}
          cardTypes={DECK_CARD_TYPES}
        />
      </div>
      <p className="mb-3 font-mono text-[10px] text-muted">
        Clic <span className="text-ok">+1</span> · Shift+clic <span className="text-alert">−1</span>
      </p>
      <div ref={scrollRef} className="grid max-h-[520px] grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
        {items.map((card) => {
          const q = getQty(card.productId);
          const cc = colorClasses(card.color);
          return (
            <button
              key={card.productId}
              onClick={(e) => onAdd(card.productId, e.shiftKey ? Math.max(0, q - 1) : q + 1)}
              className={`group relative border ${cc.border} bg-panel/50 transition hover:shadow-hud`}
              title={`${card.name} — clic: +1 · shift+clic: −1`}
              onMouseEnter={() => onPreview(card)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(card)}
              onBlur={() => onPreview(null)}
            >
              <div className="aspect-[5/7] w-full overflow-hidden">
                <CardImage card={card} />
              </div>
              {q > 0 && (
                <span className="absolute right-0.5 top-0.5 border border-ok/50 bg-void/85 px-1.5 font-mono text-[16px] text-ok">
                  {q}
                </span>
              )}
            </button>
          );
        })}
        <div ref={loadMoreRef} className="col-span-full h-1" />
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted">
        {cards.isFetchingNextPage
          ? 'Cargando más…'
          : items.length > 0
            ? `${items.length} / ${total}`
            : cards.isLoading
              ? 'Cargando…'
              : 'Sin resultados'}
      </p>
    </Panel>
  );
}
