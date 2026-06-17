import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, broadcastersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    broadcasterId?: number;
  }
}

const router: IRouter = Router();

function toBroadcasterProfile(b: typeof broadcastersTable.$inferSelect, broadcastCount = 0, isLive = false) {
  return {
    id: b.id,
    name: b.name,
    username: b.username,
    email: b.email,
    phone: b.phone ?? null,
    bio: b.bio ?? null,
    avatarUrl: b.avatarUrl ?? null,
    coverUrl: b.coverUrl ?? null,
    followerCount: b.followerCount,
    broadcastCount,
    isLive,
    isAdmin: b.isAdmin,
    createdAt: b.createdAt.toISOString(),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, username, email, password, phone } = parsed.data;

  const existing = await db
    .select()
    .from(broadcastersTable)
    .where(eq(broadcastersTable.email, email));

  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [broadcaster] = await db
    .insert(broadcastersTable)
    .values({ name, username, email, passwordHash, phone: phone ?? null })
    .returning();

  req.session.broadcasterId = broadcaster.id;

  res.status(201).json({
    broadcaster: toBroadcasterProfile(broadcaster),
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [broadcaster] = await db
    .select()
    .from(broadcastersTable)
    .where(eq(broadcastersTable.email, email));

  if (!broadcaster) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, broadcaster.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.broadcasterId = broadcaster.id;

  res.json({
    broadcaster: toBroadcasterProfile(broadcaster),
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const broadcasterId = req.session.broadcasterId;
  if (!broadcasterId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [broadcaster] = await db
    .select()
    .from(broadcastersTable)
    .where(eq(broadcastersTable.id, broadcasterId));

  if (!broadcaster) {
    res.status(401).json({ error: "Session invalid" });
    return;
  }

  res.json(toBroadcasterProfile(broadcaster));
});

export { toBroadcasterProfile };
export default router;
