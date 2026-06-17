import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, recordingsTable } from "@workspace/db";
import { CreateRecordingBody, GetRecordingParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function toRecordingJson(r: typeof recordingsTable.$inferSelect) {
  return {
    id: r.id,
    broadcastId: r.broadcastId ?? null,
    broadcasterId: r.broadcasterId,
    title: r.title,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl ?? null,
    durationSeconds: r.durationSeconds ?? null,
    isPublic: r.isPublic,
    isDraft: r.isDraft,
    createdAt: r.createdAt.toISOString(),
  };
}

router.post("/recordings", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRecordingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [recording] = await db
    .insert(recordingsTable)
    .values({
      broadcastId: parsed.data.broadcastId ?? null,
      broadcasterId: parsed.data.broadcasterId,
      title: parsed.data.title,
      url: parsed.data.url,
      thumbnailUrl: parsed.data.thumbnailUrl ?? null,
      durationSeconds: parsed.data.durationSeconds ?? null,
      isPublic: parsed.data.isPublic,
      isDraft: parsed.data.isDraft,
    })
    .returning();

  res.status(201).json(toRecordingJson(recording));
});

router.get("/recordings/:id", async (req, res): Promise<void> => {
  const params = GetRecordingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [recording] = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.id, params.data.id));

  if (!recording) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }

  res.json(toRecordingJson(recording));
});

export default router;
