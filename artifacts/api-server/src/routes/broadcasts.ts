import { Router, type IRouter } from "express";
import { eq, desc, ilike, sql } from "drizzle-orm";
import { db, broadcastsTable, broadcastersTable } from "@workspace/db";
import {
  CreateBroadcastBody,
  UpdateBroadcastBody,
  GetBroadcastParams,
  UpdateBroadcastParams,
  ListBroadcastsQueryParams,
  SearchBroadcastsQueryParams,
} from "@workspace/api-zod";
import { toBroadcasterProfile } from "./auth";

const router: IRouter = Router();

async function enrichBroadcast(broadcast: typeof broadcastsTable.$inferSelect) {
  const [broadcaster] = await db
    .select()
    .from(broadcastersTable)
    .where(eq(broadcastersTable.id, broadcast.broadcasterId));

  const broadcasterProfile = broadcaster ? toBroadcasterProfile(broadcaster) : null;

  return {
    id: broadcast.id,
    broadcasterId: broadcast.broadcasterId,
    broadcaster: broadcasterProfile,
    title: broadcast.title,
    description: broadcast.description ?? null,
    thumbnailUrl: broadcast.thumbnailUrl ?? null,
    venue: broadcast.venue ?? null,
    minister: broadcast.minister ?? null,
    tags: broadcast.tags ?? [],
    isLive: broadcast.isLive,
    listenerCount: broadcast.listenerCount,
    recordingUrl: broadcast.recordingUrl ?? null,
    isRecorded: broadcast.isRecorded,
    savedToDraft: broadcast.savedToDraft,
    startedAt: broadcast.startedAt.toISOString(),
    endedAt: broadcast.endedAt ? broadcast.endedAt.toISOString() : null,
  };
}

router.get("/broadcasts/search", async (req, res): Promise<void> => {
  const params = SearchBroadcastsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { q } = params.data;

  const broadcasts = await db
    .select()
    .from(broadcastsTable)
    .where(
      sql`(${ilike(broadcastsTable.title, `%${q}%`)} OR ${sql`${broadcastsTable.tags} @> ARRAY[${q}]::text[]`})`
    )
    .orderBy(desc(broadcastsTable.startedAt));

  const enriched = await Promise.all(broadcasts.map(enrichBroadcast));
  res.json(enriched);
});

router.get("/broadcasts", async (req, res): Promise<void> => {
  const params = ListBroadcastsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(broadcastsTable).$dynamic();

  if (params.data.live === true) {
    query = query.where(eq(broadcastsTable.isLive, true));
  } else if (params.data.live === false) {
    query = query.where(eq(broadcastsTable.isLive, false));
  }

  const broadcasts = await query.orderBy(desc(broadcastsTable.startedAt));
  const enriched = await Promise.all(broadcasts.map(enrichBroadcast));
  res.json(enriched);
});

router.post("/broadcasts", async (req, res): Promise<void> => {
  const parsed = CreateBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [broadcast] = await db
    .insert(broadcastsTable)
    .values({
      broadcasterId: parsed.data.broadcasterId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      thumbnailUrl: parsed.data.thumbnailUrl ?? null,
      venue: parsed.data.venue ?? null,
      minister: parsed.data.minister ?? null,
      tags: parsed.data.tags ?? [],
      isLive: true,
      isRecorded: parsed.data.isRecorded ?? false,
    })
    .returning();

  res.status(201).json(await enrichBroadcast(broadcast));
});

router.get("/broadcasts/:id", async (req, res): Promise<void> => {
  const params = GetBroadcastParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [broadcast] = await db
    .select()
    .from(broadcastsTable)
    .where(eq(broadcastsTable.id, params.data.id));

  if (!broadcast) {
    res.status(404).json({ error: "Broadcast not found" });
    return;
  }

  res.json(await enrichBroadcast(broadcast));
});

router.patch("/broadcasts/:id", async (req, res): Promise<void> => {
  const params = UpdateBroadcastParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.isLive !== undefined) updateData.isLive = parsed.data.isLive;
  if (parsed.data.listenerCount !== undefined) updateData.listenerCount = parsed.data.listenerCount;
  if (parsed.data.endedAt !== undefined) updateData.endedAt = new Date(parsed.data.endedAt);
  if (parsed.data.recordingUrl !== undefined) updateData.recordingUrl = parsed.data.recordingUrl;
  if (parsed.data.savedToDraft !== undefined) updateData.savedToDraft = parsed.data.savedToDraft;

  const [broadcast] = await db
    .update(broadcastsTable)
    .set(updateData)
    .where(eq(broadcastsTable.id, params.data.id))
    .returning();

  if (!broadcast) {
    res.status(404).json({ error: "Broadcast not found" });
    return;
  }

  res.json(await enrichBroadcast(broadcast));
});

export default router;
