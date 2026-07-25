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
  productId: string;
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
  productId: string;
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
  owned: Map<string, number>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mainCount = deckCards.reduce((s, dc) => s + dc.quantity, 0);
  if (mainCount !== MAIN_DECK_SIZE) {
    errors.push(`El deck principal debe tener exactamente ${MAIN_DECK_SIZE} cartas (tiene ${mainCount}).`);
  }

  const copiesByCardNumber = new Map<string, number>();
  for (const dc of deckCards) {
    copiesByCardNumber.set(dc.cardNumber, (copiesByCardNumber.get(dc.cardNumber) ?? 0) + dc.quantity);
  }
  for (const [cardNumber, quantity] of copiesByCardNumber) {
    if (quantity > MAX_COPIES) {
      const printing = deckCards.find((dc) => dc.cardNumber === cardNumber);
      const name = printing ? cardMeta.get(printing.productId)?.name : undefined;
      errors.push(`Máximo ${MAX_COPIES} copias por carta: ${name ?? cardNumber} (${cardNumber}) tiene ${quantity}.`);
    }
  }

  const colorSet = new Set<string>();
  for (const dc of deckCards) {
    const color = cardMeta.get(dc.productId)?.color;
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
    const have = owned.get(dc.productId) ?? 0;
    if (dc.quantity > have) {
      const name = cardMeta.get(dc.productId)?.name ?? dc.cardNumber;
      const missing = dc.quantity - have;
      shortages.push({
        productId: dc.productId,
        cardNumber: dc.cardNumber,
        name,
        required: dc.quantity,
        owned: have,
        missing,
      });
      warnings.push(
        `No tienes suficientes copias de ${name} (${dc.cardNumber}, ${dc.productId}): necesitas ${dc.quantity}, tienes ${have}.`,
      );
    }
  }

  return { legal: errors.length === 0, mainCount, colors, errors, warnings, shortages };
}
