/* ==========================================================================
   契丹小字 语法与拟音 — 文件入口

   A list of files, plus a viewer that actually renders.

   The first attempt embedded an <iframe> pointing at the PDF, which hands the
   job to whatever PDF component the browser happens to have. Where there is
   none — and this preview pane is one such place, it turns every PDF into a
   download prompt — the reader gets a blank rectangle or a save dialog. So the
   pages are rasterised here instead, with pdf.js, which depends on nothing but
   a canvas. It is ~2.7 MB and is fetched on the first 阅览, never on load.

   Data comes from docs/khitan/index.json, written by
   tools/fetch_khitan_docs.py. An entry that failed to mirror still appears,
   pointing at its source, rather than disappearing from the list.
   ========================================================================== */
'use strict';

const GROUPS = [
  ['A1', 'Róna-Tas《Khitan Studies》系列'],
  ['A2', 'Unicode / WG2 编码提案'],
  ['A3', '中文单篇'],
];

const $ = s => document.querySelector(s);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB'
                             : Math.round(n / 1024) + ' KB';

function row(d) {
  if (!d.file) {
    return `<li class="f is-missing">
      <span class="f-name">${esc(d.title)}</span>
      <span class="f-size">未镜像</span>
      <span class="f-acts"><a class="btn" href="${esc(d.source)}"
        target="_blank" rel="noopener">原站 ↗</a></span>
    </li>`;
  }
  return `<li class="f" id="f-${esc(d.id)}">
    <button class="f-name" type="button" data-open="${esc(d.id)}">${esc(d.title)}</button>
    <span class="f-size">${d.pages ? d.pages + ' 页　' : ''}${mb(d.bytes)}</span>
    <span class="f-acts">
      <button class="btn" type="button" data-open="${esc(d.id)}">阅览</button>
      <a class="btn" href="${esc(d.file)}" download>下载</a>
    </span>
  </li>`;
}

