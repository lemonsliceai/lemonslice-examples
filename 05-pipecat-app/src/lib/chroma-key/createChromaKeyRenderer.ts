export type ChromaKeyOptions = {
  keyColor: [number, number, number];
  /** RGB distance below which pixel is treated as background. */
  similarity: number;
  smoothness: number;
  /** Green-excess (g - max(r,b)) above spillMin starts getting keyed out. */
  spillMin: number;
  /** Green-excess at which pixel is fully keyed out. */
  spillMax: number;
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

  // How "green-screen-like" is this pixel (1 = background, 0 = foreground)
  float rgbDist = distance(rgb, u_keyColor);
  float rgbKey = 1.0 - smoothstep(u_similarity, u_similarity + u_smoothness, rgbDist);

  float greenExcess = rgb.g - max(rgb.r, rgb.b);
  float spillKey = smoothstep(u_spillMin, u_spillMax, greenExcess);

  float bg = max(rgbKey, spillKey);
  float alpha = 1.0 - bg;

  // Hard despill on any remaining foreground
  if (alpha > 0.001) {
    float rbMax = max(rgb.r, rgb.b);
    rgb.g = min(rgb.g, rbMax);
  }

  gl_FragColor = vec4(rgb, alpha);
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
    premultipliedAlpha: false,
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
  const uSmoothness = gl.getUniformLocation(program, "u_smoothness");
  const uSpillMin = gl.getUniformLocation(program, "u_spillMin");
  const uSpillMax = gl.getUniformLocation(program, "u_spillMax");

  gl.uniform1i(uTexture, 0);
  gl.uniform3fv(uKeyColor, options.keyColor);
  gl.uniform1f(uSimilarity, options.similarity);
  gl.uniform1f(uSmoothness, options.smoothness);
  gl.uniform1f(uSpillMin, options.spillMin);
  gl.uniform1f(uSpillMax, options.spillMax);

  const resize = (width: number, height: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
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
