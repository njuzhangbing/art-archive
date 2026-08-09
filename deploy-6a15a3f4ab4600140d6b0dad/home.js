/* ==========================================================================
   内亚古文字字词检索 — landing page
   ========================================================================== */
'use strict';

/* Each script's own name for itself is taken from the corpora this site
   already ships, not typed from memory:
     𐱅𐰇𐰼𐰚   oldturkic.js  Türk        「突厥人」
     𐽰𐽳𐽶𐽲𐽳𐽾  olduyghur.js  Uyġur
     ᠮᠣᠩᠭᠣᠯ   mongolian.js  mongɣol     「蒙古人」  attested traditional script
     U+E16C U+E08F  khitan.js 词条      「契丹」
     𗼇 U+17F07「番」+ 𗧻 U+179FB「番、党項人」    data.js
   Sogdian has no attested script form for its own name in the glossary, so it
   keeps the transcription the source uses. */
const SCRIPTS = [
  { key: 'sogdian',   name: '粟特语',   self: 'swγδyʾw',
    from: 350,  to: 1100, era: '4—11 世纪',
    place: '撒马尔罕　泽拉夫尚河谷',
    note: '粟特商队的语言，沿绿洲一线从泽拉夫尚河谷通到敦煌。语料出自 TITUS，释义出自维基词典的德、法、英、俄文条目。' },

  { key: 'oldturkic', name: '古突厥语', self: '\u{10C45}\u{10C07}\u{10C3C}\u{10C1A}',
    from: 730,  to: 1000, era: '8—10 世纪',
    place: '鄂尔浑河谷　和硕柴达木',
    note: '阙特勤碑与毗伽可汗碑立于此。突厥语最早的成篇文献，字母刻在石上，行款自右而左。' },

  { key: 'olduyghur', name: '回鹘文',   self: '\u{10F70}\u{10F73}\u{10F76}\u{10F72}\u{10F73}\u{10F7E}',
    from: 850,  to: 1400, era: '9—14 世纪',
    place: '吐鲁番　高昌',
    note: '佛教、摩尼教与景教写本同出一地，三种信仰共用一套自粟特文而来的字母。' },

  { key: 'khitan',    name: '契丹小字', self: '\ue16c\ue08f',
    from: 920,  to: 1200, era: '10—12 世纪',
    place: '上京临潢府　西拉木伦河',
    note: '辽代墓志出土之地。小字至今只释读了一部分，两套拟音仍在分歧之中。' },

  { key: 'tangut',    name: '西夏文',   self: '\u{17F07}\u{179FB}',
    from: 1038, to: 1250, era: '11—13 世纪',
    place: '贺兰山　兴庆府',
    note: '六千余字全为自创，无一借自汉字字形。黑水城文献使这套文字重新可读。' },

  { key: 'mongolian', name: '蒙古语',   self: 'ᠮᠣᠩᠭᠣᠯ',
    from: 1200, to: 1600, era: '13 世纪—',
    place: '克鲁伦河　阿巴儿合',
    note: '回鹘字母转写蒙古语，行款自上而下。传统蒙文与西里尔蒙文在此并列。' },
];

const AXIS_FROM = 300, AXIS_TO = 1650;
const OVERVIEW = { key: 'overview', place: '内　亚',
                   note: '自泽拉夫尚河谷至西拉木伦河，六种文字，一千年。' };

const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- grain --------------------------------------------------------
   One noise tile, generated once and tiled. The CSS animation jumps its
   offset every frame, so the field is different each time without anything
   being repainted. Generating it here rather than shipping a PNG keeps the
   page self-contained and costs about a millisecond. */
