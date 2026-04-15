import { Router, type IRouter } from "express";
import { eq, count, sum } from "drizzle-orm";
import { db, broadcastsTable, broadcastersTable, recordingsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stats/platform", async (_req, res): Promise<void> => {
  const [liveResult] = await db
    .select({ value: count() })
    .from(broadcastsTable)
    .where(eq(broadcastsTable.isLive, true));

  const [listenersResult] = await db
    .select({ value: sum(broadcastsTable.listenerCount) })
    .from(broadcastsTable)
    .where(eq(broadcastsTable.isLive, true));

  const [broadcastersResult] = await db
    .select({ value: count() })
    .from(broadcastersTable);

  const [recordingsResult] = await db
    .select({ value: count() })
    .from(recordingsTable);

  res.json({
    liveBroadcasts: Number(liveResult.value),
    totalListeners: Number(listenersResult.value ?? 0),
    totalBroadcasters: Number(broadcastersResult.value),
    totalRecordings: Number(recordingsResult.value),
  });
});

export default router;
