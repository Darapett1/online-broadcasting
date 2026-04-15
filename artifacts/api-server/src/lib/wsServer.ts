import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
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

export function setupWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url ?? "";
    const broadcastMatch = url.match(/^\/ws\/broadcast\/(\d+)/);
    const listenMatch = url.match(/^\/ws\/listen\/(\d+)/);

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

        room.listeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(buffer, { binary: true }, (err) => {
              if (err) {
                logger.warn({ err, broadcastId }, "Error sending to listener");
              }
            });
          }
        });
      });

      ws.on("close", () => {
        room.broadcaster = null;
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

      ws.on("close", () => {
        room.listeners.delete(ws);
        logger.info({ broadcastId, listeners: room.listeners.size }, "Listener disconnected");
        cleanupRoom(broadcastId);
      });

      ws.on("error", (err) => {
        logger.error({ err, broadcastId }, "Listener WebSocket error");
        room.listeners.delete(ws);
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
