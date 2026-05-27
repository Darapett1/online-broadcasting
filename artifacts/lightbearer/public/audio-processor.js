/**
 * AudioWorklet processor for The Lightbearer broadcaster.
 *
 * Does two things in one pass (audio rendering thread):
 *   1. OLA pitch shifting  — time-preserving pitch shift ±12 semitones
 *   2. PCM capture         — sends processed Float32 chunks to main thread for WebSocket relay
 *
 * OLA (Overlap-Add) algorithm:
 *   - Analysis hop  = Synthesis hop × pitch_factor
 *   - Synthesis hop = GRAIN / 4  (HOP_S = 256, GRAIN = 1024)
 *   - Hann window applied per grain so overlapping grains sum correctly
 *   - Scale factor = 2 × HOP_S / GRAIN corrects Hann window energy
 *
 * Result: pitch changes, tempo stays constant. Artifacts are minimal at ±6 st for voice.
 */

const GRAIN = 1024;
const HOP_S = 256;         // synthesis hop — always fixed
const BUFN  = 16384;       // input ring buffer size (must be power of 2)
const OUTN  = 16384;       // output ring buffer size
const SCALE = 2 * HOP_S / GRAIN; // Hann OLA normalisation ≈ 0.5

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._semitones = 0;

    // Hann analysis/synthesis window
    this._hann = new Float32Array(GRAIN);
    for (let i = 0; i < GRAIN; i++) {
      this._hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / GRAIN));
    }

    // Input ring buffer
    this._inBuf   = new Float32Array(BUFN);
    this._inWrite = 0;          // integer write head
    this._inRead  = 0.0;        // fractional analysis read head

    // Output overlap-add buffer
    this._outBuf   = new Float32Array(OUTN);
    this._outWrite = 0;         // next grain synthesis position
    this._outRead  = 0;         // output playback position

    this._ready = false;        // wait until we have enough buffered input

    this.port.onmessage = (e) => {
      if (e.data != null && e.data.semitones !== undefined) {
        this._semitones = Math.max(-12, Math.min(12, e.data.semitones));
      }
    };
  }

  /** Linear interpolation read from input ring buffer */
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

    const N           = inp.length;          // typically 128
    const pitchFactor = Math.pow(2, this._semitones / 12);
    const hopA        = HOP_S * pitchFactor; // analysis hop — varies with pitch

    // ── 1. Write incoming samples into the input ring buffer ──────────────
    for (let i = 0; i < N; i++) {
      this._inBuf[this._inWrite % BUFN] = inp[i];
      this._inWrite++;
    }

    // Wait until we have at least two grains of data
    if (!this._ready) {
      if (this._inWrite < GRAIN * 2) {
        out.fill(0);
        return true;
      }
      this._inRead  = this._inWrite - GRAIN * 2;
      this._outWrite = 0;
      this._outRead  = 0;
      this._ready    = true;
    }

    // ── 2. OLA: synthesise grains until output buffer has ≥ N samples ─────
    while ((this._outWrite - this._outRead) < N + GRAIN) {
      // Don't read past what's been written
      if (this._inRead + GRAIN > this._inWrite) break;

      for (let i = 0; i < GRAIN; i++) {
        const sample  = this._readIn(this._inRead + i);
        const outPos  = (this._outWrite + i) % OUTN;
        this._outBuf[outPos] += sample * this._hann[i];
      }
      this._inRead   += hopA;
      this._outWrite += HOP_S;
    }

    // ── 3. Read synthesised samples, scale, and zero after reading ────────
    for (let i = 0; i < N; i++) {
      const pos = (this._outRead + i) % OUTN;
      out[i]            = this._outBuf[pos] * SCALE;
      this._outBuf[pos] = 0;
    }
    this._outRead += N;

    // ── 4. Send PCM chunk to main thread → WebSocket ──────────────────────
    const copy = out.slice(0);
    this.port.postMessage(copy.buffer, [copy.buffer]);

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
