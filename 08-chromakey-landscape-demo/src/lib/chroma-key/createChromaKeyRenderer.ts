export type ChromaKeyOptions = {
  keyColor: [number, number, number];
  /** RGB distance below which pixel is treated as background. */
  similarity: number;
  smoothness: number;
  /** Green-excess (g - max(r,b)) above spillMin starts getting keyed out. */
  spillMin: number;
  /** Green-excess at which pixel is fully keyed out. */
  spillMax: number;
  /**
   * Post-process edge feather radius in canvas pixels (0 = off).
   * Blurs alpha only after chroma key; RGB stays sharp.
   */
  edgeFeatherPx?: number;
};

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spillMin;
uniform float u_spillMax;

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  vec3 rgb = color.rgb;

  float rgbDist = distance(rgb, u_keyColor);
  float rgbKey = 1.0 - smoothstep(u_similarity, u_similarity + u_smoothness, rgbDist);

  float greenExcess = rgb.g - max(rgb.r, rgb.b);
  float spillKey = smoothstep(u_spillMin, u_spillMax, greenExcess);

  float bg = max(rgbKey, spillKey);
  float alpha = 1.0 - bg;

  if (alpha > 0.001) {
    float rbMax = max(rgb.r, rgb.b);
    rgb.g = min(rgb.g, rbMax);
  }

  gl_FragColor = vec4(rgb, alpha);
}
`;

/** Blur alpha only; keep center-pixel RGB sharp. */
const ALPHA_FEATHER_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform vec2 u_direction;
uniform float u_radius;

void main() {
  vec4 center = texture2D(u_texture, v_texCoord);
  vec2 step = u_texelSize * u_direction * u_radius;

  float alpha = center.a * 0.4;
  alpha += texture2D(u_texture, v_texCoord - step).a * 0.3;
  alpha += texture2D(u_texture, v_texCoord + step).a * 0.3;

  gl_FragColor = vec4(center.rgb, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? "unknown"}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  const vert = compileShader(gl, gl.VERTEX_SHADER, vs);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log ?? "unknown"}`);
  }
  return program;
}

const POSITIONS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
/** HTML video / canvas: flip Y so image is upright. */
const VIDEO_TEX_COORDS = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
/** FBO textures: opposite Y from video when sampled back. */
const FBO_TEX_COORDS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

type GlState = {
  program: WebGLProgram;
  posBuffer: WebGLBuffer;
  texBuffer: WebGLBuffer;
  texture: WebGLTexture;
  posLoc: number;
  texLoc: number;
};

type FeatherState = {
  program: WebGLProgram;
  posBuffer: WebGLBuffer;
  texBuffer: WebGLBuffer;
  posLoc: number;
  texLoc: number;
  texelSizeLoc: WebGLUniformLocation;
  directionLoc: WebGLUniformLocation;
  radiusLoc: WebGLUniformLocation;
};

type FramebufferTarget = {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
};

function setupQuad(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  texCoords: Float32Array,
): Omit<GlState, "program" | "texture"> {
  const posBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, POSITIONS, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const texBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

  return { posBuffer, texBuffer, posLoc, texLoc };
}

function bindQuad(gl: WebGLRenderingContext, state: {
  posBuffer: WebGLBuffer;
  texBuffer: WebGLBuffer;
  posLoc: number;
  texLoc: number;
}) {
  gl.bindBuffer(gl.ARRAY_BUFFER, state.posBuffer);
  gl.vertexAttribPointer(state.posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.texBuffer);
  gl.vertexAttribPointer(state.texLoc, 2, gl.FLOAT, false, 0, 0);
}

function createGlState(gl: WebGLRenderingContext, options: ChromaKeyOptions): GlState {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  gl.useProgram(program);
  const quad = setupQuad(gl, program, VIDEO_TEX_COORDS);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  gl.uniform3fv(gl.getUniformLocation(program, "u_keyColor"), options.keyColor);
  gl.uniform1f(gl.getUniformLocation(program, "u_similarity"), options.similarity);
  gl.uniform1f(gl.getUniformLocation(program, "u_smoothness"), options.smoothness);
  gl.uniform1f(gl.getUniformLocation(program, "u_spillMin"), options.spillMin);
  gl.uniform1f(gl.getUniformLocation(program, "u_spillMax"), options.spillMax);

  return { program, texture, ...quad };
}

function createFeatherState(gl: WebGLRenderingContext): FeatherState {
  const program = createProgram(gl, VERTEX_SHADER, ALPHA_FEATHER_FRAGMENT_SHADER);
  gl.useProgram(program);
  const quad = setupQuad(gl, program, FBO_TEX_COORDS);
  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  return {
    program,
    ...quad,
    texelSizeLoc: gl.getUniformLocation(program, "u_texelSize")!,
    directionLoc: gl.getUniformLocation(program, "u_direction")!,
    radiusLoc: gl.getUniformLocation(program, "u_radius")!,
  };
}

