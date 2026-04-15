export class BroadcasterAudio {
  audioCtx: AudioContext | null = null;
  stream: MediaStream | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  bassFilter: BiquadFilterNode | null = null;
  midFilter: BiquadFilterNode | null = null;
  trebleFilter: BiquadFilterNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  scriptProcessor: ScriptProcessorNode | null = null;
  analyser: AnalyserNode | null = null;
  mediaRecorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];

  async start(
    ws: WebSocket,
    onWaveformUpdate: (data: Uint8Array) => void,
    record: boolean = false
  ) {
    this.audioCtx = new AudioContext({ sampleRate: 44100 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    this.source = this.audioCtx.createMediaStreamSource(this.stream);
    
    this.bassFilter = this.audioCtx.createBiquadFilter();
    this.bassFilter.type = "lowshelf";
    this.bassFilter.frequency.value = 200;
    
    this.midFilter = this.audioCtx.createBiquadFilter();
    this.midFilter.type = "peaking";
    this.midFilter.frequency.value = 1000;
    
    this.trebleFilter = this.audioCtx.createBiquadFilter();
    this.trebleFilter.type = "highshelf";
    this.trebleFilter.frequency.value = 8000;
    
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = -50;
    this.compressor.knee.value = 40;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0;
    this.compressor.release.value = 0.25;

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    
    this.scriptProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1);

    // Chain: source -> bass -> mid -> treble -> compressor -> analyser -> scriptProcessor -> destination
    // Note: We connect scriptProcessor to destination so it keeps processing, but we don't output audio directly (to avoid echo).
    // Wait, scriptProcessor requires a connection to destination to work in Chrome, but we can set its output to 0.
    
    this.source.connect(this.bassFilter);
    this.bassFilter.connect(this.midFilter);
    this.midFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioCtx.destination);
    
    // Create an empty buffer source to keep the script processor running if needed, 
    // but the mic source should be enough.

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      onWaveformUpdate(dataArray);
      requestAnimationFrame(draw);
    };
    draw();

    this.scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // We need to send Float32Array to the server over WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(inputData.buffer);
      }
      
      // Silence output to prevent echo
      const outputData = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < outputData.length; i++) {
        outputData[i] = 0;
      }
    };

    if (record) {
      const dest = this.audioCtx.createMediaStreamDestination();
      this.compressor.connect(dest);
      this.mediaRecorder = new MediaRecorder(dest.stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      this.mediaRecorder.start();
    }
  }

  updateSettings(bass: number, mid: number, treble: number, compressorOn: boolean) {
    if (this.bassFilter) this.bassFilter.gain.value = bass;
    if (this.midFilter) this.midFilter.gain.value = mid;
    if (this.trebleFilter) this.trebleFilter.gain.value = treble;
    
    if (this.compressor && this.trebleFilter && this.analyser) {
      this.trebleFilter.disconnect();
      if (compressorOn) {
        this.trebleFilter.connect(this.compressor);
        this.compressor.connect(this.analyser);
      } else {
        this.compressor.disconnect();
        this.trebleFilter.connect(this.analyser);
      }
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
    }
    if (this.source) this.source.disconnect();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioCtx) this.audioCtx.close();
  }
}

export class ListenerAudio {
  audioCtx: AudioContext | null = null;
  nextTime: number = 0;
  analyser: AnalyserNode | null = null;
  gainNode: GainNode | null = null;
  
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
      onWaveformUpdate(dataArray);
      requestAnimationFrame(draw);
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
    if (this.gainNode) {
      this.gainNode.gain.value = val;
    }
  }

  stop() {
    if (this.audioCtx) this.audioCtx.close();
  }
}
