import { Router } from "express";
import { db } from "@workspace/db";
import { broadcastComments } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
const router = Router();

function validateBody(body: unknown): { authorName: string; message: string; isPrayerRequest: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.authorName !== "string" || b.authorName.trim().length === 0 || b.authorName.length > 80) return null;
  if (typeof b.message !== "string"    || b.message.trim().length    === 0 || b.message.length > 1000) return null;
  return {
    authorName:      b.authorName.trim(),
    message:         b.message.trim(),
    isPrayerRequest: b.isPrayerRequest === true,
  };
}

router.get("/broadcasts/:id/comments", async (req, res) => {
  const broadcastId = parseInt(req.params.id);
  if (isNaN(broadcastId)) return void res.status(400).json({ error: "Invalid broadcast id" });

  const rows = await db
    .select()
    .from(broadcastComments)
    .where(eq(broadcastComments.broadcastId, broadcastId))
    .orderBy(asc(broadcastComments.createdAt));

  res.json({ comments: rows });
});

router.post("/broadcasts/:id/comments", async (req, res) => {
  const broadcastId = parseInt(req.params.id);
  if (isNaN(broadcastId)) return void res.status(400).json({ error: "Invalid broadcast id" });

  const parsed = validateBody(req.body);
  if (!parsed) return void res.status(400).json({ error: "Validation error: authorName and message are required" });

  const [row] = await db
    .insert(broadcastComments)
    .values({ broadcastId, ...parsed })
    .returning();

  res.status(201).json(row);
});

export default router;
