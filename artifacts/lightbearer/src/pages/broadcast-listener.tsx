import { useCallback, useEffect, useRef, useState } from "react";
import { useGetBroadcast, getGetBroadcastQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ListenerAudio } from "@/lib/audio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Users, MapPin, Mic2, Play, Square, Volume2, Radio, Wifi,
  Download, Copy, Hand, MessageSquare, Languages, X, Check
} from "lucide-react";

// ── Language metadata ──────────────────────────────────────────────────────

const LANG_META: Record<string, { name: string; flag: string }> = {
  en: { name: "English",    flag: "🇬🇧" },
  es: { name: "Spanish",    flag: "🇪🇸" },
  fr: { name: "French",     flag: "🇫🇷" },
  pt: { name: "Portuguese", flag: "🇵🇹" },
  de: { name: "German",     flag: "🇩🇪" },
  yo: { name: "Yoruba",     flag: "🇳🇬" },
  ig: { name: "Igbo",       flag: "🇳🇬" },
  ha: { name: "Hausa",      flag: "🇳🇬" },
  sw: { name: "Swahili",    flag: "🇰🇪" },
  ar: { name: "Arabic",     flag: "🇸🇦" },
};

// ── WAV helper (Float32 PCM → WAV Blob) ───────────────────────────────────

