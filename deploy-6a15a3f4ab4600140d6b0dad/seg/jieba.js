/* ==========================================================================
   jieba's accurate mode, in the browser.

   This is a port of the algorithm, not an imitation of it. Everything that
   decides where a boundary falls is the same:

     1. a prefix dictionary built from jieba's own dict.txt (349,046 entries)
     2. a DAG of every dictionary word starting at every position
     3. a right-to-left dynamic programming pass for the maximum-probability
        path, weighing log(freq / total) exactly as jieba does
     4. Viterbi over jieba's finalseg HMM for runs of characters the dictionary
        does not cover, with the same B/M/E/S states and the same emission and
        transition tables

   The tie-breaking matters as much as the arithmetic: jieba's DP compares
   `(route[x+1][0] + logfreq, x)` tuples and Python's max() keeps the FIRST
   maximum, scanning candidates in the DAG's order. Comparing only the score
   here, and taking `>` rather than `>=`, reproduces that. Getting it wrong
   changes a small number of sentences, which is exactly the kind of bug that
   never shows up in casual testing — hence tools/check_jieba.py, which diffs
   this against Python jieba over a corpus.

   Part of speech comes from dict.txt's third column, which is where
   jieba.posseg reads it for known words. Words the dictionary does not contain
   are returned with pos '' and the caller labels them as unlabelled rather
   than guessing.
   ========================================================================== */
'use strict';

