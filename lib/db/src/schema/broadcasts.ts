import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { broadcastersTable } from "./broadcasters";

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  broadcasterId: integer("broadcaster_id").notNull().references(() => broadcastersTable.id),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  venue: text("venue"),
  minister: text("minister"),
  tags: text("tags").array().notNull().default([]),
  isLive: boolean("is_live").notNull().default(true),
  listenerCount: integer("listener_count").notNull().default(0),
  recordingUrl: text("recording_url"),
  isRecorded: boolean("is_recorded").notNull().default(false),
  savedToDraft: boolean("saved_to_draft").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const insertBroadcastSchema = createInsertSchema(broadcastsTable).omit({ id: true, startedAt: true });
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcastsTable.$inferSelect;