function pcmToWav(samples: Float32Array, sampleRate = 44100): Blob {
  const numCh = 1, bps = 16;
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v   = new DataView(buf);
  const str = (off: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * bps / 8, true);
  v.setUint16(32, numCh * bps / 8, true); v.setUint16(34, bps, true);
  str(36, "data"); v.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

// ── Waveform canvas helpers ────────────────────────────────────────────────

function drawListenerWaveform(canvas: HTMLCanvasElement, data: Uint8Array) {
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const midY = H / 2, barCount = Math.min(data.length, 100), barW = W / barCount;
  for (let i = 0; i < barCount; i++) {
    const v = data[Math.floor(i * data.length / barCount)] / 255;
    const halfH = Math.max(2, v * midY * 0.92);
    const alpha = Math.max(0.1, v * 0.9);
    const grad = ctx.createLinearGradient(0, midY - halfH, 0, midY + halfH);
    grad.addColorStop(0,   `rgba(251,191,36,${alpha * 0.5})`);
    grad.addColorStop(0.5, `rgba(245,158,11,${alpha})`);
    grad.addColorStop(1,   `rgba(251,191,36,${alpha * 0.5})`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(i * barW + 1, midY - halfH, barW - 2, halfH * 2, 2); ctx.fill();
  }
  ctx.strokeStyle = "rgba(245,158,11,0.15)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
}

function drawIdleWaveform(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const midY = H / 2, barW = W / 60;
  for (let i = 0; i < 60; i++) {
    const h = 2 + Math.random() * 5;
    ctx.fillStyle = "rgba(245,158,11,0.1)";
    ctx.beginPath(); ctx.roundRect(i * barW + 1, midY - h / 2, barW - 2, h, 1); ctx.fill();
  }
  ctx.strokeStyle = "rgba(245,158,11,0.07)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Comment {
  id: number; broadcastId: number; authorName: string;
  message: string; isPrayerRequest: boolean; createdAt: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BroadcastListener() {
  const { id }      = useParams();
  const broadcastId = parseInt(id || "0");

  const { data: broadcast, isLoading } = useGetBroadcast(broadcastId, {
    query: { queryKey: getGetBroadcastQueryKey(broadcastId), enabled: !!broadcastId, refetchInterval: 8000 },
  });

  // ── playback state ─────────────────────────────────────────────────────
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [volume,     setVolume]     = useState(100);
  const [connected,  setConnected]  = useState(false);

  // ── transcript state ───────────────────────────────────────────────────
  const [transcriptLines,   setTranscriptLines]   = useState<string[]>([]);
  const [detectedLanguage,  setDetectedLanguage]  = useState<string>("");
  const [isTranscribing,    setIsTranscribing]    = useState(false);
  const [showLeaveModal,    setShowLeaveModal]     = useState(false);
  const [copied,            setCopied]            = useState(false);
  const detectedLangRef    = useRef<string>("");
  const pcmChunksRef       = useRef<Float32Array[]>([]);
  const pcmTotalRef        = useRef(0);
  const transcriptRef      = useRef<string[]>([]);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  // ── comment state ──────────────────────────────────────────────────────
  const [comments,        setComments]        = useState<Comment[]>([]);
  const [commentName,     setCommentName]      = useState("");
  const [commentMessage,  setCommentMessage]   = useState("");
  const [isPrayer,        setIsPrayer]         = useState(false);
  const [submitting,      setSubmitting]       = useState(false);
  const commentScrollRef = useRef<HTMLDivElement>(null);

  // ── refs ───────────────────────────────────────────────────────────────
  const audioRef      = useRef<ListenerAudio | null>(null);
  const wsRef         = useRef<WebSocket | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const idleDrawnRef  = useRef(false);

  // ── Draw idle waveform once mounted ───────────────────────────────────
  useEffect(() => {
    if (waveCanvasRef.current && !idleDrawnRef.current) {
      drawIdleWaveform(waveCanvasRef.current);
      idleDrawnRef.current = true;
    }
  }, [broadcast]);

  // ── Volume sync ────────────────────────────────────────────────────────
  useEffect(() => { audioRef.current?.setVolume(volume / 100); }, [volume]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => { audioRef.current?.stop(); wsRef.current?.close(); };
  }, []);

  // ── Fetch comments (poll every 5s) ─────────────────────────────────────
  useEffect(() => {
    if (!broadcastId) return;
    const fetchComments = async () => {
      const res = await fetch(`/api/broadcasts/${broadcastId}/comments`);
      if (res.ok) { const d = await res.json(); setComments(d.comments ?? []); }
    };
    fetchComments();
    const id = setInterval(fetchComments, 5000);
    return () => clearInterval(id);
  }, [broadcastId]);

  // Auto-scroll comments to bottom
  useEffect(() => {
    commentScrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [comments]);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptScrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [transcriptLines]);

  // ── AI Transcription interval (every 6 s while playing) ───────────────
  useEffect(() => {
    if (!isPlaying) return;
    const MIN_SAMPLES = 44100 * 2; // 2 seconds minimum before sending

    const tick = async () => {
      const total = pcmTotalRef.current;
      if (total < MIN_SAMPLES) return;

      // Grab & clear accumulated chunks
      const chunks = pcmChunksRef.current.splice(0);
      pcmTotalRef.current = 0;

      // Merge into one Float32Array
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }

      const wav = pcmToWav(merged);
      const form = new FormData();
      form.append("audio", wav, "audio.wav");
      if (detectedLangRef.current) form.append("language", detectedLangRef.current);

      setIsTranscribing(true);
      try {
        const res = await fetch("/api/transcription", { method: "POST", body: form });
        if (res.ok) {
          const data: { text: string; language: string } = await res.json();
          if (data.text.trim()) {
            transcriptRef.current = [...transcriptRef.current, data.text.trim()];
            setTranscriptLines([...transcriptRef.current]);
            // Lock to detected language: use English if detected, else keep auto-detecting
            if (!detectedLangRef.current) {
              detectedLangRef.current = data.language === "en" ? "en" : "";
              setDetectedLanguage(data.language);
            }
          }
        }
      } finally {
        setIsTranscribing(false);
      }
    };

    const ivl = setInterval(tick, 6000);
    return () => clearInterval(ivl);
  }, [isPlaying]);

  // ── Waveform direct-canvas callback ───────────────────────────────────
  const handleWaveformUpdate = useCallback((data: Uint8Array) => {
    if (waveCanvasRef.current) drawListenerWaveform(waveCanvasRef.current, data);
  }, []);

  // ── PCM accumulator callback ───────────────────────────────────────────
  const handlePcmChunk = useCallback((f32: Float32Array) => {
    pcmChunksRef.current.push(f32);
    pcmTotalRef.current += f32.length;
  }, []);

  // ── Play / stop ────────────────────────────────────────────────────────
  const handlePlay = () => {
    if (isPlaying) {
      audioRef.current?.stop();
      wsRef.current?.close();
      audioRef.current = null;
      wsRef.current    = null;
      setIsPlaying(false);
      setConnected(false);
      if (waveCanvasRef.current) drawIdleWaveform(waveCanvasRef.current);
      // Ask about transcript if anything was transcribed
      if (transcriptRef.current.length > 0) setShowLeaveModal(true);
      return;
    }

    const proto  = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${location.host}/ws/listen/${broadcastId}`);
    socket.onopen  = () => {
      const audio = new ListenerAudio();
      audio.start(socket, handleWaveformUpdate, handlePcmChunk);
      audio.setVolume(volume / 100);
      audioRef.current = audio;
      wsRef.current    = socket;
      setIsPlaying(true);
      setConnected(true);
    };
    socket.onclose = () => {
      setIsPlaying(false); setConnected(false);
      if (waveCanvasRef.current) drawIdleWaveform(waveCanvasRef.current);
    };
    socket.onerror = () => { setIsPlaying(false); setConnected(false); };
  };

  // ── Submit comment / prayer request ────────────────────────────────────
  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentName.trim() || !commentMessage.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/broadcasts/${broadcastId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: commentName.trim(), message: commentMessage.trim(), isPrayerRequest: isPrayer }),
      });
      if (res.ok) {
        const c: Comment = await res.json();
        setComments(prev => [...prev, c]);
        setCommentMessage("");
      }
    } finally { setSubmitting(false); }
  };

  // ── Transcript download / copy ─────────────────────────────────────────
  const fullTranscript = transcriptLines.join("\n\n");

  const downloadTranscript = () => {
    const blob = new Blob([fullTranscript], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${broadcast?.title ?? "transcript"}.txt`;
    a.click(); URL.revokeObjectURL(url);
    setShowLeaveModal(false);
  };

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(fullTranscript);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  // ── Loading states ─────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Radio className="w-10 h-10 text-primary animate-pulse" />
        <p className="text-muted-foreground">Loading broadcast…</p>
      </div>
    </div>
  );
  if (!broadcast) return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">Broadcast not found</div>
  );

  const canListen  = broadcast.isLive || !!broadcast.recordingUrl;
  const coverSrc   = broadcast.thumbnailUrl || broadcast.broadcaster?.avatarUrl || "";
  const langMeta   = LANG_META[detectedLanguage] ?? null;
  const prayerCount = comments.filter(c => c.isPrayerRequest).length;

  // ── JSX ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Blurred ambient background */}
      {coverSrc && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img src={coverSrc} alt="" className="w-full h-full object-cover blur-[80px] opacity-15 saturate-150 scale-110" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
      )}

      <div className="relative z-10 container max-w-6xl py-8 px-4 md:px-6 flex flex-col gap-7">

        {/* ── HERO: artwork + info ───────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Artwork */}
          <div className="flex-shrink-0">
            <div
              className={`relative w-48 h-48 md:w-60 md:h-60 rounded-full overflow-hidden border-4 shadow-2xl
                ${broadcast.isLive ? "border-red-500/60" : "border-primary/30"}`}
              style={broadcast.isLive && isPlaying ? { boxShadow: "0 0 60px rgba(220,38,38,0.25)" } : undefined}
            >
              {coverSrc ? (
                <img src={coverSrc} alt={broadcast.title}
                  className={`w-full h-full object-cover ${isPlaying && broadcast.isLive ? "animate-[spin_25s_linear_infinite]" : ""}`} />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <Radio className="w-16 h-16 text-zinc-700" />
                </div>
              )}
              <button onClick={handlePlay} disabled={!canListen}
                className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors group">
                <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {isPlaying ? <Square className="w-5 h-5 fill-black text-black" /> : <Play className="w-5 h-5 fill-black text-black ml-1" />}
                </div>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col gap-3 text-center lg:text-left">
            <div className="flex items-center gap-2 flex-wrap justify-center lg:justify-start">
              {broadcast.isLive ? (
                <span className="flex items-center gap-1.5 bg-red-600/20 border border-red-600/50 text-red-400 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  LIVE NOW
                </span>
              ) : (
                <Badge variant="secondary" className="text-xs font-bold">RECORDED</Badge>
              )}
              {broadcast.isLive && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span className="font-bold text-foreground tabular-nums">{broadcast.listenerCount}</span>
                  <span>{broadcast.listenerCount === 1 ? "listener" : "listeners"}</span>
                </span>
              )}
              {connected && (
                <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-2.5 py-1 rounded-full">
                  <Wifi className="w-3 h-3 animate-pulse" /> ~40ms
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">{broadcast.title}</h1>
            <Link href={`/broadcaster/${broadcast.broadcasterId}`}
              className="text-lg text-primary font-semibold hover:text-primary/80 transition-colors">
              {broadcast.broadcaster?.name}
            </Link>
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm justify-center lg:justify-start">
              {broadcast.minister && <span className="flex items-center gap-1.5"><Mic2 className="w-4 h-4" />{broadcast.minister}</span>}
              {broadcast.venue    && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{broadcast.venue}</span>}
            </div>
            {broadcast.tags && (broadcast.tags as string[]).length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center lg:justify-start">
                {(broadcast.tags as string[]).map(t => (
                  <span key={t} className="text-xs bg-primary/10 text-primary/70 border border-primary/15 px-2.5 py-0.5 rounded-full">#{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── WAVEFORM ───────────────────────────────────────────────── */}
        <div className="w-full rounded-2xl overflow-hidden bg-black/60 backdrop-blur border border-white/5 relative" style={{ height: 140 }}>
          {!isPlaying && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground z-10 pointer-events-none">
              <Radio className="w-5 h-5 opacity-40" />
              <span className="text-xs opacity-60">
                {canListen ? (broadcast.isLive ? "Click play to join the live broadcast" : "Click play to listen") : "This broadcast has ended"}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(0,0,0,0.04)_3px,rgba(0,0,0,0.04)_4px)] pointer-events-none z-10" />
          <canvas ref={waveCanvasRef} width={1000} height={140} className="w-full h-full" />
        </div>

        {/* ── TRANSCRIPT + COMMENTS two-panel ──────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* LEFT: AI Transcript */}
          <div className="rounded-2xl bg-black/40 border border-white/8 backdrop-blur flex flex-col overflow-hidden" style={{ minHeight: 300 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-white">AI Transcript</span>
                {isTranscribing && (
                  <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    transcribing…
                  </span>
                )}
              </div>
              {langMeta && (
                <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span>{langMeta.flag}</span> {langMeta.name}
                </span>
              )}
              {!langMeta && isPlaying && (
                <span className="text-xs text-muted-foreground/50">auto-detecting…</span>
              )}
            </div>

            <div ref={transcriptScrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm leading-relaxed"
              style={{ maxHeight: 280 }}>
              {transcriptLines.length === 0 ? (
                <p className="text-muted-foreground/40 italic text-center pt-8">
                  {isPlaying ? "Listening… transcript will appear shortly" : "Start listening to see the AI transcript here"}
                </p>
              ) : (
                transcriptLines.map((line, i) => (
                  <p key={i} className="text-foreground/90">{line}</p>
                ))
              )}
            </div>

            {transcriptLines.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={downloadTranscript}
                  className="gap-1.5 text-muted-foreground hover:text-foreground text-xs h-8">
                  <Download className="w-3.5 h-3.5" /> Download .txt
                </Button>
                <Button size="sm" variant="ghost" onClick={copyTranscript}
                  className="gap-1.5 text-muted-foreground hover:text-foreground text-xs h-8">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            )}
          </div>

          {/* RIGHT: Prayer Requests & Comments */}
          <div className="rounded-2xl bg-black/40 border border-white/8 backdrop-blur flex flex-col overflow-hidden" style={{ minHeight: 300 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-white">Comments</span>
                {comments.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">{comments.length}</span>
                )}
              </div>
              {prayerCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
                  <Hand className="w-3 h-3" /> {prayerCount} prayer {prayerCount === 1 ? "request" : "requests"}
                </span>
              )}
            </div>

            {/* Comment list */}
            <div ref={commentScrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
              style={{ maxHeight: 190 }}>
              {comments.length === 0 ? (
                <p className="text-muted-foreground/40 italic text-center pt-6 text-sm">
                  No comments yet — be the first to share!
                </p>
              ) : (
                comments.map(c => (
                  <div key={c.id}
                    className={`rounded-xl px-3 py-2.5 text-sm ${c.isPrayerRequest
                      ? "bg-amber-500/10 border border-amber-500/20"
                      : "bg-white/5 border border-white/8"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {c.isPrayerRequest && <Hand className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      <span className="font-semibold text-white text-xs">{c.authorName}</span>
                      {c.isPrayerRequest && <span className="text-xs text-amber-400 ml-auto">Prayer Request</span>}
                    </div>
                    <p className="text-foreground/80 leading-snug">{c.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Comment form */}
            <form onSubmit={submitComment}
              className="px-4 py-3 border-t border-white/8 space-y-2 flex-shrink-0">
              <Input
                placeholder="Your name"
                value={commentName}
                onChange={e => setCommentName(e.target.value)}
                className="h-8 text-xs bg-white/5 border-white/10 placeholder:text-muted-foreground/50"
                maxLength={80}
              />
              <Textarea
                placeholder={isPrayer ? "Share your prayer request…" : "Leave a comment…"}
                value={commentMessage}
                onChange={e => setCommentMessage(e.target.value)}
                className="text-xs bg-white/5 border-white/10 placeholder:text-muted-foreground/50 resize-none"
                rows={2}
                maxLength={1000}
              />
              <div className="flex items-center justify-between gap-2">
                <button type="button"
                  onClick={() => setIsPrayer(p => !p)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors
                    ${isPrayer
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"}`}
                >
                  <Hand className="w-3 h-3" />
                  {isPrayer ? "Prayer Request ✓" : "Prayer Request"}
                </button>
                <Button type="submit" size="sm" disabled={submitting || !commentName.trim() || !commentMessage.trim()}
                  className="h-7 px-4 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                  {submitting ? "Sending…" : "Send"}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* ── CONTROLS ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center gap-6 justify-between pb-6">
          <div className="flex items-center gap-3 w-full sm:max-w-xs">
            <Volume2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <Slider value={[volume]} min={0} max={100} step={1}
              onValueChange={v => setVolume(v[0])} className="flex-1" />
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{volume}%</span>
          </div>
          <Button size="lg" onClick={handlePlay} disabled={!canListen}
            className={`h-14 px-14 text-base font-bold rounded-full transition-all
              ${isPlaying
                ? "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_rgba(245,158,11,0.3)]"}`}
          >
            {isPlaying
              ? <><Square className="w-5 h-5 mr-2.5 fill-current" />STOP</>
              : <><Play  className="w-5 h-5 mr-2.5 fill-current ml-[-4px]" />TUNE IN</>}
          </Button>
        </div>
      </div>

      {/* ── LEAVE / SAVE TRANSCRIPT MODAL ──────────────────────────── */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Save your transcript?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  The AI captured {transcriptLines.length} segment{transcriptLines.length !== 1 ? "s" : ""} while you listened.
                </p>
              </div>
              <button onClick={() => setShowLeaveModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview */}
            <div className="rounded-xl bg-black/40 border border-white/8 px-4 py-3 max-h-36 overflow-y-auto">
              <p className="text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{fullTranscript}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={downloadTranscript}
                className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Download className="w-4 h-4" /> Download .txt
              </Button>
              <Button onClick={copyTranscript} variant="outline"
                className="flex-1 gap-2 border-white/20 hover:bg-white/10">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy to Clipboard"}
              </Button>
            </div>
            <button onClick={() => setShowLeaveModal(false)}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
              Discard transcript
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
