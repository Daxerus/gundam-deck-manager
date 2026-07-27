-- Friends, loans, card requests, return requests, invite codes (one-shot).

CREATE TABLE IF NOT EXISTS `friendships` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_a` integer NOT NULL,
  `user_b` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `requested_by` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_a`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_b`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_friendship_pair` ON `friendships` (`user_a`, `user_b`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_friendships_user_a` ON `friendships` (`user_a`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_friendships_user_b` ON `friendships` (`user_b`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `loans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `lender_id` integer NOT NULL,
  `borrower_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`lender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`borrower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loans_lender` ON `loans` (`lender_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loans_borrower` ON `loans` (`borrower_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loans_pair_status` ON `loans` (`lender_id`, `borrower_id`, `status`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `loan_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `loan_id` integer NOT NULL,
  `product_id` text NOT NULL,
  `quantity` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`product_id`) REFERENCES `cards`(`product_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_loan_item` ON `loan_items` (`loan_id`, `product_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loan_items_product` ON `loan_items` (`product_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `loan_transactions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `type` text NOT NULL,
  `loan_id` integer,
  `from_user_id` integer NOT NULL,
  `to_user_id` integer NOT NULL,
  `items_json` text NOT NULL,
  `deck_impacts_json` text NOT NULL DEFAULT '[]',
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loan_tx_from` ON `loan_transactions` (`from_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loan_tx_to` ON `loan_transactions` (`to_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loan_tx_created` ON `loan_transactions` (`created_at`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `card_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `from_user_id` integer NOT NULL,
  `to_user_id` integer NOT NULL,
  `product_id` text NOT NULL,
  `quantity` integer NOT NULL DEFAULT 1,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`product_id`) REFERENCES `cards`(`product_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_card_requests_to` ON `card_requests` (`to_user_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_card_requests_from` ON `card_requests` (`from_user_id`, `status`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `return_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `loan_id` integer NOT NULL,
  `requested_by` integer NOT NULL,
  `product_id` text NOT NULL,
  `quantity` integer NOT NULL DEFAULT 1,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`product_id`) REFERENCES `cards`(`product_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_return_requests_loan` ON `return_requests` (`loan_id`, `status`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL,
  `created_by` integer,
  `used_by` integer,
  `used_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_invite_code` ON `invite_codes` (`code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_invite_codes_unused` ON `invite_codes` (`used_by`);
