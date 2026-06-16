import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCreateBroadcast, useUpdateBroadcast, useCreateRecording } from "@workspace/api-client-react";
import { BroadcasterAudio, MicTester } from "@/lib/audio";
import { wsUrl } from "@/lib/ws";
import { apiFetch } from "@/lib/api";
import {
  Mic, MicOff, Radio, Square, Settings2, Volume2, Upload,
  X, Users, Activity, ImageIcon, Headphones, HeadphoneOff,
  Wifi, Clock, Music2, Waves
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// ── helpers ──────────────────────────────────────────────────────────────────

function drawWaveformToCanvas(canvas: HTMLCanvasElement, data: Uint8Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const barCount = Math.min(data.length, 80);
  const barW     = W / barCount;
  for (let i = 0; i < barCount; i++) {
    const v   = data[Math.floor(i * data.length / barCount)] / 255;
    const bH  = Math.max(3, v * H * 0.95);
    const alpha = Math.max(0.12, v);
    // Gradient: amber at bottom, gold at top
    const grad = ctx.createLinearGradient(0, H - bH, 0, H);
    grad.addColorStop(0, `rgba(251,191,36,${alpha})`);
    grad.addColorStop(1, `rgba(245,158,11,${alpha * 0.6})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(i * barW + 1, H - bH, barW - 2, bH, 2);
    ctx.fill();
  }
}

type UploadPurpose = "thumbnail" | "recording" | "general";

async function uploadFile(file: Blob | File, contentType: string, purpose: UploadPurpose = "general"): Promise<string> {
  const res = await apiFetch(`/api/storage/uploads/blob?purpose=${purpose}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error || "Upload failed");
  return ((await res.json()) as any).url as string;
}

function LiveClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return <span className="font-mono text-sm tabular-nums">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
}

// Knob-style display for pitch (shows semitones as ♭/♯)
function PitchLabel({ v }: { v: number }) {
  if (v === 0) return <span className="text-muted-foreground font-mono text-xs">0 st</span>;
  const abs = Math.abs(v);
  return <span className={`font-mono text-xs font-bold ${v > 0 ? "text-amber-400" : "text-violet-400"}`}>{v > 0 ? `+${v}` : v} st</span>;
}

// EQ band row
function EQBand({ label, sub, value, onChange }: { label: string; sub: string; value: number; onChange: (v: number) => void }) {
  const active = value !== 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-xs font-bold uppercase tracking-wider ${active ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
          <span className="text-[10px] text-muted-foreground/50 ml-1.5">{sub}</span>
        </div>
        <span className={`text-xs font-mono tabular-nums ${active ? "text-primary" : "text-muted-foreground/60"}`}>
          {value > 0 ? `+${value}` : value} dB
        </span>
      </div>
      <Slider value={[value]} min={-15} max={15} step={1} onValueChange={(v) => onChange(v[0])} />
      <div className="flex justify-between px-0.5 pointer-events-none">
        {[-15, -10, -5, 0, 5, 10, 15].map((tick) => (
          <div key={tick} className={`w-px h-1 ${tick === 0 ? "bg-muted-foreground/40" : "bg-muted-foreground/15"}`} />
        ))}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Studio() {
  const { broadcaster, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep]       = useState<1 | 2>(1);
  const [broadcastId, setBroadcastId] = useState<number | null>(null);
  const [liveStart, setLiveStart]     = useState<Date | null>(null);
  const [liveDur, setLiveDur]         = useState("00:00");

  // Form
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);
  const [venue, setVenue]               = useState("");
  const [minister, setMinister]         = useState("");
  const [tags, setTags]                 = useState<string[]>([]);
  const [tagInput, setTagInput]         = useState("");
  const [isRecorded, setIsRecorded]     = useState(true);
  const thumbRef = useRef<HTMLInputElement>(null);

  // Mic test
  const micTesterRef    = useRef<MicTester | null>(null);
  const micCanvasRef    = useRef<HTMLCanvasElement>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Live
  const audioRef     = useRef<BroadcasterAudio | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ws, setWs]  = useState<WebSocket | null>(null);
  const isLiveRef    = useRef(false);

  // Mixer state
  const [bass, setBass]           = useState(0);
  const [mid, setMid]             = useState(0);
  const [treble, setTreble]       = useState(0);
  const [pitch, setPitch]         = useState(0);        // semitones ±12
  const [reverbWet, setReverbWet] = useState(0);        // 0-1
  const [compOn, setCompOn]       = useState(true);
  const [volume, setVolume]       = useState(100);
  const [muted, setMuted]         = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [listeners, setListeners] = useState(0);

  // Dialog
  const [showEnd, setShowEnd]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const createBcast  = useCreateBroadcast();
  const updateBcast  = useUpdateBroadcast();
  const createRec    = useCreateRecording();

  // ── effects ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!authLoading && !broadcaster) setLocation("/login"); }, [broadcaster, authLoading]);

  useEffect(() => {
    if (!liveStart) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - liveStart.getTime()) / 1000);
      setLiveDur(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(id);
  }, [liveStart]);

  // Push ALL mixer changes to audio engine at once — never disconnects graph
  useEffect(() => {
    audioRef.current?.updateSettings(bass, mid, treble, compOn, pitch, reverbWet);
  }, [bass, mid, treble, compOn, pitch, reverbWet]);

  useEffect(() => { audioRef.current?.setMuted(muted); },          [muted]);
  useEffect(() => { if (!muted) audioRef.current?.setVolume(volume); }, [volume, muted]);
  useEffect(() => { audioRef.current?.setMonitor(monitoring); },   [monitoring]);
  useEffect(() => () => { micTesterRef.current?.stop(); audioRef.current?.stop(); }, []);

  const drawMic  = useCallback((d: Uint8Array) => { if (micCanvasRef.current)  drawWaveformToCanvas(micCanvasRef.current,  d); }, []);
  const drawLive = useCallback((d: Uint8Array) => { if (liveCanvasRef.current) drawWaveformToCanvas(liveCanvasRef.current, d); }, []);

  const startMicTest = async () => {
    try {
      const t = new MicTester(); await t.start(drawMic); micTesterRef.current = t; setIsTesting(true);
    } catch (e: any) {
      const msg = e.name === "NotAllowedError" ? "Mic permission denied." : e.name === "NotFoundError" ? "No microphone found." : e.message;
      toast({ title: "Microphone Error", description: msg, variant: "destructive" });
    }
  };

  const stopMicTest = () => {
    micTesterRef.current?.stop(); micTesterRef.current = null; setIsTesting(false);
    micCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 800, 112);
  };

  const pickThumb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setThumbUploading(true);
    try   { setThumbnailUrl(await uploadFile(f, f.type || "image/jpeg", "thumbnail")); toast({ title: "Thumbnail uploaded" }); }
    catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setThumbUploading(false); if (thumbRef.current) thumbRef.current.value = ""; }
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (tags.length < 15 && !tags.includes(tagInput.trim())) { setTags([...tags, tagInput.trim()]); setTagInput(""); }
    }
  };

  const goLive = async () => {
    if (!broadcaster) return;
    if (tags.length < 5) { toast({ title: "Need at least 5 tags", variant: "destructive" }); return; }
    stopMicTest();

    // ── Acquire mic + unlock AudioContext IMMEDIATELY in the user-gesture
    //    handler, before any async API calls or WebSocket setup.
    //    Android Chrome requires this — it enforces a strict user-activation
    //    window and will block AudioContext / getUserMedia if called too late.
    let preStream: MediaStream;
    try {
      preStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  false,
          channelCount:     { ideal: 1, max: 1 },
          sampleRate:       { ideal: 44100 },
        },
        video: false,
      });
    } catch (e: any) {
      const desc = e.name === "NotAllowedError" ? "Mic permission denied. Please allow microphone access and try again."
        : e.name === "NotFoundError" ? "No microphone found on this device."
        : e.message;
      toast({ title: "Microphone Error", description: desc, variant: "destructive" });
      return;
    }

    try {
      const res = await createBcast.mutateAsync({ data: { broadcasterId: broadcaster.id, title, description, thumbnailUrl, venue, minister, tags, isRecorded } });
      setBroadcastId(res.id);
      const socket = new WebSocket(wsUrl(`/ws/broadcast/${res.id}`));
      socket.onopen = async () => {
        try {
          const audio = new BroadcasterAudio();
          // Pass the pre-acquired stream so BroadcasterAudio skips getUserMedia
          await audio.start(socket, drawLive, isRecorded, preStream);
          audio.updateSettings(bass, mid, treble, compOn, pitch, reverbWet);
          audio.setVolume(volume);
          socket.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type === "listener_count") setListeners(m.count); } catch {} };
          audioRef.current = audio; setWs(socket); isLiveRef.current = true; setLiveStart(new Date()); setStep(2);
          toast({ title: "You are LIVE!" });
        } catch (e: any) {
          // Release the pre-acquired stream if we failed
          preStream.getTracks().forEach(t => t.stop());
          socket.close();
          toast({ title: "Broadcast Error", description: e.message, variant: "destructive" });
        }
      };
      socket.onerror  = () => toast({ title: "Connection Error", variant: "destructive" });
      socket.onclose  = (e) => { if (e.code !== 1000 && isLiveRef.current) toast({ title: "Connection Lost", variant: "destructive" }); isLiveRef.current = false; };
    } catch (e: any) { toast({ title: "Failed to start broadcast", description: e.message, variant: "destructive" }); }
  };

  const endBroadcast = async (opt: "profile" | "draft" | "discard") => {
    if (!broadcastId || !broadcaster) return;
    setSaving(true);

    // Always finalise the MediaRecorder so we get the last chunk
    if (audioRef.current?.mediaRecorder && audioRef.current.mediaRecorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const mr = audioRef.current!.mediaRecorder!;
        mr.onstop = () => resolve();
        mr.stop();
      });
    }
    const blob = audioRef.current?.getRecordingBlob() ?? null;

    audioRef.current?.stop();
    if (ws) ws.close();
    isLiveRef.current = false;
    setShowEnd(false);

    try {
      // Always upload the audio so listeners can replay the broadcast later
      let url: string | undefined;
      if (blob && blob.size > 0) {
        toast({ title: "Saving broadcast audio…" });
        url = await uploadFile(blob, "audio/webm", "recording");
      }

      // Only add to the recordings library if the broadcaster didn't discard
      if (url && opt !== "discard") {
        await createRec.mutateAsync({
          data: {
            broadcasterId: broadcaster.id, broadcastId, title, url,
            thumbnailUrl, durationSeconds: 0,
            isPublic: opt === "profile", isDraft: opt === "draft",
          },
        });
      }

      // Always mark the broadcast as ended and attach the recording URL so
      // anyone who visits the page later can still listen to it
      await updateBcast.mutateAsync({
        id: broadcastId,
        data: {
          isLive: false,
          endedAt: new Date().toISOString(),
          recordingUrl: url,
          savedToDraft: opt === "draft",
        },
      });

      toast({ title: "Broadcast ended" });
      setLocation(`/broadcaster/${broadcaster.id}`);
    } catch (e: any) {
      toast({ title: "Error ending broadcast", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !broadcaster) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  // ── SETUP STEP ────────────────────────────────────────────────────────────
  if (step === 1) return (
    <div className="container py-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Broadcast Studio</h1>
        <p className="text-muted-foreground mt-1">Set up your broadcast details and test your microphone.</p>
      </div>

      {/* Mic test */}
      <Card className="bg-card border-primary/20 overflow-hidden">
        <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Mic className="w-4 h-4 text-primary" /> Mic Test
          </CardTitle>
          <Button size="sm" variant={isTesting ? "destructive" : "outline"}
            onClick={isTesting ? stopMicTest : startMicTest}
            className={isTesting ? "" : "border-primary/40 text-primary hover:bg-primary/10"}>
            {isTesting ? <><MicOff className="w-4 h-4 mr-1.5" />Stop</> : <><Mic className="w-4 h-4 mr-1.5" />Test Mic</>}
          </Button>
        </CardHeader>
        <CardContent className="p-0 h-24 relative bg-black/60">
          {!isTesting && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm gap-2"><Activity className="w-4 h-4" />Click "Test Mic" to check your microphone</div>}
          <canvas ref={micCanvasRef} width={800} height={96} className="w-full h-full" />
        </CardContent>
      </Card>

      {/* Form */}
      <Card className="bg-card border-border/50">
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2"><Label>Broadcast Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday Morning Worship" /></div>
            <div className="space-y-2"><Label>Minister / Speaker</Label><Input value={minister} onChange={(e) => setMinister(e.target.value)} placeholder="e.g. Pastor John Doe" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2"><Label>Venue</Label><Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Main Sanctuary" /></div>
            <div className="space-y-2">
              <Label>Thumbnail Image</Label>
              <input ref={thumbRef} type="file" accept="image/*" className="hidden" onChange={pickThumb} />
              {thumbnailUrl ? (
                <div className="relative w-full h-24 rounded-lg overflow-hidden border border-border group">
                  <img src={thumbnailUrl} alt="thumb" className="w-full h-full object-cover" />
                  <button onClick={() => setThumbnailUrl("")} className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3.5 h-3.5 text-white" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full h-24 border-dashed flex-col gap-2 text-muted-foreground" onClick={() => thumbRef.current?.click()} disabled={thumbUploading}>
                  <ImageIcon className="w-6 h-6" /><span className="text-xs">{thumbUploading ? "Uploading…" : "Click to upload"}</span>
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this broadcast about?" /></div>
          <div className="space-y-2">
            <Label>Tags (add 5–15) *</Label>
            <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={addTag} placeholder="Type a tag and press Enter" />
            <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
              {tags.map((t) => (
                <span key={t} className="bg-primary/20 text-primary border border-primary/30 px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
                  {t}<button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{tags.length}/15 tags — need at least 5</p>
          </div>
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Switch id="record" checked={isRecorded} onCheckedChange={setIsRecorded} />
            <Label htmlFor="record" className="flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" /> Record this broadcast</Label>
          </div>
          <Button onClick={goLive} disabled={!title || tags.length < 5 || createBcast.isPending} className="w-full h-14 text-lg font-bold bg-destructive text-white hover:bg-destructive/90 tracking-widest">
            <Radio className="w-5 h-5 mr-3 animate-pulse" />{createBcast.isPending ? "CONNECTING…" : "GO LIVE"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // ── LIVE STEP ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* Studio header */}
      <div className="relative bg-[#07070d] border-b border-red-900/40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-red-950/40 via-transparent to-primary/5 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
        <div className="relative container py-4">
          {/* Top row */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-red-600/20 border border-red-600/40 rounded-full px-3 py-1 shadow-[0_0_18px_rgba(220,38,38,0.35)]">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>
                <span className="text-red-400 text-xs font-bold tracking-[0.2em]">ON AIR</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground/70 text-sm"><Clock className="w-3.5 h-3.5" /><span className="font-mono tabular-nums">{liveDur}</span></div>
              <div className="hidden sm:block text-muted-foreground/50 text-sm"><LiveClock /></div>
            </div>
            <Button size="sm" onClick={() => setShowEnd(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold tracking-wider shadow-[0_0_16px_rgba(220,38,38,0.3)] border border-red-500/40">
              <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> END
            </Button>
          </div>
          {/* Title + stats */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{title}</h1>
              <div className="flex gap-4 mt-1 text-sm flex-wrap">
                {minister && <span className="flex items-center gap-1.5 text-primary font-medium"><Mic className="w-3.5 h-3.5" />{minister}</span>}
                {venue    && <span className="text-muted-foreground">{venue}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-bold text-white tabular-nums">{listeners}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">{listeners === 1 ? "listener" : "listeners"}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Wifi className="w-3.5 h-3.5 text-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-medium">Live</span>
              </div>
              {isRecorded && (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-red-400 font-medium">REC</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Studio body */}
      <div className="container py-6 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Waveform */}
          <Card className="xl:col-span-2 bg-card border-border/50 overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-background/30 py-3 px-5">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <Activity className="w-4 h-4 text-primary" /> Live Audio
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[300px] bg-black/80 relative">
              <canvas ref={liveCanvasRef} width={800} height={300} className="w-full h-full" />
              <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(0,0,0,0.04)_3px,rgba(0,0,0,0.04)_4px)] pointer-events-none" />
            </CardContent>
          </Card>

          {/* ── AI Mixer ── */}
          <Card className="bg-card border-border/50 flex flex-col">
            <CardHeader className="border-b border-border/50 bg-background/30 py-3 px-5 flex-shrink-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <Settings2 className="w-4 h-4 text-primary" /> AI Audio Mixer
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto flex-1 space-y-5">

              {/* ── EQ section ── */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-3 flex items-center gap-1.5">
                  <Waves className="w-3 h-3" /> Equalizer
                </p>
                <div className="space-y-4">
                  <EQBand label="Bass"   sub="120 Hz"  value={bass}   onChange={setBass} />
                  <EQBand label="Mid"    sub="800 Hz"  value={mid}    onChange={setMid} />
                  <EQBand label="Treble" sub="4 kHz"   value={treble} onChange={setTreble} />
                </div>
              </div>

              {/* ── Pitch ── */}
              <div className="pt-4 border-t border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold flex items-center gap-1.5">
                    <Music2 className="w-3 h-3" /> Pitch Shift
                  </p>
                  <PitchLabel v={pitch} />
                </div>
                <Slider value={[pitch]} min={-12} max={12} step={1} onValueChange={(v) => setPitch(v[0])} />
                <div className="flex justify-between mt-1 px-0.5 pointer-events-none">
                  {[-12,-8,-4,0,4,8,12].map((t) => (
                    <span key={t} className={`text-[9px] tabular-nums ${t === 0 ? "text-muted-foreground/50" : "text-muted-foreground/25"}`}>{t > 0 ? `+${t}` : t}</span>
                  ))}
                </div>
                {pitch !== 0 && (
                  <Button variant="ghost" size="sm" className="w-full h-6 text-[10px] text-muted-foreground mt-1" onClick={() => setPitch(0)}>Reset pitch</Button>
                )}
              </div>

              {/* ── Reverb ── */}
              <div className="pt-4 border-t border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">Reverb</p>
                  <span className={`text-xs font-mono ${reverbWet > 0 ? "text-primary" : "text-muted-foreground/50"}`}>
                    {reverbWet === 0 ? "Off" : `${Math.round(reverbWet * 100)}%`}
                  </span>
                </div>
                <Slider value={[reverbWet * 100]} min={0} max={100} step={5} onValueChange={(v) => setReverbWet(v[0] / 100)} />
                <p className="text-[10px] text-muted-foreground/40 mt-1">Church hall reverb</p>
              </div>

              {/* ── Compressor ── */}
              <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Compressor</p>
                  <p className="text-[10px] text-muted-foreground/40">Evens out vocal levels</p>
                </div>
                <Switch checked={compOn} onCheckedChange={setCompOn} />
              </div>

              {/* ── Volume + Mute + Monitor ── */}
              <div className="pt-4 border-t border-border/60 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5" /> Volume</Label>
                  <span className="text-xs font-mono text-primary">{muted ? "Muted" : `${volume}%`}</span>
                </div>
                <Slider value={[volume]} min={0} max={100} step={1} onValueChange={(v) => { setVolume(v[0]); if (muted) setMuted(false); }} disabled={muted} />

                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={muted ? "destructive" : "outline"} className="text-xs" onClick={() => setMuted(!muted)}>
                    {muted ? <><MicOff className="w-3.5 h-3.5 mr-1" />Unmute</> : <><Mic className="w-3.5 h-3.5 mr-1" />Mute</>}
                  </Button>
                  <Button size="sm" variant={monitoring ? "default" : "outline"}
                    className={`text-xs ${monitoring ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(245,158,11,0.35)]" : ""}`}
                    onClick={() => setMonitoring(!monitoring)}>
                    {monitoring ? <><Headphones className="w-3.5 h-3.5 mr-1" />Hearing</> : <><HeadphoneOff className="w-3.5 h-3.5 mr-1" />Monitor</>}
                  </Button>
                </div>
                {monitoring && (
                  <p className="text-[10px] text-amber-400/70 text-center leading-tight">
                    You can hear yourself — use headphones to avoid echo.
                  </p>
                )}
              </div>

            </CardContent>
          </Card>
        </div>
      </div>

      {/* End dialog */}
      <Dialog open={showEnd} onOpenChange={setShowEnd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Broadcast</DialogTitle>
            <DialogDescription>{isRecorded ? "What would you like to do with your recording?" : "Are you sure you want to end this broadcast?"}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            {isRecorded && <>
              <Button onClick={() => endBroadcast("profile")} className="w-full justify-start h-12" disabled={saving}>Save to Public Profile</Button>
              <Button onClick={() => endBroadcast("draft")} variant="secondary" className="w-full justify-start h-12" disabled={saving}>Save as Draft (Private)</Button>
            </>}
            <Button onClick={() => endBroadcast("discard")} variant="outline" className="w-full justify-start h-12 text-destructive hover:bg-destructive hover:text-white" disabled={saving}>
              {isRecorded ? "Discard & End" : "End Broadcast"}
            </Button>
          </div>
          {saving && <p className="text-center text-sm text-muted-foreground pb-2">Uploading recording, please wait…</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
