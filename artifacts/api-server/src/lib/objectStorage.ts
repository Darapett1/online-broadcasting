import { v2 as cloudinary } from "cloudinary";
import type { UploadApiOptions } from "cloudinary";
import { randomUUID } from "crypto";

// Cloudinary reads these env vars automatically:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// (or a single CLOUDINARY_URL=cloudinary://key:secret@cloudname)

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export type UploadPurpose = "avatar" | "cover" | "thumbnail" | "recording" | "general";

interface UploadOptions {
  purpose?: UploadPurpose;
}

type Transformation = {
  width?: number;
  height?: number;
  crop?: string;
  gravity?: string;
  quality?: string;
  fetch_format?: string;
};

// Cloudinary eager transformation per upload purpose
const TRANSFORMATIONS: Record<UploadPurpose, Transformation[]> = {
  // Square profile photo — crop to face-center, 400×400
  avatar: [
    { width: 400, height: 400, crop: "fill", gravity: "face", quality: "auto", fetch_format: "auto" },
  ],
  // Wide cover banner — crop to fill 1200×400
  cover: [
    { width: 1200, height: 400, crop: "fill", gravity: "center", quality: "auto", fetch_format: "auto" },
  ],
  // Broadcast thumbnail — 16:9, 800×450
  thumbnail: [
    { width: 800, height: 450, crop: "fill", gravity: "center", quality: "auto", fetch_format: "auto" },
  ],
  // Audio recordings — no image transformation
  recording: [],
  // Generic uploads — quality-optimise only
  general: [
    { quality: "auto", fetch_format: "auto" },
  ],
};

export class ObjectStorageService {
  /**
   * Upload a buffer to Cloudinary and return the public CDN URL.
   * When `purpose` is an image type, the returned URL points to the
   * auto-cropped/resized version.
   */
  async uploadObject(
    buffer: Buffer,
    contentType: string,
    { purpose = "general" }: UploadOptions = {},
  ): Promise<string> {
    const resourceType = resolveResourceType(contentType);
    const publicId = `lightbearer/${purpose}/${randomUUID()}`;
    const eager = TRANSFORMATIONS[purpose];
    const applyEager = eager.length > 0 && resourceType === "image";

    const options: UploadApiOptions = {
      public_id: publicId,
      resource_type: resourceType,
      overwrite: false,
      ...(applyEager && { eager, eager_async: false }),
    };

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload returned no result"));
          return;
        }
        // Use the eagerly-transformed version when available (cropped/resized)
        const url =
          result.eager && result.eager[0]?.secure_url
            ? result.eager[0].secure_url
            : result.secure_url;
        resolve(url);
      });
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
