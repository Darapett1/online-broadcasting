import { useCallback, useEffect, useRef, useState } from "react";
import { useGetBroadcast, getGetBroadcastQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ListenerAudio } from "@/lib/audio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Users, MapPin, Mic2, Play, Square, Volume2, Radio, Wifi } from "lucide-react";

// ── Waveform helpers ──────────────────────────────────────────────────────────

/** Symmetric/mirrored waveform — bars grow up AND down from the centre line */
function drawListenerWaveform(canvas: HTMLCanvasElement, data: Uint8Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);

  const midY     = H / 2;
  const barCount = Math.min(data.length, 100);
  const barW     = W / barCount;

  for (let i = 0; i < barCount; i++) {
    const v      = data[Math.floor(i * data.length / barCount)] / 255;
    const halfH  = Math.max(2, v * midY * 0.92);
    const alpha  = Math.max(0.1, v * 0.9);

    // gradient top → bottom through centre
    const grad = ctx.createLinearGradient(0, midY - halfH, 0, midY + halfH);
    grad.addColorStop(0,   `rgba(251,191,36,${alpha * 0.5})`);
    grad.addColorStop(0.5, `rgba(245,158,11,${alpha})`);
    grad.addColorStop(1,   `rgba(251,191,36,${alpha * 0.5})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(i * barW + 1, midY - halfH, barW - 2, halfH * 2, 2);
    ctx.fill();
  }

  // Centre line
  ctx.strokeStyle = "rgba(245,158,11,0.15)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(W, midY);
  ctx.stroke();
}

/** Flat idle waveform shown before connecting */
function drawIdleWaveform(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const midY   = H / 2;
  const barW   = W / 60;
  for (let i = 0; i < 60; i++) {
    const h = 2 + Math.random() * 6;
    ctx.fillStyle = "rgba(245,158,11,0.12)";
    ctx.beginPath();
    ctx.roundRect(i * barW + 1, midY - h / 2, barW - 2, h, 1);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(245,158,11,0.08)";
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BroadcastListener() {
  const { id }       = useParams();
  const broadcastId  = parseInt(id || "0");

  const { data: broadcast, isLoading } = useGetBroadcast(broadcastId, {
    query: {
      queryKey:        getGetBroadcastQueryKey(broadcastId),
      enabled:         !!broadcastId,
      refetchInterval: 8000,
    },
  });

  const [isPlaying,  setIsPlaying]  = useState(false);
  const [volume,     setVolume]     = useState(100);
  const [connected,  setConnected]  = useState(false);

  const audioRef    = useRef<ListenerAudio | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const idleDrawnRef  = useRef(false);

  // ── Draw idle waveform once the canvas is mounted ────────────────────────
  useEffect(() => {
    if (waveCanvasRef.current && !idleDrawnRef.current) {
      drawIdleWaveform(waveCanvasRef.current);
      idleDrawnRef.current = true;
    }
  }, [broadcast]);

  // ── Volume sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    audioRef.current?.setVolume(volume / 100);
  }, [volume]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  // Direct canvas draw — NO React state, NO re-renders on every frame
  const handleWaveformUpdate = useCallback((data: Uint8Array) => {
    if (waveCanvasRef.current) drawListenerWaveform(waveCanvasRef.current, data);
  }, []);

  const handlePlay = () => {
    if (isPlaying) {
      audioRef.current?.stop();
      wsRef.current?.close();
      audioRef.current = null;
      wsRef.current    = null;
      setIsPlaying(false);
      setConnected(false);
      if (waveCanvasRef.current) drawIdleWaveform(waveCanvasRef.current);
      return;
    }

    const proto  = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${location.host}/ws/listen/${broadcastId}`);

    socket.onopen = () => {
      const audio = new ListenerAudio();
      audio.start(socket, handleWaveformUpdate);
      audio.setVolume(volume / 100);
      audioRef.current = audio;
      wsRef.current    = socket;
      setIsPlaying(true);
      setConnected(true);
    };

    socket.onclose = () => {
      setIsPlaying(false);
      setConnected(false);
      if (waveCanvasRef.current) drawIdleWaveform(waveCanvasRef.current);
    };

    socket.onerror = () => {
      setIsPlaying(false);
      setConnected(false);
    };
  };

  // ── Loading / not found ──────────────────────────────────────────────────
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

  const canListen = broadcast.isLive || !!broadcast.recordingUrl;
  const coverSrc  = broadcast.thumbnailUrl || broadcast.broadcaster?.avatarUrl || "";

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Blurred background */}
      {coverSrc && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img src={coverSrc} alt="" className="w-full h-full object-cover blur-[80px] opacity-15 saturate-150 scale-110" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
      )}

      <div className="relative z-10 container max-w-5xl py-10 px-4 md:px-6 flex flex-col gap-10 flex-1">

        {/* ── TOP: artwork + info ─────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-10 items-center">

          {/* Artwork */}
          <div className="flex-shrink-0">
            <div
              className={`
                relative w-56 h-56 md:w-72 md:h-72 rounded-full overflow-hidden
                border-4 shadow-2xl
                ${broadcast.isLive
                  ? "border-red-500/60 shadow-red-500/20"
                  : "border-primary/30 shadow-primary/10"}
              `}
              style={broadcast.isLive && isPlaying
                ? { boxShadow: "0 0 60px rgba(220,38,38,0.25), 0 0 120px rgba(220,38,38,0.1)" }
                : undefined
              }
            >
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={broadcast.title}
                  className={`w-full h-full object-cover transition-transform ${
                    isPlaying && broadcast.isLive
                      ? "animate-[spin_25s_linear_infinite]"
                      : ""
                  }`}
                />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <Radio className="w-20 h-20 text-zinc-700" />
                </div>
              )}

              {/* Play/stop overlay */}
              <button
                onClick={handlePlay}
                disabled={!canListen}
                className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors group"
              >
                <div className={`
                  w-16 h-16 rounded-full flex items-center justify-center
                  bg-primary/90 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity
                `}>
                  {isPlaying
                    ? <Square className="w-6 h-6 fill-black text-black" />
                    : <Play  className="w-6 h-6 fill-black text-black ml-1" />
                  }
                </div>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col gap-4 text-center lg:text-left">
            {/* Status badges */}
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
                  <Wifi className="w-3 h-3 animate-pulse" /> ~40ms delay
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">{broadcast.title}</h1>

            <Link href={`/broadcaster/${broadcast.broadcasterId}`}
              className="text-xl text-primary font-semibold hover:text-primary/80 transition-colors inline-block">
              {broadcast.broadcaster?.name}
            </Link>

            <div className="flex flex-wrap items-center gap-5 text-muted-foreground justify-center lg:justify-start">
              {broadcast.minister && (
                <span className="flex items-center gap-1.5"><Mic2 className="w-4 h-4" /> {broadcast.minister}</span>
              )}
              {broadcast.venue && (
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {broadcast.venue}</span>
              )}
            </div>

            {broadcast.description && (
              <p className="text-sm text-muted-foreground line-clamp-3 max-w-xl">{broadcast.description}</p>
            )}

            {broadcast.tags && broadcast.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center lg:justify-start">
                {(broadcast.tags as string[]).map((tag) => (
                  <span key={tag} className="text-xs bg-primary/10 text-primary/70 border border-primary/15 px-2.5 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── WAVEFORM ─────────────────────────────────────────────────────── */}
        <div className="w-full rounded-2xl overflow-hidden bg-black/60 backdrop-blur border border-white/5 relative"
          style={{ height: "160px" }}>
          {!isPlaying && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground z-10 pointer-events-none">
              <Radio className="w-6 h-6 opacity-40" />
              <span className="text-sm opacity-60">
                {canListen
                  ? broadcast.isLive ? "Click play to join the live broadcast" : "Click play to listen to this recording"
                  : "This broadcast has ended"}
              </span>
            </div>
          )}
          {/* Scanline overlay */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(0,0,0,0.05)_3px,rgba(0,0,0,0.05)_4px)] pointer-events-none z-10" />
          <canvas ref={waveCanvasRef} width={1000} height={160} className="w-full h-full" />
        </div>

        {/* ── CONTROLS ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center gap-6 justify-between">
          {/* Volume */}
          <div className="flex items-center gap-3 w-full sm:max-w-xs">
            <Volume2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <Slider
              value={[volume]}
              min={0} max={100} step={1}
              onValueChange={(v) => setVolume(v[0])}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{volume}%</span>
          </div>

          {/* Play button */}
          <Button
            size="lg"
            onClick={handlePlay}
            disabled={!canListen}
            className={`
              h-14 px-14 text-base font-bold rounded-full transition-all
              ${isPlaying
                ? "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_rgba(245,158,11,0.3)]"}
            `}
          >
            {isPlaying
              ? <><Square className="w-5 h-5 mr-2.5 fill-current" /> STOP</>
              : <><Play  className="w-5 h-5 mr-2.5 fill-current ml-[-4px]" /> TUNE IN</>
            }
          </Button>
        </div>

      </div>
    </div>
  );
}
