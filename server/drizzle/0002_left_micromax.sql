CREATE TABLE `displays` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `displays_code_unique` ON `displays` (`code`);--> statement-breakpoint
CREATE INDEX `displays_campaign_idx` ON `displays` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `programs` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`program_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
