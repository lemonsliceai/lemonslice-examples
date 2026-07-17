"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  HERO_CANVAS_PAD_CSS,
  heroIdlePointer,
  heroPointerOffsetPx,
} from "@/lib/hero-idle-pointer";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Corner radius ≥ half the shorter side clamps to a circle in the WebGL mask
 * (`min(r, halfMin)` + `isCircle`). Use for collapsed / loading buckets that should stay circular.
 */
export const LIVEKIT_SHADER_CIRCLE_CORNER_RADIUS_PX = 1_000_000;

/** One tweakable bucket: collapsed (idle), collapsed+loading, or expanded call surface. */
export interface LivekitShaderPreset {
  /**
   * Rounded-rect corner radius (CSS px). Values ≥ half the shorter layout side become a circle.
   * Idle / expand mask uses `collapsed.cornerRadiusPx` (and `expanded` under expand blend);
   * ambient / hover values are ignored for shape. Collapsed loading always morphs to an
   * inscribed circle regardless of this field.
   */
  cornerRadiusPx: number;
  fPower: number;
  noise: number;
  glowWeight: number;
  a: number;
  b: number;
  c: number;
  d: number;
  glowBias: number;
  glowEdge0: number;
  glowEdge1: number;
  blurRadiusScale: number;
  /** Mix strength for inner chromatic ring when hero is loading (× `loadingT`). */
  loadingRingStrength: number;
  /** Additive iridescence term in the ring (higher = brighter glow). */
  loadingRingBoost: number;
  /** Rim falloff length (px): `exp(-edgePx / innerPx)` after wobble. */
  loadingRingInnerPx: number;
  /** Outer falloff start (`smoothstep` low edge). */
  loadingRingOuterStartPx: number;
  /** Outer falloff end. */
  loadingRingOuterEndPx: number;
  /** Scales perimeter noise that modulates ring width. */
  loadingRingNoiseAmp: number;
  /** Multiplier on time in ring noise / iridescence drift. */
  loadingRingAnimSpeed: number;
  /**
   * 0–1: inward-only “magic bubble” silhouette wobble on the hero circle (never bulges past the
   * original radius). Effective strength × `loadingRingT` in the shader.
   */
  loadingBubbleStrength: number;
  /** Multiplier on angular wavenumbers around the rim (lobe density). */
  loadingBubbleFrequency: number;
  /**
   * When loading, scales bubble pulse depth (× lift in shader). Use 0–1 for subtle pulse,
   * up to ~2 for a full-strength oscillation (see shader).
   */
  loadingBubblePulseAmplitude: number;
  /** Bubble pulse rate (Hz) while amplitude is greater than zero. */
  loadingBubblePulseHz: number;
}

/**
 * Five glass buckets + pointer skew tuning for circle hover.
 */
export interface LivekitIdlePointerParams {
  pointerSkewMax: number;
  pointerShiftFrac: number;
  shapeInsetCssPx: number;
  /** Fixed transparent margin (CSS px) around the layout box; canvas is larger, render is unchanged. */
  canvasPadCssPx: number;
  pointerSmoothing: number;
  /** Collapsed ↔ idle-hover glass + skew blend (~τ ≈ 1/k s). */
  pointerBlendSmoothing: number;
}

export interface LivekitShaderParams {
  collapsed: LivekitShaderPreset;
  /** At-rest collapsed hero: subtle ring, no blur / bubble warp. */
  collapsedAmbient: LivekitShaderPreset;
  collapsedLoading: LivekitShaderPreset;
  expanded: LivekitShaderPreset;
  edgeLoading: LivekitShaderPreset;
  idleHover: LivekitShaderPreset;
  idlePointer: LivekitIdlePointerParams;
}

export type LivekitShaderDebugSurface =
  | "collapsed"
  | "collapsedAmbient"
  | "loading"
  | "expanded"
  | "edgeLoading"
  /** Collapsed idle + pointer skew (circle hover). */
  | "idleHover";

function lerpPreset(a: LivekitShaderPreset, b: LivekitShaderPreset, t: number): LivekitShaderPreset {
  return {
    cornerRadiusPx: lerp(a.cornerRadiusPx, b.cornerRadiusPx, t),
    fPower: lerp(a.fPower, b.fPower, t),
    noise: lerp(a.noise, b.noise, t),
    glowWeight: lerp(a.glowWeight, b.glowWeight, t),
    a: lerp(a.a, b.a, t),
    b: lerp(a.b, b.b, t),
    c: lerp(a.c, b.c, t),
    d: lerp(a.d, b.d, t),
    glowBias: lerp(a.glowBias, b.glowBias, t),
    glowEdge0: lerp(a.glowEdge0, b.glowEdge0, t),
    glowEdge1: lerp(a.glowEdge1, b.glowEdge1, t),
    blurRadiusScale: lerp(a.blurRadiusScale, b.blurRadiusScale, t),
    loadingRingStrength: lerp(a.loadingRingStrength, b.loadingRingStrength, t),
    loadingRingBoost: lerp(a.loadingRingBoost, b.loadingRingBoost, t),
    loadingRingInnerPx: lerp(a.loadingRingInnerPx, b.loadingRingInnerPx, t),
    loadingRingOuterStartPx: lerp(a.loadingRingOuterStartPx, b.loadingRingOuterStartPx, t),
    loadingRingOuterEndPx: lerp(a.loadingRingOuterEndPx, b.loadingRingOuterEndPx, t),
    loadingRingNoiseAmp: lerp(a.loadingRingNoiseAmp, b.loadingRingNoiseAmp, t),
    loadingRingAnimSpeed: lerp(a.loadingRingAnimSpeed, b.loadingRingAnimSpeed, t),
    loadingBubbleStrength: lerp(a.loadingBubbleStrength, b.loadingBubbleStrength, t),
    loadingBubbleFrequency: lerp(a.loadingBubbleFrequency, b.loadingBubbleFrequency, t),
    loadingBubblePulseAmplitude: lerp(
      a.loadingBubblePulseAmplitude,
      b.loadingBubblePulseAmplitude,
      t
    ),
    loadingBubblePulseHz: lerp(a.loadingBubblePulseHz, b.loadingBubblePulseHz, t),
  };
}

function mergeLivekitShaderParams(
  base: LivekitShaderParams,
  partial?: Partial<LivekitShaderParams>
): LivekitShaderParams {
  if (!partial) return base;
  return {
    collapsed: { ...base.collapsed, ...partial.collapsed },
    collapsedAmbient: {
      ...base.collapsedAmbient,
      ...partial.collapsedAmbient,
    },
    collapsedLoading: { ...base.collapsedLoading, ...partial.collapsedLoading },
    expanded: { ...base.expanded, ...partial.expanded },
    edgeLoading: { ...base.edgeLoading, ...partial.edgeLoading },
    idleHover: { ...base.idleHover, ...partial.idleHover },
    idlePointer: { ...base.idlePointer, ...partial.idlePointer },
  };
}

/** 0 = collapsed family, 1 = expanded preset (mask + uniforms interpolate). */
function targetExpandT(
  debugShaderSurface: LivekitShaderDebugSurface | null,
  callExpanded: boolean
): number {
  if (debugShaderSurface === "expanded" || debugShaderSurface === "edgeLoading")
    return 1;
  if (
    debugShaderSurface === "collapsed" ||
    debugShaderSurface === "collapsedAmbient" ||
    debugShaderSurface === "loading" ||
    debugShaderSurface === "idleHover"
  )
    return 0;
  return callExpanded ? 1 : 0;
}

/**
 * Collapsed bucket: 0 = collapsed, 1 = collapsedLoading.
 * When `expandT` is 1 (in-call surface), `loadingT` no longer affects the final glass preset unless
 * we blend `expandT` down via `transitionLoadingT` (see render loop).
 */
function targetCollapsedLoadingT(
  debugShaderSurface: LivekitShaderDebugSurface | null,
  isLoading: boolean
): number {
  if (debugShaderSurface === "loading") return 1;
  if (
    debugShaderSurface === "collapsed" ||
    debugShaderSurface === "collapsedAmbient" ||
    debugShaderSurface === "idleHover"
  )
    return 0;
  if (debugShaderSurface === "expanded" || debugShaderSurface === "edgeLoading")
    return 0;
  return isLoading ? 1 : 0;
}

function computeIdleDecorTargets(args: {
  dbg: LivekitShaderDebugSurface | null;
  ptr: (typeof heroIdlePointer)["current"];
  skipIdleDecor: boolean;
  collapsedGate: number;
  motionOk: number;
}) {
  const debugIdleHover = args.dbg === "idleHover";
  const targetIdleHover =
    (debugIdleHover ? 1 : args.ptr.bubbleActive ? 1 : 0) *
    (args.skipIdleDecor ? 0 : 1) *
    args.collapsedGate *
    args.motionOk;
  const targetAmbient =
    args.dbg === "collapsedAmbient"
      ? 1
      : args.dbg != null || args.skipIdleDecor
        ? 0
        : Math.max(0, args.collapsedGate - targetIdleHover);
  const targetPointerSkew =
    (debugIdleHover ? 1 : args.ptr.cardActive ? 1 : 0) *
    (args.skipIdleDecor ? 0 : 1) *
    args.collapsedGate *
    args.motionOk;
  return { debugIdleHover, targetIdleHover, targetAmbient, targetPointerSkew };
}

interface LivekitVideoFrameContext {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement | null;
  timeSec: number;
  deltaSec: number;
  loadingT: number;
  loadingTargetT: number;
  /** Smoothed 0–1: collapsed family → expanded preset. */
  expandT: number;
  expandTargetT: number;
  canvasSize: {
    cssWidth: number;
    cssHeight: number;
    pixelWidth: number;
    pixelHeight: number;
    dpr: number;
  };
  videoSize: {
    width: number;
    height: number;
  };
  cover: {
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
  };
}