function render(ix) {
  const groups = GROUPS.map(([id, name]) => {
    const items = ix.docs.filter(d => d.group === id);
    if (!items.length) return '';
    return `<section class="grp">
      <h2><span class="tag">${id}</span>${esc(name)}</h2>
      <ul class="files">${items.map(row).join('')}</ul>
    </section>`;
  }).join('');

  const ext = ix.external.map(e => `<li class="f is-ext">
      <span class="f-name">${esc(e.title)}</span>
      <span class="f-acts">${e.url
        ? `<a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener">出处 ↗</a>`
        : ''}</span>
    </li>`).join('');

  $('#docs').innerHTML = groups + `<section class="grp">
      <h2><span class="tag">B</span>需购买或需账号 — 未镜像</h2>
      <ul class="files">${ext}</ul>
    </section>`;

  const ok = ix.docs.filter(d => d.file);
  $('#tally').textContent = `${ok.length} 份　`
    + mb(ok.reduce((s, d) => s + d.bytes, 0));

  $('#docs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-open]');
    if (!b) return;
    const d = ix.docs.find(x => x.id === b.dataset.open);
    if (d && d.file) open(d);
  });
}

/* ---------- viewer -------------------------------------------------------
   pdf.js renders to a canvas, so it works wherever a canvas works. Pages are
   drawn as they are asked for rather than all at once — N4725R is 194 pages,
   and rendering those up front would take a minute and half a gigabyte.

   Scale is a *render* scale, not a CSS transform: zooming re-rasterises, so a
   glyph table stays sharp however far in you go. The default is fit-to-width,
   which is the only sensible opening state on a phone — a fixed 1.35 put a
   quarter of an A4 page on a 375pt screen. Pinch, double-tap and swipe are
   wired up by hand because the stage owns its touch-action; letting the
   browser pinch-zoom instead would blow up the whole dialog chrome with it. */

let PDFJS = null;

async function pdfjs() {
  if (PDFJS) return PDFJS;
  const m = await import('./pdfjs/pdf.mjs');
  m.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.mjs';
  PDFJS = m;
  return m;
}

const dlg = $('#viewer');
const stage = $('#v-stage');
const cv = $('#v-canvas');

const MIN_SCALE = 0.2, MAX_SCALE = 6;

let task = null, doc = null, page = 1;
let fit = 'width';           // 'width' | 'page' | null when the user has zoomed
let scale = 1;
let busy = false, again = false, job = null;

const clampScale = s => Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);

function setStatus(t) { $('#v-status').textContent = t || ''; }

/* Free space inside the stage, padding and any scrollbar already subtracted. */
function fitScale(base, mode) {
  const cs = getComputedStyle(stage);
  const w = stage.clientWidth
    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = stage.clientHeight
    - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const byW = Math.max(w, 120) / base.width;
  return mode === 'page' ? Math.min(byW, Math.max(h, 160) / base.height) : byW;
}

/* pdf.js will not render a page onto a canvas twice at once, so redraws
   collapse into a single trailing pass — and a redraw arriving mid-render
   cancels the one in flight rather than waiting it out. Waiting is both slow
   (three quick taps on › would render three pages in full) and unsafe: pdf.js
   finishes a render on requestAnimationFrame, which never fires while the tab
   is in the background, so a queue that only ever drains on completion can
   latch shut for as long as the reader is looking elsewhere. */
async function draw() {
  if (!doc) return;
  if (busy) {
    again = true;
    if (job) { try { job.cancel(); } catch {} }
    return;
  }
  busy = true;
  try {
    do { again = false; await paint(); } while (again);
  } catch (err) {
    setStatus('渲染失败：' + err.message);
  } finally {
    busy = false;
    job = null;
  }
}

async function paint() {
  const p = await doc.getPage(page);
  if (fit) scale = fitScale(p.getViewport({ scale: 1 }), fit);
  scale = clampScale(scale);

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const vp = p.getViewport({ scale: scale * dpr });
  cv.width = Math.round(vp.width);
  cv.height = Math.round(vp.height);
  cv.style.width = Math.round(vp.width / dpr) + 'px';
  cv.style.height = Math.round(vp.height / dpr) + 'px';
  job = p.render({ canvasContext: cv.getContext('2d'), viewport: vp });
  try {
    await job.promise;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') return;
    throw err;
  }

  $('#v-page').value = page;
  $('#v-total').textContent = doc.numPages;
  $('#v-prev').disabled = page <= 1;
  $('#v-next').disabled = page >= doc.numPages;
  /* the label is where the button takes you, not where you are */
  $('#v-fit').textContent = fit === 'width' ? '整页' : '适宽';
  setStatus(fit ? '' : Math.round(scale * 100) + '%');
}

function goto(n) {
  if (!doc) return;
  const t = Math.min(Math.max(Math.round(n) || 1, 1), doc.numPages);
  if (t === page) { $('#v-page').value = page; return; }
  page = t;
  stage.scrollTop = 0;
  draw();
}

function zoom(mult, anchor) {
  if (!doc) return;
  const before = scale;
  fit = null;
  scale = clampScale(scale * mult);
  keepAnchored(before, scale, anchor);
  draw();
}

/* Hold whatever the reader was looking at still while the page grows under
   it — without this, zooming in on a footnote throws you back to the middle
   of the page. */
function keepAnchored(from, to, anchor) {
  const k = to / from;
  if (!isFinite(k) || k <= 0 || !cv.clientWidth) return;
  const r = stage.getBoundingClientRect();
  const ax = anchor ? anchor.x - r.left : stage.clientWidth / 2;
  const ay = anchor ? anchor.y - r.top : stage.clientHeight / 2;
  /* stretch the bitmap first: the new scroll range has to exist before the
     scroll offset can be set into it, and the re-raster is a frame away */
  cv.style.width = Math.round(cv.clientWidth * k) + 'px';
  cv.style.height = Math.round(cv.clientHeight * k) + 'px';
  stage.scrollLeft = (stage.scrollLeft + ax) * k - ax;
  stage.scrollTop = (stage.scrollTop + ay) * k - ay;
}

async function open(d) {
  dlg.showModal();
  document.body.classList.add('has-viewer');
  $('#v-title').textContent = d.title;
  $('#v-dl').href = d.file;
  cv.width = cv.height = 0;
  cv.style.width = cv.style.height = '';
  $('#v-total').textContent = '—';
  setStatus('载入中…');
  page = 1;
  /* Fit-to-width almost always: it is what makes the text readable, and the
     reader scrolls. The exception is a stage too short to scroll usefully — a
     phone held sideways, where fit-width shows the top inch of the sheet and
     nothing else. There the whole page is the lesser evil, and a double-tap
     gets back to reading size. Judged on absolute height, not aspect ratio:
     a desktop window is wider than it is tall too, and fit-page there would
     set an A4 body at about seven points. */
  fit = (stage.clientHeight < 480 && stage.clientWidth > stage.clientHeight)
    ? 'page' : 'width';
  try {
    const m = await pdfjs();
    if (task) { try { task.destroy(); } catch {} }
    task = m.getDocument({ url: d.file });
    doc = await task.promise;
    await draw();
  } catch (err) {
    setStatus('无法显示：' + err.message);
  }
}

function closeViewer() {
  if (task) { try { task.destroy(); } catch {} task = null; }
  doc = null;
  dlg.close();
}

$('#v-prev').addEventListener('click', () => goto(page - 1));
$('#v-next').addEventListener('click', () => goto(page + 1));
$('#v-in').addEventListener('click', () => zoom(1.3));
$('#v-out').addEventListener('click', () => zoom(1 / 1.3));
$('#v-fit').addEventListener('click', () => {
  fit = fit === 'width' ? 'page' : 'width';
  stage.scrollTop = stage.scrollLeft = 0;
  draw();
});
$('#v-close').addEventListener('click', closeViewer);

const pageBox = $('#v-page');
pageBox.addEventListener('change', () => goto(parseInt(pageBox.value, 10)));
pageBox.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); pageBox.blur(); }
  ev.stopPropagation();          // arrows belong to the caret here, not paging
});
pageBox.addEventListener('focus', () => pageBox.select());

dlg.addEventListener('close', () => {
  document.body.classList.remove('has-viewer');
  if (task) { try { task.destroy(); } catch {} task = null; }
});
dlg.addEventListener('click', ev => { if (ev.target === dlg) closeViewer(); });

addEventListener('keydown', ev => {
  if (!dlg.open) return;
  if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') goto(page - 1);
  else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') goto(page + 1);
  else if (ev.key === '+' || ev.key === '=') zoom(1.3);
  else if (ev.key === '-') zoom(1 / 1.3);
});

/* re-fit when the phone is turned, or the window resized */
let refit;
addEventListener('resize', () => {
  if (!dlg.open || !fit) return;
  clearTimeout(refit);
  refit = setTimeout(draw, 150);
});

/* ---------- touch: pinch, double-tap, swipe ------------------------------
   The stage keeps `touch-action: pan-x pan-y`, so panning is the browser's
   (smooth, momentum-carrying) job and only the pinch is ours. Live feedback
   is a CSS resize of the bitmap already on screen; the crisp re-raster comes
   once fingers lift, because rasterising every frame of a pinch is far too
   slow to follow a finger. */

const pts = new Map();
let pinch = null, swipe = null, lastTap = 0;

const dist = ([a, b]) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const mid = ([a, b]) => ({
  x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
});

stage.addEventListener('pointerdown', ev => {
  if (ev.pointerType === 'mouse') return;
  pts.set(ev.pointerId, ev);
  if (pts.size === 2) {
    swipe = null;
    const p = [...pts.values()];
    pinch = {
      d0: dist(p) || 1,
      w0: cv.clientWidth,
      h0: cv.clientHeight,
      s0: scale,
      at: mid(p),
      k: 1,
    };
  } else if (pts.size === 1) {
    swipe = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: 0 };
  }
});

stage.addEventListener('pointermove', ev => {
  if (!pts.has(ev.pointerId)) return;
  pts.set(ev.pointerId, ev);

  if (pinch && pts.size === 2) {
    ev.preventDefault();
    const p = [...pts.values()];
    const k = clampScale(pinch.s0 * (dist(p) / pinch.d0)) / pinch.s0;
    pinch.k = k;
    cv.style.width = Math.round(pinch.w0 * k) + 'px';
    cv.style.height = Math.round(pinch.h0 * k) + 'px';
    const r = stage.getBoundingClientRect();
    const ax = pinch.at.x - r.left, ay = pinch.at.y - r.top;
    stage.scrollLeft = (stage.scrollLeft + ax) * (k / (pinch.lastK || 1)) - ax;
    stage.scrollTop = (stage.scrollTop + ay) * (k / (pinch.lastK || 1)) - ay;
    pinch.lastK = k;
  } else if (swipe) {
    swipe.moved = Math.max(swipe.moved,
      Math.hypot(ev.clientX - swipe.x, ev.clientY - swipe.y));
  }
}, { passive: false });

function endTouch(ev) {
  pts.delete(ev.pointerId);

  if (pinch && pts.size < 2) {
    const k = pinch.k;
    pinch = null;
    if (Math.abs(k - 1) > 0.01) { fit = null; scale = clampScale(scale * k); draw(); }
    swipe = null;
    return;
  }

  if (!swipe || pts.size) { swipe = null; return; }
  const dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
  const flat = stage.scrollWidth <= stage.clientWidth + 2;
  const s = swipe; swipe = null;

  /* A sideways flick turns the page — but only when there is nothing to pan
     sideways to, or it would fight the reader panning a zoomed-in page. */
  if (flat && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6
      && performance.now() - s.t < 600) {
    goto(page + (dx < 0 ? 1 : -1));
    return;
  }

  if (s.moved < 12) {
    const now = performance.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      if (fit) { const b = scale; fit = null; scale = clampScale(scale * 2);
                 keepAnchored(b, scale, { x: ev.clientX, y: ev.clientY }); }
      else { fit = 'width'; stage.scrollLeft = 0; }
      draw();
    } else {
      lastTap = now;
    }
  }
}

stage.addEventListener('pointerup', endTouch);
stage.addEventListener('pointercancel', ev => {
  pts.delete(ev.pointerId);
  if (pinch && pts.size < 2) { pinch = null; draw(); }
  swipe = null;
});

/* trackpad / mouse-wheel zoom, the desktop counterpart of the pinch */
stage.addEventListener('wheel', ev => {
  if (!ev.ctrlKey && !ev.metaKey) return;
  ev.preventDefault();
  zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, { x: ev.clientX, y: ev.clientY });
}, { passive: false });

/* the site's light/dark switch, same key so the choice carries across pages */
$('#theme').addEventListener('click', () => {
  const now = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = now === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
});
try {
  const t = localStorage.getItem('theme');
  if (t) document.documentElement.dataset.theme = t;
} catch {}

fetch('docs/khitan/index.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(render)
  .catch(err => {
    $('#docs').innerHTML =
      `<p class="docs-loading">索引读取失败：${esc(err.message)}</p>`;
  });
