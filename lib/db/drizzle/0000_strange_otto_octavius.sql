CREATE TABLE "broadcasters" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"bio" text,
	"avatar_url" text,
	"cover_url" text,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcasters_username_unique" UNIQUE("username"),
	CONSTRAINT "broadcasters_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"broadcaster_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"venue" text,
	"minister" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_live" boolean DEFAULT true NOT NULL,
	"listener_count" integer DEFAULT 0 NOT NULL,
	"recording_url" text,
	"is_recorded" boolean DEFAULT false NOT NULL,
	"saved_to_draft" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" serial PRIMARY KEY NOT NULL,
	"broadcast_id" integer,
	"broadcaster_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"broadcast_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"message" text NOT NULL,
	"is_prayer_request" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groq_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"key_value" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"test_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_broadcaster_id_broadcasters_id_fk" FOREIGN KEY ("broadcaster_id") REFERENCES "public"."broadcasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_broadcaster_id_broadcasters_id_fk" FOREIGN KEY ("broadcaster_id") REFERENCES "public"."broadcasters"("id") ON DELETE no action ON UPDATE no action;