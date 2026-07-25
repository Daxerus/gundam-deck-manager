/**
 * Official Gundam Card Game deck-construction rules (pure, no DB) so it is unit-testable.
 * - Main deck: exactly 50 cards.
 * - Max 4 copies per card_number.
 * - Max 2 colors (colorless cards do not count toward the color limit).
 * - Resource deck: exactly 10 cards.
 */

export const MAIN_DECK_SIZE = 50;
export const MAX_COPIES = 4;
export const MAX_COLORS = 2;
export const RESOURCE_DECK_SIZE = 10;

export interface DeckCardInput {
  cardNumber: string;
  quantity: number;
}

export interface CardMeta {
  cardNumber: string;
  color: string | null;
  cardType: string | null;
  name: string;
  imageUrl?: string | null;
}

export interface ShoppingShortage {
  cardNumber: string;
  name: string;
  required: number;
  owned: number;
  missing: number;
}

export interface ValidationResult {
  legal: boolean;
  mainCount: number;
  colors: string[];
  errors: string[];
  warnings: string[];
  shortages: ShoppingShortage[];
}

export function validateDeck(
  deckCards: DeckCardInput[],
  resourceDeckSize: number,
  cardMeta: Map<string, CardMeta>,
  ownedByCardNumber: Map<string, number>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mainCount = deckCards.reduce((s, dc) => s + dc.quantity, 0);
  if (mainCount !== MAIN_DECK_SIZE) {
    errors.push(`El deck principal debe tener exactamente ${MAIN_DECK_SIZE} cartas (tiene ${mainCount}).`);
  }

  for (const dc of deckCards) {
    if (dc.quantity > MAX_COPIES) {
      const name = cardMeta.get(dc.cardNumber)?.name;
      errors.push(
        `Máximo ${MAX_COPIES} copias por carta: ${name ?? dc.cardNumber} (${dc.cardNumber}) tiene ${dc.quantity}.`,
      );
    }
  }

  const colorSet = new Set<string>();
  for (const dc of deckCards) {
    const color = cardMeta.get(dc.cardNumber)?.color;
    if (color) colorSet.add(color);
  }
  const colors = [...colorSet].sort();
  if (colors.length > MAX_COLORS) {
    errors.push(`Máximo ${MAX_COLORS} colores por deck (usa ${colors.length}: ${colors.join(', ')}).`);
  }

  if (resourceDeckSize !== RESOURCE_DECK_SIZE) {
    errors.push(`El resource deck debe tener ${RESOURCE_DECK_SIZE} cartas (tiene ${resourceDeckSize}).`);
  }

  const shortages: ShoppingShortage[] = [];
  for (const dc of deckCards) {
    const have = ownedByCardNumber.get(dc.cardNumber) ?? 0;
    if (dc.quantity > have) {
      const name = cardMeta.get(dc.cardNumber)?.name ?? dc.cardNumber;
      const missing = dc.quantity - have;
      shortages.push({
        cardNumber: dc.cardNumber,
        name,
        required: dc.quantity,
        owned: have,
        missing,
      });
      warnings.push(
        `No tienes suficientes copias de ${name} (${dc.cardNumber}): necesitas ${dc.quantity}, tienes ${have}.`,
      );
    }
  }

  return { legal: errors.length === 0, mainCount, colors, errors, warnings, shortages };
}