interface LivekitVideoWebGLCanvasProps {
  liveVideoRef?: RefObject<HTMLVideoElement | null>;
  placeholderVideoRef?: RefObject<HTMLVideoElement | null>;
  placeholderHoverVideoRef?: RefObject<HTMLVideoElement | null>;
  placeholderImageRef?: RefObject<HTMLImageElement | null>;
  className?: string;
  isLoading?: boolean;
  onFrame?: (ctx: LivekitVideoFrameContext) => void;
  shaderParams?: Partial<LivekitShaderParams>;
  /** Hero vs expanded call; drives preset when not using debug override. */
  callExpanded?: boolean;
  /**
   * In-call scene change: drives edge-loading shader; live video stays visible (not replaced by placeholder).
   * Character preset change uses `characterTransitionLoading` (welcome/placeholder covers live).
   */
  transitionLoading?: boolean;
  /** In-call character preset change: pull mask toward collapsed loading (ring + glass). */
  characterTransitionLoading?: boolean;
  /**
   * Dev: force which preset is active (preview). `null` = follow `callExpanded` + smoothed loading.
   * "loading" uses `collapsedLoading` (circle). "edgeLoading" = expanded + ring preview.
   */
  debugShaderSurface?: LivekitShaderDebugSurface | null;
  /**
   * Shift the placeholder (welcome / base) cover-fit down while collapsed (`!callExpanded`),
   * in CSS px. Live agent video is unchanged. Positive = content moves down.
   */
  placeholderOffsetYPx?: number;
  layoutCssWidth?: number;
  layoutCssHeight?: number;
}

/** Apply {@link LivekitVideoWebGLCanvasProps.placeholderOffsetYPx} to a cover-fit result. */
export function applyPlaceholderCoverOffsetY(
  cover: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  offsetPx: number,
  canvasCssHeight: number
): { scaleX: number; scaleY: number; offsetX: number; offsetY: number } {
  if (!offsetPx || canvasCssHeight <= 0) return cover;
  return { ...cover, offsetY: cover.offsetY - offsetPx / canvasCssHeight };
}

/** Mirrored repeat in [0,1] — used in compose + glass fragment shaders (keep in sync). */
const GLSL_MIRROR_UV = `
      float mirrorUnit(float x) {
        x = mod(x, 2.0);
        return mix(x, 2.0 - x, step(1.0, x));
      }

      vec2 mirror01(vec2 uv) {
        return vec2(mirrorUnit(uv.x), mirrorUnit(uv.y));
      }
`;

type HeroCanvasLayout = {
  padCss: number;
  padPx: number;
  contentCssW: number;
  contentCssH: number;
  contentPixelW: number;
  contentPixelH: number;
  rtPixelW: number;
  rtPixelH: number;
  contentUvMinX: number;
  contentUvMinY: number;
  contentUvSizeX: number;
  contentUvSizeY: number;
};

function resolveHeroCanvasLayout(args: {
  canvas: HTMLCanvasElement;
  dpr: number;
  padCss: number;
  layoutCssW?: number;
  layoutCssH?: number;
}): HeroCanvasLayout {
  const { canvas, dpr, padCss } = args;
  const parent = canvas.parentElement;
  const contentCssW = Math.max(
    1,
    args.layoutCssW ?? parent?.clientWidth ?? canvas.clientWidth
  );
  const contentCssH = Math.max(
    1,
    args.layoutCssH ?? parent?.clientHeight ?? canvas.clientHeight
  );
  const padPx = padCss > 0 ? Math.max(0, Math.round(padCss * dpr)) : 0;
  const contentPixelW = Math.max(1, Math.floor(contentCssW * dpr));
  const contentPixelH = Math.max(1, Math.floor(contentCssH * dpr));
  const rtPixelW = contentPixelW + padPx * 2;
  const rtPixelH = contentPixelH + padPx * 2;

  if (padCss > 0) {
    canvas.style.position = "absolute";
    canvas.style.left = "50%";
    canvas.style.top = "50%";
    canvas.style.transform = "translate(-50%, -50%)";
    canvas.style.width = `${contentCssW + padCss * 2}px`;
    canvas.style.height = `${contentCssH + padCss * 2}px`;
  } else {
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.transform = "";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }

  if (canvas.width !== rtPixelW || canvas.height !== rtPixelH) {
    canvas.width = rtPixelW;
    canvas.height = rtPixelH;
  }

  const contentUvMinX = padPx / rtPixelW;
  const contentUvMinY = padPx / rtPixelH;
  const contentUvSizeX = contentPixelW / rtPixelW;
  const contentUvSizeY = contentPixelH / rtPixelH;

  return {
    padCss,
    padPx,
    contentCssW,
    contentCssH,
    contentPixelW,
    contentPixelH,
    rtPixelW,
    rtPixelH,
    contentUvMinX,
    contentUvMinY,
    contentUvSizeX,
    contentUvSizeY,
  };
}

const liquidGlassABCD = { a: 0.7, b: 2.3, c: 5.2, d: 6.9 };

const defaultIdlePointer: LivekitIdlePointerParams = {
  pointerSkewMax: 0.3,
  pointerShiftFrac: 0.04,
  shapeInsetCssPx: 32,
  canvasPadCssPx: HERO_CANVAS_PAD_CSS,
  pointerSmoothing: 4,
  pointerBlendSmoothing: 8,
};

const defaultCollapsed: LivekitShaderPreset = {
  cornerRadiusPx: LIVEKIT_SHADER_CIRCLE_CORNER_RADIUS_PX,
  fPower: 0.00,
  noise: 0.0,
  glowWeight: 0.0,
  a: 1.2, b: 3.0, c: 5.2, d: 6.9,
  glowBias: 0.0,
  glowEdge0: 0.06,
  glowEdge1: 0.0,
  blurRadiusScale: 0.0,
  loadingRingStrength: 0.0,
  loadingRingBoost: 0.0,
  loadingRingInnerPx: 0.0,
  loadingRingOuterStartPx: 4.0,
  loadingRingOuterEndPx: 8.0,
  loadingRingNoiseAmp: 2.5,
  loadingRingAnimSpeed: 3,
  loadingBubbleStrength: 0.8,
  loadingBubbleFrequency: 0.6,
  loadingBubblePulseAmplitude: 0,
  loadingBubblePulseHz: 1,
};

/** Subtle at-rest ring; glass stays collapsed (no blur / bubble warp). */
const defaultCollapsedAmbient: LivekitShaderPreset = {
  ...defaultCollapsed,
  loadingRingStrength: 0.75,
  loadingRingBoost: 0.35,
  loadingRingInnerPx: 18,
  loadingRingOuterStartPx: 18,
  loadingRingOuterEndPx: 96,
  loadingRingNoiseAmp: 0.5,
  loadingRingAnimSpeed: 3,
  loadingBubbleStrength: 0,
};

const defaultCollapsedLoading: LivekitShaderPreset = {
  cornerRadiusPx: LIVEKIT_SHADER_CIRCLE_CORNER_RADIUS_PX,
  fPower: 4.84,
  noise: 0.0,
  glowWeight: 0.67,
  a: 0.7, b: 2.3, c: 8, d: 2.5,
  glowBias: 0.0,
  glowEdge0: 0.06,
  glowEdge1: 0.0,
  blurRadiusScale: 12.00,
  loadingRingStrength: 1.1,
  loadingRingBoost: 0.5,
  loadingRingInnerPx: 28.0,
  loadingRingOuterStartPx: 18.0,
  loadingRingOuterEndPx: 96.0,
  loadingRingNoiseAmp: 0.5,
  loadingRingAnimSpeed: 3,
  loadingBubbleStrength: 0.8,
  loadingBubbleFrequency: 0.6,
  loadingBubblePulseAmplitude: 4,
  loadingBubblePulseHz: 0.8,
};

/** Circle hover: collapsed glass + loading ring (no bubble warp / blur). */
const defaultIdleHover: LivekitShaderPreset = {
  ...defaultCollapsed,
  loadingRingStrength: 1.4,
  loadingRingBoost: 0.85,
  loadingRingInnerPx: 4,
  loadingRingOuterStartPx: 18,
  loadingRingOuterEndPx: 220,
  loadingRingNoiseAmp: 0.5,
  loadingRingAnimSpeed: 3,
  loadingBubbleStrength: 0,
};

const defaultExpanded: LivekitShaderPreset = {
  cornerRadiusPx: 72,
  fPower: 0.0,
  noise: 0.0,
  glowWeight: 0.0,
  a: 1.0,
  b: 0.0,
  c: 8.0,
  d: 0.0,
  glowBias: 0.0,
  glowEdge0: 0.06,
  glowEdge1: 0.0,
  blurRadiusScale: 0.0,
  loadingRingStrength: 0.0,
  loadingRingBoost: 0.5,
  loadingRingInnerPx: 28.0,
  loadingRingOuterStartPx: 18.0,
  loadingRingOuterEndPx: 96.0,
  loadingRingNoiseAmp: 0.5,
  loadingRingAnimSpeed: 3,
  loadingBubbleStrength: 0.0,
  loadingBubbleFrequency: 1.0,
  loadingBubblePulseAmplitude: 0,
  loadingBubblePulseHz: 1,
};

/**
 * In-call scene swap: expanded rounded-rect mask + loading chromatic ring, same liquid-glass
 * distortion as `collapsedLoading`, without separable blur or magic bubble.
 */
const defaultEdgeLoading: LivekitShaderPreset = {
  ...defaultExpanded,
  fPower: 0.5,
  noise: defaultCollapsedLoading.noise,
  glowWeight: defaultCollapsedLoading.glowWeight,
  a: defaultCollapsedLoading.a,
  b: defaultCollapsedLoading.b,
  c: defaultCollapsedLoading.c,
  d: defaultCollapsedLoading.d,
  glowBias: defaultCollapsedLoading.glowBias,
  glowEdge0: defaultCollapsedLoading.glowEdge0,
  glowEdge1: defaultCollapsedLoading.glowEdge1,
  blurRadiusScale: 0.0,
  loadingRingStrength: defaultCollapsedLoading.loadingRingStrength,
  loadingRingBoost: defaultCollapsedLoading.loadingRingBoost,
  loadingRingInnerPx: defaultCollapsedLoading.loadingRingInnerPx,
  loadingRingOuterStartPx: defaultCollapsedLoading.loadingRingOuterStartPx,
  loadingRingOuterEndPx: defaultCollapsedLoading.loadingRingOuterEndPx,
  loadingRingNoiseAmp: defaultCollapsedLoading.loadingRingNoiseAmp,
  loadingRingAnimSpeed: defaultCollapsedLoading.loadingRingAnimSpeed,
  loadingBubbleStrength: 0.0,
  loadingBubbleFrequency: defaultCollapsedLoading.loadingBubbleFrequency,
  loadingBubblePulseAmplitude: defaultCollapsedLoading.loadingBubblePulseAmplitude,
  loadingBubblePulseHz: defaultCollapsedLoading.loadingBubblePulseHz,
};

