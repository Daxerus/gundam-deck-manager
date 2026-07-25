-- Multi-user auth: users table + per-user ownership of decks and collection.
-- Existing data is assigned to a pending owner (id=1) completed via POST /api/auth/bootstrap.
-- Note: SQLite/D1 cannot ADD a REFERENCES column with a non-NULL default, so decks.user_id
-- is added without an inline FK; integrity is enforced in application code + schema.ts.

CREATE TABLE IF NOT EXISTS `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `is_admin` integer DEFAULT false NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_users_username` ON `users` (`username`);
--> statement-breakpoint
INSERT INTO `users` (`id`, `username`, `password_hash`, `is_admin`, `created_at`)
VALUES (1, '__pending_owner__', '!pending', 1, unixepoch());
--> statement-breakpoint
ALTER TABLE `decks` ADD COLUMN `user_id` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_decks_user` ON `decks` (`user_id`);
--> statement-breakpoint
CREATE TABLE `collection_items_new` (
  `user_id` integer NOT NULL,
  `product_id` text NOT NULL,
  `quantity` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`user_id`, `product_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`product_id`) REFERENCES `cards`(`product_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `collection_items_new` (`user_id`, `product_id`, `quantity`)
SELECT 1, `product_id`, `quantity` FROM `collection_items`;
--> statement-breakpoint
DROP TABLE `collection_items`;
--> statement-breakpoint
ALTER TABLE `collection_items_new` RENAME TO `collection_items`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_collection_user` ON `collection_items` (`user_id`);
