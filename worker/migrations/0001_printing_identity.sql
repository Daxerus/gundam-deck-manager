-- Treat each printing (product_id) as its own card in decks/allocations,
-- so different rarities of the same card_number are tracked separately.
-- Existing values were card_numbers, which equal the base printing's product_id.

ALTER TABLE `deck_cards` RENAME COLUMN `card_number` TO `product_id`;
--> statement-breakpoint
ALTER TABLE `allocations` RENAME COLUMN `card_number` TO `product_id`;
