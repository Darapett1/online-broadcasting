const WORKLET_URL = new URL("/audio-processor.js", window.location.origin).href;

// Compressor settings
const COMP_ON  = { threshold: -24, knee: 30, ratio: 4,  attack: 0.003, release: 0.25 };
const COMP_OFF = { threshold:   0, knee:  0, ratio: 1,  attack: 0,     release: 0    };

/** Generate a church-hall reverb impulse response (stereo, ~2 sec) */
function buildReverbIR(ctx: AudioContext, durationSec = 2): AudioBuffer {
  const rate    = ctx.sampleRate;
  const length  = Math.floor(rate * durationSec);
  const ir      = ctx.createBuffer(2, length, rate);
  const preDelay = Math.floor(rate * 0.02); // 20 ms pre-delay

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    // Early reflections
    const earlyMs = [23, 37, 48, 63, 78, 92];
    for (const ms of earlyMs) {
      const idx = preDelay + Math.floor(rate * ms / 1000);
      if (idx < length) data[idx] += (Math.random() * 0.4 + 0.1) * (ch === 0 ? 1 : -1);
    }
    // Late diffuse tail — exponential decay + noise
    for (let i = preDelay; i < length; i++) {
      const env = Math.pow(1 - (i - preDelay) / (length - preDelay), 2.5);
      data[i] += (Math.random() * 2 - 1) * env * 0.35;
    }
  }
  return ir;
}

export class BroadcasterAudio {
  audioCtx:      AudioContext | null            = null;
  stream:        MediaStream | null             = null;
  source:        MediaStreamAudioSourceNode | null = null;

  // EQ — always in chain, only gain changed
  bassFilter:    BiquadFilterNode | null        = null;
  midFilter:     BiquadFilterNode | null        = null;
  trebleFilter:  BiquadFilterNode | null        = null;
  // Presence boost (5 kHz "air" shelf)
  presenceFilter: BiquadFilterNode | null       = null;

  compressor:    DynamicsCompressorNode | null  = null;
  gainNode:      GainNode | null                = null;

  // Reverb chain (always wired, controlled by wet gain)
  convolver:     ConvolverNode | null           = null;
  dryGain:       GainNode | null                = null;
  reverbGain:    GainNode | null                = null;

  // Pitch & capture worklet
  workletNode:   AudioWorkletNode | null        = null;

  // Analyser (waveform visualisation) + monitor
  analyser:      AnalyserNode | null            = null;
  monitorGain:   GainNode | null                = null;

  // Recording
  mediaRecorder: MediaRecorder | null           = null;
  recordedChunks: Blob[]                        = [];

  private animFrameId = 0;
  private _volume     = 1;
  private _muted      = false;

  async start(
    ws: WebSocket,
    onWaveformUpdate: (data: Uint8Array) => void,
    record = false
  ) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.source   = this.audioCtx.createMediaStreamSource(this.stream);

    // ── EQ chain ────────────────────────────────────────────────────────
    this.bassFilter = this.audioCtx.createBiquadFilter();
    this.bassFilter.type            = "lowshelf";
    this.bassFilter.frequency.value = 120;   // punchy sub-bass
    this.bassFilter.gain.value      = 0;

    this.midFilter = this.audioCtx.createBiquadFilter();
    this.midFilter.type            = "peaking";
    this.midFilter.frequency.value = 800;    // mid-range clarity
    this.midFilter.Q.value         = 1.5;
    this.midFilter.gain.value      = 0;

    this.trebleFilter = this.audioCtx.createBiquadFilter();
    this.trebleFilter.type            = "highshelf";
    this.trebleFilter.frequency.value = 4000; // treble air
    this.trebleFilter.gain.value      = 0;

    this.presenceFilter = this.audioCtx.createBiquadFilter();
    this.presenceFilter.type            = "peaking";
    this.presenceFilter.frequency.value = 5000; // vocal presence
    this.presenceFilter.Q.value         = 0.8;
    this.presenceFilter.gain.value      = 0;    // only active when treble != 0

    // ── Compressor ──────────────────────────────────────────────────────
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this._applyCompressor(true);

    // ── Master gain ─────────────────────────────────────────────────────
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 1;

    // ── Reverb (wet = 0 by default) ──────────────────────────────────────
    this.convolver  = this.audioCtx.createConvolver();
    this.convolver.buffer = buildReverbIR(this.audioCtx);
    this.dryGain    = this.audioCtx.createGain();
    this.reverbGain = this.audioCtx.createGain();
    this.dryGain.gain.value    = 1;
    this.reverbGain.gain.value = 0;

