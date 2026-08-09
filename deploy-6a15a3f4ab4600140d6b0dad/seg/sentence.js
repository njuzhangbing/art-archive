/* ==========================================================================
   句读 — read a Chinese sentence against the lexica.

   The sentence is set vertically, right to left, the way the manuscripts this
   site indexes are set. Word boundaries found by jieba are drawn as breaks in
   the column rather than as inserted marks, so the sentence stays readable as
   a sentence; the part of speech sits beside each word in the margin, which is
   where a commentator would put it.

   Each word is then looked up in the section's own glosses. This is a gloss
   lookup, not a translation: it says "these entries are glossed with this
   word", which is the honest claim. A Tangut character glossed 山 is not a
   translation of 山 in the sentence's context, and the panel says so.

   Depends on seg/jieba.js for the segmentation and on the host page for
   `sentenceHost`, which supplies the entries and the click-through.
   ========================================================================== */
'use strict';

(function () {

const MAX_HITS = 6;          // per word, before "更多"

/* ---------- matching -----------------------------------------------------
   Ranked, because "the entries whose gloss contains 王" is a much weaker claim
   than "the entries whose gloss IS 王". An exact sense beats a sense that
   merely contains the word, which beats a match anywhere in the entry's text. */
function rank(word, entries) {
  const hits = [];
  for (const e of entries) {
    if (!e.searchText) continue;
    let score = 0, why = '';
    const senses = (e.senses || []).map(s => s.g).filter(Boolean);
    if (senses.some(g => g === word)) { score = 100; why = '释义相同'; }
    else if (senses.some(g => g.split(/[、，,;；]/).some(p => p.trim() === word))) {
      score = 80; why = '义项相同';
    } else if (word.length > 1 && e.searchText.includes(word)) {
      score = 50; why = '释义含此词';
    } else if (word.length === 1 && senses.some(g => g.includes(word))) {
      // a single character matching inside a longer gloss is weak evidence;
      // it is kept, but ranked below everything else and labelled
      score = 20; why = '释义含此字';
    }
    if (!score) continue;
    // prefer the shorter gloss: 山 glossed exactly 山 is a better answer than
    // one glossed 山、丘、陵、岗 where 山 happens to be first
    hits.push({ e, score: score - Math.min(e.searchText.length, 40) / 100, why });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

/* Tangut and Khitan are glossed character by character — 山, 水, 王 — so a
   modern compound like 研究者 will never match whole, and stopping at the word
   would make the panel look empty for most of any real sentence. Falling back
   to the characters is not a fudge: it is how these lexica are indexed, and it
   is what a reader does by hand. The result is labelled per character so the
   claim stays exact — 研究者 is not being translated, its characters are being
   looked up one at a time. */
function rankChars(word, entries) {
  if (word.length < 2) return [];
  const out = [];
  for (const ch of word) {
    if (!/[一-鿿]/.test(ch)) continue;
    const h = rank(ch, entries);
    if (h.length) out.push({ ch, hits: h });
  }
  return out;
}

/* Function words are not looked up. 的, 了, 在 have no entry in a Tangut or
   Khitan lexicon that means what they mean here, and offering one would be
   worse than offering nothing. The tags come from jieba, so this is a
   statement about the parse rather than a hand-listed stopword set. */
const SKIP_POS = new Set(['uj', 'ul', 'ug', 'uv', 'uz', 'ud', 'u', 'y', 'x', 'w',
                          'c', 'cc', 'p', 'pba', 'pbei', 'e', 'o', 'eng']);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- rendering ---------------------------------------------------- */

function render(host, toks, entries, label) {
  const looked = toks.filter(t => !SKIP_POS.has(t.pos) && /[一-鿿]/.test(t.w));
  const results = new Map();
  for (const t of looked) {
    if (!results.has(t.w)) results.set(t.w, rank(t.w, entries));
  }

  const column = toks.map((t, i) => {
    const skip = SKIP_POS.has(t.pos) || !/[一-鿿]/.test(t.w);
    let n = skip ? 0 : (results.get(t.w) || []).length;
    if (!skip && !n) n = rankChars(t.w, entries).length ? -1 : 0;   // -1: 逐字命中
    const note = skip ? '' :
      (t.posZh || t.pos) + (t.known ? '' : '推') +
      (n > 0 ? ' ' + n : n < 0 ? ' 字' : '');
    // <ruby> rather than absolutely-positioned labels: in vertical writing the
    // annotation lands to the right of the character, which is where a
    // manuscript's interlinear gloss goes — and it stays there when the column
    // wraps, which an absolutely-positioned label does not.
    return `<span class="tok${skip ? ' is-skip' : ''}${n ? '' : ' is-empty'}"
              data-i="${i}" data-w="${escapeHtml(t.w)}" tabindex="0"
              role="button" aria-label="${escapeHtml(t.w)}　${escapeHtml(t.posZh || t.pos)}">
        <ruby>${escapeHtml(t.w)}<rt>${escapeHtml(note)}</rt></ruby>
      </span>`;
  }).join('');

  const row = h => `
      <li><button type="button" class="sent-hit" data-uid="${escapeHtml(h.e.uid)}">
        <span class="sh-glyph">${escapeHtml(h.e.lead || h.e.ch)}</span>
        <span class="sh-gloss">${escapeHtml(h.e.searchText.slice(0, 46))}</span>
        <span class="sh-why">${h.why}</span>
      </button></li>`;

  const cards = looked.map(t => {
    const hits = results.get(t.w) || [];
    let body;
    if (hits.length) {
      body = `<ol class="sent-hits">${hits.slice(0, MAX_HITS).map(row).join('')}</ol>${
        hits.length > MAX_HITS ? `<p class="sc-more">另有 ${hits.length - MAX_HITS} 条</p>` : ''}`;
    } else {
      const per = rankChars(t.w, entries);
      body = per.length
        ? `<p class="sc-fallback">整词未见，逐字：</p>` + per.map(p => `
            <div class="sent-char">
              <span class="sch-c">${escapeHtml(p.ch)}</span>
              <ol class="sent-hits">${p.hits.slice(0, 3).map(row).join('')}</ol>
            </div>`).join('')
        : `<p class="sc-none">${label}未见以此为释义的词条，逐字亦无</p>`;
    }
    return `<section class="sent-card" data-w="${escapeHtml(t.w)}">
      <h4>${escapeHtml(t.w)}<span class="sc-pos">${escapeHtml(t.posZh || t.pos)}</span></h4>
      ${body}
    </section>`;
  }).join('');

  host.innerHTML = `
    <div class="sent-pane">
      <div class="sent-column" aria-label="竖排句子，按分词断开">${column}</div>
      <div class="sent-side">
        <p class="sent-note">分词与词性出自 jieba（词典 349,046 条）。
          下列为${label}中以该词为释义的词条 —— 是释义检索，不是翻译：
          释义相同不等于在此句语境中可以互换。</p>
        ${cards || '<p class="sc-none">没有可查的实词。</p>'}
      </div>
    </div>`;
}

/* ---------- public ------------------------------------------------------- */

window.sentenceMode = {
  SKIP_POS,
  rank,

  /** Segment `text`, render into `host`, wire click-through via `onPick`. */
  async run(host, text, entries, label, onPick) {
    host.innerHTML = `<p class="sent-loading">正在载入 jieba 词典（约 2.6 MB，仅首次）…</p>`;
    try {
      await window.jiebaSeg.load();
    } catch (err) {
      host.innerHTML = `<p class="sent-loading">分词词典载入失败：${escapeHtml(err.message)}</p>`;
      return;
    }
    const toks = window.jiebaSeg.tag(text);
    render(host, toks, entries, label);

    const focus = w => {
      host.querySelectorAll('.tok').forEach(el =>
        el.classList.toggle('is-on', el.dataset.w === w));
      const card = host.querySelector(`.sent-card[data-w="${CSS.escape(w)}"]`);
      host.querySelectorAll('.sent-card').forEach(c => c.classList.toggle('is-on', c === card));
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    host.querySelectorAll('.tok').forEach(el => {
      el.addEventListener('click', () => focus(el.dataset.w));
      el.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); focus(el.dataset.w); }
      });
    });
    host.querySelectorAll('.sent-hit').forEach(el =>
      el.addEventListener('click', () => onPick(el.dataset.uid)));

    return toks;
  },
};

})();
