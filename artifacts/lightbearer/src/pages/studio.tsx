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
import {
  Mic, MicOff, Radio, Square, Settings2, Volume2, Upload,
  X, Users, Activity, ImageIcon, Headphones, HeadphoneOff,
  Wifi, Clock
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

function drawWaveformToCanvas(canvas: HTMLCanvasElement, data: Uint8Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = (canvas.width / data.length) * 2.5;
  let x = 0;
  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i] / 255) * canvas.height;
    const opacity = Math.max(0.15, data[i] / 255);
    ctx.fillStyle = `rgba(245, 158, 11, ${opacity})`;
    ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
    x += barWidth;
  }
}

async function uploadFileToServer(file: Blob | File, contentType: string): Promise<string> {
  const res = await fetch("/api/storage/uploads/blob", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: file,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || "Upload failed");
  }
  const { url } = await res.json();
  return url as string;
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm tabular-nums">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

export default function Studio() {
  const { broadcaster, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [broadcastId, setBroadcastId] = useState<number | null>(null);
  const [liveStartTime, setLiveStartTime] = useState<Date | null>(null);
  const [liveDuration, setLiveDuration] = useState("00:00");

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [venue, setVenue] = useState("");
  const [minister, setMinister] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isRecorded, setIsRecorded] = useState(true);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Mic test
  const micTesterRef = useRef<MicTester | null>(null);
  const micTestCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Live audio
  const audioRef = useRef<BroadcasterAudio | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const isLiveRef = useRef(false);

  // Mixer
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);
  const [compressorOn, setCompressorOn] = useState(true);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);

  // End dialog
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const createBroadcastMutation = useCreateBroadcast();
  const updateBroadcastMutation = useUpdateBroadcast();
  const createRecordingMutation = useCreateRecording();

  useEffect(() => {
    if (!authLoading && !broadcaster) setLocation("/login");
  }, [broadcaster, authLoading, setLocation]);

  // Live duration timer
  useEffect(() => {
    if (!liveStartTime) return;
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - liveStartTime.getTime()) / 1000);
      const m = String(Math.floor(secs / 60)).padStart(2, "0");
      const s = String(secs % 60).padStart(2, "0");
      setLiveDuration(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(id);
  }, [liveStartTime]);

  // Sync EQ/compressor live (no graph disconnection)
  useEffect(() => {
    audioRef.current?.updateSettings(bass, mid, treble, compressorOn);
  }, [bass, mid, treble, compressorOn]);

  useEffect(() => {
    audioRef.current?.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (!isMuted) audioRef.current?.setVolume(volume);
  }, [volume, isMuted]);

  useEffect(() => {
    audioRef.current?.setMonitor(isMonitoring);
  }, [isMonitoring]);

  useEffect(() => {
    return () => {
      micTesterRef.current?.stop();
      audioRef.current?.stop();
    };
  }, []);

  const drawToMicTestCanvas = useCallback((data: Uint8Array) => {
    if (micTestCanvasRef.current) drawWaveformToCanvas(micTestCanvasRef.current, data);
  }, []);

  const drawToLiveCanvas = useCallback((data: Uint8Array) => {
    if (liveCanvasRef.current) drawWaveformToCanvas(liveCanvasRef.current, data);
  }, []);

  const handleStartMicTest = async () => {
    try {
      const tester = new MicTester();
      await tester.start(drawToMicTestCanvas);
      micTesterRef.current = tester;
      setIsTesting(true);
    } catch (err: any) {
      let description = err.message || "Could not access microphone.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
        description = "Microphone access denied. Allow mic permission in your browser and try again.";
      else if (err.name === "NotFoundError")
        description = "No microphone found. Please connect a microphone.";
      toast({ title: "Microphone Error", description, variant: "destructive" });
    }
  };

  const handleStopMicTest = () => {
    micTesterRef.current?.stop();
    micTesterRef.current = null;
    setIsTesting(false);
    if (micTestCanvasRef.current) {
      micTestCanvasRef.current.getContext("2d")?.clearRect(0, 0, micTestCanvasRef.current.width, micTestCanvasRef.current.height);
    }
  };

  const handleThumbnailPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    try {
      const url = await uploadFileToServer(file, file.type || "image/jpeg");
      setThumbnailUrl(url);
      toast({ title: "Thumbnail uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setThumbnailUploading(false);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (tags.length < 15 && !tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
        setTagInput("");
      }
    }
  };

  const handleGoLive = async () => {
    if (!broadcaster) return;
    if (tags.length < 5) {
      toast({ title: "Tags required", description: "Please add at least 5 tags.", variant: "destructive" });
      return;
    }
    handleStopMicTest();

    try {
      const res = await createBroadcastMutation.mutateAsync({
        data: { broadcasterId: broadcaster.id, title, description, thumbnailUrl, venue, minister, tags, isRecorded },
      });
      setBroadcastId(res.id);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/broadcast/${res.id}`);

      socket.onopen = async () => {
        try {
          const audio = new BroadcasterAudio();
          await audio.start(socket, drawToLiveCanvas, isRecorded);
          audio.updateSettings(bass, mid, treble, compressorOn);
          audio.setVolume(volume);

          socket.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string);
              if (msg.type === "listener_count") setListenerCount(msg.count);
            } catch { /* binary frames */ }
          };

          audioRef.current = audio;
          setWs(socket);
          isLiveRef.current = true;
          setLiveStartTime(new Date());
          setStep(2);
          toast({ title: "🔴 You are LIVE!", description: "Your broadcast has started." });
        } catch (err: any) {
          socket.close();
          let description = err.message || "Could not access your microphone.";
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
            description = "Microphone access was denied. Please allow mic permission.";
          else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")
            description = "No microphone found. Please connect a microphone.";
          else if (err.name === "NotReadableError" || err.name === "TrackStartError")
            description = "Microphone is already in use by another app.";
          toast({ title: "Microphone Error", description, variant: "destructive" });
        }
      };

      socket.onerror = () =>
        toast({ title: "Connection Error", description: "Could not connect to broadcast server.", variant: "destructive" });

      socket.onclose = (e) => {
        if (e.code !== 1000 && isLiveRef.current)
          toast({ title: "Connection Lost", description: "Your broadcast connection dropped.", variant: "destructive" });
        isLiveRef.current = false;
      };
    } catch (err: any) {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    }
  };

  const handleEndBroadcast = async (saveOption: "profile" | "draft" | "discard") => {
    if (!broadcastId || !broadcaster) return;
    setIsSaving(true);

    let recordingBlob: Blob | null = null;
    if (saveOption !== "discard" && isRecorded) {
      if (audioRef.current?.mediaRecorder && audioRef.current.mediaRecorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          const mr = audioRef.current!.mediaRecorder!;
          mr.onstop = () => resolve();
          mr.stop();
        });
      }
      recordingBlob = audioRef.current?.getRecordingBlob() ?? null;
    }

    audioRef.current?.stop();
    if (ws) ws.close();
    isLiveRef.current = false;
    setShowEndDialog(false);

    try {
      let recordingUrl: string | undefined;

      if (recordingBlob && recordingBlob.size > 0) {
        toast({ title: "Uploading recording…", description: "Please wait while your broadcast is saved." });
        recordingUrl = await uploadFileToServer(recordingBlob, "audio/webm");
      }

      if (recordingUrl) {
        await createRecordingMutation.mutateAsync({
          data: {
            broadcasterId: broadcaster.id,
            broadcastId,
            title,
            url: recordingUrl,
            thumbnailUrl,
            durationSeconds: 0,
            isPublic: saveOption === "profile",
            isDraft: saveOption === "draft",
          },
        });
      }

      await updateBroadcastMutation.mutateAsync({
        id: broadcastId,
        data: { isLive: false, endedAt: new Date().toISOString(), savedToDraft: saveOption === "draft" },
      });

      toast({ title: "Broadcast Ended" });
      setLocation(`/broadcaster/${broadcaster.id}`);
    } catch (err: any) {
      toast({ title: "Error ending broadcast", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || !broadcaster) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── SETUP STEP ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="container py-8 max-w-5xl space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Broadcast Studio</h1>
            <p className="text-muted-foreground mt-2">Configure your broadcast and test your mic before going live.</p>
          </div>

          {/* Mic Test */}
          <Card className="bg-card border-primary/20 overflow-hidden">
            <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Mic className="w-4 h-4 text-primary" /> Mic Test — Check your audio before going live
              </CardTitle>
              <Button
                size="sm"
                variant={isTesting ? "destructive" : "outline"}
                onClick={isTesting ? handleStopMicTest : handleStartMicTest}
                className={isTesting ? "" : "border-primary/40 text-primary hover:bg-primary/10"}
              >
                {isTesting ? <><MicOff className="w-4 h-4 mr-2" />Stop Test</> : <><Mic className="w-4 h-4 mr-2" />Test Mic</>}
              </Button>
            </CardHeader>
            <CardContent className="p-0 h-28 relative bg-black/60">
              {!isTesting && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm gap-2">
                  <Activity className="w-4 h-4" /> Click "Test Mic" to check your microphone
                </div>
              )}
              <canvas ref={micTestCanvasRef} width={800} height={112} className="w-full h-full" />
            </CardContent>
          </Card>

          {/* Broadcast Details */}
          <Card className="bg-card border-border/50">
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Broadcast Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday Morning Worship" />
                </div>
                <div className="space-y-2">
                  <Label>Minister / Speaker</Label>
                  <Input value={minister} onChange={(e) => setMinister(e.target.value)} placeholder="e.g. Pastor John Doe" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Venue</Label>
                  <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Main Sanctuary" />
                </div>
                <div className="space-y-2">
                  <Label>Thumbnail Image (Optional)</Label>
                  <input ref={thumbnailInputRef} type="file" accept="image/*" className="hidden" onChange={handleThumbnailPick} />
                  {thumbnailUrl ? (
                    <div className="relative w-full h-24 rounded-lg overflow-hidden border border-border group">
                      <img src={thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setThumbnailUrl("")}
                        className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline"
                      className="w-full h-24 border-dashed flex-col gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => thumbnailInputRef.current?.click()}
                      disabled={thumbnailUploading}>
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">{thumbnailUploading ? "Uploading…" : "Click to upload image"}</span>
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this broadcast about?" />
              </div>

              <div className="space-y-2">
                <Label>Tags (add 5–15) *</Label>
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder="Type a tag and press Enter" />
                <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
                  {tags.map((tag) => (
                    <span key={tag} className="bg-primary/20 text-primary border border-primary/30 px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
                      {tag}
                      <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-primary/60">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{tags.length}/15 tags — need at least 5</p>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <Switch id="record" checked={isRecorded} onCheckedChange={setIsRecorded} />
                <Label htmlFor="record" className="flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" /> Record this broadcast
                </Label>
              </div>

              <Button
                onClick={handleGoLive}
                disabled={!title || tags.length < 5 || createBroadcastMutation.isPending}
                className="w-full h-14 text-lg font-bold bg-destructive text-white hover:bg-destructive/90 tracking-widest"
              >
                <Radio className="w-5 h-5 mr-3 animate-pulse" />
                {createBroadcastMutation.isPending ? "CONNECTING…" : "GO LIVE"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── LIVE STEP ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col min-h-screen">

          {/* ═══════════ STUDIO HEADER ═══════════ */}
          <div className="relative bg-[#0a0a0f] border-b border-red-900/40 overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-950/30 via-transparent to-primary/5 pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />

            <div className="relative container py-5 flex flex-col gap-4">
              {/* Top row — live pill + clock + end button */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Animated LIVE pill */}
                  <div className="flex items-center gap-2 bg-red-600/20 border border-red-600/50 rounded-full px-3 py-1.5 shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-red-400 text-xs font-bold tracking-[0.2em]">ON AIR</span>
                  </div>

                  {/* Duration */}
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono text-sm tabular-nums text-foreground/70">{liveDuration}</span>
                  </div>

                  {/* Clock */}
                  <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground/60 text-sm">
                    <LiveClock />
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowEndDialog(true)}
                  className="font-bold tracking-wider bg-red-600 hover:bg-red-700 shadow-[0_0_20px_rgba(220,38,38,0.35)] border border-red-500/50"
                >
                  <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> END BROADCAST
                </Button>
              </div>

              {/* Main title row */}
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight truncate">
                    {title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
                    {minister && (
                      <span className="flex items-center gap-1.5 text-primary font-medium">
                        <Mic className="w-3.5 h-3.5" /> {minister}
                      </span>
                    )}
                    {venue && (
                      <span className="text-muted-foreground">{venue}</span>
                    )}
                  </div>
                </div>

                {/* Stats chips */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-bold text-white tabular-nums">{listenerCount}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {listenerCount === 1 ? "listener" : "listeners"}
                    </span>
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

          {/* ═══════════ STUDIO BODY ═══════════ */}
          <div className="container py-6 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Waveform */}
              <Card className="lg:col-span-2 bg-card border-border/50 overflow-hidden">
                <CardHeader className="border-b border-border/50 bg-background/30 py-3 px-5">
                  <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                    <Activity className="w-4 h-4 text-primary" /> Live Audio Output
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 h-[320px] relative bg-black/70">
                  <canvas ref={liveCanvasRef} width={800} height={320} className="w-full h-full" />
                  {/* Scanline overlay */}
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)] pointer-events-none" />
                </CardContent>
              </Card>

              {/* AI Mixer */}
              <Card className="bg-card border-border/50">
                <CardHeader className="border-b border-border/50 bg-background/30 py-3 px-5">
                  <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                    <Settings2 className="w-4 h-4 text-primary" /> AI Audio Mixer
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-5">

                  {/* EQ */}
                  {(["Bass", "Mid", "Treble"] as const).map((band) => {
                    const val = band === "Bass" ? bass : band === "Mid" ? mid : treble;
                    const set = band === "Bass" ? setBass : band === "Mid" ? setMid : setTreble;
                    return (
                      <div key={band} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">{band}</Label>
                          <span className={`text-xs font-mono ${val !== 0 ? "text-primary" : "text-muted-foreground"}`}>
                            {val > 0 ? `+${val}` : val} dB
                          </span>
                        </div>
                        <Slider value={[val]} min={-15} max={15} step={1} onValueChange={(v) => set(v[0])} />
                        {/* Tick marks */}
                        <div className="flex justify-between px-0.5">
                          <span className="text-[9px] text-muted-foreground/40">-15</span>
                          <span className="text-[9px] text-muted-foreground/40">0</span>
                          <span className="text-[9px] text-muted-foreground/40">+15</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Compressor */}
                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <div>
                      <Label htmlFor="comp" className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">Compressor</Label>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">Evens out your audio levels</p>
                    </div>
                    <Switch id="comp" checked={compressorOn} onCheckedChange={setCompressorOn} />
                  </div>

                  {/* Volume + Mute */}
                  <div className="pt-3 border-t border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5" /> Volume
                      </Label>
                      <span className="text-xs text-primary font-mono">{isMuted ? "Muted" : `${volume}%`}</span>
                    </div>
                    <Slider
                      value={[volume]}
                      min={0} max={100} step={1}
                      onValueChange={(v) => { setVolume(v[0]); if (isMuted) setIsMuted(false); }}
                      disabled={isMuted}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={isMuted ? "destructive" : "outline"}
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setIsMuted(!isMuted)}
                      >
                        {isMuted ? <><MicOff className="w-3.5 h-3.5 mr-1.5" />Unmute</> : <><Mic className="w-3.5 h-3.5 mr-1.5" />Mute</>}
                      </Button>

                      {/* Self-monitor toggle */}
                      <Button
                        variant={isMonitoring ? "default" : "outline"}
                        size="sm"
                        className={`w-full text-xs ${isMonitoring ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(245,158,11,0.4)]" : ""}`}
                        onClick={() => setIsMonitoring(!isMonitoring)}
                        title="Hear yourself through your speakers"
                      >
                        {isMonitoring
                          ? <><Headphones className="w-3.5 h-3.5 mr-1.5" />Monitoring</>
                          : <><HeadphoneOff className="w-3.5 h-3.5 mr-1.5" />Monitor</>}
                      </Button>
                    </div>
                    {isMonitoring && (
                      <p className="text-[10px] text-amber-400/80 text-center leading-snug">
                        You're hearing yourself — use headphones to avoid feedback echo.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── END BROADCAST DIALOG ────────────────────────────────── */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Broadcast</DialogTitle>
            <DialogDescription>
              {isRecorded ? "What would you like to do with your recording?" : "Are you sure you want to end this broadcast?"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            {isRecorded && (
              <>
                <Button onClick={() => handleEndBroadcast("profile")} className="w-full justify-start h-12" disabled={isSaving}>
                  Save to Public Profile
                </Button>
                <Button onClick={() => handleEndBroadcast("draft")} className="w-full justify-start h-12" variant="secondary" disabled={isSaving}>
                  Save as Draft (Private)
                </Button>
              </>
            )}
            <Button
              onClick={() => handleEndBroadcast("discard")}
              className="w-full justify-start h-12 text-destructive hover:bg-destructive hover:text-white"
              variant="outline"
              disabled={isSaving}
            >
              {isRecorded ? "Discard & End" : "End Broadcast"}
            </Button>
          </div>
          {isSaving && <p className="text-center text-sm text-muted-foreground pb-2">Uploading recording, please wait…</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