    // ── Pitch-shift AudioWorklet (also streams PCM to WS) ────────────────
    await this.audioCtx.audioWorklet.addModule(WORKLET_URL);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "audio-processor");
    this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };

    // ── Analyser + monitor ───────────────────────────────────────────────
    this.analyser  = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512; // more bins = more detail in waveform
    this.monitorGain = this.audioCtx.createGain();
    this.monitorGain.gain.value = 0;

    // Silent sink keeps worklet alive without playing to speakers
    const silentGain = this.audioCtx.createGain();
    silentGain.gain.value = 0;

    // ── Fixed audio graph ────────────────────────────────────────────────
    // source → bass → mid → treble → presence → compressor → gainNode
    //        → [dryGain + convolver→reverbGain]     ← both feed into worklet
    //        → worklet → analyser ─┬→ silentGain → destination
    //                              └→ monitorGain → destination
    this.source.connect(this.bassFilter);
    this.bassFilter.connect(this.midFilter);
    this.midFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.presenceFilter);
    this.presenceFilter.connect(this.compressor);
    this.compressor.connect(this.gainNode);

    this.gainNode.connect(this.dryGain);
    this.gainNode.connect(this.convolver);
    this.convolver.connect(this.reverbGain);

    this.dryGain.connect(this.workletNode);
    this.reverbGain.connect(this.workletNode);

    this.workletNode.connect(this.analyser);
    this.analyser.connect(silentGain);
    silentGain.connect(this.audioCtx.destination);
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(this.audioCtx.destination);

    // ── Waveform animation ───────────────────────────────────────────────
    const bufLen  = this.analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArr);
      onWaveformUpdate(new Uint8Array(dataArr));
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();

    // ── Recording (captures AFTER full processing chain) ─────────────────
    if (record) {
      const dest = this.audioCtx.createMediaStreamDestination();
      this.analyser.connect(dest);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.start(1000);
    }
  }

  private _applyCompressor(on: boolean) {
    if (!this.compressor) return;
    const s = on ? COMP_ON : COMP_OFF;
    this.compressor.threshold.value = s.threshold;
    this.compressor.knee.value      = s.knee;
    this.compressor.ratio.value     = s.ratio;
    this.compressor.attack.value    = s.attack;
    this.compressor.release.value   = s.release;
  }

  /** Called on every mixer change — no graph disconnections */
  updateSettings(
    bass: number, mid: number, treble: number,
    compressorOn: boolean,
    pitchSemitones: number,
    reverbWet: number        // 0–1
  ) {
    if (this.bassFilter)    this.bassFilter.gain.value    = bass;
    if (this.midFilter)     this.midFilter.gain.value     = mid;
    if (this.trebleFilter)  this.trebleFilter.gain.value  = treble;
    // Presence tracks treble for a silky "air" boost
    if (this.presenceFilter) this.presenceFilter.gain.value = treble * 0.4;

    this._applyCompressor(compressorOn);

    // Pitch shift — send to worklet
    if (this.workletNode) {
      this.workletNode.port.postMessage({ semitones: pitchSemitones });
    }

    // Reverb wet/dry
    if (this.dryGain)    this.dryGain.gain.value    = 1 - reverbWet;
    if (this.reverbGain) this.reverbGain.gain.value  = reverbWet;
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    if (this.gainNode) this.gainNode.gain.value = muted ? 0 : this._volume;
  }

  setVolume(volume: number) {
    this._volume = volume / 100;
    if (this.gainNode && !this._muted) this.gainNode.gain.value = this._volume;
  }

  setMonitor(enabled: boolean) {
    if (this.monitorGain) this.monitorGain.gain.value = enabled ? 0.75 : 0;
  }

  getRecordingBlob(): Blob | null {
    if (!this.recordedChunks.length) return null;
    return new Blob(this.recordedChunks, { type: "audio/webm;codecs=opus" });
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
    }
    if (this.source)  this.source.disconnect();
    if (this.stream)  this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
  }
}

export class MicTester {
  audioCtx:  AudioContext | null = null;
  stream:    MediaStream | null  = null;
  analyser:  AnalyserNode | null = null;
  private animFrameId = 0;

  async start(onWaveformUpdate: (data: Uint8Array) => void) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const source  = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser); // no destination = no echo

    const bufLen  = this.analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArr);
      onWaveformUpdate(new Uint8Array(dataArr));
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    if (this.stream)   this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
  }
}

export class ListenerAudio {
  audioCtx:  AudioContext | null = null;
  analyser:  AnalyserNode | null = null;
  gainNode:  GainNode | null     = null;
  private nextTime    = 0;
  private animFrameId = 0;

  // Target jitter buffer: 40 ms ahead of now.
  // If the scheduled queue grows > MAX_AHEAD, we snap back to TARGET_AHEAD
  // (adaptive resync keeps latency tight even after burst delays).
  private static readonly TARGET_AHEAD = 0.04;  // 40 ms
  private static readonly MAX_AHEAD    = 0.25;  // 250 ms — beyond this, snap

  start(
    ws: WebSocket,
    onWaveformUpdate: (data: Uint8Array) => void,
    onPcmChunk?: (f32: Float32Array) => void,
  ) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.analyser = this.audioCtx.createAnalyser();
    this.gainNode = this.audioCtx.createGain();
    this.analyser.fftSize = 512;

    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    const bufLen  = this.analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArr);
      onWaveformUpdate(new Uint8Array(dataArr));
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();

    ws.binaryType = "arraybuffer";
    ws.onmessage  = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this._playChunk(event.data);
        // Forward raw PCM to optional transcription accumulator
        onPcmChunk?.(new Float32Array(event.data));
      }
    };
  }

  private _playChunk(buf: ArrayBuffer) {
    if (!this.audioCtx || !this.gainNode) return;

    const f32  = new Float32Array(buf);
    const abuf = this.audioCtx.createBuffer(1, f32.length, 44100);
    abuf.copyToChannel(f32, 0);

    const src = this.audioCtx.createBufferSource();
    src.buffer = abuf;
    src.connect(this.gainNode);
    // Free resources after playback
    src.onended = () => src.disconnect();

    const now = this.audioCtx.currentTime;

    // Adaptive jitter buffer:
    //  • If nextTime has fallen behind now (late start / gap): anchor to TARGET_AHEAD
    //  • If nextTime has drifted too far ahead (burst): snap back to TARGET_AHEAD
    //  • Otherwise: schedule contiguously (no gap, no glitch)
    if (this.nextTime < now || this.nextTime > now + ListenerAudio.MAX_AHEAD) {
      this.nextTime = now + ListenerAudio.TARGET_AHEAD;
    }

    src.start(this.nextTime);
    this.nextTime += abuf.duration;
  }

  setVolume(v: number) {
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
  }
}
