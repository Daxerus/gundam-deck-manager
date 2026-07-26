// Mirrors worker/src/services/validation.ts constants for client-side display.
import type { DeckValidation } from './types';

export const MAIN_DECK_SIZE = 50;
export const MAX_COPIES = 4;
export const MAX_COLORS = 2;
export const RESOURCE_DECK_SIZE = 10;

/** Lightweight client-side validation for draft decks (before save). */
export function validateDeckDraft(
  cards: { cardNumber: string; quantity: number; name?: string | null; color?: string | null; owned?: number }[],
  resourceDeckSize: number,
): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mainCount = cards.reduce((sum, card) => sum + card.quantity, 0);

  if (mainCount !== MAIN_DECK_SIZE) {
    errors.push(`El deck principal debe tener exactamente ${MAIN_DECK_SIZE} cartas (tiene ${mainCount}).`);
  }

  for (const card of cards) {
    if (card.quantity > MAX_COPIES) {
      errors.push(
        `Máximo ${MAX_COPIES} copias por carta: ${card.name ?? card.cardNumber} (${card.cardNumber}) tiene ${card.quantity}.`,
      );
    }
  }

  const colorSet = new Set<string>();
  for (const card of cards) {
    if (card.color) colorSet.add(card.color);
  }
  const colors = [...colorSet].sort();
  if (colors.length > MAX_COLORS) {
    errors.push(`Máximo ${MAX_COLORS} colores por deck (usa ${colors.length}: ${colors.join(', ')}).`);
  }

  if (resourceDeckSize !== RESOURCE_DECK_SIZE) {
    errors.push(`El resource deck debe tener ${RESOURCE_DECK_SIZE} cartas (tiene ${resourceDeckSize}).`);
  }

  const shortages: DeckValidation['shortages'] = [];
  for (const card of cards) {
    const owned = card.owned ?? 0;
    if (card.quantity > owned) {
      const name = card.name ?? card.cardNumber;
      const missing = card.quantity - owned;
      shortages.push({
        cardNumber: card.cardNumber,
        name,
        required: card.quantity,
        owned,
        missing,
      });
      warnings.push(
        `No tienes suficientes copias de ${name} (${card.cardNumber}): necesitas ${card.quantity}, tienes ${owned}.`,
      );
    }
  }

  return { legal: errors.length === 0, mainCount, colors, errors, warnings, shortages };
}
