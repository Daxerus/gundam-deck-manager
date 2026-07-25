import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel, HudButton, StatusBadge } from '../components/hud';
import { Filters } from '../components/Filters';
import { CardImage, QuantityStepper } from '../components/CardTile';
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
  const qtyByCardNumber = new Map(d.cards.map((c) => [c.cardNumber, c.quantity]));

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
          title="Deck"
          subtitle={`${v.mainCount}/${MAIN_DECK_SIZE} · colores: ${v.colors.join(', ') || '—'}`}
          tone={v.mainCount === MAIN_DECK_SIZE ? 'hud' : 'amber'}
        >
          {d.cards.length === 0 ? (
            <p className="font-ui text-muted">Deck vacío. Añade cartas desde el buscador de la derecha.</p>
          ) : (
            <DeckContents
              entries={d.cards}
              onSet={(cardNumber, quantity) => setCard.mutate({ cardNumber, quantity })}
              onPreview={(card) => setPreview(card ? { card, side: 'deck' } : null)}
            />
          )}
        </Panel>

        {/* Card search to add */}
        <div className="relative self-start lg:sticky lg:top-16">
          {preview && (
            <PreviewLayer
              key={preview.card.productId}
              card={preview.card}
              side={preview.side}
              onClose={() => setPreview(null)}
            />
          )}
          <AddCards
            getQty={(cardNumber) => qtyByCardNumber.get(cardNumber) ?? 0}
            onAdd={(cardNumber, q) => setCard.mutate({ cardNumber, quantity: q })}
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
  onSet: (cardNumber: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const units = entries.filter((entry) => entry.card?.cardType?.toUpperCase() === 'UNIT');
  const support = entries.filter((entry) => entry.card?.cardType?.toUpperCase() !== 'UNIT');

  return (
    <div className="space-y-5">
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
  onSet: (cardNumber: string, quantity: number) => void;
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {entries.map((entry) => (
            <DeckCardTile
              key={entry.cardNumber}
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
  onSet: (cardNumber: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const cc = colorClasses(entry.card?.color);
  const stock =
    entry.owned <= 0 ? 'none' : entry.owned < entry.quantity ? 'partial' : 'ok';
  const stockBorder =
    stock === 'none' ? 'border-alert/70' : stock === 'partial' ? 'border-amber/70' : cc.border;

  return (
    <div
      className={`group relative border ${stockBorder} bg-panel/50 transition hover:shadow-hud`}
      onMouseEnter={() => {
        if (!canHoverPreview()) return;
        onPreview(entry.card);
      }}
      onMouseLeave={() => {
        if (!canHoverPreview()) return;
        onPreview(null);
      }}
    >
      <button
        type="button"
        className="relative block aspect-[5/7] w-full overflow-hidden outline-none focus:shadow-hud"
        title={entry.card?.name ?? entry.cardNumber}
        aria-label={`Vista previa de ${entry.card?.name ?? entry.cardNumber}`}
        onClick={() => onPreview(entry.card)}
      >
        {entry.card ? (
          <CardImage card={entry.card} />
        ) : (
          <span className="flex h-full items-center justify-center p-2 font-mono text-[9px] text-muted">
            {entry.cardNumber}
          </span>
        )}
      </button>
      <QuantityStepper
        value={entry.quantity}
        onChange={(quantity) => onSet(entry.cardNumber, quantity)}
      />
    </div>
  );
}

function PreviewLayer({
  card,
  side,
  onClose,
}: {
  card: Card;
  side: 'deck' | 'add';
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-void/70 p-4 lg:pointer-events-none lg:absolute lg:inset-auto lg:block lg:w-96 lg:bg-transparent lg:p-0 ${
        side === 'deck' ? 'lg:left-0 lg:top-0' : 'lg:right-full lg:top-0 lg:mr-3'
      }`}
      onClick={onClose}
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-auto lg:max-h-none lg:max-w-none lg:overflow-visible">
        <DeckCardPreview card={card} />
        <p className="mt-2 text-center font-mono text-[10px] text-muted lg:hidden">Toca para cerrar</p>
      </div>
    </div>
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
        {card.productId !== card.cardNumber ? ` · ${card.productId}` : ''}
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
  getQty: (cardNumber: string) => number;
  onAdd: (cardNumber: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  const [filters, setFilters] = useState<CardFilters>({
    limit: ADD_PAGE,
    exclude_card_type: 'RESOURCE',
    group_variants: '1',
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
    setFilters({ ...rest, exclude_card_type: 'RESOURCE', group_variants: '1' });
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
        Una ficha por identidad (normal + alter suman). Usa − / + para la cantidad en el deck.
      </p>
      <div ref={scrollRef} className="grid max-h-[520px] grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">
        {items.map((card) => (
          <AddCardTile
            key={card.cardNumber}
            card={card}
            getQty={getQty}
            onAdd={onAdd}
            onPreview={onPreview}
          />
        ))}
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

function AddCardTile({
  card,
  getQty,
  onAdd,
  onPreview,
}: {
  card: Card;
  getQty: (cardNumber: string) => number;
  onAdd: (cardNumber: string, quantity: number) => void;
  onPreview: (card: Card | null) => void;
}) {
  // Representative printing only — deck composition is by card_number.
  const quantity = getQty(card.cardNumber);
  const cc = colorClasses(card.color);

  return (
    <div
      className={`group relative border ${cc.border} bg-panel/50 transition hover:shadow-hud`}
      onMouseEnter={() => {
        if (!canHoverPreview()) return;
        onPreview(card);
      }}
      onMouseLeave={() => {
        if (!canHoverPreview()) return;
        onPreview(null);
      }}
    >
      <button
        type="button"
        className="relative block aspect-[5/7] w-full overflow-hidden outline-none focus:shadow-hud"
        title={`${card.name} (${card.cardNumber})`}
        aria-label={`Vista previa de ${card.name}`}
        onClick={() => onPreview(card)}
      >
        <CardImage card={card} />
      </button>
      <QuantityStepper
        value={quantity}
        onChange={(next) => onAdd(card.cardNumber, next)}
      />
    </div>
  );
}

function canHoverPreview() {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
