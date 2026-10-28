CREATE TABLE `action_log` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`scene_id` text,
	`actor_id` text,
	`client_id` text NOT NULL,
	`origin` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`payload` text NOT NULL,
	`inverse` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`state_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `action_log_campaign_idx` ON `action_log` (`campaign_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`statblock` text NOT NULL,
	`rules_version` text,
	`xp` integer DEFAULT 0 NOT NULL,
	`sheet_version` integer DEFAULT 1 NOT NULL,
	`player_notes` text,
	`dm_notes` text,
	`image_asset_id` text,
	`hp_current` integer,
	`hp_max` integer,
	`hp_temp` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `actors_campaign_idx` ON `actors` (`campaign_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `actors_kind_idx` ON `actors` (`kind`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`original_path` text NOT NULL,
	`webp_path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_hash_unique` ON `assets` (`hash`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active_scene_id` text,
	`fog_default` text DEFAULT 'hidden' NOT NULL,
	`auto_approve` integer DEFAULT true NOT NULL,
	`advancement_mode` text DEFAULT 'milestone' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaigns_created_at_idx` ON `campaigns` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`image_asset_id` text,
	`width_px` integer NOT NULL,
	`height_px` integer NOT NULL,
	`state` text NOT NULL,
	`state_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_campaign_idx` ON `scenes` (`campaign_id`,`created_at`,`id`);