-- Deck composition by playable identity (card_number); physical allocations stay per product_id.
-- Aggregates existing deck_cards rows that referenced different printings of the same card.

CREATE TABLE `deck_cards_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `card_number` text NOT NULL,
  `quantity` integer DEFAULT 1 NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_deck_card` ON `deck_cards_new` (`deck_id`,`card_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deck_cards_deck` ON `deck_cards_new` (`deck_id`);
--> statement-breakpoint
INSERT INTO `deck_cards_new` (`deck_id`, `card_number`, `quantity`)
SELECT
  dc.`deck_id`,
  COALESCE(c.`card_number`, dc.`product_id`) AS `card_number`,
  SUM(dc.`quantity`) AS `quantity`
FROM `deck_cards` dc
LEFT JOIN `cards` c ON c.`product_id` = dc.`product_id`
GROUP BY dc.`deck_id`, COALESCE(c.`card_number`, dc.`product_id`);
--> statement-breakpoint
DROP TABLE `deck_cards`;
--> statement-breakpoint
ALTER TABLE `deck_cards_new` RENAME TO `deck_cards`;
