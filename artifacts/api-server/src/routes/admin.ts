import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { eq } from "drizzle-orm";
import { db, groqApiKeysTable, broadcastersTable } from "@workspace/db";

const router: IRouter = Router();

async function requireAdmin(req: any, res: any, next: any) {
  const broadcasterId = req.session?.broadcasterId;
  if (!broadcasterId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [broadcaster] = await db
    .select({ isAdmin: broadcastersTable.isAdmin })
    .from(broadcastersTable)
    .where(eq(broadcastersTable.id, broadcasterId));
  if (!broadcaster?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••••••" + key.slice(-4);
}

router.get("/admin/groq-keys", requireAdmin, async (_req, res): Promise<void> => {
  const keys = await db
    .select()
    .from(groqApiKeysTable)
    .orderBy(groqApiKeysTable.createdAt);

  res.json(
    keys.map((k) => ({
      id: k.id,
      label: k.label,
      keyMasked: maskKey(k.keyValue),
      isActive: k.isActive,
      testStatus: k.testStatus,
      lastTestedAt: k.lastTestedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }))
  );
});

router.post("/admin/groq-keys", requireAdmin, async (req, res): Promise<void> => {
  const { label, keyValue } = req.body as { label?: string; keyValue?: string };

  if (!label || !keyValue) {
    res.status(400).json({ error: "label and keyValue are required" });
    return;
  }
  if (!keyValue.startsWith("gsk_")) {
    res.status(400).json({ error: "Invalid GROQ API key format (should start with gsk_)" });
    return;
  }

  const existing = await db.select({ id: groqApiKeysTable.id }).from(groqApiKeysTable);
  if (existing.length >= 5) {
    res.status(400).json({ error: "Maximum of 5 GROQ API keys allowed" });
    return;
  }

  const [created] = await db
    .insert(groqApiKeysTable)
    .values({ label, keyValue })
    .returning();

  res.status(201).json({
    id: created.id,
    label: created.label,
    keyMasked: maskKey(created.keyValue),
    isActive: created.isActive,
    testStatus: created.testStatus,
    lastTestedAt: null,
    createdAt: created.createdAt.toISOString(),
  });
});

router.patch("/admin/groq-keys/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { label, isActive } = req.body as { label?: string; isActive?: boolean };

  const updates: Partial<typeof groqApiKeysTable.$inferInsert> = {};
  if (typeof label === "string") updates.label = label;
  if (typeof isActive === "boolean") updates.isActive = isActive;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [updated] = await db
    .update(groqApiKeysTable)
    .set(updates)
    .where(eq(groqApiKeysTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  res.json({
    id: updated.id,
    label: updated.label,
    keyMasked: maskKey(updated.keyValue),
    isActive: updated.isActive,
    testStatus: updated.testStatus,
    lastTestedAt: updated.lastTestedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/admin/groq-keys/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [deleted] = await db
    .delete(groqApiKeysTable)
    .where(eq(groqApiKeysTable.id, id))
    .returning({ id: groqApiKeysTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  res.json({ success: true });
});

router.post("/admin/groq-keys/:id/test", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db
    .select()
    .from(groqApiKeysTable)
    .where(eq(groqApiKeysTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  let testStatus: "ok" | "failed" = "failed";
  let errorMessage: string | undefined;

  try {
    const groq = new Groq({ apiKey: row.keyValue });
    await groq.models.list();
    testStatus = "ok";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  const [updated] = await db
    .update(groqApiKeysTable)
    .set({ testStatus, lastTestedAt: new Date() })
    .where(eq(groqApiKeysTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    testStatus,
    lastTestedAt: updated.lastTestedAt?.toISOString() ?? null,
    ...(errorMessage ? { error: errorMessage } : {}),
  });
});

export default router;
