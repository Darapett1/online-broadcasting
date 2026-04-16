import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCreateBroadcast, useUpdateBroadcast, useCreateRecording } from "@workspace/api-client-react";
import { BroadcasterAudio } from "@/lib/audio";
import { Mic, Radio, Square, Settings2, Volume2, Video, X, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  
  // Audio State
  const [audioObj, setAudioObj] = useState<BroadcasterAudio | null>(null);
  const [waveform, setWaveform] = useState<Uint8Array>(new Uint8Array(0));
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    if (audioObj) {
      audioObj.updateSettings(bass, mid, treble, compressorOn);
      // Volume/mute usually affects Listener, but for Broadcaster we just send what we have.
      // If muted, we could disconnect the source or zero out the buffer in script processor.
    }
  }, [bass, mid, treble, compressorOn, isMuted, audioObj]);

  useEffect(() => {
    if (step === 2 && canvasRef.current && waveform.length > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / waveform.length) * 2.5;
      let x = 0;

      for (let i = 0; i < waveform.length; i++) {
        const barHeight = (waveform[i] / 255) * canvas.height;
        const opacity = waveform[i] / 255;
        
        ctx.fillStyle = `rgba(245, 158, 11, ${opacity + 0.2})`; // Amber color
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    }
  }, [waveform, step]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (tags.length < 15 && !tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
        setTagInput("");
      }
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleGoLive = async () => {
    if (!broadcaster) return;
    if (tags.length < 5) {
      toast({ title: "Tags required", description: "Please add at least 5 tags.", variant: "destructive" });
      return;
    }

    try {
      const res = await createBroadcastMutation.mutateAsync({
        data: {
          broadcasterId: broadcaster.id,
          title,
          description,
          thumbnailUrl,
          venue,
          minister,
          tags,
          isRecorded
        }
      });
      
      setBroadcastId(res.id);
      
      // Connect WebSocket
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // We assume /ws/broadcast is handled by the backend
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/broadcast/${res.id}`);
      
      socket.onopen = async () => {
        try {
          const audio = new BroadcasterAudio();
          await audio.start(socket, setWaveform, isRecorded);
          audio.updateSettings(bass, mid, treble, compressorOn);
          // Listen for control messages back from the server (listener count updates, etc.)
          socket.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string);
              if (msg.type === "listener_count") {
                setListenerCount(msg.count);
              }
            } catch {
              // Binary audio data may arrive here in edge cases — ignore
            }
          };

          setAudioObj(audio);
          setWs(socket);
          isLiveRef.current = true;
          setStep(2);
          toast({ title: "You are LIVE!", description: "You are now broadcasting." });
        } catch (err: any) {
          socket.close();
          let description = err.message || "Could not access your microphone.";
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            description = "Microphone access was denied. Please allow microphone permission in your browser and try again.";
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            description = "No microphone found. Please connect a microphone and try again.";
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            description = "Your microphone is already in use by another app. Please close it and try again.";
          }
          toast({ title: "Microphone Error", description, variant: "destructive" });
        }
      };

      socket.onerror = (err) => {
        console.error("WebSocket error:", err);
        toast({ title: "Connection Error", description: "Could not connect to the broadcast server. Please try again.", variant: "destructive" });
      };

      socket.onclose = (e) => {
        if (e.code !== 1000 && isLiveRef.current) {
          toast({ title: "Connection Lost", description: "Your broadcast connection dropped. Check your internet and try again.", variant: "destructive" });
        }
        isLiveRef.current = false;
      };

    } catch (err: any) {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    }
  };

  const handleEndBroadcast = async (saveOption: 'profile' | 'draft' | 'discard') => {
    if (!broadcastId || !broadcaster) return;
    
    if (audioObj) audioObj.stop();
    if (ws) ws.close();

    try {
      if (saveOption !== 'discard' && isRecorded && audioObj?.recordedChunks.length) {
        // Upload would happen here. Mocking with fake URL for now as per instructions.
        const mockUrl = `https://example.com/recordings/${broadcastId}.webm`;
        
        await createRecordingMutation.mutateAsync({
          data: {
            broadcasterId: broadcaster.id,
            broadcastId: broadcastId,
            title,
            url: mockUrl,
            thumbnailUrl,
            durationSeconds: 3600, // mock
            isPublic: saveOption === 'profile',
            isDraft: saveOption === 'draft'
          }
        });
      }

      await updateBroadcastMutation.mutateAsync({
        id: broadcastId,
        data: {
          isLive: false,
          endedAt: new Date().toISOString(),
          savedToDraft: saveOption === 'draft'
        }
      });

      toast({ title: "Broadcast Ended", description: "Your broadcast has ended successfully." });
      setLocation(`/broadcaster/${broadcaster.id}`);
    } catch (err: any) {
      toast({ title: "Error ending broadcast", description: err.message, variant: "destructive" });
    }
  };

  if (authLoading || !broadcaster) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="container py-8 max-w-5xl">
      {step === 1 && (
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold font-sans">Broadcast Studio Setup</h1>
            <p className="text-muted-foreground mt-2">Configure your broadcast details before going live.</p>
          </div>

          <Card className="bg-card border-border/50">
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday Morning Worship" />
                </div>
                <div className="space-y-2">
                  <Label>Minister/Speaker</Label>
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
                <Label>Tags (5-15 required)</Label>
                <Input 
                  value={tagInput} 
                  onChange={(e) => setTagInput(e.target.value)} 
                  onKeyDown={handleAddTag} 
                  placeholder="Type a tag and press Enter" 
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map(tag => (
                    <span key={tag} className="bg-primary/20 text-primary px-2 py-1 rounded-md text-sm flex items-center">
                      {tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)} className="ml-1 text-primary hover:text-primary/70">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{tags.length}/15 tags added</p>
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t border-border">
                <Switch id="record" checked={isRecorded} onCheckedChange={setIsRecorded} />
                <Label htmlFor="record" className="flex items-center gap-2 cursor-pointer">
                  <Video className="w-4 h-4" /> Record this broadcast
                </Label>
              </div>

              <Button 
                onClick={handleGoLive} 
                disabled={!title || tags.length < 5 || createBroadcastMutation.isPending}
                className="w-full h-14 text-lg font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {createBroadcastMutation.isPending ? "Connecting..." : "GO LIVE"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="flex items-center justify-between bg-card p-6 rounded-xl border border-destructive/30 shadow-[0_0_30px_-10px_rgba(239,68,68,0.3)]">
            <div className="flex items-center gap-4">
              <div className="h-4 w-4 rounded-full bg-destructive animate-pulse" />
              <div>
                <h2 className="text-2xl font-bold">{title}</h2>
                <div className="flex gap-4 text-muted-foreground text-sm mt-1">
                  <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {listenerCount} Listeners</span>
                  <span>{minister} • {venue}</span>
                </div>
              </div>
            </div>
            <Button variant="destructive" size="lg" onClick={() => setShowEndDialog(true)} className="font-bold tracking-wider">
              <Square className="w-5 h-5 mr-2 fill-current" /> END BROADCAST
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visualizer */}
            <Card className="lg:col-span-2 bg-card border-border/50 overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-background/50 pb-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Mic className="w-4 h-4" /> Audio Output
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[400px] relative bg-black/50">
                <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover" />
              </CardContent>
            </Card>

            {/* Mixer */}
            <Card className="bg-card border-border/50">
              <CardHeader className="border-b border-border/50 bg-background/50 pb-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Settings2 className="w-4 h-4" /> AI Audio Mixer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-8">
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Bass ({bass > 0 ? `+${bass}` : bass} dB)</Label>
                  </div>
                  <Slider value={[bass]} min={-15} max={15} step={1} onValueChange={(v) => setBass(v[0])} className="py-2" />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Mid ({mid > 0 ? `+${mid}` : mid} dB)</Label>
                  </div>
                  <Slider value={[mid]} min={-15} max={15} step={1} onValueChange={(v) => setMid(v[0])} className="py-2" />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Treble ({treble > 0 ? `+${treble}` : treble} dB)</Label>
                  </div>
                  <Slider value={[treble]} min={-15} max={15} step={1} onValueChange={(v) => setTreble(v[0])} className="py-2" />
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between">
                  <Label htmlFor="comp" className="cursor-pointer">Studio Compressor</Label>
                  <Switch id="comp" checked={compressorOn} onCheckedChange={setCompressorOn} />
                </div>

                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Volume2 className="w-4 h-4" /> Volume</Label>
                    <span className="text-sm text-muted-foreground">{volume}%</span>
                  </div>
                  <Slider value={[volume]} min={0} max={100} step={1} onValueChange={(v) => setVolume(v[0])} />
                  <Button variant="outline" className="w-full" onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? "Unmute" : "Mute Mic"}
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
              Your broadcast is ending. What would you like to do with the recording?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button onClick={() => handleEndBroadcast('profile')} className="w-full justify-start h-12" variant="default">
              Save to Public Profile
            </Button>
            <Button onClick={() => handleEndBroadcast('draft')} className="w-full justify-start h-12" variant="secondary">
              Save as Draft (Private)
            </Button>
            <Button onClick={() => handleEndBroadcast('discard')} className="w-full justify-start h-12 text-destructive hover:bg-destructive hover:text-white" variant="outline">
              Discard Recording
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
