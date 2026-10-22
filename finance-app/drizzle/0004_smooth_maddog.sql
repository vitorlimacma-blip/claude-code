CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`deadline` text,
	`contribution_dates` text DEFAULT '[]' NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reserves` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`account_id` text NOT NULL,
	`purpose` text NOT NULL,
	`goal_id` text,
	`name` text NOT NULL,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reserves_account_idx` ON `reserves` (`account_id`);