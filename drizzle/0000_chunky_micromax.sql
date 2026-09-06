CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`side` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_round_created` ON `comments` (`round_id`,`created_at`);