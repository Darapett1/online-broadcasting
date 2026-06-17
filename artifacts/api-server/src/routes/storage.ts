import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { ObjectStorageService, type UploadPurpose } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const VALID_PURPOSES = new Set<UploadPurpose>(["avatar", "cover", "thumbnail", "recording", "general"]);

/**
 * POST /storage/uploads/blob?purpose=avatar|cover|thumbnail|recording|general
 *
 * Client sends raw binary body → server uploads to Cloudinary → returns
 * the public CDN URL (already transformed/optimised for the given purpose).
 *
 * Purposes:
 *   avatar    — cropped to 400×400, face-centred
 *   cover     — cropped to 1200×400 banner
 *   thumbnail — cropped to 800×450 (16:9)
 *   recording — audio file, no image transformation
 *   general   — quality-optimised, no crop (default)
 */
router.post(
  "/storage/uploads/blob",
  requireAuth,
  express.raw({ type: "*/*", limit: "250mb" }),
  async (req: Request, res: Response) => {
    const contentType = (req.headers["content-type"] || "application/octet-stream")
      .split(";")[0]
      .trim();

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "No file body received" });
      return;
    }

    const rawPurpose = req.query["purpose"] as string | undefined;
    const purpose: UploadPurpose =
      rawPurpose && VALID_PURPOSES.has(rawPurpose as UploadPurpose)
        ? (rawPurpose as UploadPurpose)
        : "general";

    try {
      const url = await objectStorageService.uploadObject(req.body as Buffer, contentType, { purpose });
      res.json({ url });
    } catch (error) {
      req.log.error({ err: error }, "Cloudinary upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

export default router;
