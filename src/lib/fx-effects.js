/**
 * The workbench's effects.
 *
 * Each is one fragment shader against the preamble in fx-gl.js, plus the
 * handful of numbers it takes. Kept as data so the view is only a list and a
 * few sliders, and so an effect can be added here without touching anything
 * else.
 *
 * The set is deliberately the ones with a strong hand: the archive's own pixel
 * sort, the printer's screens (Bayer, halftone), the lens faults compositors
 * reach for (chromatic aberration, bloom, grain), and the two destructive ones
 * (displacement, block glitch). Nothing here is a colour-correction slider —
 * that is what an image editor is for.
 */

const BAYER = `
const int BAYER8[64] = int[64](
   0,32, 8,40, 2,34,10,42,  48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38,  60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41,  51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37,  63,31,55,23,61,29,53,21);
float bayer(vec2 c) {
  int x = int(mod(c.x, 8.0)), y = int(mod(c.y, 8.0));
  return float(BAYER8[y * 8 + x]) / 64.0;
}`

export const EFFECTS = [
  {
    id: "sort", zh: "像素排序", en: "PIXEL SORT",
    params: [
      { key: "阈值", en: "THRESHOLD", min: 0, max: 1, step: 0.01, value: 0.55 },
      { key: "长度", en: "SPAN", min: 0.005, max: 0.35, step: 0.005, value: 0.09 },
      { key: "横向", en: "HORIZONTAL", min: 0, max: 1, step: 1, value: 0 }
    ],
    frag: `
void main() {
  vec2 u = uv(), p = px();
  vec4 c = texture(uTex, u);
  if (luma(c.rgb) < uP0) { fragColour = c; return; }
  bool horiz = uP2 > 0.5;
  vec2 dir = horiz ? vec2(p.x, 0.0) : vec2(0.0, p.y);
  float reach = uP1 * (horiz ? uRes.x : uRes.y);
  int N = int(clamp(reach, 1.0, 160.0));
  vec4 best = c;
  float bl = luma(c.rgb);
  for (int i = 1; i < 160; i++) {
    if (i >= N) break;
    vec4 t = texture(uTex, u - dir * float(i));
    float tl = luma(t.rgb);
    if (tl < uP0) break;
    if (tl > bl) { bl = tl; best = t; }
  }
  fragColour = best;
}`
  },

  {
    id: "outline", zh: "描边", en: "OUTLINE",
    params: [
      { key: "粗细", en: "WEIGHT", min: 0.5, max: 6, step: 0.1, value: 1.4 },
      { key: "阈值", en: "THRESHOLD", min: 0, max: 1, step: 0.01, value: 0.18 },
      { key: "只留线", en: "LINES ONLY", min: 0, max: 1, step: 1, value: 0 },
      { key: "反相", en: "INVERT", min: 0, max: 1, step: 1, value: 0 }
    ],
    frag: `
float lum(vec2 u) { return luma(texture(uTex, u).rgb); }
void main() {
  vec2 u = uv(), p = px() * uP0;
  float tl = lum(u + vec2(-p.x,  p.y)), t = lum(u + vec2(0.0,  p.y)), tr = lum(u + p);
  float ml = lum(u + vec2(-p.x, 0.0)),                                mr = lum(u + vec2(p.x, 0.0));
  float bl = lum(u - p),                b = lum(u + vec2(0.0, -p.y)), br = lum(u + vec2(p.x, -p.y));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * b  + br) - (tl + 2.0 * t  + tr);
  float e = smoothstep(uP1, uP1 + 0.12, length(vec2(gx, gy)));
  vec3 ink = uP3 > 0.5 ? vec3(1.0) : vec3(0.0);
  vec3 paper = uP3 > 0.5 ? vec3(0.0) : vec3(1.0);
  vec3 base = uP2 > 0.5 ? paper : texture(uTex, u).rgb;
  fragColour = vec4(mix(base, ink, e), 1.0);
}`
  },

  {
    id: "bayer", zh: "有序抖动", en: "BAYER DITHER",
    params: [
      { key: "层级", en: "LEVELS", min: 2, max: 16, step: 1, value: 2 },
      { key: "网点大小", en: "CELL", min: 1, max: 8, step: 1, value: 1 },
      { key: "彩色", en: "COLOUR", min: 0, max: 1, step: 1, value: 0 }
    ],
    frag: BAYER + `
void main() {
  vec3 c = texture(uTex, uv()).rgb;
  float n = max(2.0, floor(uP0));
  float th = bayer(gl_FragCoord.xy / max(1.0, floor(uP1))) - 0.5;
  if (uP2 > 0.5) {
    vec3 q = floor(c * (n - 1.0) + th + 0.5) / (n - 1.0);
    fragColour = vec4(clamp(q, 0.0, 1.0), 1.0);
  } else {
    float g = luma(c);
    float q = clamp(floor(g * (n - 1.0) + th + 0.5) / (n - 1.0), 0.0, 1.0);
    fragColour = vec4(vec3(q), 1.0);
  }
}`
  },

  {
    id: "halftone", zh: "彩色半调", en: "COLOR HALFTONE",
    params: [
      { key: "网点密度", en: "FREQUENCY", min: 20, max: 400, step: 5, value: 140 },
      { key: "锐度", en: "SHARPNESS", min: 0.02, max: 0.5, step: 0.01, value: 0.12 },
      { key: "底色", en: "ON WHITE", min: 0, max: 1, step: 1, value: 1 }
    ],
    frag: `
float screen(vec2 u, float ang, float f, float v) {
  float s = sin(ang), c = cos(ang);
  vec2 q = vec2(u.x * c - u.y * s, u.x * s + u.y * c) * f;
  vec2 d = fract(q) - 0.5;
  float r = sqrt(max(0.0, 1.0 - v)) * 0.72;
  return 1.0 - smoothstep(r - uP1, r + uP1, length(d));
}
void main() {
  vec2 u = uv() * vec2(uRes.x / uRes.y, 1.0);
  vec3 c = texture(uTex, uv()).rgb;
  float f = uP0;
  float r = screen(u, 0.2618, f, c.r);
  float g = screen(u, 1.3090, f, c.g);
  float b = screen(u, 1.5708, f, c.b);
  vec3 dots = vec3(r, g, b);
  fragColour = vec4(uP2 > 0.5 ? dots : 1.0 - dots, 1.0);
}`
  },

  {
    id: "chroma", zh: "色差", en: "CHROMATIC",
    params: [
      { key: "强度", en: "AMOUNT", min: 0, max: 0.06, step: 0.001, value: 0.008 },
      { key: "径向", en: "RADIAL", min: 0, max: 1, step: 1, value: 1 },
      { key: "角度", en: "ANGLE", min: 0, max: 6.28, step: 0.05, value: 0 }
    ],
    frag: `
void main() {
  vec2 u = uv();
  vec2 dir = uP1 > 0.5 ? (u - 0.5) : vec2(cos(uP2), sin(uP2)) * 0.5;
  vec2 o = dir * uP0;
  fragColour = vec4(
    texture(uTex, u + o).r,
    texture(uTex, u).g,
    texture(uTex, u - o).b,
    1.0);
}`
  },

  {
    id: "bloom", zh: "辉光", en: "BLOOM",
    passes: 2,
    params: [
      { key: "阈值", en: "THRESHOLD", min: 0, max: 1, step: 0.01, value: 0.62 },
      { key: "半径", en: "RADIUS", min: 1, max: 24, step: 0.5, value: 7 },
      { key: "强度", en: "INTENSITY", min: 0, max: 2.5, step: 0.05, value: 0.9 }
    ],
    frag: `
void main() {
  vec2 u = uv(), p = px() * uP1;
  vec2 dir = uPass < 0.5 ? vec2(p.x, 0.0) : vec2(0.0, p.y);
  float w[7] = float[7](0.1964, 0.1747, 0.1210, 0.0656, 0.0278, 0.0092, 0.0024);
  vec3 sum = vec3(0.0);
  for (int i = -6; i <= 6; i++) {
    vec3 s = texture(uTex, u + dir * float(i)).rgb;
    // The bright pass happens on the way in, so the blur only ever carries light.
    if (uPass < 0.5) s = max(vec3(0.0), s - uP0) / max(0.0001, 1.0 - uP0);
    sum += s * w[abs(i)];
  }
  if (uPass < 0.5) { fragColour = vec4(sum, 1.0); return; }
  fragColour = vec4(texture(uSrc, u).rgb + sum * uP2, 1.0);
}`
  },

  {
    id: "scan", zh: "扫描线", en: "SCANLINES",
    params: [
      { key: "线距", en: "PITCH", min: 1, max: 8, step: 0.5, value: 3 },
      { key: "线深", en: "DEPTH", min: 0, max: 1, step: 0.02, value: 0.36 },
      { key: "荫罩", en: "MASK", min: 0, max: 1, step: 0.02, value: 0.28 },
      { key: "暗角", en: "VIGNETTE", min: 0, max: 1, step: 0.02, value: 0.4 }
    ],
    frag: `
void main() {
  vec2 u = uv();
  vec3 c = texture(uTex, u).rgb;
  float line = 0.5 + 0.5 * cos(gl_FragCoord.y * 6.2831853 / max(1.0, uP0));
  c *= 1.0 - uP1 * line;
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 0.7, 0.7) : (m < 2.0 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0));
  c *= mix(vec3(1.0), mask, uP2);
  vec2 d = (u - 0.5) * vec2(1.1, 1.25);
  c *= 1.0 - uP3 * smoothstep(0.28, 0.78, dot(d, d));
  fragColour = vec4(c, 1.0);
}`
  },

  {
    id: "poster", zh: "色调分离", en: "POSTERIZE",
    params: [
      { key: "层级", en: "LEVELS", min: 2, max: 24, step: 1, value: 5 },
      { key: "饱和", en: "SATURATION", min: 0, max: 2, step: 0.05, value: 1 }
    ],
    frag: `
void main() {
  vec3 c = texture(uTex, uv()).rgb;
  c = mix(vec3(luma(c)), c, uP1);
  float n = max(2.0, floor(uP0));
  fragColour = vec4(floor(c * n) / (n - 1.0), 1.0);
}`
  },

  {
    id: "grain", zh: "颗粒", en: "GRAIN",
    params: [
      { key: "强度", en: "AMOUNT", min: 0, max: 0.5, step: 0.005, value: 0.09 },
      { key: "粗细", en: "SIZE", min: 1, max: 6, step: 0.5, value: 1 },
      { key: "彩色", en: "COLOUR", min: 0, max: 1, step: 1, value: 0 }
    ],
    frag: `
void main() {
  vec2 u = uv();
  vec3 c = texture(uTex, u).rgb;
  vec2 g = floor(gl_FragCoord.xy / max(1.0, uP1));
  vec3 n = uP2 > 0.5
    ? vec3(hash(g), hash(g + 17.0), hash(g + 53.0)) - 0.5
    : vec3(hash(g) - 0.5);
  // Silver sits in the shadows: a highlight has less of it to show.
  float shade = 1.0 - luma(c) * 0.7;
  fragColour = vec4(clamp(c + n * uP0 * shade * 2.0, 0.0, 1.0), 1.0);
}`
  },

  {
    id: "displace", zh: "置换", en: "DISPLACE",
    params: [
      { key: "位移", en: "AMOUNT", min: 0, max: 0.2, step: 0.002, value: 0.03 },
      { key: "中点", en: "BIAS", min: -0.5, max: 0.5, step: 0.01, value: 0 },
      { key: "取样距离", en: "PROBE", min: 1, max: 40, step: 1, value: 8 }
    ],
    frag: `
void main() {
  vec2 u = uv(), p = px() * uP2;
  float l = luma(texture(uSrc, u).rgb) - 0.5 + uP1;
  float lx = luma(texture(uSrc, u + vec2(p.x, 0.0)).rgb) - luma(texture(uSrc, u - vec2(p.x, 0.0)).rgb);
  float ly = luma(texture(uSrc, u + vec2(0.0, p.y)).rgb) - luma(texture(uSrc, u - vec2(0.0, p.y)).rgb);
  fragColour = texture(uTex, u + vec2(lx, ly) * uP0 + vec2(0.0, l * uP0 * 0.35));
}`
  },

  {
    id: "glitch", zh: "块位移", en: "BLOCK GLITCH",
    params: [
      { key: "块高", en: "BAND", min: 2, max: 120, step: 1, value: 22 },
      { key: "位移", en: "SHIFT", min: 0, max: 0.25, step: 0.002, value: 0.05 },
      { key: "密度", en: "DENSITY", min: 0, max: 1, step: 0.02, value: 0.3 },
      { key: "通道错位", en: "SPLIT", min: 0, max: 1, step: 0.02, value: 0.4 }
    ],
    frag: `
void main() {
  vec2 u = uv();
  float band = floor(gl_FragCoord.y / max(2.0, uP0));
  float r = hash(vec2(band, 7.31));
  float on = step(1.0 - uP2, r);
  float off = (hash(vec2(band, 19.7)) - 0.5) * 2.0 * uP1 * on;
  vec2 s = u + vec2(off, 0.0);
  float sp = uP3 * uP1 * on;
  fragColour = vec4(
    texture(uTex, s + vec2(sp, 0.0)).r,
    texture(uTex, s).g,
    texture(uTex, s - vec2(sp, 0.0)).b,
    1.0);
}`
  }
]

/** A fresh, independent copy of an effect's numbers. */
export function freshStep(id) {
  const fx = EFFECTS.find((e) => e.id === id)
  if (!fx) return null
  return { id: fx.id, frag: fx.frag, passes: fx.passes || 1, values: fx.params.map((p) => p.value), on: true }
}
