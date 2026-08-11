const CHUNK_SAMPLES = 800; // 50 ms at 16 kHz

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(CHUNK_SAMPLES);
    this._offset = 0;
    this._muted = false;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "mute") {
        this._muted = Boolean(event.data.value);
      }
    };
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      // Keep streaming silence while muted so the agent's turn detection does
      // not see the audio stream stall.
      const sample = this._muted ? 0 : Math.max(-1, Math.min(1, input[i]));
      this._buffer[this._offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      if (this._offset === CHUNK_SAMPLES) {
        const chunk = this._buffer.slice();
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this._offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
