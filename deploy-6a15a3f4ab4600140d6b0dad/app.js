/* ==========================================================================
   西夏文 契丹小字 字词检索
   ==========================================================================

   Retrieval is a weighted reciprocal-rank fusion over four independent paths
   (literal / pinyin / semantic-vector / phonetic-reconstruction). That part is
   carried over largely unchanged — it worked.

   What changed is everything downstream of it. Entries now carry *structured*
   senses (gloss + grammatical tag + source citation) instead of one flattened
   string, and the renderer is a dictionary article rather than a readout:
   numbered senses, attributed reconstructions, footnoted sources.

   Data is loaded per script, on demand. The previous build shipped every
   corpus and both script fonts on first paint whether or not you looked at
   them.
   ========================================================================== */

(() => {
'use strict';

/* ===== State ============================================================ */

// Cache-busting token for every lazily-loaded asset. Keep it in step with the
// ?v= on the <script>/<link> tags in index.html — a mismatch silently serves a
// stale corpus, which looks exactly like a data bug.
const ASSET_V = '41';
const asset = name => `${name}?v=${ASSET_V}`;

const SCRIPTS = {
  tangut: {
    label: '西夏文', labelEn: 'Tangut',
    src: asset('data.js'),
    ranges: [[0x17000, 0x187FF]],
    hexPad: 5,
    modeLabel: '字形',
    corpusNote: 'ISO/IEC 10646 参考字形',
  },
  khitan: {
    label: '契丹小字', labelEn: 'Khitan',
    src: asset('khitan.js'),
    ranges: [[0xE000, 0xE7F3]],
    hexPad: 4,
    modeLabel: '字形',
    corpusNote: '古今文字集成 CCAMC',
  },
  mongolian: {
    label: '蒙古语', labelEn: 'Mongolian',
    src: asset('mongolian.js'),
    // headwords are Cyrillic; the traditional spelling is a second script on
    // the same entry, so both blocks must reach the glyph path
    ranges: [[0x0400, 0x04FF], [0x1800, 0x18AF]],
    hexPad: 4,
    modeLabel: '字形',
    corpusNote: 'Wiktionary / kaikki.org',
  },
  olduyghur: {
    label: '回鹘文', labelEn: 'Old Uyghur',
    src: asset('olduyghur.js'),
    ranges: [[0x10F70, 0x10FAF]],
    hexPad: 5,
    modeLabel: '字形',
    corpusNote: 'Wiktionary / kaikki.org',
  },
  sogdian: {
    label: '粟特语', labelEn: 'Sogdian',
    src: asset('sogdian.js'),
    // Both blocks: Old Sogdian U+10F00–10F27 and Sogdian proper U+10F30–10F59.
    // With only the first, the five script-form headwords — all of them in the
    // second — matched no path at all: T skips them for being out of range, and
    // H only fires on Latin/Greek/Cyrillic input.
    ranges: [[0x10F00, 0x10F27], [0x10F30, 0x10F59]],
    hexPad: 5,
    modeLabel: '词形',
    corpusNote: 'TITUS 语料 + Wiktionary 词表',
  },
  oldturkic: {
    label: '古突厥语', labelEn: 'Old Turkic',
    src: asset('oldturkic.js'),
    ranges: [[0x10C00, 0x10C48]],
    hexPad: 5,
    modeLabel: '字形',
    corpusNote: 'Wiktionary / kaikki.org',
  },
};

const state = {
  script: 'tangut',
  data: {},                 // per-script: entries, indices
  entries: [], entriesByUid: new Map(),
  cooccur: new Map(), synonyms: new Map(), charPPMI: new Map(),
  glossVectors: [], charsByPinyin: new Map(), entryPinyinSet: new Map(),
  refs: [],

  filtered: [], selected: null,
  mode: 'auto', fuzzy: true, simp: false, autocopy: false,
  query: '', searchTimer: null,
  lastExpansion: null, lastPathStats: null,
  loading: false,
};

/* ===== Lazy module loading ============================================== */

const loaded = new Map();
function loadOnce(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
  loaded.set(src, p);
  return p;
}

// Pinyin table and the Cilin thesaurus only feed the fuzzy/semantic paths.
// They load alongside the first corpus, not ahead of it.
const searchAssets = () => Promise.all([
  loadOnce(asset('pinyin.js')),
  loadOnce(asset('cilin-syn.js')),
]).catch(() => {});

/* ===== DOM ============================================================== */

const dom = {};
function bindDom() {
  for (const id of ['q', 'clear', 'search-status', 'results', 'result-count',
                    'detail', 'rank-meta', 'fuzzy', 'simp', 'autocopy',
                    'theme-toggle', 'refs-list', 'corpus-line',
                    'source-line', 'mode-script', 'btn-refs', 'cx-refs', 'data-state',
                    'sentence']) {
    dom[id] = document.getElementById(id);
  }
  dom.modes = document.querySelectorAll('.mode');
  dom.scriptTabs = document.querySelectorAll('.script-switch button');
}

/* ===== Small utilities ================================================== */

const nfc = s => (s || '').normalize('NFC');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Glosses are recorded exactly as the source database has them; the display
// toggle converts on the way out rather than mutating the data.
const disp = s => (state.simp && window.toSimp) ? window.toSimp(s || '') : (s || '');

const isCJK = c => { const n = c.codePointAt(0); return n >= 0x4E00 && n <= 0x9FFF; };
const toCJKArray = s => [...s].filter(isCJK);

function buildCharSet(text) {
  const set = new Set();
  for (const ch of text || '') {
    if (isCJK(ch)) set.add(window.TC2SC?.[ch] || ch);
  }
  return set;
}

function hex(cp, pad) {
  return 'U+' + cp.toString(16).toUpperCase().padStart(pad, '0');
}

// Damerau-Levenshtein with a bounded early exit.
function dlDistance(a, b, max = 3) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  if (!m) return n;
  if (!n) return m;
  const prev2 = new Array(n + 1), prev = new Array(n + 1), curr = new Array(n + 1);
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

/* ===== Ingest ===========================================================
   Both scripts normalise onto one entry shape:

     senses      [{ g, t?, s? }]  own glosses — g text, t tags, s source refs
     derivedText string           glosses borrowed from related words, for
                                  retrieval only; never shown as the entry's own
     phonetics   [{ label, attrib, value }]
   ======================================================================== */

const POS_LABELS = ['名詞','動詞','形容詞','副詞','量詞','介詞','連詞','代詞',
                    '助詞','感嘆詞','譯音','漢語借詞','詞綴','數詞'];

function ingestTangut() {
  const data = window.tangutData || {};
  const out = [];
  for (const key in data) {
    const cp = parseInt(key, 10);
    if (!cp) continue;
    const info = data[key];
    const raw = info.meaning || '';

    // The Tangut source records one gloss string per character with 、 between
    // near-synonymous renderings and the part of speech appended. Those commas
    // do NOT mark distinct senses, so this stays one sense — splitting it would
    // invent a structure the source does not assert.
    let body = raw, pos = [];
    for (const p of POS_LABELS) {
      if (body.includes(p)) { pos.push(p); body = body.replace(p, '').trim(); }
    }
    const senses = body ? [{ g: body, t: pos.length ? pos : undefined }] : [];

    out.push(makeEntry({
      uid: 'tangut:' + cp.toString(16),
      script: 'tangut', type: 'char',
      cp, ch: String.fromCodePoint(cp), hex: hex(cp, 5),
      senses,
      phonetics: [
        // `speak` marks the one reconstruction the reader knows how to voice.
        // Gong's transcription is the only fully segmental one of the four —
        // Miyake's and Arakawa's use conventions the mapping does not cover,
        // and 龚勋's carries tone numbers a phoneme synthesiser cannot use.
        { label: '龚煌城',  attrib: 'Gong Hwang-cherng', value: nfc(info.gong), speak: true },
        { label: 'Miyake', attrib: 'Marc Miyake',        value: nfc(info.miyake) },
        { label: '荒川慎太郎', attrib: 'Arakawa Shintarō', value: nfc(info.arakawa) },
        { label: '龚勋',    attrib: '2024',              value: nfc(info.gongxun) },
      ],
    }));
  }
  out.sort((a, b) => a.cp - b.cp);
  return { entries: out, refs: [], meta: { structured: true } };
}

function ingestKhitan() {
  const data = window.khitanData || { chars: [], vocabs: [], refs: [] };
  const out = [];
  const wordByKsw = new Map();

  for (const v of data.vocabs || []) {
    if (!v.ksw) continue;
    const cps = [...v.ksw].map(c => c.codePointAt(0));
    const e = makeEntry({
      uid: 'khitan:v:' + cps.map(c => c.toString(16)).join('+'),
      script: 'khitan', type: 'vocab',
      cp: cps[0], ch: v.ksw,
      hex: cps.map(c => hex(c, 4)).join(' + '),
      senses: v.senses || [],
      phonetics: [],
      kssIds: v.ids || [],
    });
    wordByKsw.set(v.ksw, e);
    out.push(e);
  }

  for (const c of data.chars || []) {
    const ch = String.fromCodePoint(c.cp);
    // A KSS character is a phonogram: it usually carries no gloss of its own.
    // What it does carry is the words it occurs in — kept separate, and shown
    // as such, so a word's meaning is never presented as the character's.
    const derived = (c.ksws || [])
      .map(k => (wordByKsw.get(k)?.senses || []).map(s => s.g).join('、'))
      .filter(Boolean).join('、');

    out.push(makeEntry({
      uid: 'khitan:c:' + c.cp.toString(16),
      script: 'khitan', type: 'char',
      cp: c.cp, ch, hex: hex(c.cp, 4),
      senses: c.gloss ? [{ g: c.gloss }] : [],
      derivedText: derived,
      phonetics: [
        { label: 'Kane',   attrib: 'Daniel Kane',        value: nfc(c.kane) },
        { label: '乌拉熙春', attrib: '爱新觉罗·乌拉熙春', value: nfc(c.ulh) },
      ],
      kssId: c.kss_id, kaneId: c.kane_id, strokes: c.strokes, babelstone: c.bs,
      ksws: c.ksws || [],
    }));
  }

  out.sort((a, b) => (a.type === b.type ? a.cp - b.cp : a.type === 'char' ? -1 : 1));
  return { entries: out, refs: data.refs || [], meta: data.meta || {} };
}

// Old Turkic is a lexicon rather than a character set: an entry is a word with
// senses, attested quotations, morphology and a descendant tree. The gloss is
// bilingual — Chinese where a translation exists, English always kept beside it,
// since the Chinese is ours and the English is the source's.
function ingestOldTurkic() {
  const data = window.oldTurkicData || { entries: [] };
  const out = [];
  for (const e of data.entries || []) {
    if (!e.w) continue;
    const cps = [...e.w].map(c => c.codePointAt(0));
    out.push(makeEntry({
      uid: 'otk:' + cps.map(c => c.toString(16)).join('+') + ':' + (e.pos_en || ''),
      script: 'oldturkic', type: 'word',
      cp: cps[0], ch: e.w,
      hex: cps.map(c => hex(c, 5)).join(' + '),
      // a sense keeps both languages; `g` is what the Chinese search paths index
      senses: (e.senses || []).map(s => ({
        g: s.zh || s.en, en: s.zh ? s.en : '', t: [...(s.t || []), ...(s.topic || [])],
      })),
      phonetics: [
        { label: '转写', attrib: 'transliteration', value: nfc(e.tr) },
        { label: 'IPA', attrib: '', value: nfc(e.ipa) },
      ],
      otkPos: e.pos, otkPosEn: e.pos_en,
      ety: e.ety || null, forms: e.forms || [], rels: e.rel || [],
      desc: e.desc || [], quotes: e.ex || [],
    }));
  }
  out.sort((a, b) => a.cp - b.cp || a.ch.localeCompare(b.ch));
  return { entries: out, refs: [], meta: { structured: true, ...(data.meta || {}) } };
}

// Mongolian: Cyrillic headword, with the traditional spelling carried as a
// second script wherever the source attests one. Never generated — see
// tools/build_mongolian.py for why transliteration is refused.
function ingestMongolian() {
  const data = window.mongolianData || { entries: [] };
  const tagv = data.formTags || [];
  const out = [];
  for (const e of data.entries || []) {
    if (!e.w) continue;
    out.push(makeEntry({
      uid: 'mn:' + e.w + ':' + (e.pos_en || ''),
      script: 'mongolian', type: 'word',
      cp: e.w.codePointAt(0), ch: e.w,
      hex: [...e.w].map(c => hex(c.codePointAt(0), 4)).join(' '),
      senses: (e.senses || []).map(s => ({
        g: s.zh || s.en, en: s.zh ? s.en : '', t: [...(s.t || []), ...(s.topic || [])],
      })),
      phonetics: [{ label: 'IPA', attrib: '', value: nfc(e.ipa) }],
      mn: e.mn || '', mnSrc: e.mnSrc || '',
      otkPos: e.pos, otkPosEn: e.pos_en,
      ety: e.ety || null,
      forms: (e.forms || []).map(f => ({ f: f[0], t: tagv[f[1]] || [] })),
      rels: e.rel || [], desc: e.desc || [], quotes: e.ex || [],
    }));
  }
  return { entries: out, refs: [], meta: { structured: true, ...(data.meta || {}) } };
}

// Old Uyghur reuses the Old Turkic entry shape wholesale. The only difference
// is presentational: 316 of 423 headwords are in a script with no font on most
// systems, so the transliteration is carried as a co-equal headword rather than
// as a footnote to it.
function ingestOldUyghur() {
  const data = window.oldUyghurData || { entries: [] };
  const out = [];
  for (const e of data.entries || []) {
    if (!e.w) continue;
    const cps = [...e.w].map(c => c.codePointAt(0));
    out.push(makeEntry({
      uid: 'ou:' + e.w + ':' + (e.pos_en || ''),
      script: 'olduyghur', type: 'word',
      cp: cps[0], ch: e.w,
      hex: cps.map(c => hex(c, 5)).join(' '),
      lead: e.tr || '', inScript: !!e.script,
      senses: (e.senses || []).map(s => ({
        g: s.zh || s.en, en: s.zh ? s.en : '', t: [...(s.t || []), ...(s.topic || [])],
      })),
      phonetics: [
        { label: '转写', attrib: 'transliteration', value: nfc(e.tr) },
        { label: 'IPA', attrib: '', value: nfc(e.ipa) },
      ],
      otkPos: e.pos, otkPosEn: e.pos_en,
      ety: e.ety || null, forms: e.forms || [], rels: e.rel || [],
      desc: e.desc || [], quotes: e.ex || [],
    }));
  }
  return { entries: out, refs: [], meta: { structured: true, ...(data.meta || {}) } };
}

// Sogdian is a concordance, not a dictionary: the headword list is the corpus
// vocabulary and most forms have no gloss at all. Entries arrive packed as
// positional arrays — see tools/build_sogdian.py for why.
function ingestSogdian() {
  const d = window.sogdianData || { entries: [] };
  const trad = d.tradVocab || [], glv = d.glVocab || [];
  const out = [];
  for (const a of d.entries || []) {
    const [w, n, nt, ti, concN, conc, gi] = a;
    const gl = gi >= 0 ? (glv[gi] || []) : [];
    out.push(makeEntry({
      uid: 'sog:' + w,
      script: 'sogdian', type: 'word',
      cp: w.codePointAt(0) || 0, ch: w, hex: '',
      senses: gl.map(g => ({ g: g.zh || g.g, en: g.zh ? g.g : '', t: [g.lang.toUpperCase()] })),
      phonetics: [],
      otkPos: '词形', otkPosEn: 'form',
      sogN: n, sogTexts: nt, sogTrad: trad[ti] || '', sogConcN: concN, sogConc: conc || [],
      sogGloss: gl,
    }));
  }
  return { entries: out, refs: [], meta: { structured: true, ...(d.meta || {}) } };
}

function makeEntry(e) {
  e.senses = (e.senses || []).filter(s => s && (s.g || (s.t && s.t.length)));
  e.ownText = e.senses.map(s => s.g).filter(Boolean).join('、');
  e.derivedText = e.derivedText || '';
  e.quoteText = (e.quotes || []).map(q => `${q.zh || ''} ${q.en || ''}`).join(' ');
  e.altScript = e.mn || '';
  e.searchText = e.ownText || e.derivedText;
  e.isDerived = !e.ownText && !!e.derivedText;
  e.searchTextSimp = window.toSimp ? window.toSimp(e.searchText) : e.searchText;
  e.meaningCharSet = buildCharSet(e.searchText);
  return e;
}

/* ===== Index builders ===================================================
   buildCooccur → buildSynonymIndex → buildPPMI → buildGlossVectors
                                    + buildPinyinIndex
   ======================================================================== */

// Hand-curated near-synonyms for very common dictionary concepts. Augments the
// data-derived index, which is thin for rare classical glosses.
const CURATED_SYNONYMS = {
  '头':'首顶颅元额脑','首':'头顶领元','面':'颜貌脸容','脸':'面颜貌','颜':'面貌容',
  '眼':'目瞳眸睛','目':'眼瞳眸','耳':'听闻','鼻':'嗅','口':'嘴唇','嘴':'口唇',
  '牙':'齿','齿':'牙','心':'念思意情感','胸':'膺','背':'脊',
  '手':'掌指拳','足':'脚踝跟','脚':'足踝','腿':'股胫','腹':'肚胃','发':'毛鬓须','毛':'发',
  '走':'行步跑奔移','行':'走步移迈','跑':'走奔','飞':'翔翱腾','跳':'跃踊',
  '坐':'居处','立':'站','卧':'寝睡眠','睡':'寐眠卧寝','起':'立',
  '看':'视观望见瞧瞻','见':'视看观望','视':'看观望见','听':'闻聆',
  '说':'言语谈讲谓道','言':'语说谈讲','想':'思念虑忆','思':'想念虑',
  '知':'晓识觉','学':'习','教':'诲训','问':'询咨','答':'应',
  '爱':'怜慕喜','恨':'怨憎恶','怒':'愤怨恚恼','喜':'悦乐欣愉',
  '悲':'哀痛伤悼','忧':'愁烦虑','畏':'惧怕恐','怕':'惧恐畏',
  '水':'川河江海溪流','河':'川江溪水','山':'岳岭丘冈峰','火':'炎焰燃烧焚',
  '土':'地壤泥','木':'树林','金':'银铜铁','石':'岩',
  '日':'阳','月':'阴','星':'辰','天':'空苍霄','地':'土',
  '风':'气','云':'霭','雨':'雪雷电','雷':'电霹','雪':'霜',
  '草':'荑卉','花':'葩','果':'实','树':'木林',
  '大':'巨伟硕庞宏','小':'微细少寡','多':'众繁丰','少':'寡稀',
  '高':'巍峻峭崇','低':'矮卑','长':'永','短':'促',
  '新':'初鲜','旧':'故古陈','远':'遥','近':'侧邻',
  '快':'速捷','慢':'迟缓','强':'壮盛','弱':'羸',
  '美':'丽好妙','丑':'陋','好':'善佳','坏':'恶劣',
  '红':'赤朱丹','黑':'玄','白':'素皓','黄':'金','青':'蓝','绿':'翠',
  '人':'民','王':'帝君主','臣':'宦','官':'吏','兵':'军卒戎',
  '父':'爹','母':'娘','子':'儿','兄':'哥',
  '夫':'婿','妻':'妇','男':'雄','女':'雌',
  '马':'驹骏','牛':'犊','猪':'豕','狗':'犬','鸡':'雏',
  '鸟':'雀禽','蛇':'蝮',
  '剑':'刀斧戟','弓':'矢箭','甲':'盔铠','旗':'幡幟',
  '战':'斗争','杀':'诛戮','死':'亡毙殁','生':'产育',
  '衣':'袍襟','帽':'冠','门':'户','路':'道径途','城':'邑都',
  '酒':'酿','米':'粟稻黍','食':'吃啖餐','吃':'食啖',
  '上':'顶','下':'底','中':'内','内':'里中',
  '前':'先','后':'末',
  '有':'存在','无':'没','是':'为','非':'否',
  '取':'拿','给':'付','送':'赠','受':'纳','收':'获',
  '开':'启辟','关':'闭','破':'坏毁','补':'修',
  '入':'进','出':'去','来':'至','到':'至',
};

function buildCooccur(entries) {
  const co = new Map();
  const bump = (a, b) => {
    let m = co.get(a);
    if (!m) { m = new Map(); co.set(a, m); }
    m.set(b, (m.get(b) || 0) + 1);
  };
  for (const e of entries) {
    if (!e.searchText) continue;
    const body = e.searchText.replace(/[【】《》（）()「」『』\[\]]/g, ' ');
    const concept = buildCharSet(body);
    if (concept.size === 0 || concept.size > 12) continue;
    const arr = [...concept];
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length; j++) if (i !== j) bump(arr[i], arr[j]);
    }
  }
  return co;
}

