import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const broadcastComments = pgTable("broadcast_comments", {
  id:              serial("id").primaryKey(),
  broadcastId:     integer("broadcast_id").notNull(),
  authorName:      text("author_name").notNull(),
  message:         text("message").notNull(),
  isPrayerRequest: boolean("is_prayer_request").notNull().default(false),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(broadcastComments).omit({ id: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type BroadcastComment = typeof broadcastComments.$inferSelect;