function grainTile(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // triangular distribution: two uniform samples averaged. Real grain
    // clumps around mid-grey; flat uniform noise looks like TV static.
    const v = ((Math.random() + Math.random()) * 0.5 * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/* ---------- scratches and dust ------------------------------------------- */
function seedArtefacts(host) {
  if (reduced) return;
  const rand = (a, b) => a + Math.random() * (b - a);

  for (let i = 0; i < 3; i++) {
    const s = document.createElement('i');
    s.style.left = rand(4, 96).toFixed(2) + '%';
    s.style.animation = `scratch ${rand(2.6, 7.5).toFixed(2)}s linear ${rand(0, 9).toFixed(2)}s infinite`;
    host.appendChild(s);
    // re-place it each cycle, so a scratch never lives twice in the same column
    s.addEventListener('animationiteration', () => {
      s.style.left = rand(4, 96).toFixed(2) + '%';
    });
  }
  for (let i = 0; i < 14; i++) {
    const u = document.createElement('u');
    const w = rand(1, 2.6);
    u.style.left = rand(0, 100).toFixed(2) + '%';
    u.style.top = rand(0, 100).toFixed(2) + '%';
    u.style.width = w.toFixed(2) + 'px';
    u.style.height = (w * rand(1, 3.5)).toFixed(2) + 'px';
    u.style.animationDuration = rand(0.16, 0.5).toFixed(2) + 's';
    u.style.animationDelay = rand(0, 4).toFixed(2) + 's';
    host.appendChild(u);
  }
}

/* ---------- the camera ----------------------------------------------------
   One camera over a resolution pyramid.

   The camera's state is geographic — where it is looking and how wide a span it
   sees — and EVERY layer derives its own transform from that same state. Two
   layers showing the same moment therefore sit in exactly the same place at
   exactly the same scale, and cross-fading between them changes nothing but
   sharpness. That is what makes the descent continuous: there is no hand-off
   from one picture to another, only a sharper picture arriving underneath the
   camera as it gets low enough to need it.

   The alternative — fly to the destination on the wide map, then swap in the
   close plate — is what made the seam. At the swap the wide map was blown up
   33× and the close plate was native, so an unreadable blur had to become a
   photograph in one step. The pyramid closes that to about 5× per level.
   ========================================================================== */

let INDEX = null;             // plates/index.json — bounds and size of each plate
let LAYERS = [];              // sorted coarse → fine
let live = null;              // key of the region the camera is resting on
let leaveTimer = 0;

const world  = $('#world');
const gate   = () => document.getElementById('gate');

/* The frame is inset by -1.5% so it has room to weave, which makes it slightly
   larger than the viewport. Every layer, every reconnaissance window and every
   unprojection has to measure against THAT box — mixing it with innerWidth puts
   the contour windows a percent and a half off the terrain they are cut from. */
/* Phone-sized, by the same breakpoint the stylesheet uses. Several decisions
   depend on it: how much is prefetched, how many motion-blur samples are
   composited, and how many reconnaissance windows are drawn. */
const SMALL = () => Math.min(innerWidth, innerHeight) <= 520;

const VW = () => world.clientWidth || innerWidth;
const VH = () => world.clientHeight || innerHeight;

// Web Mercator y, normalised 0 at the north pole to 1 at the south. These
// plates are Mercator, so latitude is not linear in them.
const mercY = lat => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
const invMercY = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;

/* ---- camera state: a point and a span, in degrees of longitude ---------- */
const cam = { lon: 93, lat: 43, span: 76 };

/* The transform that shows `cam` on a given layer.

   `background-size: cover` scales the image by f = max(W/iw, H/ih) and centres
   it. From there it is only arithmetic: how much more scale is needed to make
   the viewport width equal `span` degrees, and how far to slide so the camera's
   point is in the middle. */
function layerTransform(p) {
  const W = VW(), H = VH();
  const f = Math.max(W / p.w, H / p.h);
  const dw = p.w * f, dh = p.h * f;
  // `cover` already scales the image to the smallest size that fills the frame,
  // so a scale below 1 would pull it back off the edges. On a tall narrow
  // viewport the requested span can be wider than the plate can give at that
  // aspect; clamping keeps the frame full and simply shows a little less.
  const s = Math.max(1, (p.east - p.west) * W / (p.w * f * cam.span));
  const u = (cam.lon - p.west) / (p.east - p.west);
  const v = (mercY(cam.lat) - mercY(p.north)) / (mercY(p.south) - mercY(p.north));
  const px = (W - dw) / 2 + u * dw;
  const py = (H - dh) / 2 + v * dh;
  return `scale(${s.toFixed(5)}) translate(${(W / 2 - px).toFixed(2)}px, ${(H / 2 - py).toFixed(2)}px)`;
}

/* Does this layer still cover the frame? Compared in normalised Mercator units
   so the height test is honest at 48°N. */
function covers(p) {
  const W = VW(), H = VH();
  const visX = cam.span / 360;
  const visY = visX * (H / W);
  const halfX = visX / 2, halfY = visY / 2;
  const cx = cam.lon / 360, cy = mercY(cam.lat);
  return (cx - halfX) >= p.west / 360 - 1e-9 && (cx + halfX) <= p.east / 360 + 1e-9
      && (cy - halfY) >= mercY(p.north) - 1e-9 && (cy + halfY) <= mercY(p.south) + 1e-9;
}

/* How much of the frame a plate actually fills, 0..1.

   `covers` is all-or-nothing, and using it to pick the sharp layer made the
   whole descent hostage to the window's aspect ratio: the detail plates are cut
   3:2, so on a squarish window (901×816 is enough) the frame is TALLER than the
   plate in degrees, covers() goes false by a fifth of a degree, and the picture
   silently stays on the mid level at a third of the resolution. That is the
   "everything is blurry" bug, and it is invisible on a wide window.

   A pyramid does not need the sharp level to reach the corners — it needs
   something behind it there, which reselect() already guarantees by keeping
   every coarser covering level lit underneath. So the sharp level is chosen on
   how much of the frame it fills, and the corners fall back by themselves. */
function coverage(p) {
  const W = VW(), H = VH();
  const visX = cam.span / 360;
  const visY = visX * (H / W);
  const cx = cam.lon / 360, cy = mercY(cam.lat);
  const ix = Math.max(0, Math.min(cx + visX / 2, p.east / 360) -
                         Math.max(cx - visX / 2, p.west / 360));
  const iy = Math.max(0, Math.min(cy + visY / 2, mercY(p.south)) -
                         Math.max(cy - visY / 2, mercY(p.north)));
  return (ix * iy) / (visX * visY);
}

const ENOUGH = 0.72;     // fills most of the frame; the rest is backed by coarser levels

/* The sharpest layer that still covers the frame, plus everything coarser than
   it kept alive underneath — so there is never a frame with nothing behind the
   one that is fading in. */
function reselect() {
  let best = LAYERS[0];
  for (const l of LAYERS) if (coverage(l.p) >= ENOUGH) best = l;
  for (const l of LAYERS) {
    // The sharpest layer that covers the frame, plus any COARSER layer that
    // also covers it, as backing while the sharp one fades in. The `covers`
    // test on the backing is essential: every region's mid-level shares the
    // same resolution, so without it all six light up at once and five of them
    // are showing a different part of Asia.
    const on = l === best || (l.res > best.res && covers(l.p));
    if (on !== l.on) {
      l.on = on;
      l.el.style.opacity = on ? '1' : '0';
      if (on) load(l);
      // A level arriving or leaving is the only remaining visible step in the
      // descent — about 5× of sharpening. A short swell of grain sits over it,
      // which is what a print change looks like and is far less noticeable
      // than the change it covers.
      if (on && l !== LAYERS[0]) splice();
    }
  }
  sharpest = best;
  return best;
}

function apply() {
  for (const l of LAYERS) {
    if (l.el.style.opacity !== '0') l.el.style.transform = layerTransform(l.p);
  }
  syncRecon();
  paintReadout();
  // the trail samples are the camera a few frames ago — the accumulation buffer
  for (let i = 0; i < trail.length; i++) {
    const h = history[Math.min(history.length - 1, (i + 1) * 3)];
    if (h) trail[i].style.transform = h;
  }
}

/* ---- motion blur ---------------------------------------------------------
   A short history of the camera's own transform on the base layer. The trail
   copies are simply shown a few frames in the past, which is an accumulation
   buffer: the smear follows the true path, curve and all, and it is exactly as
   long as the camera is fast. Standing still, the history is constant and the
   copies land on top of the picture, contributing nothing. */
const trail = [...world.querySelectorAll('.trail')];
let history = [];

function pushHistory() {
  if (!LAYERS.length) return;
  history.unshift(layerTransform(LAYERS[0].p));
  if (history.length > 20) history.length = 20;
}

let spliceTimer = 0;
function splice() {
  if (reduced) return;
  const g = gate();
  clearTimeout(spliceTimer);
  g.classList.remove('is-splicing');
  void g.offsetWidth;
  g.classList.add('is-splicing');
  spliceTimer = setTimeout(() => g.classList.remove('is-splicing'), 940);
}

/* ---- the flight ---------------------------------------------------------- */
const EASE = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let raf = 0, flight = 0;

/* A camera that only ever zoomed in would have to cross the whole map at ground
   level. Lifting on the way out and settling on the way in — the arc every map
   uses for the same reason — keeps the distance travelled on screen small and
   makes the movement legible. */
function flyTo(target, ms) {
  const id = ++flight;
  const a = { ...cam };
  const b = target;
  const dLon = Math.abs(b.lon - a.lon), dLat = Math.abs(b.lat - a.lat);
  const reach = Math.max(dLon, dLat * 1.6);
  const peak = Math.max(a.span, b.span, reach * 1.35);
  cancelAnimationFrame(raf);

  return new Promise(resolve => {
    const t0 = performance.now();
    let settled = false;
    const finish = ok => { if (!settled) { settled = true; resolve(ok); } };

    // requestAnimationFrame does not run in a hidden tab. Without a floor the
    // camera simply stops wherever it was — mid-climb, on the coarsest level —
    // and the page is left showing a blurred wide shot until the pointer moves
    // again. If the frames stop coming, jump to the destination.
    const bail = setTimeout(() => {
      if (id !== flight || settled) return;
      cam.lon = b.lon; cam.lat = b.lat; cam.span = b.span;
      history = [];
      reselect(); apply();
      finish(true);
    }, ms + 400);

    const step = now => {
      if (id !== flight) { clearTimeout(bail); return finish(false); }
      const t = Math.min(1, (now - t0) / ms);
      const e = EASE(t);
      cam.lon = a.lon + (b.lon - a.lon) * e;
      cam.lat = a.lat + (b.lat - a.lat) * e;
      // zoom moves through the peak and is interpolated logarithmically —
      // linear interpolation of scale reads as an acceleration, never as a lift
      const up = Math.min(1, e / 0.5), down = Math.max(0, (e - 0.5) / 0.5);
      const lgA = Math.log(a.span), lgP = Math.log(peak), lgB = Math.log(b.span);
      cam.span = Math.exp(e < 0.5 ? lgA + (lgP - lgA) * up : lgP + (lgB - lgP) * down);

      pushHistory();
      reselect();
      apply();
      if (t < 1) { raf = requestAnimationFrame(step); }
      else { clearTimeout(bail); finish(true); }
    };
    raf = requestAnimationFrame(step);
  });
}

/* ---- loading ------------------------------------------------------------- */
const EXT = (() => {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp') ? 'webp' : 'jpg';
  } catch { return 'jpg'; }
})();

function load(l) {
  if (l.loaded) return l.loaded;
  const tryOne = ext => new Promise(res => {
    const img = new Image();
    img.onload = () => res(`plates/${l.p.file}.${ext}`);
    img.onerror = () => res(null);
    img.src = `plates/${l.p.file}.${ext}`;
  });
  l.loaded = (async () => {
    let url = await tryOne(EXT);
    if (!url && EXT !== 'jpg') url = await tryOne('jpg');
    if (url) {
      l.el.style.backgroundImage = `url("${url}")`;
      if (l === LAYERS[0]) trail.forEach(t => { t.style.backgroundImage = `url("${url}")`; });
      // The contour print of the same plate, for the reconnaissance windows.
      // It is a second round-trip after the plate itself, so it regularly
      // arrives AFTER the camera has already landed and drawn the overlay —
      // hence the callback: whoever finishes last draws.
      const arrive = url => {
        l.contour = url;
        if (l === sharpest && !world.classList.contains('is-flying')) layRecon();
      };
      const c = new Image();
      c.onload = () => arrive(`plates/${l.p.file}-contour.${EXT}`);
      c.onerror = () => {
        const j = new Image();
        j.onload = () => arrive(`plates/${l.p.file}-contour.jpg`);
        j.src = `plates/${l.p.file}-contour.jpg`;
      };
      c.src = `plates/${l.p.file}-contour.${EXT}`;
    }
    return url;
  })();
  return l.loaded;
}

/* ---- what the timeline calls --------------------------------------------- */
/* How wide a view a plate can actually fill, given the shape of the window.

   The landing span used to be `(east - west) * 0.86` — longitude only. On a
   wide window the frame is limited by the plate's width and that is right; on a
   PHONE, held upright, the frame is 2.2× taller than it is wide, and the same
   span asks the plate for 2.2× more latitude than it has. The sharp level then
   covers a third of the frame, never clears the threshold, and the camera lands
   on the mid level: the whole descent looks blurry on a phone and correct on a
   laptop, which is why this went unnoticed.

   Taking the smaller of the two constraints means an upright phone simply flies
   in CLOSER — 0.6° instead of 2.0° — which is what a hand-sized frame wants
   anyway. Wide windows are unaffected: there the longitude constraint is
   already the smaller one. */
function landingSpan(p) {
  const W = VW(), H = VH();
  const byX = (p.east - p.west) * 0.86;
  const byY = (mercY(p.south) - mercY(p.north)) * 360 * 0.86 * (W / H);
  return Math.min(byX, byY);
}

const HOME = { lon: 93, lat: 43, span: 76 };

/* The wide shot, clamped the same way. Upright, the overview plate cannot show
   76° of longitude without being asked for more latitude than it holds, so the
   phone opens on a narrower — but sharp and correctly framed — piece of Inner
   Asia rather than on a stretched or half-empty frame. */
function home() {
  const ov = INDEX && INDEX.overview;
  if (!ov) return HOME;
  return { lon: HOME.lon, lat: HOME.lat, span: Math.min(HOME.span, landingSpan(ov)) };
}

async function fly(key) {
  if (key === live) return;
  live = key;
  gate().classList.remove('is-breathing');
  world.classList.add('is-flying');

  const r = key && INDEX[key];
  const target = r ? { lon: r.lon, lat: r.lat, span: landingSpan(r) } : home();

  // pull the destination's levels in while the camera is already moving
  if (key) LAYERS.filter(l => l.key === key || l.key === key + '@mid').forEach(load);

  clearRecon();                       // nothing survives the move
  const done = await flyTo(target, key ? 2100 : 1700);
  if (!done) return;
  world.classList.remove('is-flying');
  history = [];
  gate().classList.add('is-breathing');
  layRecon();                         // and a fresh set is drawn where it lands
}

/* Rotating a phone changes which constraint binds — a frame that fitted the
   plate in portrait asks for more longitude than it holds in landscape — so the
   camera has to be re-framed, not merely re-projected. */
addEventListener('resize', () => {
  if (!LAYERS.length) return;
  const r = live && INDEX[live];
  cam.span = r ? landingSpan(r) : home().span;
  if (r) { cam.lon = r.lon; cam.lat = r.lat; }
  reselect(); apply(); layRecon();
});

// Coming back to a hidden tab, the camera may have been frozen part-way. Put it
// where the current selection says it should be rather than leaving it stranded.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !LAYERS.length) return;
  const r = live && INDEX[live];
  const t = r ? { lon: r.lon, lat: r.lat, span: landingSpan(r) } : home();
  cam.lon = t.lon; cam.lat = t.lat; cam.span = t.span;
  history = [];
  reselect(); apply();
});

