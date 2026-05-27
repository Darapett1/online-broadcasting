import { Router } from "express";
import multer from "multer";
import Groq from "groq-sdk";
import { toFile } from "groq-sdk";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Lazy-init Groq client so missing key only fails at request time, not startup
let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

// Supported languages — Whisper large-v3 can auto-detect, but we lock to one
// of these 10 after detecting the first speaker's language.
const SUPPORTED_LANGS = new Set([
  "en", "es", "fr", "pt", "de", "yo", "ig", "ha", "sw", "ar"
]);

/**
 * POST /api/transcription
 * Multipart form-data:
 *   audio    — WAV binary (required)
 *   language — ISO-639-1 code to force (optional; omit for auto-detect on first chunk)
 *
 * Response: { text, language }
 */
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
      const groq = getGroq();

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