// Three fused sources: 同义词词林 (primary), the curated table, and corpus
// co-occurrence (weakest, fills the tail).
function buildSynonymIndex(cooccur) {
  const cilin = window.CILIN_SYN || {};
  const out = new Map();
  const allChars = new Set([...cooccur.keys(), ...Object.keys(CURATED_SYNONYMS), ...Object.keys(cilin)]);

  for (const ch of allChars) {
    const merged = new Map();

    for (const [c, w] of (cilin[ch] || [])) {
      if (!c || c === ch) continue;
      merged.set(c, Math.max(merged.get(c) || 0, w * 0.9));
    }
    let pos = 0;
    for (const c of (CURATED_SYNONYMS[ch] || '')) {
      if (!c || c === ch) continue;
      merged.set(c, Math.max(merged.get(c) || 0, 0.75 - pos * 0.04));
      pos++;
    }
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
    if (merged.size) out.set(ch, [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  }
  return out;
}

// Positive PMI character vectors — the distributional basis for the semantic path.
function buildPPMI(co) {
  const rowSum = new Map();
  let total = 0;
  for (const [c, m] of co) {
    let s = 0;
    for (const v of m.values()) s += v;
    rowSum.set(c, s); total += s;
  }
  if (!total) return new Map();
  const ppmi = new Map();
  for (const [a, m] of co) {
    const pa = rowSum.get(a) / total;
    const row = [];
    for (const [b, cab] of m) {
      const v = Math.log((cab / total) / (pa * (rowSum.get(b) / total)));
      if (v > 0.10) row.push([b, v]);
    }
    if (row.length) {
      row.sort((x, y) => y[1] - x[1]);
      ppmi.set(a, new Map(row.slice(0, 60)));
    }
  }
  return ppmi;
}

function buildGlossVectors(entries, ppmi) {
  return entries.map(e => {
    if (!e.meaningCharSet.size) return null;
    const v = new Map();
    for (const c of e.meaningCharSet) {
      v.set(c, (v.get(c) || 0) + 1.0);
      for (const [other, w] of (ppmi.get(c) || [])) v.set(other, (v.get(other) || 0) + w);
    }
    let norm = 0;
    for (const w of v.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    for (const k of v.keys()) v.set(k, v.get(k) / norm);
    return v;
  });
}

function vectorize(charWeights, ppmi) {
  const v = new Map();
  for (const [c, w0] of charWeights) {
    v.set(c, (v.get(c) || 0) + w0);
    for (const [other, w] of (ppmi.get(c) || [])) v.set(other, (v.get(other) || 0) + w * w0);
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
  for (const [k, v] of s) { const w = l.get(k); if (w) dot += v * w; }
  return dot;
}

function buildPinyinIndex(entries) {
  const PY = window.PINYIN_PLAIN || {};
  const byPy = new Map(), entryPy = new Map();
  for (const e of entries) {
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
  return { byPy, entryPy };
}

function buildIndices(slice) {
  const t0 = performance.now();
  slice.cooccur = buildCooccur(slice.entries);
  slice.synonyms = buildSynonymIndex(slice.cooccur);
  slice.charPPMI = buildPPMI(slice.cooccur);
  slice.glossVectors = buildGlossVectors(slice.entries, slice.charPPMI);
  const py = buildPinyinIndex(slice.entries);
  slice.charsByPinyin = py.byPy;
  slice.entryPinyinSet = py.entryPy;
  slice.buildMs = performance.now() - t0;
}

/* ===== Retrieval ======================================================== */

const PHON_HINT_RE = /[¹²³ʰśźʈɖɭɳʐɲʒŋʂɕɣɛɔ̱ạịụẹọṃ\d?]/;

const scriptRanges = () => SCRIPTS[state.script].ranges;
function inScript(cp) {
  for (const [lo, hi] of scriptRanges()) if (cp >= lo && cp <= hi) return true;
  return false;
}

function pathScript(q) {
  const codepoints = [...q].filter(ch => inScript(ch.codePointAt(0)));
  if (!codepoints.length) return [];
  const hits = [], seen = new Set();
  for (const e of state.entries) {
    if (seen.has(e.uid)) continue;
    if (e.ch === q || e.altScript === q ||
        (e.type === 'vocab' && e.ch.includes(q))) { hits.push(e); seen.add(e.uid); continue; }
    if (e.altScript && e.altScript.includes(q)) { hits.push(e); seen.add(e.uid); continue; }
    for (const t of codepoints) if (e.ch === t) { hits.push(e); seen.add(e.uid); break; }
  }
  return hits;
}

// Sogdian headwords are Latin transliterations of corpus forms, and Old Uyghur
// entries are cited by transliteration as often as by script. Neither is
// reachable through the gloss paths, so the headword itself must be searchable.
function pathHeadword(q) {
  const ql = q.toLowerCase();
  if (!ql) return [];
  const scored = [];
  for (const e of state.entries) {
    const w = (e.ch || '').toLowerCase();
    const t = (e.lead || '').toLowerCase();
    let score = 0;
    if (w === ql || t === ql)                      score = 300;
    else if (w.startsWith(ql) || t.startsWith(ql)) score = 180;
    else if (w.includes(ql) || t.includes(ql))     score = 90;
    // ties broken by corpus frequency where there is one
    if (score) scored.push({ entry: e, score: score + Math.min(e.sogN || 0, 5000) / 10000 });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.ch.length - b.entry.ch.length);
  return scored.slice(0, 150).map(x => x.entry);
}

function pathLexical(q) {
  const qSimp = window.toSimp ? window.toSimp(q) : q;
  const qTrad = window.toTrad ? window.toTrad(q) : q;
  const queryChars = toCJKArray(qSimp);
  const scored = [];
  for (const e of state.entries) {
    if (!e.searchText) continue;
    let score = 0;
    if (e.searchText.includes(q))           score += 200;
    else if (e.searchText.includes(qTrad))  score += 190;
    else if (e.searchTextSimp.includes(qSimp)) score += 180;
    if (queryChars.length) {
      let overlap = 0;
      for (const c of queryChars) if (e.meaningCharSet.has(c)) overlap++;
      if (overlap) score += overlap * (20 + (overlap / queryChars.length) * 30);
    }
    // A character matched only through the words it appears in is a weaker hit
    // than a word that actually carries the gloss.
    if (score > 0) scored.push({ entry: e, score: e.isDerived ? score * 0.55 : score });
  }
  scored.sort((a, b) => b.score - a.score
    || a.entry.searchText.length - b.entry.searchText.length
    || a.entry.cp - b.entry.cp);
  return scored.slice(0, 150).map(s => s.entry);
}

// Exact pinyin dominates; fuzzy expansion fires only for tokens with no exact
// match, so "tou" never blows up into {tao, dou, lou…} but a typo still lands.
function pathPinyin(q) {
  const PY = window.PINYIN_PLAIN || {};
  if (!state.charsByPinyin.size) return [];

  const raw = [];
  for (const t of (q.toLowerCase().match(/[a-z]+/g) || [])) raw.push(t);
  for (const c of toCJKArray(q)) {
    const py = PY[window.TC2SC?.[c] || c];
    if (py) raw.push(py);
  }
  if (!raw.length) return [];

  const matched = new Map();
  const allPys = [...state.charsByPinyin.keys()];
  for (const t of raw) {
    if (state.charsByPinyin.has(t)) { matched.set(t, Math.max(matched.get(t) || 0, 3.0)); continue; }
    if (t.length >= 2) {
      const maxEdit = t.length >= 5 ? 2 : 1;
      for (const py of allPys) {
        if (Math.abs(py.length - t.length) > maxEdit) continue;
        const d = dlDistance(t, py, maxEdit);
        if (d <= maxEdit && d > 0) {
          matched.set(py, Math.max(matched.get(py) || 0, d === 1 ? 0.7 : 0.20));
        }
      }
    }
  }
  if (!matched.size) return [];

  const scored = [];
  for (const e of state.entries) {
    const eps = state.entryPinyinSet.get(e.uid);
    if (!eps || !eps.size) continue;
    let maxW = 0, extras = 0;
    for (const [py, w] of matched) {
      if (!eps.has(py)) continue;
      if (w > maxW) { extras += (maxW > 0 ? 1 : 0); maxW = w; } else extras++;
    }
    if (maxW > 0) scored.push({ entry: e, score: maxW + 0.05 * extras });
  }
  scored.sort((a, b) => b.score - a.score
    || a.entry.searchText.length - b.entry.searchText.length
    || a.entry.cp - b.entry.cp);
  return scored.slice(0, 150).map(s => s.entry);
}

// Old Turkic entries carry inscription passages with Chinese and English
// translations. A search for 于都斤 or "Otuken" should reach the entry whose
// quotation mentions it even when no gloss does. Weighted low: a word occurring
// in a quotation is weaker evidence than one defined by the gloss.
function pathQuote(q) {
  const qSimp = window.toSimp ? window.toSimp(q) : q;
  const ql = q.toLowerCase();
  const scored = [];
  for (const e of state.entries) {
    if (!e.quoteText) continue;
    let score = 0;
    if (e.quoteText.includes(q)) score = 100;
    else if (qSimp !== q && e.quoteText.includes(qSimp)) score = 90;
    else if (ql.length >= 3 && e.quoteText.toLowerCase().includes(ql)) score = 70;
    if (score) scored.push({ entry: e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.cp - b.entry.cp);
  return scored.slice(0, 80).map(x => x.entry);
}

function pathVector(q) {
  if (!state.glossVectors.length) return [];
  const queryChars = toCJKArray(window.toSimp ? window.toSimp(q) : q);
  if (!queryChars.length) return [];

  const charWeights = new Map();
  const inputSet = new Set(queryChars);
  for (const c of queryChars) charWeights.set(c, 1.0);

  const expansion = [];
  for (const c of queryChars) {
    const neighbours = [];
    for (const [sc, w] of (state.synonyms.get(c) || [])) {
      if (inputSet.has(sc) || w < 0.25) continue;
      const v = Math.min(0.7, w * 0.7);
      charWeights.set(sc, Math.max(charWeights.get(sc) || 0, v));
      neighbours.push({ ch: sc, w: v });
    }
    if (neighbours.length) expansion.push({ base: c, neighbours: neighbours.slice(0, 6) });
  }
  state.lastExpansion = expansion.length ? expansion : null;

  const qv = vectorize(charWeights, state.charPPMI);
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

function pathPhonetic(q) {
  const ql = q.normalize('NFC').toLowerCase();
  if (!ql) return { literal: [], fuzzy: [] };
  const literal = [], fuzzy = [];
  for (const e of state.entries) {
    let best = 0;
    for (const ph of e.phonetics) {
      const v = (ph.value || '').toLowerCase();
      if (!v) continue;
      if (v === ql)              best = Math.max(best, 250);
      else if (v.startsWith(ql)) best = Math.max(best, 150);
      else if (v.includes(ql))   best = Math.max(best, 80);
    }
    if (best > 0) { literal.push({ entry: e, score: best }); continue; }
    if (ql.length >= 3) {
      for (const ph of e.phonetics) {
        const v = (ph.value || '').toLowerCase();
        if (!v || Math.abs(v.length - ql.length) > 1) continue;
        if (dlDistance(v, ql, 1) <= 1) { fuzzy.push({ entry: e, score: 35 }); break; }
      }
    }
  }
  literal.sort((a, b) => b.score - a.score || a.entry.cp - b.entry.cp);
  fuzzy.sort((a, b) => b.score - a.score || a.entry.cp - b.entry.cp);
  return {
    literal: literal.slice(0, 150).map(s => s.entry),
    fuzzy: fuzzy.slice(0, 100).map(s => s.entry),
  };
}

const PATH_WEIGHT = { T: 2.0, H: 1.9, L: 1.5, P: 1.4, V: 1.0, Fx: 1.8, Ff: 0.5, Q: 0.8 };
const PATH_LABEL  = { T: '字形', H: '词形', L: '字面', P: '拼音', V: '语义', Fx: '拟音', Ff: '拟音~', Q: '用例' };

function mergeRRF(paths, k = 60) {
  const score = new Map(), prov = new Map();
  for (const { name, results } of paths) {
    const w = PATH_WEIGHT[name] ?? 1.0;
    results.forEach((entry, idx) => {
      score.set(entry.uid, (score.get(entry.uid) || 0) + w / (k + idx + 1));
      let p = prov.get(entry.uid);
      if (!p) { p = new Set(); prov.set(entry.uid, p); }
      p.add(name);
    });
  }
  const merged = [];
  for (const [uid, s] of score) {
    const entry = state.entriesByUid.get(uid);
    if (entry) merged.push({ entry, score: s, paths: [...prov.get(uid)].sort() });
  }
  merged.sort((a, b) => b.score - a.score || b.paths.length - a.paths.length || a.entry.cp - b.entry.cp);
  return { results: merged.slice(0, 250), pathCount: paths.length };
}

function search(q) {
  q = (q || '').trim();
  if (!q) return { results: [], pathCount: 0 };

  const mode = state.mode;
  const hasScript = [...q].some(ch => inScript(ch.codePointAt(0)));
  const hasCJK = /[一-鿿]/.test(q);
  const hasLatin = /[a-zA-Z]/.test(q);

  state.lastExpansion = null;
  const paths = [], stats = {};
  const push = (name, results) => { stats[name] = results.length; if (results.length) paths.push({ name, results }); };

  if (hasScript) push('T', pathScript(q));
  if (/[a-zA-Z\u0370-\u1FFF\u0400-\u04FF]/.test(q)) push('H', pathHeadword(q));
  if (mode === 'tng') { state.lastPathStats = stats; return mergeRRF(paths); }

  if (hasCJK || mode === 'cn') {
    push('L', pathLexical(q));
    if (state.fuzzy) push('V', pathVector(q));
  }
  if (mode !== 'phon' && state.script !== 'mongolian') push('P', pathPinyin(q));
  if (q.length >= 2) push('Q', pathQuote(q));
  if (hasLatin || mode === 'phon') {
    const phon = pathPhonetic(q);
    push('Fx', phon.literal);
    push('Ff', phon.fuzzy);
  }
  state.lastPathStats = stats;
  return mergeRRF(paths);
}

/* ===== Glyph rendering ==================================================
   Multi-character Khitan words set in two columns following the canonical
   契丹小字 reading order: left→right within a row, then top→bottom, with an
   odd final character landing in the left column.
   ======================================================================== */

// Whether the script face for the active section actually resolved. No OS ships
// an Old Uyghur font, so the site serves its own subset; this is the safety net
// — if fonts/olduyghur.woff2 fails to load the section falls back to
// transliteration rather than printing a row of tofu.
const faceReady = { olduyghur: null };

async function checkFace(name, family, sample) {
  if (faceReady[name] !== null && faceReady[name] !== undefined) return faceReady[name];
  let ok = false;
  try {
    await document.fonts.load(`32px "${family}"`, sample);
    ok = document.fonts.check(`32px "${family}"`, sample);
  } catch { ok = false; }
  faceReady[name] = ok;
  return ok;
}

const canRender = () => faceReady.olduyghur !== false;

function glyphHtml(e) {
  const chars = [...e.ch];
  // The 2-column stack is a 契丹小字 convention for multi-character words. Old
  // Turkic runs horizontally like ordinary text, so it must not inherit it.
  if (chars.length <= 1 || e.script !== 'khitan') {
    // no face for this script → show what the reader can actually read
    if (e.lead && e.inScript && !canRender()) {
      return `<span class="glyph glyph-sub">${escapeHtml(e.lead)}</span>`;
    }
    return `<span class="glyph">${escapeHtml(e.ch)}</span>`;
  }
  return `<span class="glyph glyph-stack">${chars.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</span>`;
}

/* ===== Highlighting ===================================================== */

function highlight(text, q) {
  const esc = escapeHtml(text);
  if (!text || !q) return esc;

  const direct = new Set([q]);
  if (window.toSimp) direct.add(window.toSimp(q));
  if (window.toTrad) direct.add(window.toTrad(q));
  if (state.fuzzy) {
    for (const c of q) {
      if (!isCJK(c)) continue;
      direct.add(c);
      if (window.SC2TC?.[c]) direct.add(window.SC2TC[c]);
      if (window.TC2SC?.[c]) direct.add(window.TC2SC[c]);
    }
  }
  const syn = new Set();
  if (state.fuzzy && state.lastExpansion) {
    for (const ex of state.lastExpansion) {
      for (const n of ex.neighbours) {
        syn.add(n.ch);
        if (window.SC2TC?.[n.ch]) syn.add(window.SC2TC[n.ch]);
      }
    }
  }

  let html = esc;
  const apply = (pattern, cls) => {
    const p = escapeRegex(escapeHtml(pattern));
    if (!p) return;
    try {
      html = html.replace(new RegExp('(?<!<[^>]*)' + p, 'g'), m => `<span class="${cls}">${m}</span>`);
    } catch { /* lookbehind unsupported — skip rather than mangle the markup */ }
  };
  for (const p of [...direct].filter(Boolean).sort((a, b) => b.length - a.length)) apply(p, 'match');
  for (const p of [...syn].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (direct.has(p)) continue;
    apply(p, 'match syn');
  }
  return html;
}

/* ===== Index list ======================================================= */

function renderResults(rows, q) {
  const list = dom.results;
  list.innerHTML = '';
  dom['result-count'].textContent = rows.length ? rows.length.toLocaleString() : '0';

  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'index-empty';
    li.textContent = q ? `未检索到「${q}」` : '输入检索词';
    list.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    frag.appendChild(buildIndexItem(rows[i], i, q));
  }
  list.appendChild(frag);
}

function buildIndexItem(row, idx, q) {
  const e = row.entry;
  const li = document.createElement('li');
  li.className = 'index-item';
  li.dataset.uid = e.uid;
  li.setAttribute('role', 'button');
  li.setAttribute('tabindex', '-1');
  if (state.selected?.uid === e.uid) li.setAttribute('aria-current', 'true');

  const text = disp(e.isDerived ? e.derivedText : e.ownText);
  const glossHtml = text
    ? (e.isDerived ? '<span class="index-derived-mark">词义</span>' : '') + highlight(text, q)
    : '<span style="color:var(--ink-3)">—</span>';

  const phon = e.phonetics.find(p => p.value)?.value || '';
  const sub = [e.hex, phon].filter(Boolean).map(escapeHtml);

  li.innerHTML = `
    <span class="index-n">${String(idx + 1).padStart(3, '0')}</span>
    <span class="index-glyph">${glyphHtml(e)}</span>
    <span class="index-body">
      <span class="index-gloss${e.isDerived ? ' is-derived' : ''}">${glossHtml}</span>
      <span class="index-sub">${sub.map(s => `<span>${s}</span>`).join('')}</span>
    </span>`;

  li.addEventListener('click', () => selectEntry(e, true));
  return li;
}

/* ===== Entry article ==================================================== */

function sensesHtml(entry) {
  const senses = entry.senses;
  if (!senses.length) return '';
  const numbered = senses.length > 1;
  return `<ol class="senses">` + senses.map((s, i) => {
    const tags = (s.t || []).map(t => `<span class="sense-tag">${escapeHtml(disp(t))}</span>`).join('');
    const cites = (s.s || []).map(n =>
      `<button class="cite" data-ref="${n}" title="出处 ${n}">${n}</button>`).join('');
    // The Chinese is ours, the English is the source's — keep both visible so a
    // reader can check the translation without leaving the entry.
    const en = s.en ? `<span class="sense-en">${escapeHtml(s.en)}</span>` : '';
    return `<li class="sense">
      <span class="sense-n">${numbered ? i + 1 : ''}</span>
      <span>${escapeHtml(disp(s.g)) || '<span style="color:var(--ink-3)">—</span>'}${tags}${cites}${en}</span>
    </li>`;
  }).join('') + `</ol>`;
}

function block(titleEn, titleCn, body) {
  return `<section class="block">
    <h3><span>${titleEn}</span><span class="cn">${titleCn}</span></h3>
    ${body}
  </section>`;
}

function renderEntry(e) {
  const S = SCRIPTS[e.script];
  const parts = [];

  // --- head ---
  const meta = [];
  if (e.type === 'vocab') meta.push(['字数', [...e.ch].length]);
  if (e.kssId)   meta.push(['序号', e.kssId]);
  if (e.kaneId)  meta.push(['Kane 序号', e.kaneId]);
  if (e.strokes) meta.push(['笔画', e.strokes]);
  meta.push(['码位', e.hex]);

  parts.push(`
    <header class="entry-head">
      <div class="entry-glyph">${
        e.lead ? `<div class="head-lead">${escapeHtml(e.lead)}</div>` +
                 (e.inScript && canRender()
                    ? `<div class="head-script"><span class="glyph">${escapeHtml(e.ch)}</span></div>`
                    : `<div class="head-nofont">${escapeHtml(e.ch)} <i>字体缺失</i></div>`)
               : glyphHtml(e)}</div>
      <div class="entry-headword">
        <h2>${e.otkPos !== undefined
              ? `${S.label}${e.otkPos || '词条'}`
              : S.label + (e.type === 'vocab' ? '词条' : '单字')
            }<span class="en">${S.labelEn} ${
              e.otkPosEn !== undefined ? (e.otkPosEn || 'entry')
              : e.type === 'vocab' ? 'word' : 'character'}</span></h2>
        <div class="entry-meta">${meta.map(([k, v]) =>
          `<span><span class="k">${escapeHtml(k)}</span> ${escapeHtml(String(v))}</span>`).join('')}</div>
        <div class="entry-actions">
          <button class="btn" data-act="copy-char">复制字形<kbd>Enter</kbd></button>
          <button class="btn" data-act="copy-cite">复制条目引文</button>
          <button class="btn" data-act="permalink">复制链接</button>
        </div>
      </div>
    </header>`);

  // --- gloss ---
  if (e.senses.length) {
    parts.push(block('Gloss', '释义', sensesHtml(e)));
  } else if (e.script === 'khitan' && e.type === 'char') {
    // Stating the absence is the accurate thing to do. The previous build
    // filled this slot with the glosses of words containing the character.
    const n = e.ksws.length;
    parts.push(block('Gloss', '释义', `<p class="no-gloss">
      <strong>此字未见独立释义。</strong>契丹小字的原字绝大多数为表音符号，本身不承载词义。
      ${n ? `其词义见于下列 ${n} 个词条。` : ''}</p>`));
  } else if (e.script !== 'sogdian') {
    // Sogdian states its own case in renderSogdian — the reason there is no
    // gloss is specific to that section and worth spelling out.
    parts.push(block('Gloss', '释义', `<p class="no-gloss">未收释义。</p>`));
  }

  // --- reconstructions ---
  const phon = e.phonetics.filter(p => p.value || e.type === 'char');
  if (phon.length) {
    parts.push(block('Reconstruction', '拟音', `<dl class="recon">${
      phon.map(p => `
        <dt>${escapeHtml(p.label)}<span class="attrib">${escapeHtml(p.attrib)}</span></dt>
        <dd class="${p.value ? 'copyable' : 'empty'}" ${p.value ? `data-copy="${escapeHtml(p.value)}"` : ''}>${
          p.value ? escapeHtml(p.value) : '未录'}${
          p.speak && p.value ? `<button class="say" type="button" data-say="${escapeHtml(p.value)}"
            aria-label="试读 ${escapeHtml(p.value)}" title="按 IPA 近似合成，非历史语音">试读</button>` : ''
          }</dd>`).join('')
    }</dl>${
      phon.some(p => p.speak && p.value)
        ? `<p class="recon-note">试读依龚煌城转写的音段近似合成（meSpeak／eSpeak 英语音素），
             紧元音、鼻化与声调无法表达，仅供入耳，不足为音值依据。</p>`
        : ''
    }`));
  }

  // --- related words / composition ---
  if (e.script === 'khitan' && e.type === 'char' && e.ksws.length) {
    const items = e.ksws.map(ksw => {
      const t = state.entriesByUid.get('khitan:v:' + [...ksw].map(c => c.codePointAt(0).toString(16)).join('+'));
      const gl = t ? disp(t.ownText) : '';
      return `<button class="rel-item" data-jump="${escapeHtml(t ? t.uid : '')}">
        <span class="rel-glyph glyph glyph-stack">${[...ksw].map(c => `<span>${escapeHtml(c)}</span>`).join('')}</span>
        <span class="rel-sub">${escapeHtml(gl) || '—'}</span></button>`;
    }).join('');
    parts.push(block(`Occurs in ${e.ksws.length} word${e.ksws.length === 1 ? '' : 's'}`, '见于词条', `<div class="rel-grid">${items}</div>`));
  }

  if (e.script === 'khitan' && e.type === 'vocab') {
    const items = [...e.ch].map((c, i) => {
      const cp = c.codePointAt(0);
      const ce = state.entriesByUid.get('khitan:c:' + cp.toString(16));
      const pron = ce?.phonetics.find(p => p.value)?.value || '';
      return `<button class="rel-item" data-jump="${escapeHtml(ce ? ce.uid : '')}">
        <span class="rel-glyph glyph">${escapeHtml(c)}</span>
        <span class="rel-sub">${escapeHtml(pron || (e.kssIds?.[i] ? '#' + e.kssIds[i] : '—'))}</span></button>`;
    }).join('');
    parts.push(block(`Composition ${[...e.ch].length} characters`, '构词', `<div class="rel-grid">${items}</div>`));
  }

  // --- Old Turkic: morphology, relations, descendants, attestations, etymology ---
  if (e.script === 'oldturkic' || e.script === 'mongolian' || e.script === 'olduyghur')
    parts.push(renderOldTurkic(e));
  if (e.script === 'sogdian') parts.push(renderSogdian(e));

  // --- unicode ---
  const uni = [['码位', e.hex], ['十进制', [...e.ch].map(c => c.codePointAt(0)).join(' ')],
               ['HTML', [...e.ch].map(c => '&#' + c.codePointAt(0) + ';').join('')],
               ['UTF-8', utf8Hex(e.ch)]];
  parts.push(block('Encoding', 'Unicode', `<dl class="uni">${
    uni.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd class="copyable" data-copy="${escapeHtml(String(v))}">${escapeHtml(String(v))}</dd>`).join('')
  }</dl>`));

  // --- footnotes ---
  const refNums = [...new Set(e.senses.flatMap(s => s.s || []))].sort((a, b) => a - b);
  if (refNums.length && state.refs.length) {
    parts.push(`<footer class="entry-notes">
      <h3>出处 Sources</h3>
      <ol class="notes-list">${refNums.map(n => `
        <li id="note-${n}"><span class="note-n">${n}</span><span>${escapeHtml(state.refs[n - 1] || '（文献表中无此编号）')}</span></li>`).join('')}
      </ol></footer>`);
  }

  dom.detail.innerHTML = `<div class="entry">${parts.join('')}</div>`;
  wireEntry(e);
}

// Example text arrives pre-segmented as [[chunk, isHeadword], …] — the bold
// ranges were resolved against Python codepoint indices at build time, which
// do not survive the trip into a UTF-16 string. Nothing to compute here.
const segText = seg => (seg || []).map(x => x[0]).join('');

function segHtml(seg) {
  if (!seg || !seg.length) return '';
  return seg.map(([txt, hi]) =>
    hi ? `<mark class="kw">${escapeHtml(txt).replace(/\n/g, '<br>')}</mark>`
       : escapeHtml(txt).replace(/\n/g, '<br>')).join('');
}

// Everything below the gloss for an Old Turkic entry. Ordered the way a lexicon
// entry reads: what the word looks like, what it connects to, where it is
// attested, where it came from.
function renderOldTurkic(e) {
  const out = [];

  // The Mongolian-script spelling, set vertically as the script is actually
  // written. `mnSrc` records where it came from — the entry never shows a
  // spelling this project generated.
  if (e.mn) {
    const src = e.mnSrc === 'head' ? '词头即蒙文' : '据词典所载';
    out.push(block('Mongolian script', '传统蒙文', `
      <div class="mn-row">
        <div class="mn-vertical glyph">${escapeHtml(e.mn)}</div>
        <div class="mn-meta">
          <div class="mn-prov">${src}</div>
          <button class="btn" data-copy="${escapeHtml(e.mn)}">复制</button>
        </div>
      </div>`));
  } else if (e.script === 'mongolian') {
    out.push(block('Mongolian script', '传统蒙文', `<p class="no-gloss">
      <strong>本条未载传统蒙文写法。</strong>西里尔文与传统蒙文之间并非确定性对应，
      本站只收录原始词典已考订的写法，不作机器转写（详见凡例）。</p>`));
  }

  if (e.forms.length) {
    const rows = e.forms.filter(f => f.f).map(f =>
      `<div class="form-row"><span class="form-t">${escapeHtml((f.t || []).join('、')) || '—'}</span>` +
      `<span class="glyph">${escapeHtml(f.f)}</span></div>`).join('');
    out.push(block('Forms', '词形', `<div class="form-grid">${rows}</div>`));
  }

  if (e.rels.length) {
    const byKind = new Map();
    for (const r of e.rels) {
      if (!byKind.has(r.k)) byKind.set(r.k, []);
      byKind.get(r.k).push(r);
    }
    const body = [...byKind].map(([kind, items]) =>
      `<div class="rel-line"><span class="rel-kind">${escapeHtml(kind)}</span>` +
      `<span class="rel-items">${items.map(r =>
        `<button class="rel-word" data-jump-w="${escapeHtml(r.w)}" title="${escapeHtml(r.gl || '')}">` +
        `<span class="glyph">${escapeHtml(r.w)}</span></button>`).join('')}</span></div>`).join('');
    out.push(block('Relations', '构词与关联', body));
  }

  if (e.desc.length) {
    const rows = e.desc.map(d =>
      `<div class="desc-row" style="--depth:${d.d}">
         <span class="desc-lang">${escapeHtml(d.lang)}</span>
         <span class="desc-word">${escapeHtml(d.w)}${d.tr ? ` <i>${escapeHtml(d.tr)}</i>` : ''}</span>
         <span class="desc-note">${escapeHtml(d.note || '')}</span>
       </div>`).join('');
    out.push(block(`Descendants ${e.desc.length}`, '后代词', `<div class="desc-tree">${rows}</div>`));
  }

  if (e.quotes.length) {
    const rows = e.quotes.map((q, i) => `
      <figure class="quote" style="--i:${Math.min(i, 8)}">
        <div class="quote-otk glyph">${segHtml(q.t)}</div>
        ${segText(q.tr) ? `<div class="quote-tr">${segHtml(q.tr)}</div>` : ''}
        ${q.zh ? `<div class="quote-zh">${escapeHtml(disp(q.zh)).replace(/\n/g, '<br>')}</div>` : ''}
        ${q.en ? `<div class="quote-en">${segHtml(q.enSeg && q.enSeg.length ? q.enSeg : [[q.en, 0]])}</div>` : ''}
        ${q.src ? `<figcaption>${escapeHtml(q.src)}</figcaption>` : ''}
      </figure>`).join('');
    out.push(block(`Attestations ${e.quotes.length}`, '用例', `<div class="quotes">${rows}</div>`));
  }

  if (e.ety && (e.ety.zh || e.ety.en)) {
    out.push(block('Etymology', '词源', `
      ${e.ety.zh ? `<p class="ety-zh">${escapeHtml(disp(e.ety.zh))}</p>` : ''}
      ${e.ety.en ? `<details class="ety-src"><summary>原文 source</summary>
                    <p>${escapeHtml(e.ety.en)}</p></details>` : ''}`));
  }

  return out.join('');
}

// Sogdian: corpus statistics, then the concordance. The gloss block above has
// already said whether this form is glossed at all.
function renderSogdian(e) {
  const d = window.sogdianData || {};
  const out = [];

  out.push(block('In the corpus', '语料统计', e.sogN
    ? `<dl class="uni">
        <dt>出现次数</dt><dd>${e.sogN.toLocaleString()}</dd>
        <dt>见于文献</dt><dd>${e.sogTexts} 种</dd>
        ${e.sogTrad ? `<dt>主要传统</dt><dd>${escapeHtml(e.sogTrad)}</dd>` : ''}
      </dl>`
    : `<p class="no-gloss">此词形出自词表，<strong>未见于 TITUS 语料</strong>——
       两者转写体例不同，也可能确实未被收录。</p>`));

  if (!e.sogGloss.length) {
    out.push(block('Gloss', '释义', `<p class="no-gloss">
      <strong>本词形未见于词表。</strong>粟特语部分的词头取自 TITUS 语料的全部词形，
      而释义只有 Wiktionary 那 200 条；绝大多数词形因此只有用例，没有释义。</p>`));
  }

  if (e.sogConc.length) {
    const shown = e.sogConc.length, total = e.sogConcN;
    const rows = e.sogConc.map((li, i) => {
      const txt = (d.lines || [])[li] || '';
      const meta = (d.lineMeta || [])[li] || ['', 0, 0];
      const trad = (d.tradVocab || [])[meta[1]] || '';
      return `<figure class="quote conc" style="--i:${Math.min(i, 8)}">
        <div class="quote-tr">${concHtml(txt, e.ch)}</div>
        <figcaption>${escapeHtml(meta[0])}${trad ? `　${escapeHtml(trad)}` : ''}</figcaption>
      </figure>`;
    }).join('');
    const cap = total > shown ? `（共 ${total} 处，示 ${shown} 处）` : `（共 ${total} 处）`;
    out.push(block(`Concordance ${total}`, '用例' + cap, `<div class="quotes">${rows}</div>`));
  }
  return out.join('');
}

// Locate the form inside a corpus line. The transcription is BMP-only, so the
// same strip-and-compare the builder used is safe to redo here.
const SOG_STRIP = /^[[\]()●⋯…·.,;:?!|/\\¶†*«»"']+|[[\]()●⋯…·.,;:?!|/\\¶†*«»"']+$/g;

function concHtml(line, form) {
  return line.split(/(\s+)/).map(tok => {
    if (!tok.trim()) return escapeHtml(tok);
    return tok.replace(SOG_STRIP, '') === form
      ? `<mark class="kw">${escapeHtml(tok)}</mark>`
      : escapeHtml(tok);
  }).join('');
}

function wireEntry(e) {
  dom.detail.querySelector('[data-act="copy-char"]')?.addEventListener('click', () => copy(e.ch));
  dom.detail.querySelector('[data-act="copy-cite"]')?.addEventListener('click', () => copy(citationFor(e)));
  dom.detail.querySelector('[data-act="permalink"]')?.addEventListener('click', () => {
    copy(location.href.split('#')[0] + '#' + hashFor(e));
  });
  dom.detail.querySelectorAll('[data-copy]').forEach(el =>
    el.addEventListener('click', ev => {
      if (ev.target.closest('.say')) return;      // the button is not the value
      copy(el.getAttribute('data-copy'));
    }));

  // Reading a reconstruction aloud. The engine is 3 MB and is fetched on the
  // first press, so the button has to say what it is doing rather than sit
  // there looking broken for a second.
  dom.detail.querySelectorAll('.say').forEach(btn => {
    btn.addEventListener('click', async ev => {
      ev.stopPropagation();
      if (!window.tangutSpeech) { btn.textContent = '不可用'; return; }
      const was = btn.textContent;
      btn.disabled = true;
      btn.textContent = '载入…';
      const r = await window.tangutSpeech.speak(btn.getAttribute('data-say'));
      btn.disabled = false;
      btn.textContent = r === 'ok' ? was : (r === 'empty' ? '无音段' : '合成失败');
      if (r !== 'ok') setTimeout(() => { btn.textContent = was; }, 2200);
    });
  });
  dom.detail.querySelectorAll('[data-jump-w]').forEach(el =>
    el.addEventListener('click', () => {
      const w = el.getAttribute('data-jump-w');
      const t = state.entries.find(x => x.ch === w);
      if (t) selectEntry(t, true);
      else { dom.q.value = w; state.query = w; runSearch(); }
    }));
  dom.detail.querySelectorAll('[data-jump]').forEach(el =>
    el.addEventListener('click', () => {
      const t = state.entriesByUid.get(el.getAttribute('data-jump'));
      if (t) selectEntry(t, true);
    }));
  dom.detail.querySelectorAll('.cite').forEach(el =>
    el.addEventListener('click', () => {
      const li = dom.detail.querySelector('#note-' + el.dataset.ref);
      if (!li) return;
      li.scrollIntoView({ block: 'center', behavior: 'smooth' });
      li.classList.add('flash');
      setTimeout(() => li.classList.remove('flash'), 1400);
    }));
}

// A citation the user can paste into a paper — including where the gloss came from.
function citationFor(e) {
  const S = SCRIPTS[e.script];
  const lines = [`${e.ch}  ${e.hex}  （${S.label}${e.type === 'vocab' ? '词条' : '单字'}）`];
  if (e.senses.length) {
    lines.push('释义：');
    e.senses.forEach((s, i) => {
      const tag = (s.t || []).length ? `［${s.t.join('、')}］` : '';
      const src = (s.s || []).length ? `  出处 ${s.s.join('、')}` : '';
      lines.push(`  ${e.senses.length > 1 ? (i + 1) + '. ' : ''}${s.g}${tag}${src}`);
    });
  } else if (e.script === 'khitan' && e.type === 'char') {
    lines.push('释义：此字未见独立释义（表音原字）。');
  }
  for (const p of e.phonetics) if (p.value) lines.push(`${p.label} 拟音：${p.value}`);

  const refNums = [...new Set(e.senses.flatMap(s => s.s || []))].sort((a, b) => a - b);
  if (refNums.length && state.refs.length) {
    lines.push('出处文献：');
    for (const n of refNums) lines.push(`  [${n}] ${state.refs[n - 1] || ''}`);
  }
  lines.push(`数据来源：${SCRIPTS[e.script].corpusNote}`);
  return lines.join('\n');
}

function utf8Hex(s) {
  return Array.from(new TextEncoder().encode(s))
    .map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/* ===== Selection & routing ============================================== */

const hashFor = e => `/${e.script}/${[...e.ch].map(c => c.codePointAt(0).toString(16).toUpperCase()).join('+')}`;

function selectEntry(e, updateHash) {
  if (!e) return;
  state.selected = e;
  dom.results.querySelectorAll('[aria-current]').forEach(el => el.removeAttribute('aria-current'));
  const li = dom.results.querySelector(`[data-uid="${CSS.escape(e.uid)}"]`);
  if (li) {
    li.setAttribute('aria-current', 'true');
    li.scrollIntoView({ block: 'nearest' });
  }
  renderEntry(e);
  dom.detail.scrollTop = 0;
  if (updateHash) history.replaceState(null, '', '#' + hashFor(e));
  if (state.autocopy) copy(e.ch);
}

function entryFromHash() {
  // script names come from SCRIPTS so a new section routes without edits here
  const m = new RegExp('^#/(' + Object.keys(SCRIPTS).join('|') + ')/([0-9A-Fa-f+]+)$').exec(location.hash);
  if (!m) return null;
  const cps = m[2].split('+').map(x => parseInt(x, 16));
  const ch = cps.map(c => String.fromCodePoint(c)).join('');
  return { script: m[1], ch };
}

/* ===== Clipboard ======================================================== */

function copy(text) {
  if (!text) return;
  const done = () => flash('已复制');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb?.(); } catch {}
  document.body.removeChild(ta);
}

// Transient confirmations borrow the search-status slot and hand it back.
let statusText = '待输入', flashTimer = null;

function setStatus(s) {
  statusText = s;
  dom['search-status'].textContent = s;
}

function flash(msg) {
  dom['search-status'].textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { dom['search-status'].textContent = statusText; }, 1600);
}

/* ===== Search driving =================================================== */

function runSearch() {
  if (state.loading) return;
  const q = state.query.trim();

  if (state.mode === 'sent') { runSentence(q); return; }

  let rows;

  if (!q) {
    rows = state.entries.slice(0, 200).map(e => ({ entry: e, paths: [] }));
    setStatus('浏览全部');
    dom['rank-meta'].textContent =
      `显示前 ${Math.min(200, state.entries.length)} 条，共 ${state.entries.length.toLocaleString()} 条`;
  } else {
    const out = search(q);
    rows = out.results;
    setStatus(`${rows.length} 条命中`);

    const stats = state.lastPathStats || {};
    const parts = ['T', 'H', 'L', 'P', 'V', 'Fx', 'Ff', 'Q'].filter(k => stats[k])
      .map(k => `${PATH_LABEL[k]} ${stats[k]}`).join('\u3000');
    let meta = `${out.pathCount} 路融合：${parts || '无命中'}`;
    if (state.lastExpansion && state.fuzzy) {
      meta += `　近义扩展 ${state.lastExpansion.map(e =>
        `${e.base}≈${e.neighbours.slice(0, 4).map(n => n.ch).join('、')}`).join('\u3000')}`;
    }
    dom['rank-meta'].textContent = meta;
  }
  state.filtered = rows;
  renderResults(rows, q);
}

/* ---------- 句读 ---------------------------------------------------------
   A whole-sentence reading rather than a lookup: jieba cuts and tags it, the
   sentence is set vertically with the cuts as breaks in the column, and each
   content word is matched against this section's glosses. The workspace is
   hidden rather than reused — the index/detail pair is built around one
   headword and would have to be fought to show a sentence. */

function applyMode() {
  const on = state.mode === 'sent';
  // A class, not the `hidden` attribute: `.workspace { display: grid }` beats
  // `[hidden] { display: none }` on specificity, so the attribute alone leaves
  // the two-pane workspace on screen with the sentence view stacked under it.
  document.body.classList.toggle('is-sentence', on);
  dom.q.placeholder = on
    ? '输入一个句子——例：内亚古文字的研究者在敦煌发现了西夏文写本'
    : '输入汉语释义、字形、拟音或转写——例: 山 / 𗀀 / nior / türük';
}

let sentToken = 0;

async function runSentence(q) {
  const S = SCRIPTS[state.script];
  if (!q) {
    dom.sentence.innerHTML =
      `<p class="sent-idle">输入一句汉语，按 jieba 切分后逐词在${S.label}中检索释义。</p>`;
    setStatus('句读');
    dom['rank-meta'].textContent = '';
    return;
  }
  const mine = ++sentToken;
  setStatus('句读');
  const toks = await window.sentenceMode.run(
    dom.sentence, q, state.entries, S.label,
    uid => {
      const e = state.entriesByUid.get(uid);
      if (!e) return;
      // leaving 句读 for the entry the reader asked to see
      state.mode = 'auto';
      dom.modes.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === 'auto')));
      applyMode();
      state.query = e.searchText.split(/[、，,]/)[0] || q;
      dom.q.value = state.query;
      runSearch();
      selectEntry(e, true);
    });
  if (mine !== sentToken || !toks) return;
  const content = toks.filter(t => !window.sentenceMode.SKIP_POS.has(t.pos) && /[一-鿿]/.test(t.w));
  dom['rank-meta'].textContent =
    `${toks.length} 词　实词 ${content.length}　词典 349,046 条（jieba）`;
}

function scheduleSearch() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(runSearch, 60);
}

function moveSelection(delta) {
  if (!state.filtered.length) return;
  const cur = state.selected ? state.filtered.findIndex(r => r.entry.uid === state.selected.uid) : -1;
  const next = Math.max(0, Math.min(state.filtered.length - 1, cur + delta));
  if (next !== cur) selectEntry(state.filtered[next].entry, true);
}

/* ===== Script activation ================================================ */

async function activateScript(name, wantedCh) {
  if (!SCRIPTS[name]) return;
  const S = SCRIPTS[name];
  state.script = name;
  state.loading = true;

  // Built from SCRIPTS, not written out by hand: a hardcoded list goes stale
  // the moment a section is added, and two is-* classes at once would let CSS
  // source order — not the active section — pick the script font.
  document.body.classList.remove(...Object.keys(SCRIPTS).map(k => 'is-' + k));
  if (name !== 'tangut') document.body.classList.add('is-' + name);
  dom.scriptTabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.script === name)));
  dom['mode-script'].textContent = S.modeLabel;
  dom['source-line'].textContent = '数据来源：' + S.corpusNote;
  if (state.mode === 'sent') applyMode();

  if (!state.data[name]) {
    dom.results.innerHTML = `<li class="loading">正在载入${S.label}数据…</li>`;
    dom.detail.innerHTML = `<div class="loading">正在载入…</div>`;
    try {
      await Promise.all([loadOnce(S.src), searchAssets()]);
    } catch (err) {
      dom.results.innerHTML = `<li class="index-empty">数据载入失败：${escapeHtml(err.message)}</li>`;
      state.loading = false;
      return;
    }
    if (name === 'olduyghur') await checkFace('olduyghur', 'Old Uyghur', '\u{10F70}');

  const slice = name === 'khitan'    ? ingestKhitan()
              : name === 'oldturkic' ? ingestOldTurkic()
              : name === 'mongolian' ? ingestMongolian()
              : name === 'olduyghur' ? ingestOldUyghur()
              : name === 'sogdian'   ? ingestSogdian()
              : ingestTangut();
    slice.entriesByUid = new Map(slice.entries.map(e => [e.uid, e]));
    buildIndices(slice);
    state.data[name] = slice;
  }

  const slice = state.data[name];
  Object.assign(state, {
    entries: slice.entries, entriesByUid: slice.entriesByUid,
    cooccur: slice.cooccur, synonyms: slice.synonyms, charPPMI: slice.charPPMI,
    glossVectors: slice.glossVectors, charsByPinyin: slice.charsByPinyin,
    entryPinyinSet: slice.entryPinyinSet, refs: slice.refs, meta: slice.meta, selected: null,
  });
  state.loading = false;

  // The Khitan dataset exists in two states: the legacy conversion (glosses
  // whole, no citations) and the re-scraped one (senses split, cited). Say
  // which one is loaded rather than letting the difference pass unmarked.
  const provisional = state.meta && state.meta.structured === false;
  document.body.classList.toggle('is-provisional', !!provisional);
  let note = provisional ? '释义义项未切分，见凡例' : '';
  // Mongolian ships with the traditional-script core translated first; say how
  // far that has got rather than letting English glosses pass unremarked.
  if (!note && state.meta && state.meta.coreSenses) {
    const pct = Math.round(state.meta.zhSenses / state.meta.coreSenses * 100);
    if (pct < 100) note = `中文释义 ${pct}%，其余暂存英文`;
  }
  dom['data-state'].textContent = note;

  // Bibliography is Khitan-only for now; hide the control when it is empty.
  dom['btn-refs'].style.display = state.refs.length ? '' : 'none';
  if (state.refs.length) renderRefs();
  if (dom['cx-refs']) dom['cx-refs'].textContent = state.refs.length ? String(state.refs.length) : '—';

  const nChar  = slice.entries.filter(e => e.type === 'char').length;
  const nVocab = slice.entries.length - nChar;
  const nQuote = slice.entries.reduce((n, e) => n + (e.quotes ? e.quotes.length : 0), 0);
  dom['corpus-line'].textContent =
    (nChar  ? `${nChar.toLocaleString()} 字` : '')
    + (nVocab ? `${nChar ? '\u3000' : ''}${nVocab.toLocaleString()} 词` : '')
    + (nQuote ? `\u3000${nQuote.toLocaleString()} 例句` : '')
    + (state.refs.length ? `\u3000${state.refs.length} 条文献` : '');

  runSearch();
  // A permalink can name an entry that no longer exists (or never did). Fall
  // back to the first hit rather than leaving the pane on its loading state.
  const wanted = wantedCh ? state.entries.find(e => e.ch === wantedCh) : null;
  const target = wanted || state.filtered[0]?.entry;
  if (target) selectEntry(target, !wanted);
  else dom.detail.innerHTML = '<div class="entry-empty">没有可显示的条目</div>';
}

function renderRefs() {
  dom['refs-list'].innerHTML = state.refs.map((r, i) =>
    `<li id="ref-${i + 1}"><span class="ref-n">${i + 1}</span><span>${escapeHtml(r)}</span></li>`).join('');
}

/* ===== Theme ============================================================ */

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  dom['theme-toggle'].addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

/* ===== Events =========================================================== */

function bindEvents() {
  dom.q.addEventListener('input', e => {
    state.query = e.target.value;
    dom.clear.classList.toggle('on', !!state.query);
    scheduleSearch();
  });

  dom.q.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = state.selected || state.filtered[0]?.entry;
      if (t) { copy(t.ch); if (!state.selected) selectEntry(t, true); }
    } else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp')     { e.preventDefault(); moveSelection(-1); }
    else if (e.key === 'Escape') {
      if (state.query) {
        dom.q.value = ''; state.query = '';
        dom.clear.classList.remove('on');
        runSearch();
      } else dom.q.blur();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.target === dom.q || e.target.tagName === 'INPUT') return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === '/') { e.preventDefault(); dom.q.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); moveSelection(-1); }
    else if (e.key === 'Enter' && state.selected) copy(state.selected.ch);
  });

  dom.clear.addEventListener('click', () => {
    dom.q.value = ''; state.query = '';
    dom.clear.classList.remove('on');
    runSearch(); dom.q.focus();
  });

  dom.scriptTabs.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.script !== state.script) activateScript(b.dataset.script);
  }));

  dom.modes.forEach(b => b.addEventListener('click', () => {
    dom.modes.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    state.mode = b.dataset.mode;
    applyMode();
    runSearch(); dom.q.focus();
  }));

  dom.fuzzy.addEventListener('change', e => { state.fuzzy = e.target.checked; runSearch(); });
  dom.autocopy.addEventListener('change', e => { state.autocopy = e.target.checked; });
  dom.simp.addEventListener('change', e => {
    state.simp = e.target.checked;
    runSearch();
    if (state.selected) renderEntry(state.selected);
    if (state.refs.length) renderRefs();
  });

  document.querySelectorAll('[data-dialog]').forEach(b => b.addEventListener('click', () =>
    document.getElementById(b.dataset.dialog)?.showModal()));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () =>
    b.closest('dialog')?.close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => {
    if (e.target === d) d.close();          // click the backdrop to dismiss
  }));

  addEventListener('hashchange', () => {
    const want = entryFromHash();
    if (!want) return;
    if (want.script !== state.script) { activateScript(want.script, want.ch); return; }
    const t = state.entries.find(e => e.ch === want.ch);
    if (t && t.uid !== state.selected?.uid) selectEntry(t, false);
  });
}

/* ===== Init ============================================================= */

function init() {
  bindDom();
  initTheme();
  bindEvents();
  const want = entryFromHash();
  activateScript(want?.script || 'tangut', want?.ch);
}

window.__DBG = { state, SCRIPTS };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
