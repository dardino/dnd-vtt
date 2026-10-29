CREATE TABLE `dice_rolls` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`scene_id` text,
	`actor_id` text,
	`token_id` text,
	`origin` text NOT NULL,
	`formula` text NOT NULL,
	`mode` text NOT NULL,
	`dice` text NOT NULL,
	`modifier` integer NOT NULL,
	`total` integer NOT NULL,
	`visibility` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `dice_rolls_campaign_idx` ON `dice_rolls` (`campaign_id`,`created_at`,`id`);