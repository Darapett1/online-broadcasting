import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const groqApiKeysTable = pgTable("groq_api_keys", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  keyValue: text("key_value").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  testStatus: text("test_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GroqApiKey = typeof groqApiKeysTable.$inferSelect;
