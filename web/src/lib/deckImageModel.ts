export type DeckImageLayout = 'poster' | 'grid';
export type DeckImageOrder = 'default' | 'level' | 'cost';
export type DeckImageFormat = 'png' | 'jpeg';
export type DeckImageSize = 'standard' | 'large' | 'ultra';

export const DECK_IMAGE_WIDTH: Record<DeckImageSize, number> = {
  standard: 1080,
  large: 1920,
  ultra: 2560,
};

export interface DeckImageCard {
  cardNumber: string;
  name: string;
  quantity: number;
  cardType: string | null;
  color: string | null;
  level: number | null;
  cost: number | null;
  imageUrl: string | null;
}

export interface DeckImageOptions {
  layout: DeckImageLayout;
  order: DeckImageOrder;
  format: DeckImageFormat;
  size: DeckImageSize;
  showCreator: boolean;
  showName: boolean;
  showCover: boolean;
  showQr: boolean;
  /** Card shown in the banner. Null picks the first unit that has art. */
  coverCardNumber: string | null;
}

export interface DeckImageCurve {
  label: string;
  average: number | null;
  buckets: { label: string; count: number }[];
}

export interface PreparedDeckImage {
  ordered: DeckImageCard[];
  cells: DeckImageCard[];
  types: { label: string; count: number }[];
  colors: { color: string; count: number; hex: string }[];
  curves: DeckImageCurve[];
  cover: DeckImageCard | null;
  sheet: {
    width: number;
    height: number;
    heroHeight: number;
    cardsTop: number;
    padX: number;
    columns: number;
    faceWidth: number;
    faceHeight: number;
    gapX: number;
    gapY: number;
    caption: number;
    showCount: boolean;
  };
}

const REF_W = 1680;
const PAD_X = 24;
const PAD_BOTTOM = 24;
const HERO_H = 430;
const BEFORE_CARDS = 70;

const TYPE_ORDER = ['UNIT', 'PILOT', 'COMMAND', 'BASE'] as const;
const TYPE_LABELS: Record<string, string> = {
  UNIT: 'UNITS',
  PILOT: 'PILOTS',
  COMMAND: 'COMMANDS',
  BASE: 'BASES',
  RESOURCE: 'RESOURCES',
};

const COLOR_ORDER = ['Blue', 'White', 'Red', 'Green', 'Purple', 'Yellow'];
const COLOR_HEX: Record<string, string> = {
  Blue: '#54a8dc',
  Green: '#7caf61',
  Red: '#f37779',
  White: '#e5e8ec',
  Purple: '#bd8ddd',
  Yellow: '#efd351',
};

export function prepareDeckImage(cards: DeckImageCard[], options: DeckImageOptions): PreparedDeckImage {
  const ordered = sortCards(cards, options.order);
  const cells =
    options.layout === 'grid'
      ? ordered.flatMap((card) =>
          Array.from({ length: card.quantity }, () => ({ ...card, quantity: 1 })),
        )
      : ordered;
  const grid = gridSpec(options.layout);
  const inner = REF_W - PAD_X * 2;
  const faceWidth = (inner - (grid.columns - 1) * grid.gapX) / grid.columns;
  const faceHeight = faceWidth * 1.4;
  const rows = cells.length === 0 ? 0 : Math.ceil(cells.length / grid.columns);
  const gridHeight =
    rows === 0 ? 0 : rows * (faceHeight + grid.caption) + Math.max(0, rows - 1) * grid.gapY;
  const cardsTop = HERO_H + BEFORE_CARDS;
  const height = Math.ceil(cardsTop + gridHeight + PAD_BOTTOM);

  return {
    ordered,
    cells,
    types: typeStats(ordered),
    colors: colorStats(ordered),
    curves: [statCurve(ordered, 'cost', 'COST'), statCurve(ordered, 'level', 'LEVEL')],
    cover: pickCoverCard(ordered, options.coverCardNumber),
    sheet: {
      width: REF_W,
      height,
      heroHeight: HERO_H,
      cardsTop,
      padX: PAD_X,
      columns: grid.columns,
      faceWidth,
      faceHeight,
      gapX: grid.gapX,
      gapY: grid.gapY,
      caption: grid.caption,
      showCount: grid.showCount,
    },
  };
}

export function deckImageFileSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'deck';
}

