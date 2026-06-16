import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";

// Cloudinary is configured from a single env var:
//   CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
// or three separate vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// The SDK picks these up automatically — no manual config needed.

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  /**
   * Upload a buffer to Cloudinary and return the public CDN URL.
   * contentType drives the resource_type:
   *   audio/* | video/* → "video"  (Cloudinary stores audio under "video")
   *   image/*           → "image"
   *   everything else   → "raw"
   */
  async uploadObject(buffer: Buffer, contentType: string): Promise<string> {
    const resourceType = resolveResourceType(contentType);
    const publicId = `lightbearer/${randomUUID()}`;

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: resourceType, overwrite: false },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload returned no result"));
          } else {
            resolve(result.secure_url);
          }
        },
      );
      stream.end(buffer);
    });
  }
}

function resolveResourceType(contentType: string): "image" | "video" | "raw" {
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("audio/") || base.startsWith("video/")) return "video";
  return "raw";
}
