export type ChromaKeyOptions = {
  keyColor: [number, number, number];
  /** RGB distance threshold — closer than this is background (hard cut). */
  similarity: number;
  /**
   * Spill suppression start as a fraction of key-color magnitude from neutral gray.
   * Higher = only strong key-tint is desaturated.
   */
  spillMin: number;
  /** Spill suppression full strength as a fraction of key-color magnitude. */
  spillMax: number;
  /** Min-filter radius in source pixels — shrinks hard matte inward (shader capped at 6). */
  erodeRadius: number;
  /** Box-blur radius on eroded mask — softens jagged edge (1 ≈ 3×3; shader capped at 2). */
  featherRadius: number;
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
uniform float u_spillMin;
uniform float u_spillMax;
uniform float u_erodeRadius;
uniform float u_featherRadius;
uniform vec2 u_texelSize;

float sampleMask(vec2 uv) {
  vec3 c = texture2D(u_texture, uv).rgb;
  return step(u_similarity, distance(c, u_keyColor));
}

float erodeAt(vec2 uv, float r) {
  if (r < 1.0) {
    return sampleMask(uv);
  }

  float m = 1.0;
  for (float y = -6.0; y <= 6.0; y += 1.0) {
    if (abs(y) > r) continue;
    for (float x = -6.0; x <= 6.0; x += 1.0) {
      if (abs(x) > r) continue;
      vec2 o = vec2(x * u_texelSize.x, y * u_texelSize.y);
      m = min(m, sampleMask(uv + o));
    }
  }
  return m;
}

float matteAlpha(vec2 uv) {
  float rE = floor(u_erodeRadius + 0.5);
  float rF = floor(u_featherRadius + 0.5);

  if (rF < 1.0) {
    return erodeAt(uv, rE);
  }

  // Feather the eroded mask (not the RGB key) — soft edge without a key-color halo band.
  float sum = 0.0;
  float count = 0.0;
  for (float y = -2.0; y <= 2.0; y += 1.0) {
    if (abs(y) > rF) continue;
    for (float x = -2.0; x <= 2.0; x += 1.0) {
      if (abs(x) > rF) continue;
      vec2 o = vec2(x * u_texelSize.x, y * u_texelSize.y);
      sum += erodeAt(uv + o, rE);
      count += 1.0;
    }
  }
  return sum / count;
}

void main() {
  vec3 rgb = texture2D(u_texture, v_texCoord).rgb;
  float alpha = matteAlpha(v_texCoord);

  vec3 neutral = vec3(0.3333333);
  vec3 keyDir = u_keyColor - neutral;
  float keyMag = length(keyDir);
  if (keyMag > 0.001) {
    keyDir /= keyMag;
  } else {
    keyDir = vec3(0.0, 1.0, 0.0);
  }

  float pixProj = dot(rgb - neutral, keyDir);
  float spill = max(0.0, pixProj - u_spillMin * keyMag);
  spill = min(spill, max(0.0, (u_spillMax - u_spillMin) * keyMag));

  if (alpha > 0.5) {
    rgb -= keyDir * spill * 0.35;
    rgb = clamp(rgb, 0.0, 1.0);
  }

  gl_FragColor = vec4(rgb * alpha, alpha);
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

const DEFAULT_TEX_COORDS = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

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

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  gl.useProgram(program);

  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const texBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, DEFAULT_TEX_COORDS, gl.STATIC_DRAW);
  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
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

  const uTexture = gl.getUniformLocation(program, "u_texture");
  const uKeyColor = gl.getUniformLocation(program, "u_keyColor");
  const uSimilarity = gl.getUniformLocation(program, "u_similarity");
  const uSpillMin = gl.getUniformLocation(program, "u_spillMin");
  const uSpillMax = gl.getUniformLocation(program, "u_spillMax");
  const uErodeRadius = gl.getUniformLocation(program, "u_erodeRadius");
  const uFeatherRadius = gl.getUniformLocation(program, "u_featherRadius");
  const uTexelSize = gl.getUniformLocation(program, "u_texelSize");

  gl.uniform1i(uTexture, 0);
  gl.uniform3fv(uKeyColor, options.keyColor);
  gl.uniform1f(uSimilarity, options.similarity);
  gl.uniform1f(uSpillMin, options.spillMin);
  gl.uniform1f(uSpillMax, options.spillMax);
  gl.uniform1f(uErodeRadius, options.erodeRadius);
  gl.uniform1f(uFeatherRadius, options.featherRadius);

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

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform2f(uTexelSize, 1 / video.videoWidth, 1 / video.videoHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const destroy = () => {
    gl.deleteTexture(texture);
    gl.deleteBuffer(posBuffer);
    gl.deleteBuffer(texBuffer);
    gl.deleteProgram(program);
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