export const DEFAULT_LIVEKIT_SHADER_PARAMS: LivekitShaderParams = {
  collapsed: defaultCollapsed,
  collapsedAmbient: defaultCollapsedAmbient,
  collapsedLoading: defaultCollapsedLoading,
  expanded: defaultExpanded,
  edgeLoading: defaultEdgeLoading,
  idleHover: defaultIdleHover,
  idlePointer: defaultIdlePointer,
};

let webglCapabilityCache: boolean | null = null;

/**
 * Cached probe: same options as `LivekitVideoWebGLCanvas` init. Safe to call from client components;
 * returns false when `document` is unavailable (never true-SSR / false-client mismatch if used after mount).
 */
export function isLivekitWebGLAvailable(): boolean {
  if (webglCapabilityCache !== null) return webglCapabilityCache;
  if (typeof document === "undefined") {
    return true;
  }
  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    }) ?? canvas.getContext("experimental-webgl");
  webglCapabilityCache = Boolean(gl);
  return webglCapabilityCache;
}

/** WebGL draws the hero mask — skip CSS overflow/radius clipping when available. */
export function heroWebglShapeMaskActive(): boolean {
  return isLivekitWebGLAvailable();
}

export function heroWebglClipOverflow(webgl: boolean): string {
  return webgl ? "overflow-visible" : "overflow-hidden";
}

/**
 * Discrete mask radius matching the WebGL path’s `cornerRadiusPx` uniform (no frame-to-frame smoothing).
 * Used for HTML/CSS clipping when WebGL is unavailable.
 */
export function computeHeroSurfaceClipBorderRadiusPx(args: {
  width: number;
  height: number;
  shaderParams?: Partial<LivekitShaderParams>;
  callExpanded: boolean;
  debugShaderSurface: LivekitShaderDebugSurface | null;
  characterTransitionLoading: boolean;
}): number {
  const {
    width,
    height,
    shaderParams,
    callExpanded,
    debugShaderSurface,
    characterTransitionLoading,
  } = args;
  const merged = mergeLivekitShaderParams(
    DEFAULT_LIVEKIT_SHADER_PARAMS,
    shaderParams
  );
  const targetExpand = targetExpandT(debugShaderSurface, callExpanded);
  const expandBlendT = targetExpand * (characterTransitionLoading ? 0 : 1);
  const circleR = Math.min(width, height) * 0.5;
  const collapsedR = Math.min(circleR, merged.collapsed.cornerRadiusPx);
  return lerp(collapsedR, merged.expanded.cornerRadiusPx / 2, expandBlendT);
}