/* ---------- readout, standing name ---------------------------------------
   Everything shown here is measured off the camera or read from the plate's
   own metadata. Nothing is invented: there are no fake altitudes, no fake
   sensor timestamps, no fake target designations. The reconnaissance look
   comes from the typography and from what is genuinely known — where the
   frame is centred, which plate is carrying it, at what ground resolution,
   and which NASA product it was cut from.
   ========================================================================== */

const readout = $('#readout');
const standing = $('#standing');

const dms = (v, pos, neg) => {
  const h = v >= 0 ? pos : neg;
  // Round to tenths of a second FIRST, then split. Splitting first and
  // rounding the seconds afterwards is what produces 42°53′60.0″.
  let t = Math.round(Math.abs(v) * 36000);          // tenths of a second
  const d = Math.floor(t / 36000); t -= d * 36000;
  const m = Math.floor(t / 600);   t -= m * 600;
  return `${d}°${String(m).padStart(2, '0')}′` +
         `${(t / 10).toFixed(1).padStart(4, '0')}″${h}`;
};

/* Great-circle distance and initial bearing — used for the pins, so the numbers
   beside them are the real offset from the centre of frame. */
function geodesic(lon1, lat1, lon2, lat2) {
  const R = 6371.0088, r = Math.PI / 180;
  const p1 = lat1 * r, p2 = lat2 * r, dp = (lat2 - lat1) * r, dl = (lon2 - lon1) * r;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { km: d, brg: (Math.atan2(y, x) / r + 360) % 360 };
}

