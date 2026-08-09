/* Displacer Pro + Pixel Sort melt transition — shader source.
 *
 * Copied verbatim from the reference implementation in melt-transition/index.html.
 * The displacement map is the incoming image itself, which is what makes the
 * tearing belong to the picture arriving rather than to a noise field, and the
 * displacement sign flips at the cut so the motion runs downward throughout.
 * Do not reformat: keep this in step with the reference if that ever changes.
 */

export const MELT_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const MELT_FRAG = `#version 300 es
precision highp float;

in  vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexA;      // 正在离场的图
uniform sampler2D uTexB;      // 进场的图，同时兼任 Displacer 的 map layer
uniform vec2  uRes;           // 画布像素
uniform vec2  uSizeA;         // A 的原始尺寸(用于 cover 适配)
uniform vec2  uSizeB;
uniform float uProgress;      // 0..1
uniform float uDir;           // +1 向下, -1 向上回退

uniform float uDisplace;      // Displacer Pro：最大竖向置换量（屏高占比）
uniform float uDispBias;      // map 亮度中点。0 = 全画面严格单向；
                              // 调大以后比它暗的像素会往反方向跑，运动就不再单纯了
uniform float uSortSpan;      // Pixel Sort：搜索窗口高度（屏高占比）
uniform float uThreshold;     // 阴影阈值：只有比它暗的像素参与排序
uniform float uSortMix;       // 排序强度
uniform float uInvertAt;      // invert sorting 启动时刻
uniform float uCA;            // 色散
uniform float uSwitch;        // 切到 B 的时刻
uniform float uWash;          // 峰值褪色
uniform float uTime;

const float PI = 3.14159265359;
const int   NS = 49;          // 排序采样数，奇数 → 中心样本正对当前像素

// 屏幕空间 <-> 流动空间（对合变换：向上回退时整体翻转 y）
vec2 flip(vec2 uv){
  return uDir > 0.0 ? uv : vec2(uv.x, 1.0 - uv.y);
}

// object-fit: cover
vec2 coverUv(vec2 uv, vec2 img){
  float ra = uRes.x / max(uRes.y, 1.0);
  float ri = img.x / max(img.y, 1.0);
  vec2 s = ra > ri ? vec2(1.0, ri / ra) : vec2(ra / ri, 1.0);
  return (uv - 0.5) * s + 0.5;
}

float lumaOf(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* ── Displacer Pro ──────────────────────────────────────────────
   map layer = 第二张图，transform 只开竖向。
   置换量由 map 的亮度决定 —— 所以撕裂的形状"属于"即将进来的那张图，
   这也是它和随机噪声融解最不一样的地方。
   dAmt 带符号：+ 让画面继续往下走，- 让画面从上方压下来落位。 */
float mapLum(vec2 s){
  return lumaOf(texture(uTexB, clamp(coverUv(flip(s), uSizeB), 0.0, 1.0)).rgb);
}

float dispY(vec2 s, float dAmt){
  return s.y + dAmt * (mapLum(s) - uDispBias);
}

// 置换之后的画面。硬切（useB 只有 0 或 1），切点被最乱的一帧盖住。
vec3 srcAt(vec2 s, float dAmt, float useB){
  vec2 q = vec2(s.x, dispY(s, dAmt));
  if (useB < 0.5) return texture(uTexA, clamp(coverUv(flip(q), uSizeA), 0.0, 1.0)).rgb;
  return              texture(uTexB, clamp(coverUv(flip(q), uSizeB), 0.0, 1.0)).rgb;
}

void main(){
  vec2  uv   = flip(vUv);
  float p    = clamp(uProgress, 0.0, 1.0);
  float useB = step(uSwitch, p);
  float inv  = step(uInvertAt, p);            // 过半启动 invert sorting

  /* 运动始终朝下 —— 关键在于置换量的符号在切点翻转：
       A 段  dAmt: 0 → +D    A 被越拉越往下，走出画面
       B 段  dAmt: -D → 0    B 从上方压着落位，仍然是往下走
     如果两段同号（只是幅度 0→1→0），B 段就会原路缩回去，
     看起来就成了"先向下又向上"。 */
  float phase = (useB < 0.5) ? p / max(uSwitch, 1e-4)
                             : (p - uSwitch) / max(1.0 - uSwitch, 1e-4);
  phase = clamp(phase, 0.0, 1.0);

  float amp  = pow((useB < 0.5) ? phase : 1.0 - phase, 0.6);   // 峰值落在切点
  float dAmt = uDisplace * amp * ((useB < 0.5) ? 1.0 : -1.0);
  float ca   = uCA * amp;

  // 置换后的原始像素（同时是阴影判定的依据）
  vec3 base = srcAt(uv, dAmt, useB);

  vec3 col;
  col.r = srcAt(vec2(uv.x, uv.y + ca), dAmt, useB).r;
  col.g = base.g;
  col.b = srcAt(vec2(uv.x, uv.y - ca), dAmt, useB).b;

  /* ── Pixel Sort（竖向 / 阴影 / 可 invert）────────────────────
     span = 该列上包含当前像素、且亮度都低于阈值的连续暗段。
     段内像素按亮度重排：输出位置 t 对应第 k 名 —— 于是暗段被拉成
     平滑的竖向渐变带。这与"把某一行的颜色拖住"完全不同，
     后者出来的是等色硬条，前者才是参考里那种渐变丝。 */
  float sortAmt = uSortMix * amp;

  if (sortAmt > 0.001 && lumaOf(base) < uThreshold){
    float dy   = uSortSpan / float(NS - 1);
    float yTop = uv.y + uSortSpan * 0.5;

    float lum[NS];
    for (int i = 0; i < NS; i++){
      lum[i] = lumaOf(srcAt(vec2(uv.x, yTop - float(i) * dy), dAmt, useB));
    }

    // 从中心往两头找暗段边界
    int c = (NS - 1) / 2;
    int lo = c, hi = c;
    for (int i = c; i >= 0; i--){ if (lum[i] >= uThreshold) break; lo = i; }
    for (int i = c; i < NS; i++){ if (lum[i] >= uThreshold) break; hi = i; }

    int n = hi - lo + 1;
    if (n > 1){
      float yLo = yTop - float(hi) * dy;      // 段底
      float yHi = yTop - float(lo) * dy;      // 段顶
      float t   = clamp((uv.y - yLo) / max(yHi - yLo, 1e-5), 0.0, 1.0);
      if (inv > 0.5) t = 1.0 - t;             // invert sorting

      float kf = t * float(n - 1);
      int   k0 = int(floor(kf));
      int   k1 = min(k0 + 1, n - 1);
      float kt = kf - float(k0);

      // 选出第 k0 / k1 名：用下标破平局，保证名次是 0..n-1 的一个排列
      int i0 = lo, i1 = lo;
      for (int i = lo; i <= hi; i++){
        int r = 0;
        for (int j = lo; j <= hi; j++){
          if (lum[j] < lum[i] || (lum[j] == lum[i] && j < i)) r++;
        }
        if (r == k0) i0 = i;
        if (r == k1) i1 = i;
      }

      float y0 = yTop - float(i0) * dy;
      float y1 = yTop - float(i1) * dy;

      vec3 sorted;
      sorted.r = mix(srcAt(vec2(uv.x, y0 + ca), dAmt, useB),
                     srcAt(vec2(uv.x, y1 + ca), dAmt, useB), kt).r;
      sorted.g = mix(srcAt(vec2(uv.x, y0), dAmt, useB),
                     srcAt(vec2(uv.x, y1), dAmt, useB), kt).g;
      sorted.b = mix(srcAt(vec2(uv.x, y0 - ca), dAmt, useB),
                     srcAt(vec2(uv.x, y1 - ca), dAmt, useB), kt).b;

      col = mix(col, sorted, sortAmt);
    }
  }

  // 峰值轻微褪色发灰
  float lum = lumaOf(col);
  col = mix(col, vec3(lum), uWash * amp * 0.5) + uWash * amp * 0.08;

  // 抖动去色带
  col += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.0035;

  fragColor = vec4(col, 1.0);
}`
