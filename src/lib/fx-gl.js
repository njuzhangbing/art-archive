/**
 * A small stackable image pipeline on WebGL2.
 *
 * Every effect is one fragment shader. The chain runs into two framebuffers
 * turn and turn about, so a stack of any depth costs two textures rather than
 * one per stage, and the original stays bound throughout for the effects that
 * need to composite against it.
 *
 * Everything happens on the reader's own machine. Nothing here is uploaded,
 * nothing is processed on a server, and the archive pays nothing for a picture
 * being worked on — which is also why the export is done at the image's real
 * size rather than the size of the preview.
 */

const VERT = `#version 300 es
void main() {
  // One triangle covering the clip square: no vertex buffer, no attributes.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/** Prepended to every effect, so a shader is only its own idea. */
export const PREAMBLE = `#version 300 es
precision highp float;
uniform sampler2D uTex;    // what the previous stage produced
uniform sampler2D uSrc;    // the untouched image
uniform vec2  uRes;        // pixels
uniform float uPass;       // 0-based, for multi-pass effects
uniform float uP0, uP1, uP2, uP3;
out vec4 fragColour;

vec2 uv() { return gl_FragCoord.xy / uRes; }
vec2 px()  { return 1.0 / uRes; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`

/** The largest edge we will hand the GPU; beyond this the tool downscales. */
export const MAX_EDGE = 4096

export function createStage() {
  const canvas = document.createElement("canvas")
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })
  if (!gl) return null

  const cache = new Map()
  let srcTex = null, W = 0, H = 0
  let fbo = [null, null], tex = [null, null]

  function compile(src) {
    if (cache.has(src)) return cache.get(src)
    const vs = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vs, VERT); gl.compileShader(vs)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fs, PREAMBLE + src); gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error("fx shader:", gl.getShaderInfoLog(fs))
      gl.deleteShader(vs); gl.deleteShader(fs)
      cache.set(src, null)
      return null
    }
    const p = gl.createProgram()
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p)
    gl.deleteShader(vs); gl.deleteShader(fs)
    const u = {}
    for (const n of ["uTex", "uSrc", "uRes", "uPass", "uP0", "uP1", "uP2", "uP3"]) {
      u[n] = gl.getUniformLocation(p, n)
    }
    const entry = { p, u }
    cache.set(src, entry)
    return entry
  }

  function target(w, h) {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
                          [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
      gl.texParameteri(gl.TEXTURE_2D, k, v)
    }
    const f = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, f)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
    return [f, t]
  }

  /** Point the stage at an image. Sizes everything to it. */
  function load(img) {
    W = Math.min(img.naturalWidth || img.width, MAX_EDGE)
    H = Math.round((img.naturalHeight || img.height) * (W / (img.naturalWidth || img.width)))
    if (H > MAX_EDGE) { W = Math.round(W * (MAX_EDGE / H)); H = MAX_EDGE }
    canvas.width = W; canvas.height = H

    if (srcTex) gl.deleteTexture(srcTex)
    srcTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, srcTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    for (const f of fbo) if (f) gl.deleteFramebuffer(f)
    for (const t of tex) if (t) gl.deleteTexture(t)
    const a = target(W, H), b = target(W, H)
    fbo = [a[0], b[0]]; tex = [a[1], b[1]]
    return { w: W, h: H }
  }

  /**
   * Run a stack and leave the result on the canvas.
   * @param {Array<{frag: string, passes?: number, values: number[]}>} stack
   */
  function render(stack) {
    if (!srcTex) return
    gl.viewport(0, 0, W, H)
    gl.disable(gl.BLEND)

    // Every enabled pass of every effect, flattened.
    const jobs = []
    for (const step of stack) {
      const n = Math.max(1, step.passes || 1)
      for (let i = 0; i < n; i++) jobs.push({ step, pass: i })
    }

    let read = srcTex
    let slot = 0
    for (let j = 0; j < jobs.length; j++) {
      const { step, pass } = jobs[j]
      const prog = compile(step.frag)
      if (!prog) continue
      const last = j === jobs.length - 1
      gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : fbo[slot])
      gl.useProgram(prog.p)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, read)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, srcTex)
      gl.uniform1i(prog.u.uTex, 0)
      gl.uniform1i(prog.u.uSrc, 1)
      gl.uniform2f(prog.u.uRes, W, H)
      gl.uniform1f(prog.u.uPass, pass)
      const v = step.values || []
      gl.uniform1f(prog.u.uP0, v[0] ?? 0)
      gl.uniform1f(prog.u.uP1, v[1] ?? 0)
      gl.uniform1f(prog.u.uP2, v[2] ?? 0)
      gl.uniform1f(prog.u.uP3, v[3] ?? 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!last) { read = tex[slot]; slot ^= 1 }
    }

    // An empty stack still has to show the picture.
    if (!jobs.length) {
      const prog = compile("void main() { fragColour = texture(uSrc, uv()); }")
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(prog.p)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, srcTex)
      gl.uniform1i(prog.u.uSrc, 1)
      gl.uniform2f(prog.u.uRes, W, H)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
  }

  return {
    canvas,
    load,
    render,
    get size() { return { w: W, h: H } },
    destroy() {
      for (const f of fbo) if (f) gl.deleteFramebuffer(f)
      for (const t of tex) if (t) gl.deleteTexture(t)
      if (srcTex) gl.deleteTexture(srcTex)
      for (const e of cache.values()) if (e) gl.deleteProgram(e.p)
      cache.clear()
    }
  }
}
