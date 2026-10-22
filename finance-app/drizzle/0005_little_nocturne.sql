CREATE TABLE `memory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`user_scope` text NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`scope` text NOT NULL,
	`evidence_ref` text,
	`review_status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memory_scope_idx` ON `memory_items` (`user_scope`,`type`);