/* Screen point → lon/lat, the inverse of layerTransform's framing. */
function unproject(x, y) {
  const W = VW(), H = VH();
  const perPx = cam.span / W / 360;                 // normalised units per pixel
  return {
    lon: cam.lon + (x - W / 2) * cam.span / W,
    lat: invMercY(mercY(cam.lat) + (y - H / 2) * perPx),
  };
}

let sharpest = null;

function paintReadout() {
  const p = sharpest ? sharpest.p : (INDEX && INDEX.overview);
  if (!p) return;
  const mPerPx = (p.east - p.west) / p.w;
  const scr = cam.span / VW();               // degrees per screen pixel
  readout.innerHTML =
    `<span class="big">${dms(cam.lat, 'N', 'S')}　${dms(cam.lon, 'E', 'W')}</span>` +
    `视场 ${cam.span.toFixed(3)}° 　 图面 ${(scr * 1000).toFixed(3)} m°/px<br>` +
    `<span class="dim">底片 ${p.file.toUpperCase()}　${p.w}×${p.h}　${(mPerPx * 1000).toFixed(3)} m°/px</span><br>` +
    `<span class="dim">ASTER GDEM 灰阶晕渲 ／ LANDSAT WELD 1999　公有领域</span>`;
}

function setStanding(s) {
  if (!s) { standing.classList.remove('is-on'); return; }
  standing.innerHTML = `${s.name}<span class="self">${s.self}</span>`;
  standing.classList.add('is-on');
}