export function LivekitVideoWebGLCanvas({
  liveVideoRef,
  placeholderVideoRef,
  placeholderHoverVideoRef,
  placeholderImageRef,
  className,
  isLoading = false,
  onFrame,
  shaderParams,
  callExpanded = false,
  transitionLoading = false,
  characterTransitionLoading = false,
  debugShaderSurface = null,
  placeholderOffsetYPx = 0,
  layoutCssWidth,
  layoutCssHeight,
}: LivekitVideoWebGLCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callExpandedRef = useRef(callExpanded);
  const debugShaderSurfaceRef = useRef(debugShaderSurface);
  const isLoadingRef = useRef(isLoading);
  const transitionLoadingRef = useRef(transitionLoading);
  const characterTransitionLoadingRef = useRef(characterTransitionLoading);
  const shaderParamsRef = useRef(shaderParams);
  const placeholderOffsetYPxRef = useRef(placeholderOffsetYPx);
  const layoutCssWidthRef = useRef(layoutCssWidth);
  const layoutCssHeightRef = useRef(layoutCssHeight);
  const onFrameRef = useRef(onFrame);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerSmoothedRef = useRef({ x: 0, y: 0 });
  const pointerReducedMotionRef = useRef(false);
  callExpandedRef.current = callExpanded;
  debugShaderSurfaceRef.current = debugShaderSurface;
  isLoadingRef.current = isLoading;
  transitionLoadingRef.current = transitionLoading;
  characterTransitionLoadingRef.current = characterTransitionLoading;
  shaderParamsRef.current = shaderParams;
  placeholderOffsetYPxRef.current = placeholderOffsetYPx;
  layoutCssWidthRef.current = layoutCssWidth;
  layoutCssHeightRef.current = layoutCssHeight;
  onFrameRef.current = onFrame;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      pointerReducedMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear stale inline sizing from prior builds (hot reload).
    canvas.style.left = "";
    canvas.style.top = "";
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.transform = "";

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) return;

    const hasDerivatives = Boolean(gl.getExtension("OES_standard_derivatives"));

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const createProgram = (vertexSource: string, fragmentSource: string) => {
      let frag = fragmentSource;
      // Fall back when OES_standard_derivatives is missing.
      if (!hasDerivatives && frag.includes("GL_OES_standard_derivatives")) {
        frag = frag
          .replace(
            /#extension\s+GL_OES_standard_derivatives\s*:\s*enable\s*/g,
            "",
          )
          .replace(
            /float aa = max\(fwidth\(d\), 1e-4\);/g,
            "float aa = max(1.25, 1.5 * max(u_canvasPx.x, u_canvasPx.y) / 512.0);",
          );
      }
      const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = compileShader(gl.FRAGMENT_SHADER, frag);
      if (!vertexShader || !fragmentShader) {
        if (vertexShader) gl.deleteShader(vertexShader);
        if (fragmentShader) gl.deleteShader(fragmentShader);
        return null;
      }
      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
      }
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return program;
    };

    const vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        vTexCoord = a_texCoord;
      }
    `;
    const composeFragmentSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uLiveTexture;
      uniform sampler2D uPlaceholderTexture;
      uniform sampler2D uPlaceholderHoverTexture;
      uniform vec2 uLiveScale;
      uniform vec2 uLiveOffset;
      uniform vec2 uPlaceholderScale;
      uniform vec2 uPlaceholderOffset;
      uniform vec2 uPlaceholderHoverScale;
      uniform vec2 uPlaceholderHoverOffset;
      uniform float uLiveReady;
      uniform float uPlaceholderReady;
      uniform float uPlaceholderHoverT;
      ${GLSL_MIRROR_UV}

      vec4 sampleLive(vec2 uv) {
        vec2 mapped = mirror01(uv * uLiveScale + uLiveOffset);
        return texture2D(uLiveTexture, mapped);
      }

      vec4 samplePlaceholder(vec2 uv) {
        vec2 mapped = mirror01(uv * uPlaceholderScale + uPlaceholderOffset);
        return texture2D(uPlaceholderTexture, mapped);
      }

      vec4 samplePlaceholderHover(vec2 uv) {
        vec2 mapped = mirror01(uv * uPlaceholderHoverScale + uPlaceholderHoverOffset);
        return texture2D(uPlaceholderHoverTexture, mapped);
      }

      vec3 sampleCombined(vec2 uv) {
        vec3 placeBase = samplePlaceholder(uv).rgb;
        vec3 placeHover = samplePlaceholderHover(uv).rgb;
        vec3 placeCurr = mix(placeBase, placeHover, uPlaceholderHoverT);
        vec3 liveCurr = sampleLive(uv).rgb;
        vec3 base = mix(vec3(0.0), placeCurr, uPlaceholderReady);
        return mix(base, liveCurr, uLiveReady);
      }

      void main() {
        gl_FragColor = vec4(sampleCombined(vTexCoord), 1.0);
      }
    `;

    // 9-tap separable binomial (σ-like falloff) + 2× H/V passes for large, high-quality blur.
    const blurFragmentSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D u_image;
      uniform vec2 u_texelSize;
      uniform vec2 u_direction;
      uniform float u_blurRadiusScale;

      void main() {
        vec2 uv = vTexCoord;
        vec2 s = u_texelSize * u_direction * u_blurRadiusScale;

        // Pascal row 8 / 256 — same footprint as a wide Gaussian, fewer banding artifacts than 5-tap.
        vec3 c = texture2D(u_image, uv).rgb * (70.0 / 256.0);
        c += texture2D(u_image, uv + s * -4.0).rgb * (1.0 / 256.0);
        c += texture2D(u_image, uv + s * -3.0).rgb * (8.0 / 256.0);
        c += texture2D(u_image, uv + s * -2.0).rgb * (28.0 / 256.0);
        c += texture2D(u_image, uv + s * -1.0).rgb * (56.0 / 256.0);
        c += texture2D(u_image, uv + s * 1.0).rgb * (56.0 / 256.0);
        c += texture2D(u_image, uv + s * 2.0).rgb * (28.0 / 256.0);
        c += texture2D(u_image, uv + s * 3.0).rgb * (8.0 / 256.0);
        c += texture2D(u_image, uv + s * 4.0).rgb * (1.0 / 256.0);

        gl_FragColor = vec4(c, 1.0);
      }
    `;

    const presentFragmentSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D u_image;

      void main() {
        gl_FragColor = texture2D(u_image, vTexCoord);
      }
    `;

    const glassFragmentSource = `
      #extension GL_OES_standard_derivatives : enable
      precision mediump float;
      varying vec2 vTexCoord;

      uniform sampler2D u_blurTexture;
      uniform vec2 u_canvasPx;
      uniform float u_cornerRadiusPx;

      // LiquidGlass uniforms (adapted from OverShifted/LiquidGlass)
      uniform float u_fPower; // u_fPower (refraction exponent)

      uniform float u_a;
      uniform float u_b;
      uniform float u_c;
      uniform float u_d;

      uniform float u_noise; // scalar noise intensity
      uniform float u_glowWeight;
      uniform float u_glowBias;
      uniform float u_glowEdge0;
      uniform float u_glowEdge1;

      /** 0–1: idle hero loading — inner-edge iridescent ring (Image Playground–style). */
      uniform float u_loadingRing;
      /** ∫(animSpeed × visibility) dt from JS — do not use wall time × animLift (phase jumps when ring returns). */
      uniform float u_ringAnimAccum;
      uniform float u_ringStrength;
      uniform float u_ringBoost;
      uniform float u_ringInnerPx;
      uniform float u_ringOuterStartPx;
      uniform float u_ringOuterEndPx;
      uniform float u_ringNoiseAmp;
      /** Inward-only radial pinch (× loadingRingT × preset); hero circle only. */
      uniform float u_loadingBubble;
      /** Scales rim wobble frequency (Cartesian harmonics). */
      uniform float u_loadingBubbleFreq;
      /** 0–1 pulse mix from preset (× lift uniform from JS). */
      uniform float u_loadingBubblePulseAmp;
      /** Real loading factor (no idle ambient lift) — pulse only while loading. */
      uniform float u_loadingBubblePulseLift;
      /** Radians: ∫ 2π Hz dt for bubble pulse phase. */
      uniform float u_bubblePulseAccum;
      /** Pointer offset from canvas center (px); idle hero squash/stretch axis. */
      uniform vec2 u_pointerOffsetPx;
      /** Skew strength (squash/stretch); gated off while expanded. */
      uniform float u_pointerSkew;
      /** Translate strength as a fraction of bubble radius toward the pointer. */
      uniform float u_pointerShift;
      /** Shrinks idle mask radius so skew/translate stays inside the canvas. */
      uniform float u_shapeInsetPx;
      /** Transparent margin (px): circle is inset from the FBO edge by this amount. */
      uniform float u_padPx;
      /** Normalized content rect inside the padded FBO (mirrored blur sampling). */
      uniform vec2 u_contentUvMin;
      uniform vec2 u_contentUvSize;

      ${GLSL_MIRROR_UV}

      vec2 blurSampleUv(vec2 fboUv) {
        vec2 local = (fboUv - u_contentUvMin) / max(u_contentUvSize, vec2(1e-6));
        local = mirror01(local);
        return local * u_contentUvSize + u_contentUvMin;
      }

      // iq: https://iquilezles.org/articles/distfunctions2d/ — corners are circular in pixel space.
      float sdRoundedBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }

      const float M_E = 2.718281828459045;

      float f(float x) {
        // LiquidGlass f(x) = 1 - b * pow(c*e, -d*x - a)
        return 1.0 - u_b * pow(u_c * M_E, -u_d * x - u_a);
      }

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float Glow() {
        // Same shape as repo: sin(atan(ndcY, ndcX) - 0.5)
        vec2 ndc = vTexCoord * 2.0 - 1.0;
        return sin(atan(ndc.y, ndc.x) - 0.5);
      }

      // Mask-only: shift toward pointer, then area-preserving stretch along that axis.
      vec2 pointerShapeSpace(vec2 p, float halfMin) {
        vec2 off = u_pointerOffsetPx;
        float mag = length(off);
        if (
          (u_pointerSkew < 0.001 && u_pointerShift < 0.001) ||
          mag < halfMin * 0.02
        ) {
          return p;
        }

        vec2 dir = off / mag;
        float reach = smoothstep(0.0, halfMin * 1.35, mag);

        p -= dir * (halfMin * u_pointerShift * reach);

        if (u_pointerSkew < 0.001) return p;

        vec2 perp = vec2(-dir.y, dir.x);
        float along = dot(p, dir);
        float across = dot(p, perp);
        float k = u_pointerSkew * reach * 0.14;
        // Inverse map: divide along / multiply across by the same factor → ellipse, same area as circle.
        float stretch = 1.0 + k;
        along /= stretch;
        across *= stretch;
        return dir * along + perp * across;
      }

      void main() {
        vec2 halfSize = u_canvasPx * 0.5;
        vec2 contentHalf = max(halfSize - vec2(u_padPx), vec2(1.0));
        float halfMin = min(contentHalf.x, contentHalf.y);
        vec2 p = (vTexCoord - vec2(0.5)) * u_canvasPx;
        float r = min(u_cornerRadiusPx, min(contentHalf.x, contentHalf.y));
        bool isCircle = abs(r - halfMin) < 1.0;
        float inset = u_shapeInsetPx;
        float halfMinShape = max(halfMin - inset, 1.0);
        vec2 halfSizeShape = max(contentHalf - vec2(inset), vec2(1.0));
        float rShape = max(
          min(u_cornerRadiusPx, min(halfSizeShape.x, halfSizeShape.y)) - inset * 0.35,
          0.0
        );
        vec2 pShape = pointerShapeSpace(p, halfMin);

        float d;
        if (u_loadingBubble > 0.001 && isCircle) {
          float rho = length(pShape);
          float R0 = halfMinShape;
          vec2 u = rho > 1e-4 ? pShape.xy / rho : vec2(1.0, 0.0);
          float tm = u_ringAnimAccum;
          float fq = max(u_loadingBubbleFreq, 0.05);
          float w =
            sin(fq * (5.0 * u.x + 2.0 * u.y) + tm * 1.1) * 0.5 +
            sin(fq * (3.0 * u.x - 6.0 * u.y) - tm * 0.85) * 0.35 +
            sin(fq * (1.2 * u.x + 2.3 * u.y) + tm * 0.4) * 0.15;
          w = w * 0.5 + 0.5;
          float wterm = 0.04 + 0.08 * w;
          float pulseDepth = clamp(
            u_loadingBubblePulseAmp * u_loadingBubblePulseLift,
            0.0,
            2.5
          );
          float oscLow = max(0.0, 1.0 - 0.5 * min(pulseDepth, 2.0));
          float s = 0.5 + 0.5 * sin(u_bubblePulseAccum);
          float pulseMul =
            pulseDepth > 0.001 ? mix(oscLow, 1.0, s) : 1.0;
          // Cap the *envelope* before pulse, then multiply by pulseMul so the sine is never
          // flattened by min(pinch, cap) when the bubble is strong (was clipping the top half).
          const float PINCH_CAP = 0.12;
          float M = u_loadingBubble * wterm;
          float pinch = min(M, PINCH_CAP) * pulseMul;
          d = rho - R0 * (1.0 - pinch);
        } else if (isCircle) {
          d = length(pShape) - halfMinShape;
        } else {
          d = sdRoundedBox(pShape, halfSizeShape, rShape);
        }

        // Screen-space AA on the mask edge (fwidth ≈ one pixel for d); avoids stair-steps on the wavy bubble rim.
        float aa = max(fwidth(d), 1e-4);
        float edgeAlpha = 1.0 - smoothstep(-aa, aa, d);
        if (edgeAlpha <= 0.001) {
          gl_FragColor = vec4(0.0);
          return;
        }

        float dist = max(-d, 0.0);
        float distNorm = dist / max(halfMin, 1.0);

        float fDist = max(f(distNorm), 0.0001);
        vec2 sampleP = p * pow(fDist, u_fPower);
        vec2 coord = sampleP / u_canvasPx + vec2(0.5);

        float n = (rand(gl_FragCoord.xy * 1e-3) - 0.5) * u_noise;

        vec3 color = texture2D(u_blurTexture, blurSampleUv(coord)).rgb + vec3(n);

        float glow = Glow();
        float edge = smoothstep(u_glowEdge0, u_glowEdge1, distNorm);
        float mul = glow * u_glowWeight * edge + 1.0 + u_glowBias;

        color *= vec3(mul);

        if (u_loadingRing > 0.001 && u_ringStrength > 0.0001) {
          // True inward distance from boundary — never offset with noise (additive noise
          // pulled the band off the rim and left gaps when negative).
          float edgePx = max(dist, 0.0);
          float ang = atan(pShape.y, pShape.x);
          float na = u_ringNoiseAmp;
          float tm = u_ringAnimAccum;
          // ~zero-mean; only scales band depth from the edge so the ring always emanates from the rim
          float nAnim =
            sin(4.0 * ang + tm * 1.05) * 0.5 +
            sin(11.0 * ang - tm * 0.78) * 0.32 +
            sin(19.0 * ang + tm * 1.4) * 0.18 +
            sin(2.0 * ang - tm * 0.35) * 0.22;
          float wobble = 1.0 + na * nAnim;
          wobble = clamp(wobble, 0.42, 1.9);
          float innerW = max(u_ringInnerPx * wobble, 0.5);
          float outerS = u_ringOuterStartPx * wobble;
          float outerE = max(u_ringOuterEndPx * wobble, outerS + 0.5);
          // exp(-edgePx / innerW): full strength on the boundary, soft falloff inward (wider than linear)
          float atRim = exp(-edgePx / innerW);
          float deepFade = 1.0 - smoothstep(outerS, outerE, edgePx);
          float band = atRim * deepFade;
          // ang gives hue that travels around the rim; cos(phase) stays continuous when ang jumps 2π.
          float phase = ang + edgePx * 0.07 + u_ringAnimAccum * 0.38;
          vec3 irid =
            0.32 +
            0.68 * cos(phase + vec3(0.0, 2.1, 4.2));
          irid = mix(vec3(1.0), irid, 0.5);
          float ringAmp = clamp(band * u_loadingRing * u_ringStrength, 0.0, 1.0);
          color = mix(color, color * irid + irid * u_ringBoost, ringAmp);
        }

        gl_FragColor = vec4(color * edgeAlpha, edgeAlpha);
      }
    `;

    const composeProgram = createProgram(vertexSource, composeFragmentSource);
    const blurProgram = createProgram(vertexSource, blurFragmentSource);
    const glassProgram = createProgram(vertexSource, glassFragmentSource);
    const presentProgram = createProgram(vertexSource, presentFragmentSource);
    if (!composeProgram || !blurProgram || !glassProgram || !presentProgram) {
      if (composeProgram) gl.deleteProgram(composeProgram);
      if (blurProgram) gl.deleteProgram(blurProgram);
      if (glassProgram) gl.deleteProgram(glassProgram);
      if (presentProgram) gl.deleteProgram(presentProgram);
      return;
    }

    const positionBuffer = gl.createBuffer();
    const texBuffer = gl.createBuffer();
    if (!positionBuffer || !texBuffer) {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texBuffer);
      gl.deleteProgram(composeProgram);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(glassProgram);
      gl.deleteProgram(presentProgram);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW
    );

    const bindAttributes = (program: WebGLProgram) => {
      gl.useProgram(program);
      const posLoc = gl.getAttribLocation(program, "a_position");
      const uvLoc = gl.getAttribLocation(program, "a_texCoord");
      if (posLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      }
      if (uvLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
      }
    };
    bindAttributes(composeProgram);
    bindAttributes(blurProgram);
    bindAttributes(glassProgram);
    bindAttributes(presentProgram);

    const liveTexture = gl.createTexture();
    const placeholderTexture = gl.createTexture();
    const placeholderHoverTexture = gl.createTexture();
    const combinedTexture = gl.createTexture();
    const blurTextureA = gl.createTexture();
    const blurTextureB = gl.createTexture();
    const finalTexture = gl.createTexture();
    if (
      !liveTexture ||
      !placeholderTexture ||
      !placeholderHoverTexture ||
      !combinedTexture ||
      !blurTextureA ||
      !blurTextureB ||
      !finalTexture
    ) {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texBuffer);
      gl.deleteProgram(composeProgram);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(glassProgram);
      gl.deleteProgram(presentProgram);
      return;
    }

    const composeFbo = gl.createFramebuffer();
    const blurFboA = gl.createFramebuffer();
    const blurFboB = gl.createFramebuffer();
    const finalFbo = gl.createFramebuffer();
    if (!composeFbo || !blurFboA || !blurFboB || !finalFbo) {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texBuffer);
      gl.deleteTexture(liveTexture);
      gl.deleteTexture(placeholderTexture);
      gl.deleteTexture(placeholderHoverTexture);
      gl.deleteTexture(combinedTexture);
      gl.deleteTexture(blurTextureA);
      gl.deleteTexture(blurTextureB);
      gl.deleteTexture(finalTexture);
      gl.deleteProgram(composeProgram);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(glassProgram);
      gl.deleteProgram(presentProgram);
      return;
    }

    const setupTexture = (unit: number, texture: WebGLTexture) => {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    setupTexture(gl.TEXTURE0, liveTexture);
    setupTexture(gl.TEXTURE1, placeholderTexture);
    setupTexture(gl.TEXTURE2, placeholderHoverTexture);
    setupTexture(gl.TEXTURE4, combinedTexture);
    setupTexture(gl.TEXTURE5, blurTextureA);
    setupTexture(gl.TEXTURE6, blurTextureB);
    setupTexture(gl.TEXTURE7, finalTexture);

    const attachFboTex = (fbo: WebGLFramebuffer, tex: WebGLTexture, width: number, height: number) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    };

    const composeUniforms = {
      liveTex: gl.getUniformLocation(composeProgram, "uLiveTexture"),
      placeholderTex: gl.getUniformLocation(composeProgram, "uPlaceholderTexture"),
      placeholderHoverTex: gl.getUniformLocation(
        composeProgram,
        "uPlaceholderHoverTexture"
      ),
      liveScale: gl.getUniformLocation(composeProgram, "uLiveScale"),
      liveOffset: gl.getUniformLocation(composeProgram, "uLiveOffset"),
      placeholderScale: gl.getUniformLocation(composeProgram, "uPlaceholderScale"),
      placeholderOffset: gl.getUniformLocation(composeProgram, "uPlaceholderOffset"),
      placeholderHoverScale: gl.getUniformLocation(
        composeProgram,
        "uPlaceholderHoverScale"
      ),
      placeholderHoverOffset: gl.getUniformLocation(
        composeProgram,
        "uPlaceholderHoverOffset"
      ),
      liveReady: gl.getUniformLocation(composeProgram, "uLiveReady"),
      placeholderReady: gl.getUniformLocation(composeProgram, "uPlaceholderReady"),
      placeholderHoverT: gl.getUniformLocation(composeProgram, "uPlaceholderHoverT"),
    };
    gl.useProgram(composeProgram);
    if (composeUniforms.liveTex) gl.uniform1i(composeUniforms.liveTex, 0);
    if (composeUniforms.placeholderTex) gl.uniform1i(composeUniforms.placeholderTex, 1);
    if (composeUniforms.placeholderHoverTex)
      gl.uniform1i(composeUniforms.placeholderHoverTex, 2);

    const blurUniforms = {
      image: gl.getUniformLocation(blurProgram, "u_image"),
      texelSize: gl.getUniformLocation(blurProgram, "u_texelSize"),
      direction: gl.getUniformLocation(blurProgram, "u_direction"),
      blurRadiusScale: gl.getUniformLocation(blurProgram, "u_blurRadiusScale"),
    };

    const glassUniforms = {
      blurTexture: gl.getUniformLocation(glassProgram, "u_blurTexture"),
      canvasPx: gl.getUniformLocation(glassProgram, "u_canvasPx"),
      cornerRadiusPx: gl.getUniformLocation(glassProgram, "u_cornerRadiusPx"),
      fPower: gl.getUniformLocation(glassProgram, "u_fPower"),
      a: gl.getUniformLocation(glassProgram, "u_a"),
      b: gl.getUniformLocation(glassProgram, "u_b"),
      c: gl.getUniformLocation(glassProgram, "u_c"),
      d: gl.getUniformLocation(glassProgram, "u_d"),
      noise: gl.getUniformLocation(glassProgram, "u_noise"),
      glowWeight: gl.getUniformLocation(glassProgram, "u_glowWeight"),
      glowBias: gl.getUniformLocation(glassProgram, "u_glowBias"),
      glowEdge0: gl.getUniformLocation(glassProgram, "u_glowEdge0"),
      glowEdge1: gl.getUniformLocation(glassProgram, "u_glowEdge1"),
      loadingRing: gl.getUniformLocation(glassProgram, "u_loadingRing"),
      ringStrength: gl.getUniformLocation(glassProgram, "u_ringStrength"),
      ringBoost: gl.getUniformLocation(glassProgram, "u_ringBoost"),
      ringInnerPx: gl.getUniformLocation(glassProgram, "u_ringInnerPx"),
      ringOuterStartPx: gl.getUniformLocation(glassProgram, "u_ringOuterStartPx"),
      ringOuterEndPx: gl.getUniformLocation(glassProgram, "u_ringOuterEndPx"),
      ringNoiseAmp: gl.getUniformLocation(glassProgram, "u_ringNoiseAmp"),
      ringAnimAccum: gl.getUniformLocation(glassProgram, "u_ringAnimAccum"),
      loadingBubble: gl.getUniformLocation(glassProgram, "u_loadingBubble"),
      loadingBubbleFreq: gl.getUniformLocation(glassProgram, "u_loadingBubbleFreq"),
      loadingBubblePulseAmp: gl.getUniformLocation(
        glassProgram,
        "u_loadingBubblePulseAmp"
      ),
      loadingBubblePulseLift: gl.getUniformLocation(
        glassProgram,
        "u_loadingBubblePulseLift"
      ),
      bubblePulseAccum: gl.getUniformLocation(glassProgram, "u_bubblePulseAccum"),
      pointerOffsetPx: gl.getUniformLocation(glassProgram, "u_pointerOffsetPx"),
      pointerSkew: gl.getUniformLocation(glassProgram, "u_pointerSkew"),
      pointerShift: gl.getUniformLocation(glassProgram, "u_pointerShift"),
      shapeInsetPx: gl.getUniformLocation(glassProgram, "u_shapeInsetPx"),
      padPx: gl.getUniformLocation(glassProgram, "u_padPx"),
      contentUvMin: gl.getUniformLocation(glassProgram, "u_contentUvMin"),
      contentUvSize: gl.getUniformLocation(glassProgram, "u_contentUvSize"),
    };
    gl.useProgram(glassProgram);
    if (glassUniforms.blurTexture) gl.uniform1i(glassUniforms.blurTexture, 6);

    const presentUniforms = {
      image: gl.getUniformLocation(presentProgram, "u_image"),
    };
    gl.useProgram(presentProgram);
    if (presentUniforms.image) gl.uniform1i(presentUniforms.image, 7);

    let rafId = 0;
    let lastNow = performance.now();
    let loadingT = targetCollapsedLoadingT(
      debugShaderSurfaceRef.current,
      isLoadingRef.current
    );
    const dbgInit = debugShaderSurfaceRef.current;
    let transitionLoadingT =
      dbgInit === "edgeLoading"
        ? 1
        : transitionLoadingRef.current
          ? 1
          : 0;
    let characterTransitionT = characterTransitionLoadingRef.current ? 1 : 0;
    const expandTargetAtInit = targetExpandT(
      debugShaderSurfaceRef.current,
      callExpandedRef.current
    );
    /**
     * When the expanded call UI mounts, `callExpanded` is already true, so the naive init was
     * expandT = 1 — the glass preset snapped to "expanded" while the hero frame was still animating.
     * Start at 0 when we need to blend *toward* expanded so uniforms interpolate during the morph.
     */
    let expandT = expandTargetAtInit === 1 ? 0 : expandTargetAtInit;
    let ambientT = 0;
    let idleHoverT = 0;
    let pointerSkewT = 0;
    let placeholderHoverT = 0;
    /** Smoothed 0–1: mask is a true circle → gates the loading bubble wobble in/out. */
    let bubbleGateT = 0;
    let liveUploadBlocked = false;
    let placeholderUploadBlocked = false;
    let placeholderHoverUploadBlocked = false;
    let rtWidth = 0;
    let rtHeight = 0;
    let hasValidFrame = false;
    /** ∫(loadingRingAnimSpeed × loadingRingT) dt — avoids u_time×animLift jumps when the ring turns back on. */
    let ringAnimAccum = 0;
    /** ∫ 2π Hz dt for loading bubble pulse (continuous while amplitude is positive). */
    let bubblePulseAccum = 0;
    /**
     * After `src` changes, `<img>` / `<video>` can be !ready for a few frames while live is forced off
     * (character in-call transition). Keep sampling the last uploaded placeholder texels so we don't flash black.
     */
    let hasStablePlaceholderTexture = false;
    let hasStablePlaceholderHoverTexture = false;
    let stalePlaceholderCover = {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    };
    let stalePlaceholderHoverCover = {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    };

    const tryUploadTexture = (
      textureUnit: number,
      texture: WebGLTexture,
      source: TexImageSource
    ) => {
      try {
        gl.activeTexture(textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        return true;
      } catch {
        return false;
      }
    };

    const render = () => {
      const canvasEl = canvasRef.current;
      const liveVideoEl = liveVideoRef?.current ?? null;
      const defaultPlaceholderVideoEl = placeholderVideoRef?.current ?? null;
      const hoverPlaceholderVideoEl = placeholderHoverVideoRef?.current ?? null;
      const ptr = heroIdlePointer.current;
      const placeholderImageEl = placeholderImageRef?.current ?? null;
      if (!canvasEl || !composeUniforms.liveScale || !composeUniforms.liveOffset || !composeUniforms.placeholderScale || !composeUniforms.placeholderOffset) {
        rafId = window.requestAnimationFrame(render);
        return;
      }

      const now = performance.now();
      const deltaSec = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      const timeSec = now / 1000;

      /** First-order smoothing: larger → faster. ~τ ≈ 1/k seconds to 1/e error. */
      const loadingSmoothing = 1 - Math.exp(-deltaSec * 5);
      /**
       * Collapsed→expanded glass blend. ~k=3 targets a similar time scale to the Framer spring on
       * the hero frame (k=1 lagged a full second behind the layout morph after loading released).
       */
      const expandSmoothing = 1 - Math.exp(-deltaSec * 3.0);
      const dbg = debugShaderSurfaceRef.current;
      const targetLoadingInner = targetCollapsedLoadingT(
        dbg,
        isLoadingRef.current
      );
      const targetExpand = targetExpandT(dbg, callExpandedRef.current);
      const targetTransitionLoading =
        dbg === "edgeLoading" ? 1 : transitionLoadingRef.current ? 1 : 0;
      const targetCharacterTransition = characterTransitionLoadingRef.current
        ? 1
        : 0;
      loadingT += (targetLoadingInner - loadingT) * loadingSmoothing;
      transitionLoadingT +=
        (targetTransitionLoading - transitionLoadingT) * loadingSmoothing;
      characterTransitionT +=
        (targetCharacterTransition - characterTransitionT) * loadingSmoothing;
      expandT += (targetExpand - expandT) * expandSmoothing;

      /** Idle-only decor (ambient / hover): off while loading or morphing to expanded. */
      const skipIdleDecor =
        targetLoadingInner > 0.001 || targetExpand > 0.001;

      const merged = mergeLivekitShaderParams(
        DEFAULT_LIVEKIT_SHADER_PARAMS,
        shaderParamsRef.current
      );
      const collapsedGate = Math.max(0, 1 - expandT) * (1 - loadingT);
      const motionOk = pointerReducedMotionRef.current ? 0 : 1;
      const {
        debugIdleHover,
        targetIdleHover: targetIdleHoverTRaw,
        targetAmbient: targetAmbientTRaw,
        targetPointerSkew: targetPointerSkewT,
      } = computeIdleDecorTargets({
        dbg,
        ptr,
        skipIdleDecor,
        collapsedGate,
        motionOk,
      });
      const collapsedBlendSmoothing =
        1 -
        Math.exp(
          -deltaSec * merged.idlePointer.pointerBlendSmoothing
        );
      ambientT += (targetAmbientTRaw - ambientT) * collapsedBlendSmoothing;
      idleHoverT += (targetIdleHoverTRaw - idleHoverT) * collapsedBlendSmoothing;
      pointerSkewT +=
        (targetPointerSkewT - pointerSkewT) * collapsedBlendSmoothing;

      const targetPlaceholderHoverT =
        skipIdleDecor ||
        callExpandedRef.current ||
        isLoadingRef.current ||
        !hoverPlaceholderVideoEl
          ? 0
          : ptr.bubbleActive
            ? 1
            : 0;
      placeholderHoverT +=
        (targetPlaceholderHoverT - placeholderHoverT) * collapsedBlendSmoothing;

      const padCss = Math.max(0, merged.idlePointer.canvasPadCssPx);
      const layout = resolveHeroCanvasLayout({
        canvas: canvasEl,
        dpr: window.devicePixelRatio || 1,
        padCss,
        layoutCssW: layoutCssWidthRef.current,
        layoutCssH: layoutCssHeightRef.current,
      });
      const {
        padPx,
        contentCssW,
        contentCssH,
        contentPixelW,
        contentPixelH,
        rtPixelW,
        rtPixelH,
        contentUvMinX,
        contentUvMinY,
        contentUvSizeX,
        contentUvSizeY,
      } = layout;

      if (rtWidth !== rtPixelW || rtHeight !== rtPixelH) {
        rtWidth = rtPixelW;
        rtHeight = rtPixelH;
        attachFboTex(composeFbo, combinedTexture, rtWidth, rtHeight);
        attachFboTex(blurFboA, blurTextureA, rtWidth, rtHeight);
        attachFboTex(blurFboB, blurTextureB, rtWidth, rtHeight);
        attachFboTex(finalFbo, finalTexture, rtWidth, rtHeight);
      }

      const dpr = window.devicePixelRatio || 1;

      const computeCover = (
        srcWidth: number,
        srcHeight: number
      ): { scaleX: number; scaleY: number; offsetX: number; offsetY: number } => {
        const canvasAr = contentPixelW / contentPixelH;
        const srcAr = srcWidth / srcHeight;
        let scaleX = 1;
        let scaleY = 1;
        let offsetX = 0;
        let offsetY = 0;
        if (srcAr > canvasAr) {
          scaleX = canvasAr / srcAr;
          offsetX = (1 - scaleX) * 0.5;
        } else if (srcAr < canvasAr) {
          scaleY = srcAr / canvasAr;
          offsetY = (1 - scaleY) * 0.5;
        }
        return { scaleX, scaleY, offsetX, offsetY };
      };

      const liveReady =
        !!liveVideoEl &&
        liveVideoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        liveVideoEl.videoWidth > 0 &&
        liveVideoEl.videoHeight > 0;
      const defaultPlaceholderVideoReady =
        !!defaultPlaceholderVideoEl &&
        defaultPlaceholderVideoEl.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA &&
        defaultPlaceholderVideoEl.videoWidth > 0 &&
        defaultPlaceholderVideoEl.videoHeight > 0;
      const hoverPlaceholderVideoReady =
        !!hoverPlaceholderVideoEl &&
        hoverPlaceholderVideoEl.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA &&
        hoverPlaceholderVideoEl.videoWidth > 0 &&
        hoverPlaceholderVideoEl.videoHeight > 0;
      if (
        defaultPlaceholderVideoReady &&
        hoverPlaceholderVideoReady &&
        defaultPlaceholderVideoEl &&
        hoverPlaceholderVideoEl
      ) {
        const masterT = defaultPlaceholderVideoEl.currentTime;
        if (Math.abs(hoverPlaceholderVideoEl.currentTime - masterT) > 0.04) {
          try {
            hoverPlaceholderVideoEl.currentTime = masterT;
          } catch {
            /* seek can throw at loop boundary */
          }
        }
      }
      const placeholderImageReady =
        !!placeholderImageEl &&
        placeholderImageEl.complete &&
        placeholderImageEl.naturalWidth > 0 &&
        placeholderImageEl.naturalHeight > 0;
      const placeholderReady =
        defaultPlaceholderVideoReady || placeholderImageReady;

      const defaultPlaceholderCoverCurrent = defaultPlaceholderVideoReady
        ? computeCover(
            defaultPlaceholderVideoEl!.videoWidth,
            defaultPlaceholderVideoEl!.videoHeight
          )
        : placeholderImageReady
          ? computeCover(
              placeholderImageEl!.naturalWidth,
              placeholderImageEl!.naturalHeight
            )
          : null;
      if (defaultPlaceholderCoverCurrent) {
        stalePlaceholderCover = defaultPlaceholderCoverCurrent;
      }
      const placeholderCover =
        defaultPlaceholderCoverCurrent ?? stalePlaceholderCover;

      const hoverPlaceholderCoverCurrent = hoverPlaceholderVideoReady
        ? computeCover(
            hoverPlaceholderVideoEl!.videoWidth,
            hoverPlaceholderVideoEl!.videoHeight
          )
        : null;
      if (hoverPlaceholderCoverCurrent) {
        stalePlaceholderHoverCover = hoverPlaceholderCoverCurrent;
      }
      const placeholderHoverCover =
        hoverPlaceholderCoverCurrent ?? stalePlaceholderHoverCover;

      /**
       * No binary `idleDecorT` gate here: `computeIdleDecorTargets` already zeroes the targets
       * under `skipIdleDecor`, so the smoothed `ambientT` / `idleHoverT` decay *is* the blend.
       * A hard cutoff made idle decor (ring, glass) snap off one frame into loading.
       */
      const collapsedFamily = lerpPreset(
        lerpPreset(
          lerpPreset(merged.collapsed, merged.collapsedAmbient, ambientT),
          merged.idleHover,
          idleHoverT
        ),
        merged.collapsedLoading,
        loadingT
      );
      const expandBlendT = expandT * (1 - characterTransitionT);
      const baseGlassPreset = lerpPreset(
        collapsedFamily,
        merged.expanded,
        expandBlendT
      );
      const edgeBlend =
        targetExpand === 1
          ? transitionLoadingT * expandT * (1 - characterTransitionT)
          : 0;
      const preset = lerpPreset(baseGlassPreset, merged.edgeLoading, edgeBlend);
      const cl = merged.collapsedLoading;
      const collapsedRingT =
        Math.max(ambientT, idleHoverT) * Math.max(0, 1 - loadingT);
      const loadingRingT =
        collapsedRingT * (1 - expandBlendT) +
        loadingT * (1 - expandBlendT) +
        (targetExpand === 1 ? transitionLoadingT * expandT : 0);
      /** Collapsed / edge loading only — bubble pulse while loading, not ambient / hover. */
      const loadingOnlyT =
        loadingT * (1 - expandBlendT) +
        (targetExpand === 1 ? transitionLoadingT * expandT : 0);
      const ringBlendT = Math.max(loadingT, edgeBlend);
      const ringAnimSpeed = lerp(
        preset.loadingRingAnimSpeed,
        cl.loadingRingAnimSpeed,
        ringBlendT
      );
      ringAnimAccum +=
        deltaSec *
        ringAnimSpeed *
        Math.min(1, Math.max(0, loadingRingT));
      const bubblePulseAmp = lerp(
        preset.loadingBubblePulseAmplitude,
        cl.loadingBubblePulseAmplitude,
        ringBlendT
      );
      const bubblePulseHz = lerp(
        preset.loadingBubblePulseHz,
        cl.loadingBubblePulseHz,
        ringBlendT
      );
      if (bubblePulseAmp > 0.001) {
        bubblePulseAccum += deltaSec * bubblePulseHz * (Math.PI * 2);
      }

      if (liveReady || placeholderReady || hasStablePlaceholderTexture) {
        const circleR = Math.min(contentPixelW, contentPixelH) * 0.5;
        /**
         * Idle mask radius follows `collapsed` only (same as
         * `computeHeroSurfaceClipBorderRadiusPx`). Ambient / hover buckets still
         * own rings & glass; lerping their `cornerRadiusPx` with the circle
         * sentinel would pin the mask to `circleR` unless every bucket was
         * overridden together.
         */
        // Preset radii are CSS px; shader space is framebuffer px (contentCss × dpr).
        const collapsedIdleCornerR = Math.min(
          circleR,
          merged.collapsed.cornerRadiusPx * dpr
        );
        /** Loading (and collapsedLoading debug) always uses an inscribed circle. */
        const collapsedCornerR = lerp(collapsedIdleCornerR, circleR, loadingT);
        let cornerRadiusPx = lerp(
          collapsedCornerR,
          merged.expanded.cornerRadiusPx * dpr,
          expandBlendT
        );
        /**
         * The shader switches to its circle branch when the radius reaches half the shorter side
         * (`isCircle`), regardless of aspect. If the radius lerp outruns the layout spring on a
         * non-square canvas, the mask would snap from pill to inscribed circle — hold the radius
         * just below the circle threshold until the canvas is actually square.
         */
        const canvasIsSquare = Math.abs(contentPixelW - contentPixelH) <= 2;
        if (!canvasIsSquare) {
          cornerRadiusPx = Math.min(cornerRadiusPx, circleR - 2);
        }
        /**
         * The wobble only exists in the circle branch, so it would pop in at the strength
         * `loadingT` already reached. Ramp it from 0 once the mask is a true circle.
         */
        const maskIsCircle = canvasIsSquare && cornerRadiusPx >= circleR - 1;
        bubbleGateT += ((maskIsCircle ? 1 : 0) - bubbleGateT) * loadingSmoothing;

        const fPower = preset.fPower;
        const noise = preset.noise;
        const glowWeight = preset.glowWeight;
        const blurRadiusScale = preset.blurRadiusScale;

        const liveCover =
          liveReady && liveVideoEl
            ? computeCover(liveVideoEl.videoWidth, liveVideoEl.videoHeight)
            : { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

        gl.useProgram(composeProgram);
        gl.uniform2f(composeUniforms.liveScale, liveCover.scaleX, liveCover.scaleY);
        gl.uniform2f(composeUniforms.liveOffset, liveCover.offsetX, liveCover.offsetY);
        gl.uniform2f(
          composeUniforms.placeholderScale,
          placeholderCover.scaleX,
          placeholderCover.scaleY
        );
        const placeholderCoverFramed = applyPlaceholderCoverOffsetY(
          placeholderCover,
          callExpandedRef.current ? 0 : placeholderOffsetYPxRef.current,
          contentCssH
        );
        const placeholderHoverCoverFramed = applyPlaceholderCoverOffsetY(
          placeholderHoverCover,
          callExpandedRef.current ? 0 : placeholderOffsetYPxRef.current,
          contentCssH
        );
        gl.uniform2f(
          composeUniforms.placeholderOffset,
          placeholderCoverFramed.offsetX,
          placeholderCoverFramed.offsetY
        );
        if (composeUniforms.placeholderHoverScale)
          gl.uniform2f(
            composeUniforms.placeholderHoverScale,
            placeholderHoverCoverFramed.scaleX,
            placeholderHoverCoverFramed.scaleY
          );
        if (composeUniforms.placeholderHoverOffset)
          gl.uniform2f(
            composeUniforms.placeholderHoverOffset,
            placeholderHoverCoverFramed.offsetX,
            placeholderHoverCoverFramed.offsetY
          );
        if (composeUniforms.placeholderHoverT)
          gl.uniform1f(composeUniforms.placeholderHoverT, placeholderHoverT);

        if (liveReady && liveVideoEl) {
          if (!liveUploadBlocked) {
            const uploaded = tryUploadTexture(gl.TEXTURE0, liveTexture, liveVideoEl);
            if (!uploaded) {
              liveUploadBlocked = true;
              console.warn(
                "[livekit webgl] live texture upload blocked (likely cross-origin taint)."
              );
            }
          }
        }

        if (defaultPlaceholderVideoReady) {
          if (!placeholderUploadBlocked) {
            const uploaded = tryUploadTexture(
              gl.TEXTURE1,
              placeholderTexture,
              defaultPlaceholderVideoEl!
            );
            if (!uploaded) {
              placeholderUploadBlocked = true;
              console.warn(
                "[livekit webgl] placeholder texture upload blocked (cross-origin media without CORS)."
              );
            } else {
              hasStablePlaceholderTexture = true;
            }
          }
        } else if (placeholderImageReady) {
          if (!placeholderUploadBlocked) {
            const uploaded = tryUploadTexture(
              gl.TEXTURE1,
              placeholderTexture,
              placeholderImageEl!
            );
            if (!uploaded) {
              placeholderUploadBlocked = true;
              console.warn(
                "[livekit webgl] placeholder texture upload blocked (cross-origin media without CORS)."
              );
            } else {
              hasStablePlaceholderTexture = true;
            }
          }
        }

        if (hoverPlaceholderVideoReady) {
          if (!placeholderHoverUploadBlocked) {
            const uploaded = tryUploadTexture(
              gl.TEXTURE2,
              placeholderHoverTexture,
              hoverPlaceholderVideoEl!
            );
            if (!uploaded) {
              placeholderHoverUploadBlocked = true;
              console.warn(
                "[livekit webgl] placeholder hover texture upload blocked (cross-origin media without CORS)."
              );
            } else {
              hasStablePlaceholderHoverTexture = true;
            }
          }
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, liveTexture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, placeholderTexture);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, placeholderHoverTexture);

        const liveAvailable = liveReady && !liveUploadBlocked;
        const placeholderAvailable =
          !placeholderUploadBlocked &&
          (placeholderReady || hasStablePlaceholderTexture);
        /** Hide live during character swap (welcome/placeholder). Edge (scene) loading keeps live. */
        const liveCompositeReady =
          liveAvailable && !characterTransitionLoadingRef.current;
        if (composeUniforms.liveReady) gl.uniform1f(composeUniforms.liveReady, liveCompositeReady ? 1 : 0);
        if (composeUniforms.placeholderReady) gl.uniform1f(composeUniforms.placeholderReady, placeholderAvailable ? 1 : 0);

        // Pass 1: compose live + placeholder into the centered content region only.
        gl.bindFramebuffer(gl.FRAMEBUFFER, composeFbo);
        gl.viewport(0, 0, rtWidth, rtHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(composeProgram);
        gl.viewport(padPx, padPx, contentPixelW, contentPixelH);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Passes 2–5: separable blur. Skip when radius is 0 (most idle/expanded presets).
        const skipBlur = blurRadiusScale < 0.001;
        if (!skipBlur) {
          // Pass 2: horizontal blur (sample combined on unit 4 — compose uses 0–1)
          gl.useProgram(blurProgram);
          gl.bindFramebuffer(gl.FRAMEBUFFER, blurFboA);
          gl.viewport(0, 0, rtWidth, rtHeight);
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, combinedTexture);
          if (blurUniforms.image) gl.uniform1i(blurUniforms.image, 4);
          if (blurUniforms.texelSize)
            gl.uniform2f(blurUniforms.texelSize, 1 / rtWidth, 1 / rtHeight);
          if (blurUniforms.direction) gl.uniform2f(blurUniforms.direction, 1.0, 0.0);
          if (blurUniforms.blurRadiusScale)
            gl.uniform1f(blurUniforms.blurRadiusScale, blurRadiusScale);
          gl.drawArrays(gl.TRIANGLES, 0, 6);

          // Pass 3: vertical blur
          gl.bindFramebuffer(gl.FRAMEBUFFER, blurFboB);
          gl.viewport(0, 0, rtWidth, rtHeight);
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, blurTextureA);
          if (blurUniforms.image) gl.uniform1i(blurUniforms.image, 5);
          if (blurUniforms.direction) gl.uniform2f(blurUniforms.direction, 0.0, 1.0);
          if (blurUniforms.blurRadiusScale)
            gl.uniform1f(blurUniforms.blurRadiusScale, blurRadiusScale);
          gl.drawArrays(gl.TRIANGLES, 0, 6);

          // Passes 4–5: second separable blur (smaller radius) widens the kernel ~√2.
          const blurSecondPassScale = blurRadiusScale * 0.5;
          gl.bindFramebuffer(gl.FRAMEBUFFER, blurFboA);
          gl.viewport(0, 0, rtWidth, rtHeight);
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, blurTextureB);
          if (blurUniforms.image) gl.uniform1i(blurUniforms.image, 4);
          if (blurUniforms.texelSize)
            gl.uniform2f(blurUniforms.texelSize, 1 / rtWidth, 1 / rtHeight);
          if (blurUniforms.direction) gl.uniform2f(blurUniforms.direction, 1.0, 0.0);
          if (blurUniforms.blurRadiusScale)
            gl.uniform1f(blurUniforms.blurRadiusScale, blurSecondPassScale);
          gl.drawArrays(gl.TRIANGLES, 0, 6);

          gl.bindFramebuffer(gl.FRAMEBUFFER, blurFboB);
          gl.viewport(0, 0, rtWidth, rtHeight);
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, blurTextureA);
          if (blurUniforms.image) gl.uniform1i(blurUniforms.image, 5);
          if (blurUniforms.direction) gl.uniform2f(blurUniforms.direction, 0.0, 1.0);
          if (blurUniforms.blurRadiusScale)
            gl.uniform1f(blurUniforms.blurRadiusScale, blurSecondPassScale);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        // Pass 6: glass composite to cached final frame
        gl.useProgram(glassProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, finalFbo);
        gl.viewport(0, 0, rtWidth, rtHeight);
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, skipBlur ? combinedTexture : blurTextureB);
        if (glassUniforms.canvasPx)
          gl.uniform2f(glassUniforms.canvasPx, rtWidth, rtHeight);
        if (glassUniforms.padPx)
          gl.uniform1f(glassUniforms.padPx, padCss > 0 ? padPx : 0);
        if (glassUniforms.contentUvMin)
          gl.uniform2f(glassUniforms.contentUvMin, contentUvMinX, contentUvMinY);
        if (glassUniforms.contentUvSize)
          gl.uniform2f(
            glassUniforms.contentUvSize,
            contentUvSizeX,
            contentUvSizeY
          );
        if (glassUniforms.cornerRadiusPx)
          gl.uniform1f(glassUniforms.cornerRadiusPx, cornerRadiusPx);
        if (glassUniforms.fPower) gl.uniform1f(glassUniforms.fPower, fPower);
        if (glassUniforms.a) gl.uniform1f(glassUniforms.a, preset.a);
        if (glassUniforms.b) gl.uniform1f(glassUniforms.b, preset.b);
        if (glassUniforms.c) gl.uniform1f(glassUniforms.c, preset.c);
        if (glassUniforms.d) gl.uniform1f(glassUniforms.d, preset.d);

        if (glassUniforms.noise) gl.uniform1f(glassUniforms.noise, noise);
        if (glassUniforms.glowWeight)
          gl.uniform1f(glassUniforms.glowWeight, glowWeight);
        if (glassUniforms.glowBias)
          gl.uniform1f(glassUniforms.glowBias, preset.glowBias);
        if (glassUniforms.glowEdge0)
          gl.uniform1f(glassUniforms.glowEdge0, preset.glowEdge0);
        if (glassUniforms.glowEdge1)
          gl.uniform1f(glassUniforms.glowEdge1, preset.glowEdge1);
        if (glassUniforms.loadingRing)
          gl.uniform1f(glassUniforms.loadingRing, loadingRingT);
        if (glassUniforms.ringStrength)
          gl.uniform1f(
            glassUniforms.ringStrength,
            lerp(
              preset.loadingRingStrength,
              cl.loadingRingStrength,
              ringBlendT
            )
          );
        if (glassUniforms.ringBoost)
          gl.uniform1f(
            glassUniforms.ringBoost,
            lerp(preset.loadingRingBoost, cl.loadingRingBoost, ringBlendT)
          );
        if (glassUniforms.ringInnerPx)
          gl.uniform1f(
            glassUniforms.ringInnerPx,
            lerp(preset.loadingRingInnerPx, cl.loadingRingInnerPx, ringBlendT) *
              dpr
          );
        if (glassUniforms.ringOuterStartPx)
          gl.uniform1f(
            glassUniforms.ringOuterStartPx,
            lerp(
              preset.loadingRingOuterStartPx,
              cl.loadingRingOuterStartPx,
              ringBlendT
            ) * dpr
          );
        if (glassUniforms.ringOuterEndPx)
          gl.uniform1f(
            glassUniforms.ringOuterEndPx,
            lerp(
              preset.loadingRingOuterEndPx,
              cl.loadingRingOuterEndPx,
              ringBlendT
            ) * dpr
          );
        if (glassUniforms.ringNoiseAmp)
          gl.uniform1f(
            glassUniforms.ringNoiseAmp,
            lerp(preset.loadingRingNoiseAmp, cl.loadingRingNoiseAmp, ringBlendT)
          );
        if (glassUniforms.ringAnimAccum)
          gl.uniform1f(glassUniforms.ringAnimAccum, ringAnimAccum);
        if (glassUniforms.loadingBubble) {
          const bubbleStrength = lerp(
            preset.loadingBubbleStrength,
            cl.loadingBubbleStrength,
            ringBlendT
          );
          gl.uniform1f(
            glassUniforms.loadingBubble,
            loadingRingT * bubbleStrength * bubbleGateT
          );
        }
        if (glassUniforms.loadingBubbleFreq)
          gl.uniform1f(
            glassUniforms.loadingBubbleFreq,
            lerp(
              preset.loadingBubbleFrequency,
              cl.loadingBubbleFrequency,
              ringBlendT
            )
          );
        if (glassUniforms.loadingBubblePulseAmp)
          gl.uniform1f(glassUniforms.loadingBubblePulseAmp, bubblePulseAmp);
        if (glassUniforms.loadingBubblePulseLift)
          gl.uniform1f(
            glassUniforms.loadingBubblePulseLift,
            Math.min(1, Math.max(0, loadingOnlyT))
          );
        if (glassUniforms.bubblePulseAccum)
          gl.uniform1f(glassUniforms.bubblePulseAccum, bubblePulseAccum);
        const ip = merged.idlePointer;
        const canvasForPointer = canvasRef.current;
        if (debugIdleHover && canvasForPointer && !ptr.cardActive) {
          const rect = canvasForPointer.getBoundingClientRect();
          pointerTargetRef.current = heroPointerOffsetPx(
            canvasForPointer,
            rect.left + rect.width * 0.62,
            rect.top + rect.height * 0.52
          );
        } else if (
          !ptr.cardActive ||
          callExpandedRef.current ||
          isLoadingRef.current ||
          pointerReducedMotionRef.current ||
          !canvasForPointer
        ) {
          pointerTargetRef.current = { x: 0, y: 0 };
        } else {
          pointerTargetRef.current = heroPointerOffsetPx(
            canvasForPointer,
            ptr.clientX,
            ptr.clientY
          );
        }
        const pointerSmoothing =
          1 - Math.exp(-deltaSec * ip.pointerSmoothing);
        const pointerTarget = pointerTargetRef.current;
        const pointerSmoothed = pointerSmoothedRef.current;
        pointerSmoothed.x += (pointerTarget.x - pointerSmoothed.x) * pointerSmoothing;
        pointerSmoothed.y += (pointerTarget.y - pointerSmoothed.y) * pointerSmoothing;
        const halfMinPx = Math.min(contentPixelW, contentPixelH) * 0.5;
        const pointerMag = Math.hypot(pointerSmoothed.x, pointerSmoothed.y);
        const pointerReach =
          halfMinPx > 0
            ? Math.min(1, pointerMag / (halfMinPx * 1.35))
            : 0;
        const deformStrength =
          pointerReach *
          Math.max(
            pointerSkewT * ip.pointerSkewMax,
            pointerSkewT * ip.pointerShiftFrac
          );
        const idleShapeInsetPx = deformStrength * ip.shapeInsetCssPx * dpr;
        if (glassUniforms.pointerOffsetPx)
          gl.uniform2f(
            glassUniforms.pointerOffsetPx,
            pointerSmoothed.x,
            pointerSmoothed.y
          );
        if (glassUniforms.pointerSkew)
          gl.uniform1f(
            glassUniforms.pointerSkew,
            pointerSkewT * ip.pointerSkewMax
          );
        if (glassUniforms.pointerShift)
          gl.uniform1f(
            glassUniforms.pointerShift,
            pointerSkewT * ip.pointerShiftFrac
          );
        if (glassUniforms.shapeInsetPx)
          gl.uniform1f(glassUniforms.shapeInsetPx, idleShapeInsetPx);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        hasValidFrame = true;

        onFrameRef.current?.({
          gl,
          canvas: canvasEl,
          video: liveVideoEl,
          timeSec,
          deltaSec,
          loadingT,
          loadingTargetT: targetLoadingInner,
          expandT,
          expandTargetT: targetExpand,
          canvasSize: {
            cssWidth: contentCssW,
            cssHeight: contentCssH,
            pixelWidth: contentPixelW,
            pixelHeight: contentPixelH,
            dpr,
          },
          videoSize: {
            width: liveVideoEl?.videoWidth ?? 0,
            height: liveVideoEl?.videoHeight ?? 0,
          },
          cover: liveCover,
        });
      }

      if (hasValidFrame) {
        gl.useProgram(presentProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, rtWidth, rtHeight);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, finalTexture);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      gl.deleteTexture(liveTexture);
      gl.deleteTexture(placeholderTexture);
      gl.deleteTexture(placeholderHoverTexture);
      gl.deleteTexture(combinedTexture);
      gl.deleteTexture(blurTextureA);
      gl.deleteTexture(blurTextureB);
      gl.deleteTexture(finalTexture);
      gl.deleteFramebuffer(composeFbo);
      gl.deleteFramebuffer(blurFboA);
      gl.deleteFramebuffer(blurFboB);
      gl.deleteFramebuffer(finalFbo);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texBuffer);
      gl.deleteProgram(composeProgram);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(glassProgram);
      gl.deleteProgram(presentProgram);
    };
  }, [
    liveVideoRef,
    placeholderVideoRef,
    placeholderHoverVideoRef,
    placeholderImageRef,
  ]);

  return <canvas ref={canvasRef} className={className} />;
}
