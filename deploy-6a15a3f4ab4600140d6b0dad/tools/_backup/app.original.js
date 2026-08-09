/* ============================================================
   TANGUT.DECRYPT — Application
   ============================================================ */

(() => {
'use strict';

// ===== STATE =====
// Multi-script: each script (tangut / khitan) holds its own entries + indices.
// On switchScript(), the active script's slice is copied into the root state
// so all existing code that reads state.entries / state.glossVectors / etc.
// keeps working without per-call indirection.
const state = {
  script: 'tangut',
  scripts: {
    tangut: { label: '西夏 TANGUT', meta: 'U+17000–U+187FF', font: 'tng', range: [0x17000, 0x187FF] },
    khitan: { label: '契丹 KHITAN', meta: 'U+E000–U+E7F3 (PUA)', font: 'khi', range: [0xE000, 0xE7F3] },
  },

  // === Aliases mirror active script (populated by switchScript) ===
  entries: [],
  entriesByUid: new Map(),  // uid → entry
  cooccur: new Map(),
  synonyms: new Map(),
  charPPMI: new Map(),
  glossVectors: [],
  charsByPinyin: new Map(),
  entryPinyinSet: new Map(),// uid → Set<pinyin>

  // === UI state (cross-script) ===
  filtered: [],
  selected: null,
  mode: 'auto',
  fuzzy: true,
  autocopy: false,
  query: '',
  searchTimer: null,

  // === Last search bookkeeping ===
  lastExpansion: null,
  lastPathStats: null,
};

// ===== POS labels & curated thesaurus =====
// POS tags get stripped before synonym extraction.
const POS_LABELS = ['名詞','動詞','形容詞','副詞','量詞','介詞','連詞','代詞','助詞','感嘆詞','譯音','漢語借詞','詞綴','數詞'];

// Curated near-synonyms (in Simplified). Augments data-derived index for common
// classical concepts (body parts / motion / sensory / nature / qualities / kinship).
// Values are concatenated chars; each gets a high baseline weight.
const CURATED_SYNONYMS = {
  // body / head
  '头':'首顶颅元额脑','首':'头顶领元','面':'颜貌脸容','脸':'面颜貌','颜':'面貌容',
  '眼':'目瞳眸睛','目':'眼瞳眸','耳':'听闻','鼻':'嗅','口':'嘴唇','嘴':'口唇',
  '牙':'齿','齿':'牙','舌':'','心':'念思意情感','胸':'膺','背':'脊',
  '手':'掌指拳','足':'脚踝跟','脚':'足踝','腿':'股胫','腹':'肚胃','发':'毛鬓须','毛':'发',
  // motion / posture
  '走':'行步跑奔移','行':'走步移迈','跑':'走奔','飞':'翔翱腾','跳':'跃踊',
  '坐':'居处','立':'站','卧':'寝睡眠','睡':'寐眠卧寝','起':'立',
  // sense / cognition
  '看':'视观望见瞧瞻','见':'视看观望','视':'看观望见','听':'闻聆',
  '说':'言语谈讲谓道','言':'语说谈讲','想':'思念虑忆','思':'想念虑',
  '知':'晓识觉','学':'习','教':'诲训','问':'询咨','答':'应',
  // emotion
  '爱':'怜慕喜','恨':'怨憎恶','怒':'愤怨恚恼','喜':'悦乐欣愉',
  '悲':'哀痛伤悼','忧':'愁烦虑','畏':'惧怕恐','怕':'惧恐畏',
  // nature
  '水':'川河江海溪流','河':'川江溪水','山':'岳岭丘冈峰','火':'炎焰燃烧焚',
  '土':'地壤泥','木':'树林','金':'银铜铁','石':'岩',
  '日':'阳','月':'阴','星':'辰','天':'空苍霄','地':'土',
  '风':'气','云':'霭','雨':'雪雷电','雷':'电霹','雪':'霜',
  '草':'荑卉','花':'葩','果':'实','叶':'','树':'木林',
  // quality
  '大':'巨伟硕庞宏','小':'微细少寡','多':'众繁丰','少':'寡稀',
  '高':'巍峻峭崇','低':'矮卑','长':'永','短':'促',
  '新':'初鲜','旧':'故古陈','远':'遥','近':'侧邻',
  '快':'速捷','慢':'迟缓','强':'壮盛','弱':'羸',
  '美':'丽好妙','丑':'陋','好':'善佳','坏':'恶劣',
  '红':'赤朱丹','黑':'玄','白':'素皓','黄':'金','青':'蓝','绿':'翠',
  // kinship / society
  '人':'民','王':'帝君主','臣':'宦','官':'吏','兵':'军卒戎',
  '父':'爹','母':'娘','子':'儿','兄':'哥','弟':'','姐':'','妹':'',
  '夫':'婿','妻':'妇','男':'雄','女':'雌',
  // animals
  '马':'驹骏','牛':'犊','羊':'','猪':'豕','狗':'犬','鸡':'雏',
  '鸟':'雀禽','鱼':'','虫':'','蛇':'蝮','龙':'','虎':'',
  // implements / culture
  '剑':'刀斧戟','弓':'矢箭','甲':'盔铠','旗':'幡幟',
  '战':'斗争','杀':'诛戮','死':'亡毙殁','生':'产育',
  '衣':'袍襟','帽':'冠','门':'户','路':'道径途','城':'邑都',
  '酒':'酿','茶':'','米':'粟稻黍','麦':'','食':'吃啖餐','吃':'食啖',
  // direction / position
  '上':'顶','下':'底','中':'内','内':'里中','外':'',
  '左':'','右':'','前':'先','后':'末',
  '东':'','西':'','南':'','北':'',
  // verbs of state / action
  '有':'存在','无':'没','是':'为','非':'否',
  '取':'拿','给':'付','送':'赠','受':'纳','收':'获',
  '开':'启辟','关':'闭','破':'坏毁','补':'修',
  '入':'进','出':'去','来':'至','到':'至',
};

// ===== DOM REFS =====
const dom = {};
function bindDom() {
  const ids = [
    'q', 'clear-btn', 'search-stats', 'results', 'result-count',
    'detail', 'detail-id', 'detail-foot', 'entries-count',
    'status-text', 'proc-time', 'mem-load', 'mode-display',
    'clock', 'copy-flash', 'copy-flash-payload', 'tooltip',
    'rank-meta', 'boot-log', 'boot-overlay',
    'fuzzy-toggle', 'autocopy-toggle',
    'script-label', 'range-meta'
  ];
  for (const id of ids) dom[id] = document.getElementById(id);
  dom.tabs = document.querySelectorAll('.tab');
  dom.scriptTabs = document.querySelectorAll('.script-tab');
}

// ===== BOOT SEQUENCE =====
const bootLines = [
  ['[OK]', 'init core //', 'TANGUT.DECRYPT v2.6.0'],
  ['[OK]', 'mount fontset //', 'Noto Sans Tangut · JetBrains Mono'],
  ['[OK]', 'load corpus //', 'tangut_all.json'],
  ['[OK]', 'index entries //', '6051 records · 6144 codepoints'],
  ['[OK]', 'reconstruction layers //', 'gong · miyake · arakawa · gongxun'],
  ['[OK]', 'orthography map //', 'TC↔SC bidirectional'],
  ['[..]', 'spinning up search engine //', ''],
  ['[OK]', 'system ready //', 'awaiting query input'],
];

function runBoot() {
  let i = 0;
  const interval = setInterval(() => {
    if (i >= bootLines.length) {
      clearInterval(interval);
      setTimeout(() => {
        dom['boot-overlay'].classList.add('hidden');
        setTimeout(() => dom['boot-overlay'].remove(), 800);
        dom.q && dom.q.focus();
      }, 200);
      return;
    }
    const [tag, msg, val] = bootLines[i];
    const div = document.createElement('div');
    div.className = 'line';
    div.style.animationDelay = (i * 0.03) + 's';
    div.innerHTML = `<span class="ok">${tag}</span> ${msg} <span class="ok">${val}</span>`;
    dom['boot-log'].appendChild(div);
    i++;
  }, 130);
}

// ===== DATA INGEST =====
const nfc = s => (s || '').normalize('NFC');

function ingestTangut() {
  const data = window.tangutData || {};
  const out = [];
  for (const key in data) {
    const cp = parseInt(key, 10);
    if (!cp) continue;
    const info = data[key];
    const ch = String.fromCodePoint(cp);
    const meaning = info.meaning || '';
    // Phonetics array — 4 reconstruction systems for Tangut
    const phonetics = [
      { key: 'gong',    label: 'GONG',    sublabel: '龔煌城',    value: nfc(info.gong)    },
      { key: 'miyake',  label: 'MIYAKE',  sublabel: 'M. Miyake', value: nfc(info.miyake)  },
      { key: 'arakawa', label: 'ARAKAWA', sublabel: '荒川慎太郎', value: nfc(info.arakawa) },
      { key: 'gongxun', label: 'GONGXUN', sublabel: '龔勳 ’24',  value: nfc(info.gongxun) },
    ];
    const uid = 'tng:' + cp;
    out.push({
      uid,
      cp,
      ch,
      hex: 'U+' + cp.toString(16).toUpperCase().padStart(5, '0'),
      meaning,
      meaningSimp: window.toSimp ? window.toSimp(meaning) : meaning,
      meaningCharSet: buildCharSet(meaning),
      phonetics,
      type: 'char',
      script: 'tangut',
    });
  }
  out.sort((a, b) => a.cp - b.cp);
  state.scripts.tangut.entries = out;
  state.scripts.tangut.entriesByUid = new Map(out.map(e => [e.uid, e]));
}

function ingestKhitan() {
  const data = window.khitanData || { chars: [], vocabs: [] };
  const out = [];
  // (a) Individual KSS characters
  for (const c of data.chars) {
    if (!c.ch) continue;
    const uid = 'khi-c:' + c.cp;
    const phon = c.pron ? [{ key: 'kane', label: 'CCAMC', sublabel: 'Kane / 吉田', value: nfc(c.pron) }] : [];
    out.push({
      uid,
      cp: c.cp,
      ch: c.ch,
      hex: 'U+' + c.cp.toString(16).toUpperCase().padStart(4, '0'),
      meaning: c.meaning || '',
      meaningSimp: window.toSimp ? window.toSimp(c.meaning || '') : (c.meaning || ''),
      meaningCharSet: buildCharSet(c.meaning || ''),
      phonetics: phon,
      type: 'char',
      script: 'khitan',
      kss_id: c.kss_id,
      kane_id: c.kane_id || '',
      stroke_count: c.stroke_count || '',
      rel_ksws: c.rel_ksws || [],
    });
  }
  // (b) KSW vocabulary entries (multi-char words)
  for (const v of data.vocabs) {
    if (!v.ksw) continue;
    const cp0 = v.cp;
    const cps = [...v.ksw].map(c => c.codePointAt(0));
    const hex = cps.map(c => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join('+');
    const uid = 'khi-v:' + v.ksw;
    out.push({
      uid,
      cp: cp0,
      ch: v.ksw,
      hex,
      meaning: v.meaning || '',
      meaningSimp: window.toSimp ? window.toSimp(v.meaning || '') : (v.meaning || ''),
      meaningCharSet: buildCharSet(v.meaning || ''),
      phonetics: [],
      type: 'vocab',
      script: 'khitan',
      rel_kss_ids: v.rel_kss_ids || [],
      length: cps.length,
    });
  }
  state.scripts.khitan.entries = out;
  state.scripts.khitan.entriesByUid = new Map(out.map(e => [e.uid, e]));
}

// === Switch the active script (copies that script's slice into root state) ===
function switchScript(name) {
  if (!state.scripts[name]) return;
  state.script = name;
  const s = state.scripts[name];
  state.entries        = s.entries        || [];
  state.entriesByUid   = s.entriesByUid   || new Map();
  state.cooccur        = s.cooccur        || new Map();
  state.synonyms       = s.synonyms       || new Map();
  state.charPPMI       = s.charPPMI       || new Map();
  state.glossVectors   = s.glossVectors   || [];
  state.charsByPinyin  = s.charsByPinyin  || new Map();
  state.entryPinyinSet = s.entryPinyinSet || new Map();
  state.selected = null;
  // Body class for font + theme tweaks
  document.body.classList.remove('script-tangut', 'script-khitan');
  document.body.classList.add('script-' + name);
  // UI labels
  if (dom['entries-count']) dom['entries-count'].textContent = state.entries.length.toLocaleString();
  if (dom['mem-load'])      dom['mem-load'].textContent      = String(state.entries.length).padStart(4, '0');
  if (dom['range-meta'])    dom['range-meta'].textContent    = s.meta;
  // The third mode-tab label tracks the active script (TANGUT ↔ KHITAN)
  const tngTab = document.querySelector('.tab[data-mode="tng"]');
  if (tngTab) tngTab.textContent = name === 'khitan' ? 'KHITAN' : 'TANGUT';
  // Keep the active state on the matching script switcher chip
  if (dom.scriptTabs) dom.scriptTabs.forEach(x => x.classList.toggle('active', x.dataset.script === name));
  // Re-run search and reselect first entry
  runSearch();
  if (state.entries.length) selectEntry(state.entries[0]);
}

// ===== UTILITIES =====

// Damerau-Levenshtein edit distance with bounded early exit.
function dlDistance(a, b, max = 3) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  if (!m) return n;
  if (!n) return m;
  const prev2 = new Array(n + 1);
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + cost);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= n; j++) { prev2[j] = prev[j]; prev[j] = curr[j]; }
  }
  return prev[n];
}