/* ---------- reconnaissance overlay ---------------------------------------- */
const recon = $('#recon');
let reconItems = [];

function clearRecon() {
  reconItems.forEach(el => el.classList.remove('is-on'));
  const gone = reconItems;
  setTimeout(() => gone.forEach(el => el.remove()), 700);
  reconItems = [];
}

/* Windows are placed away from the type: the left third belongs to the
   timeline, the right edge to the standing name, and the bottom to the
   readout. What is left is the middle of the frame, which is where anyone
   would put a reticle anyway. */
function layRecon() {
  clearRecon();
  if (!sharpest || reduced) return;
  const W = VW(), H = VH();
  const x0 = W * 0.28, x1 = W * 0.80, y0 = H * 0.24, y1 = H * 0.78;
  const R = (a, b) => a + Math.random() * (b - a);
  const url = sharpest.contour;
  if (!url) return;

  const boxes = [];
  const n = SMALL() ? 1 + Math.floor(Math.random() * 2)   // 1–2 on a phone
                    : 2 + Math.floor(Math.random() * 3); // 2–4
  for (let i = 0; i < n && boxes.length < n; i++) {
    for (let tries = 0; tries < 24; tries++) {
      const w = R(W * (SMALL() ? 0.16 : 0.07), W * (SMALL() ? 0.30 : 0.13));
      const h = R(H * (SMALL() ? 0.07 : 0.10), H * (SMALL() ? 0.13 : 0.19));
      const x = R(x0, x1 - w), y = R(y0, y1 - h);
      const hit = boxes.some(b => x < b.x + b.w + 24 && x + w + 24 > b.x &&
                                  y < b.y + b.h + 40 && y + h + 40 > b.y);
      if (!hit) { boxes.push({ x, y, w, h }); break; }
    }
  }

  boxes.forEach((b, i) => {
    const win = document.createElement('div');
    win.className = 'win';
    win.style.cssText = `left:${b.x.toFixed(0)}px;top:${b.y.toFixed(0)}px;` +
                        `width:${b.w.toFixed(0)}px;height:${b.h.toFixed(0)}px`;
    const inner = document.createElement('div');
    inner.className = 'win-inner';
    inner.style.cssText = `left:${(-b.x).toFixed(0)}px;top:${(-b.y).toFixed(0)}px;` +
                          `width:${W}px;height:${H}px;background-image:url("${url}")`;
    const tag = document.createElement('span');
    tag.className = 'win-tag';
    const c = unproject(b.x + b.w / 2, b.y + b.h / 2);
    tag.textContent = `扇区 ${String(i + 1).padStart(2, '0')}　等高 Δ9　` +
                      `${c.lat.toFixed(3)}° ${c.lon.toFixed(3)}°`;
    win.append(inner, tag);
    recon.appendChild(win);
    reconItems.push(win);
    requestAnimationFrame(() => win.classList.add('is-on'));
  });

  const pins = SMALL() ? 2 : 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < pins; i++) {
    const x = R(x0, x1), y = R(y0, y1);
    const g = unproject(x, y);
    const d = geodesic(cam.lon, cam.lat, g.lon, g.lat);
    const pin = document.createElement('div');
    pin.className = 'pin' + (x > W * 0.66 ? ' flip' : '');
    pin.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px`;
    pin.innerHTML = `<i></i><b>${g.lat.toFixed(4)}° ${g.lon.toFixed(4)}°<br>` +
                    `距心 ${d.km.toFixed(1)} km　方位 ${d.brg.toFixed(0).padStart(3, '0')}°</b>`;
    recon.appendChild(pin);
    reconItems.push(pin);
    requestAnimationFrame(() => pin.classList.add('is-on'));
  }
  syncRecon();
}

function syncRecon() {
  if (!sharpest) return;
  const tf = layerTransform(sharpest.p);
  recon.querySelectorAll('.win-inner').forEach(el => { el.style.transform = tf; });
}

/* ---------- timeline ------------------------------------------------------
   The bars sit at their true dates, which is the point of a timeline: four of
   the six scripts begin inside two centuries of each other and the crowding
   should be visible. But four labels cannot occupy 60 px either. So the bars
   stay put and the LABELS are pushed apart, with a hairline drawn from each
   label back to its own span — the offset becomes legible instead of a lie. */
const rows = [];
let previewed = null;      // the row a touch user has already flown to

function layoutTimeline() {
  const list = $('#tl-list');
  const H = list.clientHeight;
  if (!H || !rows.length) return;
  const span = AXIS_TO - AXIS_FROM;
  const y = yr => ((yr - AXIS_FROM) / span) * H;

  rows.forEach(r => {
    r.barTop = y(r.s.from);
    r.barH = Math.max(8, y(r.s.to) - y(r.s.from));
    r.want = r.barTop + r.barH / 2;
    r.labelY = r.want;
  });

  // Relax overlaps: push neighbours apart by half the shortfall each, repeat.
  // Converges in a handful of passes for six rows and needs no sorting because
  // SCRIPTS is already in date order.
  const GAP = Math.min(48, H / (rows.length + 0.6));
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i].labelY - rows[i - 1].labelY;
      if (d < GAP) {
        const push = (GAP - d) / 2;
        rows[i - 1].labelY -= push;
        rows[i].labelY += push;
        moved = true;
      }
    }
    // keep the stack inside the box after the pushing
    const over = rows[rows.length - 1].labelY - (H - GAP / 2);
    if (over > 0) { rows.forEach(r => r.labelY -= over); moved = true; }
    const under = (GAP / 2) - rows[0].labelY;
    if (under > 0) { rows.forEach(r => r.labelY += under); moved = true; }
    if (!moved) break;
  }

  const link = $('#tl-links');
  link.setAttribute('viewBox', `0 0 60 ${H}`);
  link.style.height = H + 'px';
  link.innerHTML = '';

  rows.forEach(r => {
    r.li.style.top = r.labelY + 'px';
    r.bar.style.top = (r.barTop - r.labelY) + 'px';
    r.bar.style.height = r.barH + 'px';

    // hairline: down the bar's own column, across, into the label
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', `M1 ${r.want.toFixed(1)} H7 L15 ${r.labelY.toFixed(1)} H21`);
    p.setAttribute('class', 'link');
    p.dataset.key = r.s.key;
    link.appendChild(p);
  });
}

function buildTimeline() {
  const list = $('#tl-list');
  const span = AXIS_TO - AXIS_FROM;
  const pct = y => ((y - AXIS_FROM) / span) * 100;

  SCRIPTS.forEach(s => {
    const li = document.createElement('li');
    li.className = 'tl-item';

    const bar = document.createElement('span');
    bar.className = 'bar';

    const a = document.createElement('a');
    a.className = 'hit';
    a.href = `lexica.html#${s.key}`;
    a.innerHTML =
      `<span class="era">${s.era}</span>` +
      `<span class="name">${s.name}</span>` +
      `<span class="self">${s.self}</span>`;

    const enter = () => {
      clearTimeout(leaveTimer);
      list.querySelectorAll('.tl-item').forEach(x => x.classList.remove('is-on'));
      li.classList.add('is-on');
      $('#tl-links').querySelectorAll('.link').forEach(
        p => p.classList.toggle('is-on', p.dataset.key === s.key));
      fly(s.key);
      setStanding(s);
    };
    a.addEventListener('mouseenter', () => { stopTour(); enter(); });
    a.addEventListener('focus', () => { stopTour(); enter(); });

    /* Touch has no hover, so a tap has to mean "show me" before it can mean
       "take me there". The previous test — has this row got the `is-on` class —
       was always true by the time click ran, because focusing the link fires
       first and `enter()` sets that class: every first tap on a phone jumped
       straight to the lexicon and the flight was never seen. Tracking the
       previewed key separately is immune to that ordering. */
    a.addEventListener('click', ev => {
      stopTour();
      if (matchMedia('(hover: none)').matches && previewed !== s.key) {
        ev.preventDefault();
        previewed = s.key;
        enter();
      }
    });

    li.append(bar, a);
    list.appendChild(li);
    rows.push({ s, li, bar });
  });

  layoutTimeline();
  addEventListener('resize', layoutTimeline);

  const back = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      list.querySelectorAll('.tl-item').forEach(x => x.classList.remove('is-on'));
      $('#tl-links').querySelectorAll('.link').forEach(p => p.classList.remove('is-on'));
      fly(null);
      setStanding(null);
    }, 340);          // a beat of tolerance for crossing the gap between rows
  };
  $('#timeline').addEventListener('mouseleave', back);
  $('#timeline').addEventListener('focusout', ev => {
    if (!$('#timeline').contains(ev.relatedTarget)) back();
  });

  // century rules down the axis, so the bars are read against something
  const axis = $('#axis');
  for (let y = 400; y <= 1600; y += 100) {
    const t = document.createElement('span');
    t.style.cssText =
      `position:absolute;left:0;width:${y % 500 === 0 ? 9 : 5}px;height:1px;` +
      `top:${pct(y)}%;background:rgba(232,228,217,${y % 500 === 0 ? 0.4 : 0.2})`;
    axis.appendChild(t);
  }
}

