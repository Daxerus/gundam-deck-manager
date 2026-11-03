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

/** Card code, optional letter/printing suffix (`GD01-001a`, `GD01-086_p3`). */
const CARD_CODE = String.raw`[A-Za-z][A-Za-z0-9]*-\d+[A-Za-z0-9]*(?:_[A-Za-z0-9]+)*`;
const CARD_NUMBER_RE = new RegExp(`^${CARD_CODE}$`, 'i');
const BRACKET_CODE_RE = new RegExp(String.raw`[\[(]\s*(${CARD_CODE})\s*[\])]`, 'i');
const QTY_THEN_CODE_RE = new RegExp(String.raw`^(\d+)\s*[x×X]?\s+(${CARD_CODE})\b`, 'i');
const QTY_TIGHT_RE = new RegExp(String.raw`^(\d+)\s*[x×X]\s*(${CARD_CODE})\b`, 'i');
/** `4 - Launcher Strike Gundam - GD01-024` — name between dashes, code at the end. */
const QTY_DASH_NAME_CODE_RE = new RegExp(
  String.raw`^(\d+)\s*[x×X]?\s+-\s+.*\s+-\s+(${CARD_CODE})\s*$`,
  'i',
);
const CODE_FIRST_RE = new RegExp(String.raw`^(${CARD_CODE})(?:\s*[x×X]\s*(\d+))?(?:\s+.*)?\s*$`, 'i');
const MAX_LINE_QTY = 9999;

/** Sample accepted by the importer. A bare code counts as 1 copy. */
export const IMPORT_LIST_EXAMPLE = `4 GD01-024
4x GD01-024
4 - Launcher Strike Gundam - GD01-024
4x GD01-024 Launcher Strike Gundam
GD01-024`;

/**
 * Parse a plain-text deck or collection list.
 * - Lines starting with `//` are comments (ignored).
 * - Empty lines are ignored.
 * - The card name is ignored. Only the code and the quantity are kept.
 * - Supported lines: `4 GD01-024`, `4x GD01-024`, `4x GD01-024 Launcher Strike Gundam`,
 *   `4 - Launcher Strike Gundam - GD01-024`, `GD01-024` (1 copy), `2 Guntank [GD01-008]`.
 * - Duplicate card numbers are summed.
 */
export function parseDeckText(text: string): DeckImportResult {
  const cards = new Map<string, number>();
  const skipped: DeckImportSkip[] = [];

  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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
    if (!Number.isFinite(parsed.quantity) || parsed.quantity <= 0 || parsed.quantity > MAX_LINE_QTY) {
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
  const cleaned = line.replace(/^[-*•]\s+/, '').trim();
  if (!cleaned) return null;

  // Name-first lists keep the code in brackets: `2 Guntank [GD01-008]`.
  // Prefer that over a model number that appears earlier in the name (`TR-5`).
  const bracket = cleaned.match(BRACKET_CODE_RE);
  if (bracket) {
    const leading = cleaned.match(/^\s*(\d+)\b/);
    return { quantity: leading ? Number(leading[1]) : 1, cardNumber: bracket[1]! };
  }

  const qtyThenCode = cleaned.match(QTY_THEN_CODE_RE) ?? cleaned.match(QTY_TIGHT_RE);
  if (qtyThenCode) {
    return { quantity: Number(qtyThenCode[1]), cardNumber: qtyThenCode[2]! };
  }

  const dashName = cleaned.match(QTY_DASH_NAME_CODE_RE);
  if (dashName) {
    return { quantity: Number(dashName[1]), cardNumber: dashName[2]! };
  }

  const codeFirst = cleaned.match(CODE_FIRST_RE);
  if (codeFirst) {
    return { quantity: codeFirst[2] ? Number(codeFirst[2]) : 1, cardNumber: codeFirst[1]! };
  }

  return null;
}
