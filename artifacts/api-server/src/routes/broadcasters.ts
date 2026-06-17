import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, broadcastersTable, broadcastsTable, recordingsTable } from "@workspace/db";
import { GetBroadcasterParams, UpdateBroadcasterBody, UpdateBroadcasterParams } from "@workspace/api-zod";
import { toBroadcasterProfile } from "./auth";

const router: IRouter = Router();

router.get("/broadcasters", async (_req, res): Promise<void> => {
  const broadcasters = await db.select().from(broadcastersTable);

  const profiles = await Promise.all(
    broadcasters.map(async (b) => {
      const [{ value: broadcastCount }] = await db
        .select({ value: count() })
        .from(broadcastsTable)
        .where(eq(broadcastsTable.broadcasterId, b.id));

      const liveBroadcast = await db
        .select()
        .from(broadcastsTable)
        .where(eq(broadcastsTable.broadcasterId, b.id));

      const isLive = liveBroadcast.some((br) => br.isLive);
      return toBroadcasterProfile(b, Number(broadcastCount), isLive);
    })
  );

  res.json(profiles);
});

router.get("/broadcasters/:id", async (req, res): Promise<void> => {
  const params = GetBroadcasterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [broadcaster] = await db
    .select()
    .from(broadcastersTable)
    .where(eq(broadcastersTable.id, params.data.id));

  if (!broadcaster) {
    res.status(404).json({ error: "Broadcaster not found" });
    return;
  }

  const [{ value: broadcastCount }] = await db
    .select({ value: count() })
    .from(broadcastsTable)
    .where(eq(broadcastsTable.broadcasterId, broadcaster.id));

  const liveBroadcasts = await db
    .select()
    .from(broadcastsTable)
    .where(eq(broadcastsTable.broadcasterId, broadcaster.id));

  const isLive = liveBroadcasts.some((br) => br.isLive);

  res.json(toBroadcasterProfile(broadcaster, Number(broadcastCount), isLive));
});

router.patch("/broadcasters/:id", async (req, res): Promise<void> => {
  const params = UpdateBroadcasterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBroadcasterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, string | null | undefined> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.bio !== undefined) updateData.bio = parsed.data.bio;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.coverUrl !== undefined) updateData.coverUrl = parsed.data.coverUrl;

  const [broadcaster] = await db
    .update(broadcastersTable)
    .set(updateData)
    .where(eq(broadcastersTable.id, params.data.id))
    .returning();

  if (!broadcaster) {
    res.status(404).json({ error: "Broadcaster not found" });
    return;
  }

  res.json(toBroadcasterProfile(broadcaster));
});

router.post("/broadcasters/:id/follow", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [broadcaster] = await db
    .update(broadcastersTable)
    .set({ followerCount: sql`${broadcastersTable.followerCount} + 1` })
    .where(eq(broadcastersTable.id, id))
    .returning();
  if (!broadcaster) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ followerCount: broadcaster.followerCount });
});

router.delete("/broadcasters/:id/follow", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [broadcaster] = await db
    .update(broadcastersTable)
    .set({ followerCount: sql`GREATEST(0, ${broadcastersTable.followerCount} - 1)` })
    .where(eq(broadcastersTable.id, id))
    .returning();
  if (!broadcaster) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ followerCount: broadcaster.followerCount });
});

router.get("/broadcasters/:id/recordings", async (req, res): Promise<void> => {
  const params = GetBroadcasterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const recordings = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.broadcasterId, params.data.id));

  const mapped = recordings.map((r) => ({
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
  }));

  res.json(mapped);
});

export default router;
