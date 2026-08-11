export const MIC_SAMPLE_RATE = 16000;

export type MicCapture = {
  setMuted: (muted: boolean) => void;
  getLevel: () => number;
  stop: () => Promise<void>;
};

/** Captures the microphone as 16 kHz mono PCM16 chunks for the bridge socket. */
export async function startMicCapture(
  onChunk: (pcm16: ArrayBuffer) => void,
): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // Asking for the target rate up front lets the browser do the resampling.
  const context = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
  if (context.state === "suspended") await context.resume();

  try {
    await context.audioWorklet.addModule("/worklets/mic-processor.js");
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    throw error;
  }

  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, "mic-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });

  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  const levelBuffer = new Float32Array(analyser.fftSize);

  let muted = false;

  worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onChunk(event.data);

  source.connect(worklet);
  source.connect(analyser);

  return {
    setMuted(next: boolean) {
      muted = next;
      worklet.port.postMessage({ type: "mute", value: next });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
    },
    getLevel() {
      if (muted) return 0;
      analyser.getFloatTimeDomainData(levelBuffer);
      let sum = 0;
      for (let i = 0; i < levelBuffer.length; i++) sum += levelBuffer[i] * levelBuffer[i];
      return Math.min(1, Math.sqrt(sum / levelBuffer.length) * 4);
    },
    async stop() {
      worklet.port.onmessage = null;
      source.disconnect();
      worklet.disconnect();
      analyser.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    },
  };
}
