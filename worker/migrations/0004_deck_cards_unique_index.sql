-- Migration 0003 created indexes on deck_cards_new with the same names as the
-- legacy indexes still attached to deck_cards. SQLite skipped them (IF NOT EXISTS),
-- then DROP TABLE removed the old indexes, leaving deck_cards without uniqueness.
-- Recreate them on the live table (idempotent).

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_deck_card` ON `deck_cards` (`deck_id`,`card_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deck_cards_deck` ON `deck_cards` (`deck_id`);
