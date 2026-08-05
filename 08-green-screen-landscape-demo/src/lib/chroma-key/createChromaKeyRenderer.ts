export type ChromaKeyOptions = {
  keyColor: [number, number, number];
  /** RGB distance threshold — closer than this is background (hard cut). */
  similarity: number;
  /** Min-filter radius in source pixels — shrinks hard matte inward (shader capped at 6). */
  erodeRadius: number;
  /** Box-blur radius on eroded mask — softens jagged edge (1 ≈ 3×3; shader capped at 2). */
  featherRadius: number;
};

const MAX_ERODE_RADIUS = 6;
const MAX_FEATHER_RADIUS = 2;

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

/**
 * Two-pass matte: erode → intermediate R channel, then feather that mask.
 * Radii are baked as loop bounds so GLSL ES 1.00 never branches on uniforms.
 */
function buildErodeFragmentShader(erodeRadius: number): string {
  const r = erodeRadius;
  const erodeBody =
    r < 1
      ? `return sampleMask(uv);`
      : `
  float m = 1.0;
  for (float y = -${r}.0; y <= ${r}.0; y += 1.0) {
    for (float x = -${r}.0; x <= ${r}.0; x += 1.0) {
      vec2 o = vec2(x * u_texelSize.x, y * u_texelSize.y);
      m = min(m, sampleMask(uv + o));
    }
  }
  return m;`;

  return `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_similarity;
uniform vec2 u_texelSize;

float sampleMask(vec2 uv) {
  vec3 c = texture2D(u_texture, uv).rgb;
  return step(u_similarity, distance(c, u_keyColor));
}

float erodeAt(vec2 uv) {
  ${erodeBody}
}

void main() {
  float mask = erodeAt(v_texCoord);
  gl_FragColor = vec4(mask, 0.0, 0.0, 1.0);
}
`;
}

function buildCompositeFragmentShader(featherRadius: number): string {
  const r = featherRadius;
  const featherBody =
    r < 1
      ? `return texture2D(u_mask, uv).r;`
      : `
  float sum = 0.0;
  float count = 0.0;
  for (float y = -${r}.0; y <= ${r}.0; y += 1.0) {
    for (float x = -${r}.0; x <= ${r}.0; x += 1.0) {
      vec2 o = vec2(x * u_texelSize.x, y * u_texelSize.y);
      sum += texture2D(u_mask, uv + o).r;
      count += 1.0;
    }
  }
  return sum / count;`;

  return `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_mask;
uniform vec2 u_texelSize;

float featheredMask(vec2 uv) {
  ${featherBody}
}

void main() {
  vec3 rgb = texture2D(u_texture, v_texCoord).rgb;
  float alpha = featheredMask(v_texCoord);
  gl_FragColor = vec4(rgb * alpha, alpha);
}
`;
}

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

function createTexture(gl: WebGLRenderingContext) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

/** Display pass: flips Y so the top-down video texture draws upright on the canvas. */
const DEFAULT_TEX_COORDS = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
/**
 * Offscreen pass: no flip, so the mask texture is stored in the same orientation
 * as the uploaded video frame and both can be sampled with the same coordinates.
 */