function gridSpec(layout: DeckImageLayout) {
  if (layout === 'grid') {
    return { columns: 10, gapX: 10, gapY: 10, caption: 0, showCount: false };
  }
  return { columns: 5, gapX: 16, gapY: 20, caption: 38, showCount: true };
}

function sortCards(cards: DeckImageCard[], order: DeckImageOptions['order']): DeckImageCard[] {
  return cards
    .filter((card) => card.quantity > 0 && card.cardNumber.trim())
    .map((card) => ({ ...card, quantity: Math.floor(card.quantity) }))
    .sort((a, b) => {
      const typeDelta = typeRank(a.cardType) - typeRank(b.cardType);
      if (typeDelta !== 0) return typeDelta;
      if (order === 'cost' || order === 'level') {
        const av = a[order];
        const bv = b[order];
        const aMissing = av == null;
        const bMissing = bv == null;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (av != null && bv != null && av !== bv) return av - bv;
      }
      return a.cardNumber.localeCompare(b.cardNumber, 'en', { numeric: true });
    });
}

function typeRank(cardType: string | null): number {
  const normalized = (cardType ?? '').trim().toUpperCase();
  const index = TYPE_ORDER.indexOf(normalized as (typeof TYPE_ORDER)[number]);
  return index === -1 ? TYPE_ORDER.length : index;
}

function typeStats(cards: DeckImageCard[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const type = (card.cardType ?? '').trim().toUpperCase();
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + card.quantity);
  }
  return [...counts.entries()]
    .sort((a, b) => typeRank(a[0]) - typeRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([type, count]) => ({ label: TYPE_LABELS[type] ?? type, count }));
}

function colorStats(cards: DeckImageCard[]): { color: string; count: number; hex: string }[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const color = canonColor(card.color);
    if (!color) continue;
    counts.set(color, (counts.get(color) ?? 0) + card.quantity);
  }
  return [...counts.entries()]
    .sort((a, b) => colorRank(a[0]) - colorRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([color, count]) => ({ color, count, hex: COLOR_HEX[color] ?? '#9a9aa3' }));
}

function canonColor(color: string | null): string | null {
  const trimmed = color?.trim();
  if (!trimmed) return null;
  return COLOR_ORDER.find((entry) => entry.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

function colorRank(color: string): number {
  const index = COLOR_ORDER.indexOf(color);
  return index === -1 ? COLOR_ORDER.length : index;
}

function statCurve(cards: DeckImageCard[], field: 'cost' | 'level', label: string): DeckImageCurve {
  const samples: { value: number; count: number }[] = [];
  for (const card of cards) {
    const value = card[field];
    if (value == null || value < 0 || !Number.isFinite(value)) continue;
    samples.push({ value, count: card.quantity });
  }
  if (samples.length === 0) {
    return { label, average: null, buckets: [{ label: '0', count: 0 }] };
  }
  const cap = 12;
  const peak = Math.min(cap, Math.max(...samples.map((sample) => Math.floor(sample.value))));
  const buckets = Array.from({ length: peak + 1 }, (_, index) => ({ label: String(index), count: 0 }));
  let total = 0;
  let copies = 0;
  let overflow = false;
  for (const sample of samples) {
    const index = Math.min(peak, Math.floor(sample.value));
    if (sample.value > peak) overflow = true;
    buckets[index]!.count += sample.count;
    total += sample.value * sample.count;
    copies += sample.count;
  }
  if (overflow) buckets[peak]!.label += '+';
  return { label, average: copies > 0 ? total / copies : null, buckets };
}

export function pickCoverCard(cards: DeckImageCard[], coverCardNumber: string | null): DeckImageCard | null {
  const withArt = cards.filter((card) => card.quantity > 0 && card.imageUrl);
  if (coverCardNumber) {
    const chosen = withArt.find((card) => card.cardNumber === coverCardNumber);
    if (chosen) return chosen;
  }
  const ranked = [...withArt].sort((a, b) => {
    const typeDelta = typeRank(a.cardType) - typeRank(b.cardType);
    if (typeDelta !== 0) return typeDelta;
    const costDelta = (a.cost ?? 99) - (b.cost ?? 99);
    if (costDelta !== 0) return costDelta;
    return a.cardNumber.localeCompare(b.cardNumber, 'en', { numeric: true });
  });
  return ranked[0] ?? null;
}
