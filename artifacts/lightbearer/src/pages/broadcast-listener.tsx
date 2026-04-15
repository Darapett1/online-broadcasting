import { useEffect, useRef, useState } from "react";
import { useGetBroadcast } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ListenerAudio } from "@/lib/audio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Users, MapPin, Mic2, Play, Square, Volume2 } from "lucide-react";

export default function BroadcastListener() {
  const { id } = useParams();
  const broadcastId = parseInt(id || "0");
  
  const { data: broadcast, isLoading } = useGetBroadcast(broadcastId, {
    query: { enabled: !!broadcastId, refetchInterval: 10000 }
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [waveform, setWaveform] = useState<Uint8Array>(new Uint8Array(0));
  const audioRef = useRef<ListenerAudio | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.setVolume(volume / 100);
    }
  }, [volume]);

  useEffect(() => {
    if (canvasRef.current && waveform.length > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / waveform.length) * 2.5;
      let x = 0;
      
      const centerY = canvas.height / 2;

      for (let i = 0; i < waveform.length; i++) {
        // Mirrored waveform look
        const barHeight = ((waveform[i] / 255) * canvas.height) / 2;
        const opacity = Math.max(0.1, waveform[i] / 255);
        
        ctx.fillStyle = `rgba(245, 158, 11, ${opacity})`; // Amber color
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
        x += barWidth + 1;
      }
    }
  }, [waveform]);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.stop();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handlePlay = () => {
    if (isPlaying) {
      if (audioRef.current) audioRef.current.stop();
      if (wsRef.current) wsRef.current.close();
      setIsPlaying(false);
      setWaveform(new Uint8Array(0));
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/listen/${broadcastId}`);
      
      socket.onopen = () => {
        const audio = new ListenerAudio();
        audio.start(socket, setWaveform);
        audio.setVolume(volume / 100);
        audioRef.current = audio;
        wsRef.current = socket;
        setIsPlaying(true);
      };
      
      socket.onclose = () => setIsPlaying(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!broadcast) return <div className="min-h-screen flex items-center justify-center">Broadcast not found</div>;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background flex flex-col relative overflow-hidden">
      {/* Background Blur */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <img 
          src={broadcast.thumbnailUrl || broadcast.broadcaster?.coverUrl || "/placeholder.jpg"} 
          alt="" 
          className="w-full h-full object-cover blur-3xl saturate-150"
        />
        <div className="absolute inset-0 bg-black/80"></div>
      </div>

      <div className="container relative z-10 flex-1 flex flex-col justify-center py-12 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left: Album Art / Profile Pic */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full bg-card border-8 border-background shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex-shrink-0 group">
              <img 
                src={broadcast.thumbnailUrl || broadcast.broadcaster?.avatarUrl || "/placeholder.jpg"} 
                alt={broadcast.title}
                className={`w-full h-full object-cover transition-transform duration-[10000ms] ease-linear ${isPlaying ? 'rotate-180 scale-110' : ''} ${broadcast.isLive ? 'animate-[spin_20s_linear_infinite]' : ''}`}
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <Button variant="ghost" size="icon" className="w-20 h-20 text-white hover:text-primary hover:bg-transparent" onClick={handlePlay}>
                   {isPlaying ? <Square className="w-10 h-10 fill-current" /> : <Play className="w-12 h-12 fill-current ml-2" />}
                 </Button>
              </div>
            </div>
            
            <div className="mt-12 w-full max-w-sm">
               <div className="flex items-center gap-4 text-muted-foreground">
                 <Volume2 className="w-5 h-5 flex-shrink-0" />
                 <Slider value={[volume]} min={0} max={100} step={1} onValueChange={(v) => setVolume(v[0])} />
               </div>
            </div>
          </div>

          {/* Right: Info & Waveform */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
              {broadcast.isLive ? (
                <Badge variant="destructive" className="animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)] px-3 py-1 text-sm font-bold">
                  LIVE NOW
                </Badge>
              ) : (
                <Badge variant="secondary" className="px-3 py-1 text-sm font-bold">RECORDED</Badge>
              )}
              {broadcast.isLive && (
                <Badge variant="outline" className="border-border text-foreground px-3 py-1 text-sm font-medium flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" /> {broadcast.listenerCount} Listening
                </Badge>
              )}
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold font-sans text-foreground leading-tight">
              {broadcast.title}
            </h1>
            
            <Link href={`/broadcaster/${broadcast.broadcasterId}`} className="text-2xl text-primary font-medium hover:underline inline-block">
              {broadcast.broadcaster?.name}
            </Link>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-muted-foreground text-lg">
              {broadcast.minister && (
                <span className="flex items-center gap-2"><Mic2 className="w-5 h-5" /> {broadcast.minister}</span>
              )}
              {broadcast.venue && (
                <span className="flex items-center gap-2"><MapPin className="w-5 h-5" /> {broadcast.venue}</span>
              )}
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-2 mt-4">
              {broadcast.tags?.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="bg-card/50 text-muted-foreground hover:text-foreground">#{tag}</Badge>
              ))}
            </div>

            {/* Waveform Visualizer */}
            <div className="w-full h-32 mt-8 rounded-xl overflow-hidden bg-black/30 backdrop-blur-sm border border-white/5 relative">
               {!isPlaying && (
                 <div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10 pointer-events-none">
                    {broadcast.isLive ? "Click play to listen" : "Broadcast ended"}
                 </div>
               )}
               <canvas ref={canvasRef} width={800} height={128} className="w-full h-full object-cover" />
            </div>

            <div className="w-full pt-8">
              <Button 
                size="lg" 
                className={`w-full md:w-auto px-12 h-16 text-lg font-bold rounded-full ${isPlaying ? 'bg-secondary text-white hover:bg-secondary/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                onClick={handlePlay}
                disabled={!broadcast.isLive && !broadcast.recordingUrl}
              >
                {isPlaying ? "STOP LISTENING" : "TUNE IN"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
