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
import { Mic, MicOff, Radio, Square, Settings2, Volume2, VolumeX, Video, X, Users, Activity } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export default function Studio() {
  const { broadcaster, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [broadcastId, setBroadcastId] = useState<number | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [minister, setMinister] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isRecorded, setIsRecorded] = useState(true);

  // Mic test state (step 1)
  const micTesterRef = useRef<MicTester | null>(null);
  const micTestCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Live audio state (step 2)
  const audioRef = useRef<BroadcasterAudio | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const isLiveRef = useRef(false);

  // Mixer State
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);
  const [compressorOn, setCompressorOn] = useState(true);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);

  // End Dialog
  const [showEndDialog, setShowEndDialog] = useState(false);

  const createBroadcastMutation = useCreateBroadcast();
  const updateBroadcastMutation = useUpdateBroadcast();
  const createRecordingMutation = useCreateRecording();

  useEffect(() => {
    if (!authLoading && !broadcaster) {
      setLocation("/login");
    }
  }, [broadcaster, authLoading, setLocation]);

  // Wire EQ/compressor changes into live audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.updateSettings(bass, mid, treble, compressorOn);
    }
  }, [bass, mid, treble, compressorOn]);

  // Wire mute into live audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  // Wire volume into live audio
  useEffect(() => {
    if (audioRef.current && !isMuted) {
      audioRef.current.setVolume(volume);
    }
  }, [volume, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      micTesterRef.current?.stop();
      audioRef.current?.stop();
    };
  }, []);

  const drawToMicTestCanvas = useCallback((data: Uint8Array) => {
    if (micTestCanvasRef.current) {
      drawWaveformToCanvas(micTestCanvasRef.current, data);
    }
  }, []);

  const drawToLiveCanvas = useCallback((data: Uint8Array) => {
    if (liveCanvasRef.current) {
      drawWaveformToCanvas(liveCanvasRef.current, data);
    }
  }, []);

  const handleStartMicTest = async () => {
    try {
      const tester = new MicTester();
      await tester.start(drawToMicTestCanvas);
      micTesterRef.current = tester;
      setIsTesting(true);
    } catch (err: any) {
      let description = err.message || "Could not access microphone.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        description = "Microphone access denied. Allow mic permission in your browser and try again.";
      } else if (err.name === "NotFoundError") {
        description = "No microphone found. Please connect a microphone.";
      }
      toast({ title: "Microphone Error", description, variant: "destructive" });
    }
  };

  const handleStopMicTest = () => {
    micTesterRef.current?.stop();
    micTesterRef.current = null;
    setIsTesting(false);
    if (micTestCanvasRef.current) {
      const ctx = micTestCanvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, micTestCanvasRef.current.width, micTestCanvasRef.current.height);
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

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleGoLive = async () => {
    if (!broadcaster) return;
    if (tags.length < 5) {
      toast({ title: "Tags required", description: "Please add at least 5 tags.", variant: "destructive" });
      return;
    }

    // Stop mic test if running
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
            } catch {
              // binary frames ignored
            }
          };

          audioRef.current = audio;
          setWs(socket);
          isLiveRef.current = true;
          setStep(2);
          toast({ title: "You are LIVE!", description: "Your broadcast has started." });
        } catch (err: any) {
          socket.close();
          let description = err.message || "Could not access your microphone.";
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            description = "Microphone access was denied. Allow mic permission in your browser and try again.";
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            description = "No microphone found. Please connect a microphone and try again.";
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            description = "Your microphone is already in use by another app. Close it and try again.";
          }
          toast({ title: "Microphone Error", description, variant: "destructive" });
        }
      };

      socket.onerror = () => {
        toast({ title: "Connection Error", description: "Could not connect to broadcast server. Please try again.", variant: "destructive" });
      };

      socket.onclose = (e) => {
        if (e.code !== 1000 && isLiveRef.current) {
          toast({ title: "Connection Lost", description: "Your broadcast connection dropped.", variant: "destructive" });
        }
        isLiveRef.current = false;
      };
    } catch (err: any) {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    }
  };

  const handleEndBroadcast = async (saveOption: "profile" | "draft" | "discard") => {
    if (!broadcastId || !broadcaster) return;

    audioRef.current?.stop();
    if (ws) ws.close();
    isLiveRef.current = false;

    try {
      if (saveOption !== "discard" && isRecorded && audioRef.current?.recordedChunks.length) {
        const mockUrl = `https://example.com/recordings/${broadcastId}.webm`;
        await createRecordingMutation.mutateAsync({
          data: {
            broadcasterId: broadcaster.id,
            broadcastId,
            title,
            url: mockUrl,
            thumbnailUrl,
            durationSeconds: 3600,
            isPublic: saveOption === "profile",
            isDraft: saveOption === "draft",
          },
        });
      }

      await updateBroadcastMutation.mutateAsync({
        id: broadcastId,
        data: { isLive: false, endedAt: new Date().toISOString(), savedToDraft: saveOption === "draft" },
      });

      toast({ title: "Broadcast Ended", description: "Your broadcast has ended." });
      setLocation(`/broadcaster/${broadcaster.id}`);
    } catch (err: any) {
      toast({ title: "Error ending broadcast", description: err.message, variant: "destructive" });
    }
  };

  if (authLoading || !broadcaster) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="container py-8 max-w-5xl">
      {step === 1 && (
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Broadcast Studio</h1>
            <p className="text-muted-foreground mt-2">Configure your broadcast and test your mic before going live.</p>
          </div>

          {/* Mic Test Section */}
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

          {/* Broadcast Details Form */}
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
                  <Label>Thumbnail URL (Optional)</Label>
                  <Input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this broadcast about?" />
              </div>

              <div className="space-y-2">
                <Label>Tags (add 5–15) *</Label>
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Type a tag and press Enter"
                />
                <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
                  {tags.map((tag) => (
                    <span key={tag} className="bg-primary/20 text-primary border border-primary/30 px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
                      {tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-primary/60 transition-colors">
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
                  <Video className="w-4 h-4" /> Record this broadcast
                </Label>
              </div>

              <Button
                onClick={handleGoLive}
                disabled={!title || tags.length < 5 || createBroadcastMutation.isPending}
                className="w-full h-14 text-lg font-bold bg-destructive text-white hover:bg-destructive/90 tracking-widest"
              >
                <Radio className="w-5 h-5 mr-3 animate-pulse" />
                {createBroadcastMutation.isPending ? "CONNECTING..." : "GO LIVE"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Live Status Bar */}
          <div className="flex items-center justify-between bg-card p-5 rounded-xl border border-destructive/40 shadow-[0_0_40px_-10px_rgba(239,68,68,0.25)]">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-4 w-4 rounded-full bg-destructive animate-pulse" />
                <div className="absolute inset-0 h-4 w-4 rounded-full bg-destructive animate-ping opacity-40" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold">{title}</h2>
                  <Badge variant="destructive" className="text-xs font-bold tracking-widest px-2">LIVE</Badge>
                </div>
                <div className="flex gap-4 text-muted-foreground text-sm mt-0.5">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {listenerCount} {listenerCount === 1 ? "Listener" : "Listeners"}
                  </span>
                  {minister && <span>{minister}</span>}
                  {venue && <span>• {venue}</span>}
                </div>
              </div>
            </div>
            <Button variant="destructive" size="lg" onClick={() => setShowEndDialog(true)} className="font-bold tracking-wider">
              <Square className="w-4 h-4 mr-2 fill-current" /> END BROADCAST
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Waveform Visualizer */}
            <Card className="lg:col-span-2 bg-card border-border/50 overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-background/30 py-3 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                  <Activity className="w-4 h-4 text-primary" /> Live Audio Output
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[360px] relative bg-black/60">
                <canvas ref={liveCanvasRef} width={800} height={360} className="w-full h-full" />
              </CardContent>
            </Card>

            {/* AI Mixer Panel */}
            <Card className="bg-card border-border/50">
              <CardHeader className="border-b border-border/50 bg-background/30 py-3 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                  <Settings2 className="w-4 h-4 text-primary" /> AI Audio Mixer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-6">

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Bass</Label>
                    <span className="text-xs text-primary font-mono">{bass > 0 ? `+${bass}` : bass} dB</span>
                  </div>
                  <Slider value={[bass]} min={-15} max={15} step={1} onValueChange={(v) => setBass(v[0])} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Mid</Label>
                    <span className="text-xs text-primary font-mono">{mid > 0 ? `+${mid}` : mid} dB</span>
                  </div>
                  <Slider value={[mid]} min={-15} max={15} step={1} onValueChange={(v) => setMid(v[0])} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Treble</Label>
                    <span className="text-xs text-primary font-mono">{treble > 0 ? `+${treble}` : treble} dB</span>
                  </div>
                  <Slider value={[treble]} min={-15} max={15} step={1} onValueChange={(v) => setTreble(v[0])} />
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <Label htmlFor="comp" className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">Compressor</Label>
                  <Switch id="comp" checked={compressorOn} onCheckedChange={setCompressorOn} />
                </div>

                <div className="pt-3 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> Volume
                    </Label>
                    <span className="text-xs text-primary font-mono">{isMuted ? "Muted" : `${volume}%`}</span>
                  </div>
                  <Slider
                    value={[volume]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => { setVolume(v[0]); if (isMuted) setIsMuted(false); }}
                    disabled={isMuted}
                  />
                  <Button
                    variant={isMuted ? "destructive" : "outline"}
                    size="sm"
                    className="w-full"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <><MicOff className="w-4 h-4 mr-2" /> Unmute Mic</> : <><Mic className="w-4 h-4 mr-2" /> Mute Mic</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Broadcast</DialogTitle>
            <DialogDescription>
              What would you like to do with the recording?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button onClick={() => handleEndBroadcast("profile")} className="w-full justify-start h-12" variant="default">
              Save to Public Profile
            </Button>
            <Button onClick={() => handleEndBroadcast("draft")} className="w-full justify-start h-12" variant="secondary">
              Save as Draft (Private)
            </Button>
            <Button onClick={() => handleEndBroadcast("discard")} className="w-full justify-start h-12 text-destructive hover:bg-destructive hover:text-white" variant="outline">
              Discard Recording
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
