export type DeckImportSkip = {
  line: number;
  raw: string;
  reason: string;
};

export type DeckImportResult = {
  cards: Map<string, number>;
  skipped: DeckImportSkip[];
  totalCopies: number;
  distinctCards: number;
};

const CARD_NUMBER_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const LINE_WITH_X_RE = /^(\d+)\s*[x×X]\s*([A-Za-z][A-Za-z0-9]*-\d+)\s*$/;
const LINE_WITH_SPACE_RE = /^(\d+)\s+([A-Za-z][A-Za-z0-9]*-\d+)\s*$/;
const LINE_CARD_ONLY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+)\s*$/;

/**
 * Parse a plain-text deck list.
 * - Lines starting with `//` are comments (ignored).
 * - Empty lines are ignored.
 * - Supported card lines: `2x ST01-009`, `2 ST01-009`, `ST01-009`.
 * - Duplicate card numbers are summed.
 */
export function parseDeckText(text: string): DeckImportResult {
  const cards = new Map<string, number>();
  const skipped: DeckImportSkip[] = [];

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;

    const parsed = parseDeckLine(trimmed);
    if (!parsed) {
      skipped.push({ line: i + 1, raw: trimmed, reason: 'formato no reconocido' });
      continue;
    }
    if (!CARD_NUMBER_RE.test(parsed.cardNumber)) {
      skipped.push({ line: i + 1, raw: trimmed, reason: 'número de carta inválido' });
      continue;
    }
    if (parsed.quantity <= 0) {
      skipped.push({ line: i + 1, raw: trimmed, reason: 'cantidad inválida' });
      continue;
    }

    const cardNumber = parsed.cardNumber.toUpperCase();
    cards.set(cardNumber, (cards.get(cardNumber) ?? 0) + parsed.quantity);
  }

  let totalCopies = 0;
  for (const qty of cards.values()) totalCopies += qty;

  return {
    cards,
    skipped,
    totalCopies,
    distinctCards: cards.size,
  };
}

/**
 * Serialize deck composition to plain text (`2x ST01-009` per line).
 * Optional header comment is included when `title` is provided.
 */
export function formatDeckText(
  cards: { cardNumber: string; quantity: number }[],
  opts?: { title?: string },
): string {
  const lines: string[] = [];
  if (opts?.title?.trim()) {
    lines.push(`// ${opts.title.trim()}`);
  }
  const sorted = [...cards]
    .filter((c) => c.quantity > 0 && c.cardNumber.trim())
    .sort((a, b) => a.cardNumber.localeCompare(b.cardNumber));
  for (const card of sorted) {
    lines.push(`${card.quantity}x ${card.cardNumber.toUpperCase()}`);
  }
  return lines.join('\n');
}

function parseDeckLine(line: string): { cardNumber: string; quantity: number } | null {
  let match = line.match(LINE_WITH_X_RE);
  if (match) {
    return { quantity: Number(match[1]), cardNumber: match[2]! };
  }
  match = line.match(LINE_WITH_SPACE_RE);
  if (match) {
    return { quantity: Number(match[1]), cardNumber: match[2]! };
  }
  match = line.match(LINE_CARD_ONLY_RE);
  if (match) {
    return { quantity: 1, cardNumber: match[1]! };
  }
  return null;
}