/* ---------- the tour -----------------------------------------------------
   A phone has no pointer to hover with, so the flight — the thing this page is
   for — would only ever be seen by someone who guessed that tapping twice does
   something different than tapping once. Left alone, the camera visits the six
   regions in turn, and the first touch anywhere hands control back. */

let tourTimer = 0, tourAt = -1, tourOn = false;

function stopTour() {
  tourOn = false;
  clearTimeout(tourTimer);
}

function tourStep() {
  if (!tourOn) return;
  tourAt = (tourAt + 1) % SCRIPTS.length;
  const s = SCRIPTS[tourAt];
  const row = rows.find(r => r.s.key === s.key);
  if (row) {
    rows.forEach(r => r.li.classList.toggle('is-on', r === row));
    $('#tl-links').querySelectorAll('.link').forEach(
      p => p.classList.toggle('is-on', p.dataset.key === s.key));
  }
  fly(s.key);
  setStanding(s);
  tourTimer = setTimeout(tourStep, 5200);   // travel + a beat to look
}

function startTour(delay) {
  if (reduced || !SMALL()) return;   // a pointer user can hover; leave them alone
  stopTour();
  tourOn = true;
  tourTimer = setTimeout(tourStep, delay);
  // any deliberate touch ends it, including a scroll or a tap on the map
  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(ev =>
    addEventListener(ev, stopTour, { once: true, passive: true }));
}

