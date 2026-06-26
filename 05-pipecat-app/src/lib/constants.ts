import { hexToKeyColor } from "@/lib/chroma-key/createChromaKeyRenderer";

/** Default pre-call / ringing placeholder — matches `AGENT_IMAGE_URL` in `agent/src/server.py`. */
export const DEFAULT_PLACEHOLDER_URL =
  "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/inf2-image-uploads/resized-image-zt3Bs2sVHNEP6QnJvrDKXxIAy8XphY.jpg";

/** LemonSlice greenscreen background — match your reference image / stream. */
export const CHROMA_KEY_HEX = "#009B40";

/** WebGL chroma key tuning — see createChromaKeyRenderer.ts for parameter meanings. */
export const CHROMA_KEY_OPTIONS = {
  keyColor: hexToKeyColor(CHROMA_KEY_HEX),
  similarity: 0.055,
  smoothness: 0.09,
  /** Pixels with g - max(r,b) above this start losing opacity (kills edge halos). */
  spillMin: 0.08,
  spillMax: 0.2,
};
