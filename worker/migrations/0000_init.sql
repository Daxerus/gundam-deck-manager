-- Initial schema for gundam-deck-manager (matches worker/src/db/schema.ts)

CREATE TABLE IF NOT EXISTS `cards` (
  `product_id` text PRIMARY KEY NOT NULL,
  `card_number` text NOT NULL,
  `name` text NOT NULL,
  `set_code` text NOT NULL,
  `set_name` text,
  `rarity` text,
  `card_type` text,
  `color` text,
  `level` integer,
  `cost` integer,
  `ap` integer,
  `hp` integer,
  `ap_raw` text,
  `hp_raw` text,
  `zone` text,
  `trait` text,
  `link` text,
  `source_title` text,
  `block_icon` text,
  `sp` text,
  `effect` text,
  `image_url` text,
  `detail_url` text,
  `where_to_get` text,
  `keywords_text` text,
  `keyword_effects` text,
  `timing_markers` text,
  `traits` text,
  `link_refs` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cards_card_number` ON `cards` (`card_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cards_set_code` ON `cards` (`set_code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cards_color` ON `cards` (`color`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cards_card_type` ON `cards` (`card_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cards_rarity` ON `cards` (`rarity`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collection_items` (
  `product_id` text PRIMARY KEY NOT NULL,
  `quantity` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `cards`(`product_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `decks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `notes` text,
  `is_active` integer DEFAULT false NOT NULL,
  `resource_deck_size` integer DEFAULT 10 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `deck_cards` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `card_number` text NOT NULL,
  `quantity` integer DEFAULT 1 NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_deck_card` ON `deck_cards` (`deck_id`,`card_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deck_cards_deck` ON `deck_cards` (`deck_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `allocations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `card_number` text NOT NULL,
  `quantity` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_alloc_card` ON `allocations` (`deck_id`,`card_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_alloc_deck` ON `allocations` (`deck_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_alloc_card_number` ON `allocations` (`card_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `meta` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text
);
