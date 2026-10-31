CREATE TABLE `maps` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`image_asset_id` text,
	`width_px` integer NOT NULL,
	`height_px` integer NOT NULL,
	`document` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maps_campaign_idx` ON `maps` (`campaign_id`,`updated_at`,`id`);--> statement-breakpoint
ALTER TABLE `scenes` ADD `map_id` text REFERENCES maps(id);