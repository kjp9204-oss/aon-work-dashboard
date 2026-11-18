CREATE TABLE `aon_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`owner` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`creation_payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aon_events_date_idx` ON `aon_events` (`date`,`time`);--> statement-breakpoint
CREATE TABLE `aon_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`owner` text NOT NULL,
	`due` text NOT NULL,
	`status` text NOT NULL,
	`next` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`creation_payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aon_tasks_updated_at_idx` ON `aon_tasks` (`updated_at`);