const CJK_RE_CHAR = c => {
  const code = c.codePointAt(0);
  return code >= 0x4E00 && code <= 0x9FFF;
};

function toCJKArray(s) {
  return [...s].filter(CJK_RE_CHAR);
}

function buildCharSet(text) {
  const s = new Set();
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x4E00 && code <= 0x9FFF) {
      s.add(window.TC2SC?.[ch] || ch);
    }
  }
  return s;
}

// ===== INDEX BUILDERS =====
// Pipeline at boot:
//   buildCooccur   →  buildSynonymIndex   (top-N near-synonyms, for highlights)
//                  →  buildPPMI            (sparse char vectors, semantic basis)
//                  →  buildGlossVectors    (per-entry vectors for cosine search)
//                  +  buildPinyinIndex     (pinyin → char + entry mappings)

// Step 1 — raw co-occurrence of CJK chars within the same gloss (POS stripped).
function buildCooccur() {
  const co = new Map();
  const bump = (a, b) => {
    let m = co.get(a);
    if (!m) { m = new Map(); co.set(a, m); }
    m.set(b, (m.get(b) || 0) + 1);
  };
  for (const e of state.entries) {
    if (!e.meaning) continue;
    let body = e.meaning;
    for (const p of POS_LABELS) body = body.split(p).join('');
    body = body.replace(/[【】《》（）()「」『』\[\]]/g, ' ');
    const concept = new Set();
    for (const ch of body) {
      const code = ch.codePointAt(0);
      if (code >= 0x4E00 && code <= 0x9FFF) {
        concept.add(window.TC2SC?.[ch] || ch);
      }
    }
    if (concept.size === 0 || concept.size > 12) continue;
    const arr = [...concept];
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length; j++) if (i !== j) bump(arr[i], arr[j]);
    }
  }
  state.cooccur = co;
  return co;
}

