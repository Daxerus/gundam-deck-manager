-- External (unregistered) loan contacts and bookkeeping columns on loans/transactions.

CREATE TABLE IF NOT EXISTS `loan_contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_user_id` integer NOT NULL,
  `nick` text NOT NULL,
  `nick_key` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_loan_contact_nick` ON `loan_contacts` (`owner_user_id`, `nick_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loan_contacts_owner` ON `loan_contacts` (`owner_user_id`);
--> statement-breakpoint

ALTER TABLE `loans` ADD COLUMN `contact_id` integer REFERENCES `loan_contacts`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `external_direction` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loans_contact` ON `loans` (`contact_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_loans_contact_dir_status` ON `loans` (`lender_id`, `contact_id`, `external_direction`, `status`);
--> statement-breakpoint

ALTER TABLE `loan_transactions` ADD COLUMN `from_contact_id` integer REFERENCES `loan_contacts`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `loan_transactions` ADD COLUMN `to_contact_id` integer REFERENCES `loan_contacts`(`id`) ON DELETE set null;
