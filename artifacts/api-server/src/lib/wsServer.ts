import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import { db, broadcastsTable } from "@workspace/db";
import { logger } from "./logger";

interface BroadcastRoom {
  broadcaster: WebSocket | null;
  listeners: Set<WebSocket>;
}

const rooms = new Map<string, BroadcastRoom>();

function getOrCreateRoom(broadcastId: string): BroadcastRoom {
  if (!rooms.has(broadcastId)) {
    rooms.set(broadcastId, { broadcaster: null, listeners: new Set() });
  }
  return rooms.get(broadcastId)!;
}

function cleanupRoom(broadcastId: string): void {
  const room = rooms.get(broadcastId);
  if (room && !room.broadcaster && room.listeners.size === 0) {
    rooms.delete(broadcastId);
    logger.info({ broadcastId }, "Cleaned up empty room");
  }
}

/** Mark a broadcast as ended in the database (isLive=false, endedAt=now). */
async function markBroadcastEnded(broadcastId: string): Promise<void> {
  try {
    const numId = parseInt(broadcastId, 10);
    if (isNaN(numId)) return;
    await db
      .update(broadcastsTable)
      .set({ isLive: false, endedAt: new Date() })
      .where(eq(broadcastsTable.id, numId));
    logger.info({ broadcastId }, "Broadcast marked as ended");
  } catch (err) {
    logger.error({ err, broadcastId }, "Failed to mark broadcast as ended in DB");
  }
}

export function setupWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url ?? "";
    const broadcastMatch = url.match(/^\/ws\/broadcast\/(\d+)/);
    const listenMatch    = url.match(/^\/ws\/listen\/(\d+)/);

    if (broadcastMatch) {
      const broadcastId = broadcastMatch[1];
      const room = getOrCreateRoom(broadcastId);

      if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
        ws.close(4000, "Broadcast already has a streamer");
        return;
      }

      room.broadcaster = ws;
      logger.info({ broadcastId }, "Broadcaster connected");

      ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        let buffer: Buffer;
        if (Buffer.isBuffer(data)) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = Buffer.from(data);
        } else {
          buffer = Buffer.concat(data as Buffer[]);
        }

        // Relay to all listeners
        room.listeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(buffer, { binary: true }, (err) => {
              if (err) logger.warn({ err, broadcastId }, "Error sending to listener");
            });
          }
        });
      });

      ws.on("close", async () => {
        room.broadcaster = null;

        // ── Auto-clear the LIVE flag so past broadcasts don't stay "live" ──
        await markBroadcastEnded(broadcastId);

        // Notify all listeners the broadcast has ended
        room.listeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(JSON.stringify({ type: "broadcast_ended" }));
          }
        });

        logger.info({ broadcastId, listeners: room.listeners.size }, "Broadcaster disconnected");
        cleanupRoom(broadcastId);
      });

      ws.on("error", (err) => {
        logger.error({ err, broadcastId }, "Broadcaster WebSocket error");
      });

    } else if (listenMatch) {
      const broadcastId = listenMatch[1];
      const room = getOrCreateRoom(broadcastId);
      room.listeners.add(ws);

      logger.info({ broadcastId, listeners: room.listeners.size }, "Listener connected");

      // Notify broadcaster of updated listener count
      if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
        room.broadcaster.send(JSON.stringify({ type: "listener_count", count: room.listeners.size }));
      }

      ws.on("close", () => {
        room.listeners.delete(ws);
        logger.info({ broadcastId, listeners: room.listeners.size }, "Listener disconnected");
        if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
          room.broadcaster.send(JSON.stringify({ type: "listener_count", count: room.listeners.size }));
        }
        cleanupRoom(broadcastId);
      });

      ws.on("error", (err) => {
        logger.error({ err, broadcastId }, "Listener WebSocket error");
        room.listeners.delete(ws);
        if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
          room.broadcaster.send(JSON.stringify({ type: "listener_count", count: room.listeners.size }));
        }
      });

      if (!room.broadcaster || room.broadcaster.readyState !== WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "waiting_for_broadcaster" }));
      }
    } else {
      logger.warn({ url }, "Unknown WebSocket path");
      ws.close(4001, "Unknown path");
    }
  });

  logger.info("WebSocket server initialized on /ws");
}
