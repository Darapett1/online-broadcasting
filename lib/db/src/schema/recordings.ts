import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { broadcastersTable } from "./broadcasters";
import { broadcastsTable } from "./broadcasts";

export const recordingsTable = pgTable("recordings", {
  id: serial("id").primaryKey(),
  broadcastId: integer("broadcast_id").references(() => broadcastsTable.id),
  broadcasterId: integer("broadcaster_id").notNull().references(() => broadcastersTable.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  durationSeconds: integer("duration_seconds"),
  isPublic: boolean("is_public").notNull().default(true),
  isDraft: boolean("is_draft").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecordingSchema = createInsertSchema(recordingsTable).omit({ id: true, createdAt: true });
export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Recording = typeof recordingsTable.$inferSelect;