function createFramebufferTarget(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
): FramebufferTarget {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { fbo, texture, width, height };
}

function destroyGlState(gl: WebGLRenderingContext, state: GlState | null) {
  if (!state) return;
  gl.deleteTexture(state.texture);
  gl.deleteBuffer(state.posBuffer);
  gl.deleteBuffer(state.texBuffer);
  gl.deleteProgram(state.program);
}

function destroyFeatherState(gl: WebGLRenderingContext, state: FeatherState | null) {
  if (!state) return;
  gl.deleteBuffer(state.posBuffer);
  gl.deleteBuffer(state.texBuffer);
  gl.deleteProgram(state.program);
}

function destroyFramebufferTarget(gl: WebGLRenderingContext, target: FramebufferTarget | null) {
  if (!target) return;
  gl.deleteFramebuffer(target.fbo);
  gl.deleteTexture(target.texture);
}

export type ChromaKeyRenderer = {
  render: (video: HTMLVideoElement) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
};

export function createChromaKeyRenderer(
  canvas: HTMLCanvasElement,
  options: ChromaKeyOptions,
): ChromaKeyRenderer {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  if (!gl) throw new Error("WebGL not supported");

  const edgeFeatherPx = options.edgeFeatherPx ?? 0;
  const useFeather = edgeFeatherPx > 0;

  let state = createGlState(gl, options);
  let feather: FeatherState | null = useFeather ? createFeatherState(gl) : null;
  let keyedTarget: FramebufferTarget | null = null;
  let featherTarget: FramebufferTarget | null = null;
  let bufferWidth = 0;
  let bufferHeight = 0;

  const ensureFramebuffers = (w: number, h: number) => {
    if (!useFeather) return;
    if (keyedTarget && featherTarget && bufferWidth === w && bufferHeight === h) return;
    destroyFramebufferTarget(gl, keyedTarget);
    destroyFramebufferTarget(gl, featherTarget);
    keyedTarget = createFramebufferTarget(gl, w, h);
    featherTarget = createFramebufferTarget(gl, w, h);
    bufferWidth = w;
    bufferHeight = h;
  };

  const reinitAll = () => {
    destroyGlState(gl, state);
    destroyFeatherState(gl, feather);
    destroyFramebufferTarget(gl, keyedTarget);
    destroyFramebufferTarget(gl, featherTarget);
    keyedTarget = null;
    featherTarget = null;
    bufferWidth = 0;
    bufferHeight = 0;
    state = createGlState(gl, options);
    feather = useFeather ? createFeatherState(gl) : null;
  };

  const runFeatherPass = (
    source: WebGLTexture,
    target: FramebufferTarget | null,
    direction: [number, number],
  ) => {
    if (!feather) return;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.useProgram(feather.program);
    bindQuad(gl, feather);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    const w = target?.width ?? canvas.width;
    const h = target?.height ?? canvas.height;
    gl.uniform2f(feather.texelSizeLoc, 1 / w, 1 / h);
    gl.uniform2f(feather.directionLoc, direction[0], direction[1]);
    gl.uniform1f(feather.radiusLoc, edgeFeatherPx);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const resize = (width: number, height: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      reinitAll();
    }
    ensureFramebuffers(w, h);
    gl.viewport(0, 0, w, h);
  };

  const renderDirect = (video: HTMLVideoElement) => {
    const { program, posBuffer, texBuffer, texture, posLoc, texLoc } = state;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const renderWithFeather = (video: HTMLVideoElement) => {
    if (!feather || !keyedTarget || !featherTarget) return;

    // Pass 1: chroma key → FBO (video tex coords)
    gl.bindFramebuffer(gl.FRAMEBUFFER, keyedTarget.fbo);
    gl.viewport(0, 0, keyedTarget.width, keyedTarget.height);
    gl.useProgram(state.program);
    bindQuad(gl, state);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 2–3: alpha-only feather (RGB stays sharp)
    runFeatherPass(keyedTarget.texture, featherTarget, [1, 0]);
    runFeatherPass(featherTarget.texture, null, [0, 1]);
  };

  const render = (video: HTMLVideoElement) => {
    if (video.readyState < video.HAVE_CURRENT_DATA) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;
    if (useFeather) renderWithFeather(video);
    else renderDirect(video);
  };

  const destroy = () => {
    destroyGlState(gl, state);
    destroyFeatherState(gl, feather);
    destroyFramebufferTarget(gl, keyedTarget);
    destroyFramebufferTarget(gl, featherTarget);
  };

  return { render, resize, destroy };
}

export function hexToKeyColor(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return [r, g, b];
}
