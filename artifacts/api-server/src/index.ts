import { createServer } from "http";
import { eq } from "drizzle-orm";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./lib/wsServer";
import { db, broadcastersTable } from "@workspace/db";

async function ensureAdminEmail(): Promise<void> {
  const adminEmail = process.env["ADMIN_EMAIL"];
  if (!adminEmail) return;
  const result = await db
    .update(broadcastersTable)
    .set({ isAdmin: true })
    .where(eq(broadcastersTable.email, adminEmail));
  logger.info({ adminEmail, updated: result.rowCount ?? 0 }, "Admin email enforced");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
setupWebSocketServer(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  ensureAdminEmail().catch((err) =>
    logger.error({ err }, "Failed to enforce admin email"),
  );
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
