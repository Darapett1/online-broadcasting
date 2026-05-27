/**
 * AudioWorklet processor — The Lightbearer broadcaster.
 *
 * Two modes:
 *   • pitch = 0 : direct pass-through  — zero extra latency, raw PCM forwarded immediately
 *   • pitch ≠ 0 : OLA pitch shift      — time-preserving ±12 semitones, ~GRAIN samples latency
 *
 * PCM chunks are sent to the main thread via postMessage on every render quantum (128 samples ≈ 2.9 ms).
 */

const GRAIN = 1024;
const HOP_S = 256;
const BUFN  = 16384;
const OUTN  = 16384;
const SCALE = 2 * HOP_S / GRAIN;

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._semitones = 0;

    // Hann window
    this._hann = new Float32Array(GRAIN);
    for (let i = 0; i < GRAIN; i++) {
      this._hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / GRAIN));
    }

    // OLA buffers
    this._inBuf    = new Float32Array(BUFN);
    this._inWrite  = 0;
    this._inRead   = 0.0;
    this._outBuf   = new Float32Array(OUTN);
    this._outWrite = 0;
    this._outRead  = 0;
    this._ready    = false;

    this.port.onmessage = (e) => {
      if (e.data != null && e.data.semitones !== undefined) {
        this._semitones = Math.max(-12, Math.min(12, e.data.semitones));
        // Reset OLA state on pitch change to avoid artefacts
        if (this._semitones === 0) this._ready = false;
      }
    };
  }

  _readIn(fracPos) {
    const p  = ((Math.floor(fracPos) % BUFN) + BUFN) % BUFN;
    const p1 = (p + 1) % BUFN;
    const f  = fracPos - Math.floor(fracPos);
    return this._inBuf[p] * (1 - f) + this._inBuf[p1] * f;
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    const N = inp.length;

    // ── FAST PATH: no pitch shift ──────────────────────────────────────────
    // Bypasses OLA entirely — zero added latency.
    if (this._semitones === 0) {
      out.set(inp);
      const copy = inp.slice(0);
      this.port.postMessage(copy.buffer, [copy.buffer]);
      return true;
    }

    // ── SLOW PATH: OLA pitch shift ─────────────────────────────────────────
    const pitchFactor = Math.pow(2, this._semitones / 12);
    const hopA        = HOP_S * pitchFactor;

    // Write input
    for (let i = 0; i < N; i++) {
      this._inBuf[this._inWrite % BUFN] = inp[i];
      this._inWrite++;
    }

    if (!this._ready) {
      if (this._inWrite < GRAIN * 2) { out.fill(0); return true; }
      this._inRead  = this._inWrite - GRAIN * 2;
      this._outWrite = 0;
      this._outRead  = 0;
      this._ready    = true;
    }

    // Synthesise grains
    while ((this._outWrite - this._outRead) < N + GRAIN) {
      if (this._inRead + GRAIN > this._inWrite) break;
      for (let i = 0; i < GRAIN; i++) {
        const sample = this._readIn(this._inRead + i);
        const pos    = (this._outWrite + i) % OUTN;
        this._outBuf[pos] += sample * this._hann[i];
      }
      this._inRead   += hopA;
      this._outWrite += HOP_S;
    }

    // Read output
    for (let i = 0; i < N; i++) {
      const pos  = (this._outRead + i) % OUTN;
      out[i]     = this._outBuf[pos] * SCALE;
      this._outBuf[pos] = 0;
    }
    this._outRead += N;

    const copy = out.slice(0);
    this.port.postMessage(copy.buffer, [copy.buffer]);

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
