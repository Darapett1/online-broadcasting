import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/blob
 *
 * Client sends raw binary body → server uploads to Cloudinary → returns
 * the public CDN URL.  Works for images (avatars, thumbnails, cover photos)
 * and audio recordings.
 */
router.post(
  "/storage/uploads/blob",
  express.raw({ type: "*/*", limit: "250mb" }),
  async (req: Request, res: Response) => {
    const contentType = (req.headers["content-type"] || "application/octet-stream")
      .split(";")[0]
      .trim();

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "No file body received" });
      return;
    }

    try {
      const url = await objectStorageService.uploadObject(req.body as Buffer, contentType);
      res.json({ url });
    } catch (error) {
      req.log.error({ err: error }, "Cloudinary upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

export default router;
