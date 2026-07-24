/** Decode a local WAV/audio file to mono PCM16 and chunk it for the tunnel protocol. */

export const TARGET_SAMPLE_RATE = 16000;
export const CHUNK_DURATION_SEC = 0.1;
/** Wall-clock delay between sending each chunk (can be faster than realtime). */
export const SEND_INTERVAL_MS = 80;

function floatToPcm16(float32: Float32Array) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function downsampleMono(
  channelData: Float32Array,
  fromRate: number,
  toRate: number,
) {
  if (fromRate === toRate) return channelData;
  const ratio = fromRate / toRate;
  const newLength = Math.round(channelData.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(channelData.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += channelData[j];
    result[i] = sum / Math.max(1, end - start);
  }
  return result;
}

function pcm16ToBase64(pcm16: Int16Array) {
  const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function wavFileToPcm16Chunks(file: File | Blob) {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioContext.close();
  }

  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channelCount; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / channelCount;
    }
  }

  const resampled = downsampleMono(
    mono,
    audioBuffer.sampleRate,
    TARGET_SAMPLE_RATE,
  );
  const pcm16 = floatToPcm16(resampled);
  const samplesPerChunk = Math.max(
    1,
    Math.floor(TARGET_SAMPLE_RATE * CHUNK_DURATION_SEC),
  );
  const chunks: string[] = [];
  for (let offset = 0; offset < pcm16.length; offset += samplesPerChunk) {
    chunks.push(pcm16ToBase64(pcm16.subarray(offset, offset + samplesPerChunk)));
  }

  return { sampleRate: TARGET_SAMPLE_RATE, chunks };
}
