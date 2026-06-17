import { Router } from "express";
import multer from "multer";
import Groq from "groq-sdk";
import { toFile } from "groq-sdk";
import { db, groqApiKeysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function getGroqClient(): Promise<Groq> {
  const dbKeys = await db
    .select({ keyValue: groqApiKeysTable.keyValue, id: groqApiKeysTable.id })
    .from(groqApiKeysTable)
    .where(and(eq(groqApiKeysTable.isActive, true)));

  if (dbKeys.length > 0) {
    const pick = dbKeys[Math.floor(Math.random() * dbKeys.length)];
    return new Groq({ apiKey: pick.keyValue });
  }

  const envKey = process.env.GROQ_API_KEY;
  if (envKey) return new Groq({ apiKey: envKey });

  throw new Error("No GROQ API key configured. Add one in the Admin panel.");
}

const SUPPORTED_LANGS = new Set([
  "en", "es", "fr", "pt", "de", "yo", "ig", "ha", "sw", "ar"
]);

router.post(
  "/transcription",
  upload.single("audio"),
  async (req, res) => {
    const buf = req.file?.buffer;
    if (!buf || buf.length < 100) {
      return void res.status(400).json({ error: "No audio data received" });
    }

    const requestedLang = typeof req.body.language === "string" && req.body.language.trim()
      ? req.body.language.trim().toLowerCase()
      : undefined;

    const langParam: string | undefined = requestedLang && SUPPORTED_LANGS.has(requestedLang)
      ? requestedLang
      : undefined;

    try {
      const groq = await getGroqClient();
      const audioFile = await toFile(buf, "audio.wav", { type: "audio/wav" });

      const result = await groq.audio.transcriptions.create({
        file:            audioFile,
        model:           "whisper-large-v3",
        response_format: "verbose_json",
        ...(langParam ? { language: langParam } : {}),
      });

      const detectedLang: string = (result as { language?: string }).language ?? "en";

      res.json({
        text:     result.text?.trim() ?? "",
        language: detectedLang,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      res.status(500).json({ error: message });
    }
  }
);

export default router;
