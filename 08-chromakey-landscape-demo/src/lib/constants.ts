import { hexToKeyColor } from "@/lib/chroma-key/createChromaKeyRenderer";

/** Looping 16:9 landscape background (`public/background.mp4`). */
export const BACKGROUND_VIDEO_URL = "/background.mp4";

/** Pre-call preview loop (`public/placeholder.mp4`). */
export const PLACEHOLDER_VIDEO_URL = "/placeholder.mp4";

/**
 * Avatar frame aspect ratio (width / height). Must match `aspect_ratio` in `agent/src/agent.py`.
 * - `2x3` → `2 / 3` (default)
 * - `1x1` → `1` (use if the character is clipped at the top/bottom)
 */
export const AVATAR_ASPECT_RATIO = 2 / 3;

/** LemonSlice greenscreen background — match your reference image / stream. */
export const CHROMA_KEY_HEX = "#50A954";

/** WebGL chroma key tuning — see createChromaKeyRenderer.ts for parameter meanings. */
export const CHROMA_KEY_OPTIONS = {
  keyColor: hexToKeyColor(CHROMA_KEY_HEX),
  // #50A954 is lighter/desaturated — wider similarity catches more of the actual bg.
  similarity: 0.19,
  smoothness: 0.06,
  /** Pixels with g - max(r,b) above this start losing opacity (kills edge halos). */
  spillMin: 0.025,
  spillMax: 0.085,
  /** Post-process edge softening in canvas pixels (0 = off). */
  edgeFeatherPx: 2,
};
