import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { decks, type DeckRow } from '../db/schema';

/** Load a deck owned by the given user, or null if missing / foreign. */
export async function getOwnedDeck(
  db: DB,
  userId: number,
  deckId: number,
): Promise<DeckRow | null> {
  if (!Number.isInteger(deckId) || deckId < 1) return null;
  const row = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
    .get();
  return row ?? null;
}
