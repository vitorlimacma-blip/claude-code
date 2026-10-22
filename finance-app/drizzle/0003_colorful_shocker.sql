CREATE TABLE `recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`payment_method` text DEFAULT 'other' NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`day_of_month` integer NOT NULL,
	`month_of_year` integer,
	`start_date` text NOT NULL,
	`end_date` text
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `recurrence_id` text;--> statement-breakpoint
CREATE INDEX `transactions_recurrence_idx` ON `transactions` (`recurrence_id`);