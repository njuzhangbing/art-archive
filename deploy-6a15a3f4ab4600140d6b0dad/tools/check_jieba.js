#!/usr/bin/env node
/* Diff seg/jieba.js against Python jieba over a corpus.
 *
 * The browser file is loaded as-is — no test build, no second copy of the
 * algorithm. Only `window` and `fetch` are stubbed, so what is being checked is
 * exactly the code the site ships.
 *
 * Usage:  python3 tools/check_jieba.py --emit > /tmp/expect.json
 *         node tools/check_jieba.js /tmp/expect.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);

global.window = global;
global.fetch = async (url) => {
  const file = path.join(ROOT, url);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
    body: new Blob([buf]).stream(),
    text: async () => buf.toString('utf8'),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
};

require(path.join(ROOT, 'seg', 'jieba.js'));

(async () => {
  const expectPath = process.argv[2];
  if (!expectPath) {
    console.error('usage: node tools/check_jieba.js <expect.json>');
    process.exit(2);
  }
  const expect = JSON.parse(fs.readFileSync(expectPath, 'utf8'));

  const t0 = Date.now();
  await window.jiebaSeg.load();
  const st = window.jiebaSeg.stats();
  console.log(`词典载入 ${Date.now() - t0} ms  前缀表 ${st.words} 项  总频次 ${st.total}`);

  let nSent = 0, nTok = 0, badCut = 0, badPos = 0;
  const samples = [];
  for (const [sent, want] of Object.entries(expect)) {
    nSent++;
    const got = window.jiebaSeg.tag(sent);
    const gotWords = got.map(x => x.w);
    const wantWords = want.map(x => x[0]);
    nTok += wantWords.length;
    if (gotWords.join('') !== wantWords.join('')) {
      badCut++;
      if (samples.length < 8) samples.push(
        `  切分不同\n    句  ${sent}\n    py  ${wantWords.join('/')}\n    js  ${gotWords.join('/')}`);
    } else {
      for (let i = 0; i < want.length; i++) {
        // only known words are compared: unknown words get no tag from us by
        // design, and jieba's posseg guesses them with a model we do not ship
        if (!got[i].known) continue;
        if (got[i].pos !== want[i][1]) {
          badPos++;
          if (samples.length < 12) samples.push(
            `  词性不同  ${want[i][0]}  py=${want[i][1]}  js=${got[i].pos}`);
        }
      }
    }
  }

  console.log(`句子 ${nSent}  词次 ${nTok}`);
  console.log(`切分不一致 ${badCut} 句  (${(100 * (1 - badCut / nSent)).toFixed(2)}% 一致)`);
  console.log(`登录词词性不一致 ${badPos} 处`);
  if (samples.length) console.log(samples.join('\n'));
  process.exit(badCut === 0 && badPos === 0 ? 0 : 1);
})();