(function () {

const BASE = 'seg/';

let FREQ = null;       // Map word → frequency; prefixes present with value 0
let TOTAL = 0;
let POS = null;        // Map word → tag
let HMM = null;        // finalseg: plain B/M/E/S
let PM = null;         // posseg: states are "BMES,tag"
let POS_ZH = null;
let loading = null;

/* ---------- loading ------------------------------------------------------
   The dictionary ships gzipped and is inflated here rather than relying on
   the host to negotiate compression: 4.8 MB against 1.8 MB is the difference
   between a feature that feels instant on a phone and one that does not. */
async function fetchGz(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  if (!('DecompressionStream' in window)) {
    // no inflate available — fall back to an uncompressed copy if one is there
    const plain = await fetch(BASE + path.replace(/\.gz$/, ''));
    if (!plain.ok) throw new Error('DecompressionStream unavailable');
    return plain.text();
  }
  const ds = new DecompressionStream('gzip');
  return new Response(res.body.pipeThrough(ds)).text();
}

function buildPrefixDict(text) {
  const freq = new Map(), pos = new Map();
  let total = 0;
  // Splitting the whole 4.8 MB at once costs ~200 ms and a copy of everything;
  // walking line ends keeps it to one pass and no intermediate array.
  let i = 0;
  const n = text.length;
  while (i < n) {
    let j = text.indexOf('\n', i);
    if (j < 0) j = n;
    const line = text.slice(i, j);
    i = j + 1;
    if (!line) continue;
    const s1 = line.indexOf(' ');
    if (s1 < 0) continue;
    const word = line.slice(0, s1);
    const s2 = line.indexOf(' ', s1 + 1);
    const f = +(s2 < 0 ? line.slice(s1 + 1) : line.slice(s1 + 1, s2));
    if (!(f > 0)) continue;
    total += f;
    freq.set(word, f);
    if (s2 > 0) pos.set(word, line.slice(s2 + 1));
    // every proper prefix must be present, or the DAG walk stops early
    for (let k = 1; k < word.length; k++) {
      const p = word.slice(0, k);
      if (!freq.has(p)) freq.set(p, 0);
    }
  }
  return { freq, pos, total };
}

function load() {
  if (loading) return loading;
  loading = (async () => {
    const [dictText, hmmText, posmText, posText] = await Promise.all([
      fetchGz('jieba-dict.txt.gz'),
      fetchGz('jieba-hmm.json.gz'),
      fetchGz('jieba-pos.json.gz'),
      fetch(BASE + 'pos-zh.json').then(r => r.ok ? r.json() : {}),
    ]);
    const built = buildPrefixDict(dictText);
    FREQ = built.freq; POS = built.pos; TOTAL = built.total;
    HMM = JSON.parse(hmmText);
    PM = JSON.parse(posmText);
    PM.allStates = Object.keys(PM.trans);
    POS_ZH = posText;
    return true;
  })();
  return loading;
}

/* ---------- DAG + dynamic programming ------------------------------------ */

function getDAG(s) {
  const dag = new Map();
  const n = s.length;
  for (let k = 0; k < n; k++) {
    const list = [];
    let i = k, frag = s[k];
    while (i < n && FREQ.has(frag)) {
      if (FREQ.get(frag) > 0) list.push(i);
      i += 1;
      frag = s.slice(k, i + 1);
    }
    if (!list.length) list.push(k);
    dag.set(k, list);
  }
  return dag;
}

function calc(s, dag) {
  const n = s.length;
  const route = new Array(n + 1);
  route[n] = [0, 0];
  const logTotal = Math.log(TOTAL);
  for (let idx = n - 1; idx >= 0; idx--) {
    let best = -Infinity, bestX = 0;
    for (const x of dag.get(idx)) {
      const w = s.slice(idx, x + 1);
      const f = FREQ.get(w) || 0;
      const lp = (f > 0 ? Math.log(f) : 0) - logTotal + route[x + 1][0];
      // strictly greater: Python's max() keeps the first of equal candidates,
      // and the DAG is scanned in the same ascending order here
      if (lp > best) { best = lp; bestX = x; }
    }
    route[idx] = [best, bestX];
  }
  return route;
}

/* ---------- HMM for unknown runs ----------------------------------------- */

const PREV = { B: ['E', 'S'], M: ['M', 'B'], S: ['S', 'E'], E: ['B', 'M'] };
const MIN_FLOAT = -3.14e100;

function viterbi(s) {
  const states = ['B', 'M', 'E', 'S'];
  let V = [{}];
  const path = {};
  for (const y of states) {
    const em = HMM.emit[y][s[0]];
    V[0][y] = HMM.start[y] + (em === undefined ? MIN_FLOAT : em);
    path[y] = [y];
  }
  for (let t = 1; t < s.length; t++) {
    V.push({});
    const newPath = {};
    for (const y of states) {
      const em = HMM.emit[y][s[t]];
      const emp = em === undefined ? MIN_FLOAT : em;
      let best = MIN_FLOAT, bestState = PREV[y][0];
      for (const y0 of PREV[y]) {
        const tr = HMM.trans[y0] && HMM.trans[y0][y];
        const p = V[t - 1][y0] + (tr === undefined ? MIN_FLOAT : tr) + emp;
        if (p > best) { best = p; bestState = y0; }
      }
      V[t][y] = best;
      newPath[y] = path[bestState].concat(y);
    }
    for (const k in path) delete path[k];
    Object.assign(path, newPath);
  }
  const last = V[s.length - 1];
  const end = last.E >= last.S ? 'E' : 'S';
  return path[end];
}

function* cutHMM(s) {
  const pos = viterbi(s);
  let begin = 0, nexti = 0;
  for (let i = 0; i < s.length; i++) {
    const state = pos[i];
    if (state === 'B') begin = i;
    else if (state === 'E') { yield s.slice(begin, i + 1); nexti = i + 1; }
    else if (state === 'S') { yield s[i]; nexti = i + 1; }
  }
  if (nexti < s.length) yield s.slice(nexti);
}

/* ---------- the accurate-mode cut ---------------------------------------- */

const RE_HAN = /([一-鿕]+)/;
const RE_SKIP = /([a-zA-Z0-9]+(?:\.\d+)?%?)/;
const RE_ENG = /^[a-zA-Z0-9]$/;

function* cutBlock(s, useHMM) {
  const dag = getDAG(s);
  const route = calc(s, dag);
  let x = 0, buf = '';
  const n = s.length;
  while (x < n) {
    const y = route[x][1] + 1;
    const w = s.slice(x, y);
    // EVERY single-character step joins the buffer, not only the ones missing
    // from the dictionary. 内, 亚, 龚, 粟, 特 all have entries of their own, so
    // a `!FREQ.get(w)` guard here keeps them apart and 内亚 / 龚煌城 / 粟特
    // never reach the HMM that would join them. This is the whole reason the
    // port is diffed against Python rather than eyeballed.
    if (y - x === 1) {
      buf += w;
    } else {
      if (buf) {
        yield* flush(buf, useHMM);
        buf = '';
      }
      yield w;
    }
    x = y;
  }
  if (buf) yield* flush(buf, useHMM);
}

function* flush(buf, useHMM) {
  if (buf.length === 1) { yield buf; return; }
  if (!FREQ.get(buf)) {
    if (useHMM) { yield* cutHMM(buf); return; }
    for (const c of buf) yield c;
    return;
  }
  for (const c of buf) yield c;
}

/* jieba splits the input into Han blocks and everything else first, so that
   punctuation and Latin never enter the DAG. Reproduced here including the
   empty-string guard, which is what keeps a leading separator from emitting a
   zero-length token. */
function* cutAll(sentence, useHMM) {
  const blocks = sentence.split(RE_HAN);
  for (const blk of blocks) {
    if (!blk) continue;
    if (RE_HAN.test(blk) && /^[一-鿕]+$/.test(blk)) {
      yield* cutBlock(blk, useHMM);
    } else {
      for (const x of blk.split(RE_SKIP)) {
        if (!x) continue;
        if (RE_SKIP.test(x) && /^[a-zA-Z0-9]/.test(x)) yield x;
        else for (const ch of x) yield ch;
      }
    }
  }
}

/* ---------- posseg -------------------------------------------------------
   jieba.posseg is a SECOND segmenter, not a tagger bolted onto the first. Its
   HMM states are (B/M/E/S, tag) pairs, so the same run of unknown characters
   can be cut differently here than by finalseg — 我们中出了一个叛徒 gives
   中出/了 from jieba.cut and 中/出/了 from posseg — and the tag for an unknown
   word comes out of the same Viterbi rather than being looked up afterwards.
   That is what lets 龚煌城 come back as a person and 临潢府 as a place.

   Two details decide whether this agrees with Python:
     - the candidate set at each step is `charStates[ch] ∩ reachable`, falling
       back to reachable, then to every state — narrowing it any further
       silently changes the answer on rare characters
     - ties are broken by the LARGEST state, because Python compares
       (prob, state) tuples. States are written "B,n"; ',' sorts below every
       letter, so JS string order reproduces Python tuple order exactly. */

function posViterbi(obs) {
  const V = [{}], memPath = [{}];
  const all = PM.allStates;
  const first = PM.charStates[obs[0]] || all;
  for (const y of first) {
    const em = PM.emit[y] && PM.emit[y][obs[0]];
    V[0][y] = (PM.start[y] === undefined ? MIN_FLOAT : PM.start[y]) +
              (em === undefined ? MIN_FLOAT : em);
    memPath[0][y] = '';
  }
  for (let t = 1; t < obs.length; t++) {
    V.push({}); memPath.push({});
    const prev = Object.keys(memPath[t - 1]).filter(
      x => PM.trans[x] && Object.keys(PM.trans[x]).length > 0);
    const reachable = new Set();
    for (const x of prev) for (const y in PM.trans[x]) reachable.add(y);
    let cands = (PM.charStates[obs[t]] || all).filter(y => reachable.has(y));
    if (!cands.length) cands = reachable.size ? [...reachable] : all;

    for (const y of cands) {
      const em = PM.emit[y] && PM.emit[y][obs[t]];
      const emp = em === undefined ? MIN_FLOAT : em;
      let best = -Infinity, bestState = null;
      for (const y0 of prev) {
        const tr = PM.trans[y0][y];
        const p = V[t - 1][y0] + (tr === undefined ? MIN_FLOAT : tr) + emp;
        // >= with the larger state wins: Python's max over (prob, state)
        if (p > best || (p === best && (bestState === null || y0 > bestState))) {
          best = p; bestState = y0;
        }
      }
      V[t][y] = best;
      memPath[t][y] = bestState;
    }
  }
  const lastKeys = Object.keys(memPath[obs.length - 1]);
  let bestP = -Infinity, state = lastKeys[0];
  for (const y of lastKeys) {
    const p = V[obs.length - 1][y];
    if (p > bestP || (p === bestP && y > state)) { bestP = p; state = y; }
  }
  const route = new Array(obs.length);
  for (let i = obs.length - 1; i >= 0; i--) {
    route[i] = state;
    state = memPath[i][state];
  }
  return route;
}

function* posCutHMM(sentence) {
  const route = posViterbi(sentence);
  let begin = 0, nexti = 0;
  for (let i = 0; i < sentence.length; i++) {
    const [bmes, tag] = route[i].split(',');
    if (bmes === 'B') begin = i;
    else if (bmes === 'E') { yield [sentence.slice(begin, i + 1), tag]; nexti = i + 1; }
    else if (bmes === 'S') { yield [sentence[i], tag]; nexti = i + 1; }
  }
  if (nexti < sentence.length) {
    yield [sentence.slice(nexti), route[nexti].split(',')[1]];
  }
}

const RE_HAN_DETAIL = /([一-鿕]+)/;
const RE_SKIP_DETAIL = /([\.0-9]+|[a-zA-Z0-9]+)/;
const RE_NUM = /^[\.0-9]+$/;
const RE_ENG_W = /^[a-zA-Z0-9]+$/;

function* posCutDetail(sentence) {
  for (const blk of sentence.split(RE_HAN_DETAIL)) {
    if (!blk) continue;
    if (/^[一-鿕]+$/.test(blk)) { yield* posCutHMM(blk); continue; }
    for (const x of blk.split(RE_SKIP_DETAIL)) {
      if (!x) continue;
      if (RE_SKIP_DETAIL.test(x) && (RE_NUM.test(x) || RE_ENG_W.test(x))) {
        yield [x, 'x'];
      } else {
        for (const xx of x) {
          if (RE_NUM.test(xx)) yield [xx, 'm'];
          else if (RE_ENG_W.test(x)) yield [xx, 'eng'];
          else yield [xx, 'x'];
        }
      }
    }
  }
}

const tagOf = w => POS.get(w) || 'x';

function* posCutDAG(sentence) {
  const dag = getDAG(sentence);
  const route = calc(sentence, dag);
  let x = 0, buf = '';
  const N = sentence.length;
  while (x < N) {
    const y = route[x][1] + 1;
    const w = sentence.slice(x, y);
    if (y - x === 1) { buf += w; }
    else {
      if (buf) { yield* posFlush(buf); buf = ''; }
      yield [w, tagOf(w)];
    }
    x = y;
  }
  if (buf) yield* posFlush(buf);
}

function* posFlush(buf) {
  if (buf.length === 1) { yield [buf, tagOf(buf)]; return; }
  if (!FREQ.get(buf)) { yield* posCutDetail(buf); return; }
  for (const c of buf) yield [c, tagOf(c)];
}

const RE_HAN_INTERNAL = /([一-鿕a-zA-Z0-9+#&\._%\-]+)/;
const RE_SKIP_INTERNAL = /(\r\n|\s)/;

function* posCut(sentence) {
  for (const blk of sentence.split(RE_HAN_INTERNAL)) {
    if (!blk) continue;
    if (RE_HAN_INTERNAL.test(blk) && /^[一-鿕a-zA-Z0-9+#&\._%\-]+$/.test(blk)) {
      yield* posCutDAG(blk);
      continue;
    }
    for (const x of blk.split(RE_SKIP_INTERNAL)) {
      if (!x) continue;
      if (RE_SKIP_INTERNAL.test(x) && /^(\r\n|\s)$/.test(x)) { yield [x, 'x']; }
      else for (const xx of x) yield [xx, 'x'];
    }
  }
}

/* ---------- public surface ----------------------------------------------- */

window.jiebaSeg = {
  load,
  ready: () => FREQ !== null,

  /** jieba.posseg.cut — segmentation and part of speech in one pass.
   *  Returns [{w, pos, posZh, known}]; `known` says whether the word is in the
   *  dictionary, so the UI can show which tags were read off an entry and
   *  which the HMM inferred. */
  tag(sentence) {
    if (!FREQ) throw new Error('jieba dictionary not loaded');
    const out = [];
    for (const [w, p] of posCut(sentence)) {
      out.push({
        w,
        pos: p,
        posZh: POS_ZH[p] || p,
        known: FREQ.has(w) && FREQ.get(w) > 0,
      });
    }
    return out;
  },

  cut(sentence, useHMM = true) {
    return [...cutAll(sentence, useHMM)];
  },

  stats: () => ({ words: FREQ ? FREQ.size : 0, total: TOTAL }),
};

})();
