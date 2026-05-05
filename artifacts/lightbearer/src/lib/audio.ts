const WORKLET_URL = new URL("/audio-processor.js", window.location.origin).href;

// Compressor "bypass" values — effectively no compression
const COMPRESSOR_BYPASS = { threshold: 0, knee: 0, ratio: 1, attack: 0, release: 0 };
// Compressor "on" preset
const COMPRESSOR_ON = { threshold: -50, knee: 40, ratio: 12, attack: 0, release: 0.25 };

export class BroadcasterAudio {
  audioCtx: AudioContext | null = null;
  stream: MediaStream | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  bassFilter: BiquadFilterNode | null = null;
  midFilter: BiquadFilterNode | null = null;
  trebleFilter: BiquadFilterNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  workletNode: AudioWorkletNode | null = null;
  analyser: AnalyserNode | null = null;
  gainNode: GainNode | null = null;
  monitorGain: GainNode | null = null; // for self-monitoring (hearing yourself)
  mediaRecorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];
  private animFrameId: number = 0;
  private _volume: number = 1;
  private _muted: boolean = false;

  async start(
    ws: WebSocket,
    onWaveformUpdate: (data: Uint8Array) => void,
    record: boolean = false
  ) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    // EQ filters — always in the chain, adjusted via .gain.value only
    this.bassFilter = this.audioCtx.createBiquadFilter();
    this.bassFilter.type = "lowshelf";
    this.bassFilter.frequency.value = 200;
    this.bassFilter.gain.value = 0;

    this.midFilter = this.audioCtx.createBiquadFilter();
    this.midFilter.type = "peaking";
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 1;
    this.midFilter.gain.value = 0;

    this.trebleFilter = this.audioCtx.createBiquadFilter();
    this.trebleFilter.type = "highshelf";
    this.trebleFilter.frequency.value = 8000;
    this.trebleFilter.gain.value = 0;

    // Compressor — always in the chain, "bypassed" by setting neutral values
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this._applyCompressor(true);

    // Master gain for mute/volume
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 1;

    // Self-monitor gain — default silent; broadcaster can toggle
    this.monitorGain = this.audioCtx.createGain();
    this.monitorGain.gain.value = 0;

    // Analyser for waveform visualisation
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    // AudioWorklet — streams processed PCM to listeners over WebSocket
    await this.audioCtx.audioWorklet.addModule(WORKLET_URL);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "audio-processor");
    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      }
    };

    // Silent sink keeps the worklet alive without playing audio to speakers
    const silentGain = this.audioCtx.createGain();
    silentGain.gain.value = 0;

    // Fixed graph — NEVER disconnect any node after this point
    // source → bass → mid → treble → compressor → gainNode ─┬→ analyser → worklet → silentGain → destination
    //                                                         └→ monitorGain ──────────────────→ destination
    this.source.connect(this.bassFilter);
    this.bassFilter.connect(this.midFilter);
    this.midFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.compressor);
    this.compressor.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.gainNode.connect(this.monitorGain);
    this.analyser.connect(this.workletNode);
    this.workletNode.connect(silentGain);
    silentGain.connect(this.audioCtx.destination);
    this.monitorGain.connect(this.audioCtx.destination);

    // Waveform animation
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      onWaveformUpdate(new Uint8Array(dataArray));
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();

    // Recording via MediaRecorder on the post-compressor stream
    if (record) {
      const dest = this.audioCtx.createMediaStreamDestination();
      this.compressor.connect(dest);
      this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus" });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.start(1000);
    }
  }

  private _applyCompressor(on: boolean) {
    if (!this.compressor) return;
    const s = on ? COMPRESSOR_ON : COMPRESSOR_BYPASS;
    this.compressor.threshold.value = s.threshold;
    this.compressor.knee.value = s.knee;
    this.compressor.ratio.value = s.ratio;
    this.compressor.attack.value = s.attack;
    this.compressor.release.value = s.release;
  }

  // Called by the studio whenever a slider or toggle changes — NEVER disconnects nodes
  updateSettings(bass: number, mid: number, treble: number, compressorOn: boolean) {
    if (this.bassFilter) this.bassFilter.gain.value = bass;
    if (this.midFilter) this.midFilter.gain.value = mid;
    if (this.trebleFilter) this.trebleFilter.gain.value = treble;
    this._applyCompressor(compressorOn);
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : this._volume;
    }
  }

  setVolume(volume: number) {
    this._volume = volume / 100;
    if (this.gainNode && !this._muted) {
      this.gainNode.gain.value = this._volume;
    }
  }

  // Toggle self-monitoring (hearing your own voice through speakers)
  setMonitor(enabled: boolean) {
    if (this.monitorGain) {
      // Keep monitor at 0.7 to avoid clipping/feedback loop at high volumes
      this.monitorGain.gain.value = enabled ? 0.7 : 0;
    }
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
    if (this.source) this.source.disconnect();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
  }
}

export class MicTester {
  audioCtx: AudioContext | null = null;
  stream: MediaStream | null = null;
  analyser: AnalyserNode | null = null;
  private animFrameId: number = 0;

  async start(onWaveformUpdate: (data: Uint8Array) => void) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    // No connection to destination → no echo
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      onWaveformUpdate(new Uint8Array(dataArray));
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
  }
}

export class ListenerAudio {
  audioCtx: AudioContext | null = null;
  nextTime: number = 0;
  analyser: AnalyserNode | null = null;
  gainNode: GainNode | null = null;
  private animFrameId: number = 0;

  start(ws: WebSocket, onWaveformUpdate: (data: Uint8Array) => void) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.analyser = this.audioCtx.createAnalyser();
    this.gainNode = this.audioCtx.createGain();

    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    this.analyser.fftSize = 256;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      onWaveformUpdate(new Uint8Array(dataArray));
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();

    ws.binaryType = "arraybuffer";
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.playChunk(event.data);
      }
    };
  }

  private playChunk(arrayBuffer: ArrayBuffer) {
    if (!this.audioCtx || !this.gainNode) return;

    const float32Array = new Float32Array(arrayBuffer);
    const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, 44100);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    if (this.nextTime < this.audioCtx.currentTime) {
      this.nextTime = this.audioCtx.currentTime + 0.1;
    }
    source.start(this.nextTime);
    this.nextTime += audioBuffer.duration;
  }

  setVolume(val: number) {
    if (this.gainNode) this.gainNode.gain.value = val;
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
  }
}