const FBO_TEX_COORDS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

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
    premultipliedAlpha: true,
    antialias: false,
  });
  if (!gl) throw new Error("WebGL not supported");

  const erodeRadius = Math.min(
    MAX_ERODE_RADIUS,
    Math.max(0, Math.round(options.erodeRadius)),
  );
  const featherRadius = Math.min(
    MAX_FEATHER_RADIUS,
    Math.max(0, Math.round(options.featherRadius)),
  );

  const erodeProgram = createProgram(
    gl,
    VERTEX_SHADER,
    buildErodeFragmentShader(erodeRadius),
  );
  const compositeProgram = createProgram(
    gl,
    VERTEX_SHADER,
    buildCompositeFragmentShader(featherRadius),
  );

  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const texBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, DEFAULT_TEX_COORDS, gl.STATIC_DRAW);

  const fboTexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fboTexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, FBO_TEX_COORDS, gl.STATIC_DRAW);

  const erodePosLoc = gl.getAttribLocation(erodeProgram, "a_position");
  const erodeTexLoc = gl.getAttribLocation(erodeProgram, "a_texCoord");
  const compositePosLoc = gl.getAttribLocation(compositeProgram, "a_position");
  const compositeTexLoc = gl.getAttribLocation(compositeProgram, "a_texCoord");

  const videoTexture = createTexture(gl);
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

  const maskTexture = createTexture(gl);
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

  const maskFramebuffer = gl.createFramebuffer();
  if (!maskFramebuffer) throw new Error("Failed to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, maskFramebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    maskTexture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const uErodeTexture = gl.getUniformLocation(erodeProgram, "u_texture");
  const uErodeKeyColor = gl.getUniformLocation(erodeProgram, "u_keyColor");
  const uErodeSimilarity = gl.getUniformLocation(erodeProgram, "u_similarity");
  const uErodeTexelSize = gl.getUniformLocation(erodeProgram, "u_texelSize");

  const uCompositeTexture = gl.getUniformLocation(compositeProgram, "u_texture");
  const uCompositeMask = gl.getUniformLocation(compositeProgram, "u_mask");
  const uCompositeTexelSize = gl.getUniformLocation(compositeProgram, "u_texelSize");

  gl.useProgram(erodeProgram);
  gl.uniform1i(uErodeTexture, 0);
  gl.uniform3fv(uErodeKeyColor, options.keyColor);
  gl.uniform1f(uErodeSimilarity, options.similarity);

  gl.useProgram(compositeProgram);
  gl.uniform1i(uCompositeTexture, 0);
  gl.uniform1i(uCompositeMask, 1);

  let maskWidth = 0;
  let maskHeight = 0;
  let warnedIncomplete = false;

  /**
   * Returns false when the mask target could not be allocated (e.g. a frame
   * larger than MAX_TEXTURE_SIZE, or a lost context). Callers skip the frame
   * rather than throwing, so the render loop can recover on a later frame.
   */
  const ensureMaskSize = (width: number, height: number) => {
    if (maskWidth === width && maskHeight === height) return true;

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, maskFramebuffer);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      if (!warnedIncomplete) {
        warnedIncomplete = true;
        console.error(
          `Chroma key: mask framebuffer incomplete at ${width}x${height} (0x${status.toString(16)}); skipping frames.`,
        );
      }
      return false;
    }

    maskWidth = width;
    maskHeight = height;
    warnedIncomplete = false;
    return true;
  };

  const bindQuad = (
    posLoc: number,
    texLoc: number,
    coordBuffer: WebGLBuffer | null,
  ) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, coordBuffer);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
  };

  const resize = (width: number, height: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    // Resizing the backing store clears the canvas but does not invalidate WebGL
    // programs/textures — only viewport needs updating. ChromaKeyVideo redraws
    // immediately after resize so the avatar does not flash blank.
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  };

  const render = (video: HTMLVideoElement) => {
    if (video.readyState < video.HAVE_CURRENT_DATA) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const texelW = 1 / vw;
    const texelH = 1 / vh;

    if (!ensureMaskSize(vw, vh)) return;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    // The mask is the render target below, so it must not stay bound to a unit.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Pass 1: hard key + erode → mask texture (source-pixel space, unflipped).
    gl.bindFramebuffer(gl.FRAMEBUFFER, maskFramebuffer);
    gl.viewport(0, 0, vw, vh);
    gl.useProgram(erodeProgram);
    bindQuad(erodePosLoc, erodeTexLoc, fboTexBuffer);
    gl.uniform2f(uErodeTexelSize, texelW, texelH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 2: feather eroded mask and composite to canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProgram);
    bindQuad(compositePosLoc, compositeTexLoc, texBuffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.uniform2f(uCompositeTexelSize, texelW, texelH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const destroy = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(maskFramebuffer);
    gl.deleteTexture(videoTexture);
    gl.deleteTexture(maskTexture);
    gl.deleteBuffer(posBuffer);
    gl.deleteBuffer(texBuffer);
    gl.deleteBuffer(fboTexBuffer);
    gl.deleteProgram(erodeProgram);
    gl.deleteProgram(compositeProgram);
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