/* ---------- boot ---------------------------------------------------------- */
async function boot() {
  $('#grain').style.backgroundImage = `url("${grainTile(168)}")`;
  $('#dissolve').style.backgroundImage = `url("${grainTile(220)}")`;
  seedArtefacts($('#scratches'));
  buildTimeline();
  setStanding(null);

  // plates/index.json carries every plate's real bounds and pixel size, written
  // by tools/fetch_plates.py — the camera reads them rather than repeating the
  // tile arithmetic here.
  try {
    INDEX = await (await fetch('plates/index.json', { cache: 'no-cache' })).json();
  } catch {
    gate().classList.add('is-breathing');
    return;                      // no map; the timeline still works as a menu
  }

  // one element per plate, ordered coarse → fine so `reselect` can walk it
  const host = $('#world');
  LAYERS = Object.entries(INDEX).map(([key, p]) => ({
    key, p, res: (p.east - p.west) / p.w, loaded: null,
  })).sort((a, b) => b.res - a.res);

  LAYERS.forEach(l => {
    const el = document.createElement('div');
    el.className = 'layer';
    el.dataset.key = l.key;
    l.el = el;
    host.insertBefore(el, host.querySelector('.trail'));  // coarse first, trails on top
  });

  await load(LAYERS[0]);          // the wide map, before anything is shown
  Object.assign(cam, home());     // the opening frame depends on the window's shape
  reselect();
  apply();
  world.classList.remove('is-flying');
  gate().classList.add('is-breathing');
  setTimeout(layRecon, 600);
  startTour(2600);

  // Warm the six mid-levels — about 6 MB — but not on a phone and not on a
  // metered connection. There the plates are fetched when a row is actually
  // touched: fly() asks for them as it sets off, which buys a second of travel
  // before they are needed, and nobody pays for five regions they never opened.
  const conn = navigator.connection || {};
  const frugal = SMALL() || conn.saveData === true ||
                 /^(slow-)?2g$/.test(conn.effectiveType || '') || conn.effectiveType === '3g';
  if (!frugal) {
    const warm = () => LAYERS.filter(l => l.key.endsWith('@mid'))
        .forEach((l, i) => setTimeout(() => load(l), i * 600));
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2500);
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
