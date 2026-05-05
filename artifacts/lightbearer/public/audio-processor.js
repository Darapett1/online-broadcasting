/**
 * AudioWorklet processor for The Lightbearer broadcaster.
 * Runs in the audio rendering thread — no UI thread blocking, no echo.
 * Sends raw Float32 PCM chunks back to the main thread via postMessage.
 */
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Slice creates a copy — original stays valid for the audio graph
      const copy = input[0].slice(0);
      this.port.postMessage(copy.buffer, [copy.buffer]);
    }
    // Return true to keep the processor alive indefinitely
    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
