ALTER TABLE `accounts` ADD `payment_account_id` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `currency` text DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `nature` text DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `competence_month` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `settled_date` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `refund_of_id` text;--> statement-breakpoint
CREATE INDEX `transactions_refund_of_idx` ON `transactions` (`refund_of_id`);