// Step 2 — derive top-N near-synonym list. Three sources fused:
//   (a) HIT 同义词词林扩展版 (Cilin Ext) — primary, curated by linguists
//   (b) Hand-curated CURATED_SYNONYMS — boosts very common dictionary concepts
//   (c) Corpus co-occurrence — captures Tangut-dictionary-specific clusters
function buildSynonymIndex() {
  const cooccur = state.cooccur;
  const cilin = window.CILIN_SYN || {};
  const out = new Map();
  const allChars = new Set([
    ...cooccur.keys(),
    ...Object.keys(CURATED_SYNONYMS),
    ...Object.keys(cilin),
  ]);
  for (const ch of allChars) {
    const merged = new Map();

    // (a) Cilin — already normalised [0, 1], scale to [0, 0.9]
    const cilinEntries = cilin[ch];
    if (cilinEntries) {
      for (const [c, w] of cilinEntries) {
        if (!c || c === ch) continue;
        merged.set(c, Math.max(merged.get(c) || 0, w * 0.9));
      }
    }

    // (b) Hand-curated — top-positions weighted high
    let pos = 0;
    for (const c of (CURATED_SYNONYMS[ch] || '')) {
      if (!c || c === ch) continue;
      merged.set(c, Math.max(merged.get(c) || 0, 0.75 - pos * 0.04));
      pos++;
    }

    // (c) Corpus co-occurrence — weakest signal, fills tail
    const co = cooccur.get(ch);
    if (co) {
      const sorted = [...co.entries()].sort((a, b) => b[1] - a[1]);
      const best = sorted[0]?.[1] || 1;
      for (let i = 0; i < Math.min(sorted.length, 6); i++) {
        const [c, cnt] = sorted[i];
        if (c === ch) continue;
        const w = (cnt / best) * (0.45 - i * 0.04);
        if (w > 0.1) merged.set(c, Math.max(merged.get(c) || 0, w));
      }
    }

    if (merged.size > 0) {
      out.set(ch, [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
    }
  }
  state.synonyms = out;
  return out;
}

// Step 3 — Positive PMI character vectors (sparse). Each char becomes a vector
// over the chars it co-occurs with, weighted by association strength.
// This is the analog of text2vec embeddings — built via distributional hypothesis
// on our own corpus.
function buildPPMI() {
  const co = state.cooccur;
  const rowSum = new Map();
  let total = 0;
  for (const [c, m] of co) {
    let s = 0;
    for (const v of m.values()) s += v;
    rowSum.set(c, s);
    total += s;
  }
  if (total === 0) { state.charPPMI = new Map(); return; }
  const ppmi = new Map();
  for (const [a, m] of co) {
    const pa = rowSum.get(a) / total;
    const row = [];
    for (const [b, cab] of m) {
      const pb = rowSum.get(b) / total;
      const pab = cab / total;
      const v = Math.log(pab / (pa * pb));
      if (v > 0.10) row.push([b, v]);
    }
    if (row.length) {
      row.sort((x, y) => y[1] - x[1]);
      ppmi.set(a, new Map(row.slice(0, 60))); // cap features per char
    }
  }
  state.charPPMI = ppmi;
  return ppmi;
}

// Step 4 — gloss vectors: for each entry, sum its chars' PPMI rows + self
// features, then L2 normalize. Sparse Map<char, weight>.
function buildGlossVectors() {
  const ppmi = state.charPPMI;
  state.glossVectors = state.entries.map(e => {
    if (!e.meaningCharSet || e.meaningCharSet.size === 0) return null;
    const v = new Map();
    for (const c of e.meaningCharSet) {
      v.set(c, (v.get(c) || 0) + 1.0);          // self feature
      const cv = ppmi.get(c);
      if (!cv) continue;
      for (const [other, w] of cv) v.set(other, (v.get(other) || 0) + w);
    }
    // L2 normalize
    let norm = 0;
    for (const w of v.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    for (const k of v.keys()) v.set(k, v.get(k) / norm);
    return v;
  });
}

// Build query vector with the same encoding as gloss vectors. `charWeights`
// is a Map<char, weight>: query chars at 1.0, synonym chars at <1.0.
function vectorize(charWeights) {
  const ppmi = state.charPPMI;
  const v = new Map();
  for (const [c, w0] of charWeights) {
    v.set(c, (v.get(c) || 0) + w0);
    const cv = ppmi.get(c);
    if (!cv) continue;
    for (const [other, w] of cv) v.set(other, (v.get(other) || 0) + w * w0);
  }
  let norm = 0;
  for (const w of v.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  for (const k of v.keys()) v.set(k, v.get(k) / norm);
  return v;
}

function cosine(a, b) {
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, v] of s) {
    const w = l.get(k);
    if (w) dot += v * w;
  }
  return dot;
}

// Step 5 — pinyin indices: per-entry pinyin set + reverse pinyin→chars map.
function buildPinyinIndex() {
  const PY = window.PINYIN_PLAIN || {};
  const byPy = new Map();
  const entryPy = new Map();
  for (const e of state.entries) {
    const pys = new Set();
    for (const ch of e.meaningCharSet) {
      const py = PY[ch];
      if (!py) continue;
      pys.add(py);
      let s = byPy.get(py);
      if (!s) { s = new Set(); byPy.set(py, s); }
      s.add(ch);
    }
    entryPy.set(e.uid, pys);
  }
  state.charsByPinyin = byPy;
  state.entryPinyinSet = entryPy;
}

// Build all indices for a given script (operates on state.scripts[name]).
// We temporarily point the root state's aliases at that script, run the
// builders (which write to state.cooccur / state.charPPMI / etc.), then snapshot
// the results back into the script slice. Lets us reuse the existing builders
// untouched while supporting multiple scripts.
function buildAllForScript(name) {
  const prev = state.script;
  state.entries        = state.scripts[name].entries;
  state.entriesByUid   = state.scripts[name].entriesByUid;
  state.cooccur        = new Map();
  state.synonyms       = new Map();
  state.charPPMI       = new Map();
  state.glossVectors   = [];
  state.charsByPinyin  = new Map();
  state.entryPinyinSet = new Map();

  buildCooccur();
  buildSynonymIndex();
  buildPPMI();
  buildGlossVectors();
  buildPinyinIndex();

  const s = state.scripts[name];
  s.cooccur        = state.cooccur;
  s.synonyms       = state.synonyms;
  s.charPPMI       = state.charPPMI;
  s.glossVectors   = state.glossVectors;
  s.charsByPinyin  = state.charsByPinyin;
  s.entryPinyinSet = state.entryPinyinSet;
}

// ===== HYBRID SEARCH ENGINE =====
// Two-path retrieval with Reciprocal Rank Fusion:
//   Path L  lexical  · literal substring + char-overlap (TC↔SC normalized)
//   Path P  pinyin   · plain-pinyin match + Damerau-Levenshtein fuzzy
//   Path V  vector   · PPMI cosine similarity (semantic, no overlap needed)
//   Path F  phonetic · reconstruction match (exact/prefix/substr/fuzzy)
//   Path T  tangut   · direct Tangut codepoint
//
// Each path returns ranked Array<entry>. mergeRRF combines by reciprocal rank,
// boosting entries that appear in multiple paths.

const PINYIN_RE = /^[a-z]+$/;
const PHON_HINT_RE = /[¹²³ʰśźʈɖɭɳʐɲʒŋʂɕɣɛɔ̱ạịụẹọṃ\d?]/;

// Active script's codepoint range (Tangut SMP block or Khitan PUA).
function scriptRange() {
  return state.scripts[state.script].range;
}
function isScriptCodepoint(cp) {
  const [lo, hi] = scriptRange();
  return cp >= lo && cp <= hi;
}

function detectMode(q) {
  if (state.mode !== 'auto') return state.mode;
  if (!q) return 'auto';
  const first = q.codePointAt(0);
  if (isScriptCodepoint(first)) return 'tng';
  if (/[一-鿿]/.test(q)) return 'cn';
  if (PHON_HINT_RE.test(q)) return 'phon';
  return 'auto';
}

// ---------- Path T : direct script-character ----------
// (Works for both Tangut SMP and Khitan PUA — uses the active script's range)
function pathTangut(q) {
  const codepoints = [...q].filter(ch => isScriptCodepoint(ch.codePointAt(0)));
  if (!codepoints.length) return [];
  const hits = [];
  const seen = new Set();
  // For multi-char Khitan ksw, also try matching the entire query as a ksw substring
  for (const e of state.entries) {
    if (seen.has(e.uid)) continue;
    if (e.ch === q || (e.type === 'vocab' && e.ch && e.ch.includes(q))) {
      hits.push(e); seen.add(e.uid); continue;
    }
    // single-codepoint match
    for (const target of codepoints) {
      if (e.ch === target) { hits.push(e); seen.add(e.uid); break; }
    }
  }
  return hits;
}

// ---------- Path L : lexical / literal ----------
function pathLexical(q) {
  const qSimp = window.toSimp ? window.toSimp(q) : q;
  const qTrad = window.toTrad ? window.toTrad(q) : q;
  const queryChars = toCJKArray(qSimp);
  const scored = [];
  for (const e of state.entries) {
    if (!e.meaning) continue;
    let score = 0;
    if (e.meaning.includes(q))           score += 200;
    else if (e.meaning.includes(qTrad))  score += 190;
    else if (e.meaningSimp.includes(qSimp)) score += 180;
    if (queryChars.length) {
      let overlap = 0;
      for (const c of queryChars) if (e.meaningCharSet.has(c)) overlap++;
      if (overlap) score += overlap * (20 + (overlap / queryChars.length) * 30);
    }
    if (score > 0) scored.push({ entry: e, score });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    a.entry.meaning.length - b.entry.meaning.length ||
    a.entry.cp - b.entry.cp
  );
  return scored.slice(0, 150).map(s => s.entry);
}

// ---------- Path P : pinyin ----------
// Strategy: exact pinyin match dominates. Fuzzy (edit-distance ≤1) is only
// attempted for tokens that have no exact pinyin match in the corpus — so
// "tou" never expands to {tao,dou,lou,…}, but typo "tuo" → still finds {tou}.
// Scoring: per-entry score = max single weight + 0.05 × additional matches
// (prevents broad-but-weak entries beating focused exact-match entries).
function pathPinyin(q) {
  const PY = window.PINYIN_PLAIN || {};
  if (!state.charsByPinyin.size) return [];

  const raw = [];
  const latinMatches = q.toLowerCase().match(/[a-z]+/g);
  if (latinMatches) for (const t of latinMatches) raw.push(t);
  for (const c of toCJKArray(q)) {
    const simp = window.TC2SC?.[c] || c;
    const py = PY[simp];
    if (py) raw.push(py);
  }
  if (!raw.length) return [];

  const matchedPys = new Map();         // py → weight
  const exactSet = new Set();           // pinyins that came from an EXACT user-token match
  const allPys = [...state.charsByPinyin.keys()];

  for (const t of raw) {
    if (state.charsByPinyin.has(t)) {
      // Exact pinyin → strong weight, no fuzzy expansion
      matchedPys.set(t, Math.max(matchedPys.get(t) || 0, 3.0));
      exactSet.add(t);
      continue;
    }
    // No exact match for this token → fuzzy fallback (typo tolerance)
    if (t.length >= 2) {
      const maxEdit = t.length >= 5 ? 2 : 1;
      for (const py of allPys) {
        if (Math.abs(py.length - t.length) > maxEdit) continue;
        const d = dlDistance(t, py, maxEdit);
        if (d <= maxEdit && d > 0) {
          const w = d === 1 ? 0.7 : 0.20;
          matchedPys.set(py, Math.max(matchedPys.get(py) || 0, w));
        }
      }
    }
  }
  if (!matchedPys.size) return [];

  const scored = [];
  for (const e of state.entries) {
    const eps = state.entryPinyinSet.get(e.uid);
    if (!eps || !eps.size) continue;
    let maxW = 0, extras = 0;
    for (const [py, w] of matchedPys) {
      if (!eps.has(py)) continue;
      if (w > maxW) { extras += (maxW > 0 ? 1 : 0); maxW = w; }
      else extras++;
    }
    if (maxW > 0) scored.push({ entry: e, score: maxW + 0.05 * extras });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    a.entry.meaning.length - b.entry.meaning.length ||
    a.entry.cp - b.entry.cp
  );
  return scored.slice(0, 150).map(s => s.entry);
}

// ---------- Path V : vector / semantic ----------
// Builds a query vector that includes the literal query chars AT WEIGHT 1.0 +
// their cilin/curated/corpus near-synonyms at <1.0. So a search for "头"
// already pulls in 脑/首/颅/骨 in the query vector — boosting recall for
// glosses that use synonymous chars instead of the exact query char.
function pathVector(q) {
  if (!state.glossVectors.length) return [];
  const qSimp = window.toSimp ? window.toSimp(q) : q;
  const queryChars = toCJKArray(qSimp);
  if (!queryChars.length) return [];

  const charWeights = new Map();
  const inputSet = new Set(queryChars);
  for (const c of queryChars) charWeights.set(c, 1.0);

  const expansionLog = [];
  for (const c of queryChars) {
    const syns = state.synonyms.get(c);
    if (!syns) continue;
    const neighbours = [];
    for (const [sc, w] of syns) {
      if (inputSet.has(sc)) continue;
      if (w < 0.25) continue;
      // Synonym contribution: scale down so query chars dominate
      const v = Math.min(0.7, w * 0.7);
      charWeights.set(sc, Math.max(charWeights.get(sc) || 0, v));
      neighbours.push({ ch: sc, w: v });
    }
    if (neighbours.length) expansionLog.push({ base: c, neighbours: neighbours.slice(0, 6) });
  }
  state.lastExpansion = expansionLog.length ? expansionLog : null;

  const qv = vectorize(charWeights);
  if (!qv.size) return [];

  const scored = [];
  for (let i = 0; i < state.entries.length; i++) {
    const gv = state.glossVectors[i];
    if (!gv) continue;
    const sim = cosine(qv, gv);
    if (sim >= 0.08) scored.push({ entry: state.entries[i], score: sim });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.cp - b.entry.cp);
  return scored.slice(0, 150).map(s => s.entry);
}

// ---------- Path F : phonetic reconstruction ----------
// Two sub-paths returned separately so RRF can weight them differently:
//   { literal: [...] }  exact / prefix / substring on any reconstruction
//   { fuzzy:   [...] }  Damerau-Levenshtein ≤1 fallback (no literal hit)
function pathPhonetic(q) {
  const ql = q.normalize('NFC').toLowerCase();
  if (!ql) return { literal: [], fuzzy: [] };
  const literal = [];
  const fuzzy = [];

  for (const e of state.entries) {
    let best = 0;
    for (const ph of e.phonetics || []) {
      const v = (ph.value || '').toLowerCase();
      if (!v) continue;
      if (v === ql)              best = Math.max(best, 250);
      else if (v.startsWith(ql)) best = Math.max(best, 150);
      else if (v.includes(ql))   best = Math.max(best, 80);
    }
    if (best > 0) { literal.push({ entry: e, score: best }); continue; }

    if (ql.length >= 3) {
      let bestFuzzy = 0;
      for (const ph of e.phonetics || []) {
        const v = (ph.value || '').toLowerCase();
        if (!v) continue;
        if (Math.abs(v.length - ql.length) > 1) continue;
        const d = dlDistance(v, ql, 1);
        if (d <= 1) { bestFuzzy = 35; break; }
      }
      if (bestFuzzy > 0) fuzzy.push({ entry: e, score: bestFuzzy });
    }
  }
  literal.sort((a, b) => b.score - a.score || a.entry.cp - b.entry.cp);
  fuzzy.sort((a, b)   => b.score - a.score || a.entry.cp - b.entry.cp);
  return {
    literal: literal.slice(0, 150).map(s => s.entry),
    fuzzy:   fuzzy.slice(0, 100).map(s => s.entry),
  };
}

// ---------- Hybrid orchestrator ----------
function search(q) {
  q = (q || '').trim();
  if (!q) return { results: [], paths: [], pathStats: null };

  const mode = state.mode;
  const hasTng = [...q].some(ch => isScriptCodepoint(ch.codePointAt(0)));
  const hasCJK = /[一-鿿]/.test(q);
  const hasLatin = /[a-zA-Z]/.test(q);

  state.lastExpansion = null;

  const paths = [];
  const stats = {};
  const push = (name, results) => {
    stats[name] = results.length;
    if (results.length) paths.push({ name, results });
  };

  if (hasTng) {
    push('T', pathTangut(q));
  }
  if (mode === 'tng') {
    state.lastPathStats = stats;
    return mergeRRF(paths);
  }

  // Lexical & vector for any CJK presence (or explicit CN mode)
  if (hasCJK || mode === 'cn') {
    push('L', pathLexical(q));
    if (state.fuzzy) push('V', pathVector(q));
  }

  // Pinyin path: useful for any query — Latin (typed pinyin) or CJK (auto-convert)
  if (mode !== 'phon') {
    push('P', pathPinyin(q));
  }

  // Phonetic: only when Latin chars present (or explicit phon mode)
  // Split into Fx (literal — high confidence) and Ff (fuzzy fallback — low confidence)
  if (hasLatin || mode === 'phon') {
    const phon = pathPhonetic(q);
    push('Fx', phon.literal);
    push('Ff', phon.fuzzy);
  }

  state.lastPathStats = stats;
  return mergeRRF(paths);
}

// Weighted Reciprocal Rank Fusion. k=60 is standard. Per-path weights reflect
// how confident a hit from that path tends to be:
//   T direct Tangut codepoint   — exact identity match
//   L literal Chinese substring — high precision
//   P pinyin (exact-only)       — strong: pinyin-search semantics
//   V semantic cosine           — softer: distributional similarity
//   F phonetic recon. (incl. fuzzy fallback) — softest: noisy edit-dist
const PATH_WEIGHT = {
  T: 2.0,    // direct Tangut codepoint
  L: 1.5,    // literal Chinese substring / char overlap
  P: 1.4,    // pinyin (exact-only; fuzzy fallback already kicks in only when needed)
  V: 1.0,    // semantic cosine (vector path — text2vec analog)
  Fx: 1.8,   // phonetic LITERAL (exact / prefix / substring) — strongest single signal
  Ff: 0.5,   // phonetic FUZZY (edit-dist fallback) — typo tolerance, low confidence
};

function mergeRRF(paths, k = 60) {
  const score = new Map();
  const prov = new Map();
  const ranks = new Map();
  for (const { name, results } of paths) {
    const w = PATH_WEIGHT[name] ?? 1.0;
    results.forEach((entry, idx) => {
      const key = entry.uid;
      score.set(key, (score.get(key) || 0) + w / (k + idx + 1));
      let p = prov.get(key); if (!p) { p = new Set(); prov.set(key, p); } p.add(name);
      let r = ranks.get(key); if (!r) { r = {}; ranks.set(key, r); } r[name] = idx + 1;
    });
  }
  const merged = [];
  for (const [uid, s] of score) {
    const entry = state.entriesByUid.get(uid);
    if (!entry) continue;
    merged.push({ entry, score: s, paths: [...prov.get(uid)].sort(), ranks: ranks.get(uid) });
  }
  merged.sort((a, b) =>
    b.score - a.score ||
    b.paths.length - a.paths.length ||
    a.entry.cp - b.entry.cp
  );
  return { results: merged.slice(0, 250), pathCount: paths.length };
}

// ===== RENDERING =====

function highlightMatch(text, query, isSimp) {
  if (!text || !query) return escapeHtml(text);
  const escText = escapeHtml(text);
  const escQuery = escapeRegex(query);
  // Try matching simplified too
  let re;
  try {
    re = new RegExp(escQuery, 'gi');
  } catch (e) {
    return escText;
  }
  return escText.replace(re, m => `<span class="match">${m}</span>`);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderResults(rows, q) {
  const list = dom.results;
  list.innerHTML = '';
  dom['result-count'].textContent = String(rows.length).padStart(4, '0');

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'results-empty';
    empty.innerHTML = q
      ? `<div>NO MATCH</div><div style="margin-top:8px;font-size:9px;">QUERY: <span style="color:var(--c-amber)">${escapeHtml(q)}</span></div>`
      : `<div>ENTER QUERY ABOVE</div>`;
    list.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  const limit = Math.min(rows.length, 200);
  for (let i = 0; i < limit; i++) frag.appendChild(buildRow(rows[i], i, q));
  list.appendChild(frag);
}

function buildRow(row, idx, q) {
  const e = row.entry;
  const paths = row.paths || [];
  const el = document.createElement('div');
  el.className = 'result-row';
  el.style.animationDelay = Math.min(idx * 0.012, 0.4) + 's';
  el.dataset.cp = e.cp;
  if (state.selected && state.selected.uid === e.uid) el.classList.add('active');

  const phon = (e.phonetics && e.phonetics.find(p => p.value)?.value) || '';
  const meaningHL = q ? highlightMatchInMeaning(e.meaning, q) : escapeHtml(e.meaning);

  const badges = paths.length
    ? paths.map(p => `<span class="badge bd-${p}" title="${escapeHtml(PATH_TITLE[p] || p)}">${p}</span>`).join('')
    : '';

  const charCell = renderCharCell(e, 'r');         // 'r' = result-row size

  el.innerHTML = `
    <div class="r-idx">${String(idx + 1).padStart(3, '0')}</div>
    <div class="r-char">${charCell}</div>
    <div class="r-body">
      <div class="r-meaning">${meaningHL || '<span style="color:var(--c-deep-mute)">—</span>'}</div>
      <div class="r-phon">${escapeHtml(phon)}</div>
    </div>
    <div class="r-side">
      <div class="r-code">${e.hex}</div>
      <div class="r-badges">${badges}</div>
    </div>
  `;

  el.addEventListener('click', () => selectEntry(e));
  return el;
}

// Render the character glyph slot. For Khitan vocab (multi-char ksw) we use a
// 2-column grid following the canonical 契丹小字 reading order:
//   1c:  ①          2c:  ①②         3c:  ①②      4c:  ①②      …  7c:  ①②
//                                          ③            ③④                 ③④
//                                                                             ⑤⑥
//                                                                              ⑦
// Cells flow left-to-right within a row, then top-to-bottom. Odd-count last
// char ends up in column 1 (left) — exactly what CSS Grid does by default.
function renderCharCell(e, size /* 'r' = result row, 'd' = detail big */) {
  const chars = [...e.ch];
  // Single-codepoint entries → flat span (most Tangut + Khitan KSS)
  if (chars.length <= 1) {
    return `<span class="cc-single">${escapeHtml(e.ch)}</span>`;
  }
  // Multi-codepoint (Khitan vocab) → 2-col stack with auto-sized cells
  const cells = chars.map(c => `<span class="cc-cell">${escapeHtml(c)}</span>`).join('');
  const sizeAttr = size === 'd' ? `style="--cells:${chars.length}"` : '';
  return `<div class="cc-stack cc-stack-${size}" ${sizeAttr}>${cells}</div>`;
}

function highlightMatchInMeaning(meaning, q) {
  if (!meaning || !q) return escapeHtml(meaning);

  // Literal query patterns (gold/cinnabar highlight)
  const direct = new Set();
  direct.add(q);
  if (window.toSimp) direct.add(window.toSimp(q));
  if (window.toTrad) direct.add(window.toTrad(q));
  if (state.fuzzy) {
    for (const c of q) {
      const code = c.codePointAt(0);
      if (code >= 0x4E00 && code <= 0x9FFF) {
        direct.add(c);
        if (window.SC2TC?.[c]) direct.add(window.SC2TC[c]);
        if (window.TC2SC?.[c]) direct.add(window.TC2SC[c]);
      }
    }
  }

  // Synonym patterns (distinct dimmer highlight)
  const syn = new Set();
  if (state.fuzzy && state.lastExpansion) {
    for (const ex of state.lastExpansion) {
      for (const n of ex.neighbours) {
        syn.add(n.ch);
        if (window.SC2TC?.[n.ch]) syn.add(window.SC2TC[n.ch]);
      }
    }
  }

  // Apply highlights — longest patterns first to avoid partial overlap.
  // Direct matches take precedence over synonym matches.
  const escMeaning = escapeHtml(meaning);
  let html = escMeaning;

  const applyHL = (pattern, cls) => {
    const escP = escapeRegex(escapeHtml(pattern));
    if (!escP) return;
    try {
      const re = new RegExp('(?<!<[^>]*)' + escP, 'g');
      html = html.replace(re, m => `<span class="${cls}">${m}</span>`);
    } catch (e) {
      const re2 = new RegExp(escP, 'g');
      html = html.replace(re2, m => `<span class="${cls}">${m}</span>`);
    }
  };

  // Direct first (longest first)
  for (const p of [...direct].filter(Boolean).sort((a, b) => b.length - a.length)) applyHL(p, 'match');
  // Then synonyms (skip if already inside a <span class="match">)
  for (const p of [...syn].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escP = escapeRegex(escapeHtml(p));
    if (!escP) continue;
    try {
      // skip if already inside any span
      const re = new RegExp('(?<!<span[^>]*>[^<]*)' + escP, 'g');
      html = html.replace(re, m => `<span class="match syn">${m}</span>`);
    } catch (e) {
      const re2 = new RegExp(escP, 'g');
      html = html.replace(re2, m => `<span class="match syn">${m}</span>`);
    }
  }
  return html;
}

// ===== DETAIL VIEW =====

function selectEntry(e) {
  if (!e) return;
  state.selected = e;
  // Update active in list
  document.querySelectorAll('.result-row.active').forEach(r => r.classList.remove('active'));
  const row = document.querySelector(`.result-row[data-cp="${e.cp}"]`);
  if (row) {
    row.classList.add('active');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  renderDetail(e);
  dom['detail-id'].textContent = `CD · ${e.hex}`;
  dom['detail-foot'].textContent = `TARGET LOCKED · ${e.hex} · DEC ${e.cp}`;

  if (state.autocopy) {
    copyToClipboard(e.ch, e.ch);
  }
}

function renderDetail(e) {
  // Phonetics: use the entry's per-script list (Tangut: 4 rows, Khitan: 1).
  const phonRows = (e.phonetics || []).map(p => ({
    key: p.label,
    sub: p.sublabel,
    val: p.value,
  }));
  const phonHeader = e.script === 'khitan' ? '拟音' : `拟音 × ${phonRows.length}`;

  // Meaning rendering
  const meaningHtml = renderMeaning(e.meaning);

  const html = `
    <div class="detail-view">
      <div class="detail-char-block">
        <div class="char-frame">
          <span class="char-corner tl"></span>
          <span class="char-corner tr"></span>
          <span class="char-corner bl"></span>
          <span class="char-corner br"></span>
          <div class="char-display">${renderCharCell(e, 'd')}</div>
        </div>
        <div class="char-meta">
          <div class="char-codepoint">
            ${e.hex}
            <span class="sep">·</span>
            <span class="dec">DEC ${e.cp}</span>
          </div>
        </div>
        <div class="copy-row">
          <button class="btn amber" data-act="copy-char">
            COPY CHAR <span class="key">[Enter]</span>
          </button>
          <button class="btn" data-act="copy-data">
            COPY DATA <span class="key">[C]</span>
          </button>
        </div>
      </div>

      <div class="detail-info">
        <div class="info-section">
          <div class="info-header">
            <span class="info-header-l">// SEMANTIC GLOSS</span>
            <span class="info-header-r">釋義 · MEANING</span>
          </div>
          <div class="info-body">
            <div class="info-row">
              <div class="info-key">CN<span class="key-sub">中文</span></div>
              <div class="info-val meaning copy-tap" data-copy="${escapeHtml(e.meaning)}">
                ${meaningHtml || '<span class="empty">no gloss recorded</span>'}
              </div>
            </div>
          </div>
        </div>

        ${phonRows.length ? `
        <div class="info-section">
          <div class="info-header">
            <span class="info-header-l">// PHONETIC RECONSTRUCTION</span>
            <span class="info-header-r">${phonHeader}</span>
          </div>
          <div class="info-body">
            ${phonRows.map(r => `
              <div class="info-row">
                <div class="info-key">
                  ${escapeHtml(r.key)}
                  <span class="key-sub">${escapeHtml(r.sub)}</span>
                </div>
                <div class="info-val ${!r.val ? 'empty' : 'copy-tap'}" ${r.val ? `data-copy="${escapeHtml(r.val)}"` : ''}>
                  ${r.val ? escapeHtml(r.val) : '— not recorded —'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        ${renderScriptExtras(e)}

        <div class="info-section">
          <div class="info-header">
            <span class="info-header-l">// CHARACTER METADATA</span>
            <span class="info-header-r">UNICODE</span>
          </div>
          <div class="info-body">
            <div class="info-row">
              <div class="info-key">CODEPOINT<span class="key-sub">U+</span></div>
              <div class="info-val copy-tap" data-copy="${e.hex}">${e.hex}</div>
            </div>
            <div class="info-row">
              <div class="info-key">DECIMAL<span class="key-sub">dec</span></div>
              <div class="info-val copy-tap" data-copy="${e.cp}">${e.cp}</div>
            </div>
            <div class="info-row">
              <div class="info-key">HTML ENT<span class="key-sub">&amp;#…</span></div>
              <div class="info-val copy-tap" data-copy="&#${e.cp};">&amp;#${e.cp};</div>
            </div>
            <div class="info-row">
              <div class="info-key">UTF-8<span class="key-sub">hex bytes</span></div>
              <div class="info-val">${utf8Hex(e.ch)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  dom.detail.innerHTML = html;

  // Wire up actions
  dom.detail.querySelectorAll('[data-act="copy-char"]').forEach(btn => {
    btn.addEventListener('click', () => copyToClipboard(e.ch, e.ch));
  });
  dom.detail.querySelectorAll('[data-act="copy-data"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const payload = formatDataPayload(e);
      copyToClipboard(payload, e.ch + ' · DATA');
    });
  });
  dom.detail.querySelectorAll('.copy-tap').forEach(el => {
    el.addEventListener('click', () => {
      const v = el.getAttribute('data-copy');
      copyToClipboard(v, v.length > 24 ? v.slice(0, 24) + '…' : v);
    });
  });
  // Khitan: jump to a related vocab (ksw) or a composing character (cp)
  dom.detail.querySelectorAll('.khi-rel').forEach(el => {
    el.addEventListener('click', () => {
      const ksw = el.getAttribute('data-jump');
      const target = state.entriesByUid.get('khi-v:' + ksw);
      if (target) selectEntry(target);
    });
  });
  dom.detail.querySelectorAll('.khi-comp').forEach(el => {
    el.addEventListener('click', () => {
      const cp = +el.getAttribute('data-jump-c');
      const target = state.entriesByUid.get('khi-c:' + cp);
      if (target) selectEntry(target);
    });
  });
}

// Per-script extra metadata blocks shown below the standard phonetic + Unicode
// sections in the detail panel. Tangut entries currently have nothing extra;
// Khitan char entries get Kane ID + stroke count + related-vocab list; Khitan
// vocab entries get a composition strip (which KSS characters compose them).
function renderScriptExtras(e) {
  if (e.script !== 'khitan') return '';
  const blocks = [];

  if (e.type === 'char') {
    // Char metadata: Kane ID, stroke count
    const meta = [];
    if (e.kane_id)      meta.push({ k: 'KANE ID',      sub: '吉田/Kane',     v: e.kane_id });
    if (e.stroke_count) meta.push({ k: 'STROKE COUNT', sub: '筆畫',          v: e.stroke_count });
    if (e.kss_id != null) meta.push({ k: 'KSS ID',      sub: 'CCAMC index',  v: e.kss_id });
    if (meta.length) {
      blocks.push(`
        <div class="info-section">
          <div class="info-header">
            <span class="info-header-l">// KHITAN CHARACTER</span>
            <span class="info-header-r">契丹小字 · CCAMC</span>
          </div>
          <div class="info-body">
            ${meta.map(m => `
              <div class="info-row">
                <div class="info-key">${escapeHtml(m.k)}<span class="key-sub">${escapeHtml(m.sub)}</span></div>
                <div class="info-val">${escapeHtml(String(m.v))}</div>
              </div>`).join('')}
          </div>
        </div>`);
    }
    // Related vocab list
    if (e.rel_ksws && e.rel_ksws.length) {
      const items = e.rel_ksws.slice(0, 60).map(ksw => {
        const vocabEntry = state.entriesByUid.get('khi-v:' + ksw);
        const gloss = vocabEntry?.meaning || '';
        const safeKsw = escapeHtml(ksw);
        return `<span class="khi-rel" data-jump="${safeKsw}" title="${escapeHtml(gloss)}">${safeKsw}</span>`;
      }).join('');
      blocks.push(`
        <div class="info-section">
          <div class="info-header">
            <span class="info-header-l">// APPEARS IN ${e.rel_ksws.length} WORDS</span>
            <span class="info-header-r">關聯詞</span>
          </div>
          <div class="info-body khi-rel-grid">${items}</div>
        </div>`);
    }
  }

  if (e.type === 'vocab') {
    // Composition strip: which KSS characters compose this ksw
    const parts = [...e.ch].map(c => {
      const cp = c.codePointAt(0);
      const ce = state.entriesByUid.get('khi-c:' + cp);
      const pron = ce?.phonetics?.[0]?.value || '';
      const safe = escapeHtml(c);
      return `<span class="khi-comp" data-jump-c="${cp}" title="${escapeHtml(pron)}">
                <span class="khi-comp-ch">${safe}</span>
                <span class="khi-comp-pron">${escapeHtml(pron) || '—'}</span>
              </span>`;
    }).join('');
    blocks.push(`
      <div class="info-section">
        <div class="info-header">
          <span class="info-header-l">// COMPOSITION · ${[...e.ch].length} CHAR${e.length === 1 ? '' : 'S'}</span>
          <span class="info-header-r">構詞 / KSW = KSS + …</span>
        </div>
        <div class="info-body khi-comp-grid">${parts}</div>
      </div>`);
  }

  return blocks.join('');
}

function renderMeaning(text) {
  if (!text) return '';
  // Common POS labels at end of gloss
  const posLabels = ['名詞', '動詞', '形容詞', '副詞', '量詞', '介詞', '連詞', '代詞', '助詞', '感嘆詞', '譯音', '漢語借詞'];
  let body = text;
  const posFound = [];
  for (const p of posLabels) {
    if (body.includes(p)) {
      posFound.push(p);
      body = body.replace(p, '').trim();
    }
  }
  // Split body into segments by Chinese comma/punctuation
  const segs = body.split(/[、，,；;]/).map(s => s.trim()).filter(Boolean);
  const segsHtml = segs.map(s => `<span class="seg">${escapeHtml(s)}</span>`).join(' ');
  const posHtml = posFound.map(p => `<span class="pos">${escapeHtml(p)}</span>`).join(' ');
  return segsHtml + (posFound.length ? '<div style="margin-top:8px;">' + posHtml + '</div>' : '');
}

function formatDataPayload(e) {
  const lines = [`${e.ch}  ${e.hex}  (DEC ${e.cp})`, `釋義:    ${e.meaning || '—'}`];
  for (const p of (e.phonetics || [])) {
    lines.push(`${(p.label + ':').padEnd(8)} ${p.value || '—'}`);
  }
  if (e.script === 'khitan') {
    if (e.type === 'char') {
      if (e.kane_id)      lines.push(`Kane ID:  ${e.kane_id}`);
      if (e.stroke_count) lines.push(`筆畫:    ${e.stroke_count}`);
    }
    if (e.type === 'vocab' && e.rel_kss_ids?.length) {
      lines.push(`構詞:    KSS ${e.rel_kss_ids.join(' + ')}`);
    }
  }
  return lines.join('\n');
}

function utf8Hex(ch) {
  const bytes = new TextEncoder().encode(ch);
  return Array.from(bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// ===== CLIPBOARD + FLASH =====

let flashTimer = null;
function copyToClipboard(text, displayPayload) {
  if (!text) return;
  const showFlash = () => {
    dom['copy-flash-payload'].textContent = displayPayload || text;
    dom['copy-flash'].classList.add('show');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      dom['copy-flash'].classList.remove('show');
    }, 1300);
    setStatus(`COPIED · ${displayPayload || text}`);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showFlash).catch(() => fallbackCopy(text, showFlash));
  } else {
    fallbackCopy(text, showFlash);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb && cb(); } catch (e) {}
  document.body.removeChild(ta);
}

// ===== STATUS / META =====

let statusTimer = null;
function setStatus(msg, isAmber) {
  dom['status-text'].textContent = msg;
  dom['status-text'].style.color = isAmber ? 'var(--c-amber)' : 'var(--c-text)';
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    dom['status-text'].textContent = 'IDLE';
    dom['status-text'].style.color = '';
  }, 3500);
}

function updateClock() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  dom.clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ===== EVENTS =====

function bindEvents() {
  // Search input
  dom.q.addEventListener('input', e => {
    state.query = e.target.value;
    dom['clear-btn'].classList.toggle('visible', !!state.query);
    scheduleSearch();
  });

  dom.q.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Copy currently selected, or first hit
      const target = state.selected || state.filtered[0]?.entry;
      if (target) {
        copyToClipboard(target.ch, target.ch);
        if (!state.selected && state.filtered[0]) selectEntry(state.filtered[0].entry);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Escape') {
      if (state.query) {
        dom.q.value = '';
        state.query = '';
        dom['clear-btn'].classList.remove('visible');
        runSearch();
      } else {
        dom.q.blur();
      }
    }
  });

  // Global keys
  document.addEventListener('keydown', e => {
    if (e.target === dom.q) return;
    if (e.key === '/') {
      e.preventDefault();
      dom.q.focus();
    } else if (e.key === 'c' || e.key === 'C') {
      if ((e.metaKey || e.ctrlKey)) return;
      if (state.selected) {
        const payload = formatDataPayload(state.selected);
        copyToClipboard(payload, state.selected.ch + ' · DATA');
      }
    } else if (e.key === 'ArrowDown') {
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      moveSelection(-1);
    } else if (e.key === 'Enter' && state.selected) {
      copyToClipboard(state.selected.ch, state.selected.ch);
    }
  });

  // Clear button
  dom['clear-btn'].addEventListener('click', () => {
    dom.q.value = '';
    state.query = '';
    dom['clear-btn'].classList.remove('visible');
    runSearch();
    dom.q.focus();
  });

  // Script tabs (Tangut / Khitan)
  dom.scriptTabs?.forEach(t => {
    t.addEventListener('click', () => {
      const name = t.dataset.script;
      if (!name || name === state.script) return;
      dom.scriptTabs.forEach(x => x.classList.toggle('active', x.dataset.script === name));
      switchScript(name);
    });
  });

  // Mode tabs
  dom.tabs.forEach(t => {
    t.addEventListener('click', () => {
      dom.tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      state.mode = t.dataset.mode;
      dom['mode-display'].textContent = state.mode.toUpperCase();
      runSearch();
      dom.q.focus();
    });
  });

  // Toggles
  dom['fuzzy-toggle'].addEventListener('change', e => {
    state.fuzzy = e.target.checked;
    runSearch();
  });
  dom['autocopy-toggle'].addEventListener('change', e => {
    state.autocopy = e.target.checked;
  });

  // Results scroll preserves focus
  dom.results.addEventListener('wheel', e => { /* allow native scroll */ }, { passive: true });
}

function scheduleSearch() {
  if (state.searchTimer) clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(runSearch, 60);
}

function runSearch() {
  const t0 = performance.now();
  const q = state.query.trim();
  let rows;          // Array<{entry, score?, paths?}>  — uniform shape
  if (!q) {
    rows = state.entries.slice(0, 200).map(e => ({ entry: e, paths: [] }));
    dom['search-stats'].textContent = 'BROWSING';
    dom['rank-meta'].textContent = `showing first ${Math.min(200, state.entries.length)} of ${state.entries.length.toLocaleString()}`;
  } else {
    const out = search(q);
    rows = out.results;
    const ms = (performance.now() - t0).toFixed(2);
    dom['search-stats'].textContent = `${rows.length} HIT${rows.length === 1 ? '' : 'S'} · ${ms}ms`;

    // Build rank-meta showing path stats + synonym expansion (if any)
    const stats = state.lastPathStats || {};
    const pathParts = ['T', 'L', 'P', 'V', 'Fx', 'Ff']
      .filter(k => stats[k])
      .map(k => `${PATH_LABEL[k]}:${stats[k]}`)
      .join(' · ');
    let meta = `${out.pathCount}-path fusion · ${pathParts || 'no path matched'} · top ${rows.length} of ${rows.length}`;
    if (state.lastExpansion && state.fuzzy) {
      const expSummary = state.lastExpansion.map(e => {
        const ns = e.neighbours.slice(0, 4).map(n => n.ch).join('·');
        return `${e.base}≈${ns}`;
      }).join('  ');
      meta += `   ⇢ ${expSummary}`;
    }
    dom['rank-meta'].textContent = meta;
    dom['proc-time'].textContent = ms;
  }
  state.filtered = rows;
  renderResults(rows, q);
}

function moveSelection(delta) {
  if (!state.filtered.length) return;
  const cur = state.selected
    ? state.filtered.findIndex(r => r.entry.cp === state.selected.cp)
    : -1;
  let next = cur + delta;
  if (next < 0) next = 0;
  if (next >= state.filtered.length) next = state.filtered.length - 1;
  if (next === cur) return;
  selectEntry(state.filtered[next].entry);
}

const PATH_LABEL = { T: 'tng', L: 'lex', P: 'pin', V: 'vec', Fx: 'phon', Ff: 'phon~' };
const PATH_TITLE = {
  T:  'Tangut codepoint — 直接匹配',
  L:  'Lexical — literal substring & char overlap (TC↔SC)',
  P:  'Pinyin — exact pinyin; fuzzy only if no exact (typo tolerance)',
  V:  'Vector — PPMI cosine similarity (text2vec analog, semantic)',
  Fx: 'Phonetic literal — exact / prefix / substring on 4 reconstructions',
  Ff: 'Phonetic fuzzy — Damerau-Levenshtein ≤1 fallback',
};

// ===== INIT =====

function init() {
  bindDom();
  runBoot();

  // === Ingest both scripts ===
  ingestTangut();
  ingestKhitan();

  // === Build indices for each script ===
  const t0 = performance.now();
  buildAllForScript('tangut');
  const tT = performance.now();
  buildAllForScript('khitan');
  const tK = performance.now();
  console.log('[INDEX]',
    'tangut', (tT - t0).toFixed(0) + 'ms (' + state.scripts.tangut.entries.length + ' entries)',
    '· khitan', (tK - tT).toFixed(0) + 'ms (' + state.scripts.khitan.entries.length + ' entries)'
  );

  // Bind UI events BEFORE switching script so listeners are in place
  bindEvents();

  // === Activate default script ===
  switchScript('tangut');

  updateClock();
  setInterval(updateClock, 1000);
  const cilinCount = window.CILIN_SYN ? Object.keys(window.CILIN_SYN).length : 0;
  setStatus(
    `READY · tangut ${state.scripts.tangut.entries.length} · khitan ${state.scripts.khitan.entries.length} · cilin ${cilinCount} · total ${(tK - t0).toFixed(0)}ms`,
    true
  );
}

// Expose for browser-console debugging only
window.__DBG = {
  state,
  search: (q) => { state.query = q; runSearch(); return state.filtered.length; },
  renderCharCell,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
