#!/usr/bin/env python3
"""
Build sogdian.js from two sources of very different character.

  1. A GLOSSARY — 200 entries scraped from Wiktionary, and not the English one:
     glosses come in German (119), French (40), English (39) and Russian (2),
     mostly citing Skjærvø's *An Introduction to Manichean Sogdian*. Tiny, but
     it is the only thing here that states what a word means.

  2. A CORPUS — the TITUS Sogdian collection: 21,292 lines and 125,820 tokens
     across 27 texts in six traditions (Buddhist, Manichaean, Christian, secular
     documents, ancient letters). No glosses at all; what it gives instead is
     attestation — where a form actually occurs, with text / chapter / manuscript
     / page / line.

So this section is not a dictionary with examples bolted on, it is a
CONCORDANCE with a glossary bolted on. The headword list is the corpus
vocabulary ranked by frequency; a gloss appears on the ~200 forms the glossary
covers and is absent — visibly — everywhere else.

The tokens table cannot be joined back to the lines table: its key
(part, 文本, 章节, 写本, 页, 行) collides on 996 rows. The concordance is therefore
built by re-tokenising `text_clean` with the same normalisation the tokens table
used, which also keeps the offsets needed to highlight the form in its line.

Usage:  python3 tools/build_sogdian.py
"""
import csv, json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = os.environ.get("SOGDIAN_DIR", "/Users/zhangbing/Downloads/old_turkic/output")
GLOSS_FILE = os.path.join(HERE, "sog_glosses.json")
MAX_CONC = 24          # concordance lines kept per form; true total is recorded
log = lambda *a: print(*a, flush=True)

TRADITION = {
    "佛教文献": "佛教文献", "摩尼教文献": "摩尼教文献", "基督教文献": "基督教文献",
    "摩尼字体·其他": "摩尼字体（其他）", "世俗文书": "世俗文书", "古代书信等": "古代书信等",
}

# Editorial marks the TITUS transcription uses; the tokens table strips exactly
# these when producing 词形_去符号, so the concordance must strip the same set.
STRIP = "[]()●⋯…·.,;:?!·|/\\¶†*«»\"'"


def norm(tok):
    return tok.strip(STRIP).strip()


# The glossary and the corpus do not share a transcription. Wiktionary writes
# plain Latin (crm, cxš’pt); TITUS writes the Manichaean/Sogdian-script
# conventions (՚ for aleph, β γ δ for the spirants). Folding those away
# raises the number of glossary entries that reach a corpus form from 45 to 138.
_FOLD = str.maketrans({"β": "b", "γ": "g", "δ": "d",
                       "š": "s", "č": "c", "ž": "z"})


def fold(s):
    s = s.lower().translate(_FOLD)
    for ch in "՚ʾ’‘'`ʿʼ̣̄̆":
        s = s.replace(ch, "")
    return s


def read(path):
    with open(path, encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def main():
    gdir = os.path.join(BASE, "Sogdian")
    tdir = os.path.join(BASE, "Sogdian_TITUS")
    for d in (gdir, tdir):
        if not os.path.isdir(d):
            sys.exit(f"missing source directory: {d}")

    ZH = json.load(open(GLOSS_FILE, encoding="utf-8")) if os.path.exists(GLOSS_FILE) else {}
    if not ZH:
        log(f"  (无 {os.path.basename(GLOSS_FILE)}，释义保留原文)")

    # ---- glossary ---------------------------------------------------------
    need = set()
    gloss = collections.defaultdict(list)
    for r in read(os.path.join(gdir, "sogdian_词汇.csv")):
        g = (r.get("释义") or "").strip()
        if not g:
            continue
        zh = ZH.get(g, "")
        if not zh:
            need.add(g)
        item = {"g": g, "zh": zh, "lang": r.get("释义语言", ""),
                "pos": (r.get("词性") or "").strip(), "src": (r.get("出处") or "").strip(),
                "tr": (r.get("转写") or "").strip()}
        for key in {(r.get("词头") or "").strip(), (r.get("转写") or "").strip()}:
            if key:
                gloss[fold(key)].append(item)

    # ---- corpus lines -----------------------------------------------------
    lines, line_meta = [], []
    for r in read(os.path.join(tdir, "lines_行级语料.csv")):
        txt = (r.get("text_clean") or "").strip()
        if not txt:
            continue
        ref = "/".join(x for x in [r.get("文本", ""), r.get("章节", ""),
                                   r.get("写本", ""), r.get("页", ""), r.get("行", "")] if x)
        lines.append(txt)
        line_meta.append([ref, TRADITION.get(r.get("传统", ""), r.get("传统", "")),
                          r.get("文本", "")])

    # ---- inverted index ---------------------------------------------------
    post = collections.defaultdict(list)      # form → [(lineIdx, tokenStart, tokenEnd)]
    freq = collections.Counter()
    for i, txt in enumerate(lines):
        for raw in txt.split():
            w = norm(raw)
            freq[w] += 1
            if not w:
                continue
            if len(post[w]) < MAX_CONC:
                post[w].append(i)

    # ---- headwords: corpus vocabulary, ranked by frequency ----------------
    entries = []
    for r in read(os.path.join(tdir, "wordfreq_词频.csv")):
        w = (r.get("词形") or "").strip()
        if not w:
            continue
        hits = post.get(w, [])
        gl = gloss.get(fold(w), [])
        entries.append({
            "w": w,
            "n": int(r.get("频次") or 0),
            "nt": int(r.get("出现文本数") or 0),
            "trad": TRADITION.get(r.get("主要传统", ""), r.get("主要传统", "")),
            "gl": gl,
            "conc": hits[:MAX_CONC],
            "concN": freq.get(w, len(hits)),
        })
    # A glossary word whose spelling never occurs in the corpus would otherwise
    # be unreachable — 200 entries went in, only ~138 fold-match a corpus form.
    # Carry the rest in as zero-frequency headwords so the glossary is complete.
    seen = {fold(e["w"]) for e in entries}
    orphan = 0
    for key, items in gloss.items():
        if key in seen:
            continue
        seen.add(key)
        orphan += 1
        entries.append({"w": items[0].get("tr") or key, "n": 0, "nt": 0,
                        "trad": "", "gl": items, "conc": [], "concN": 0})
    if orphan:
        log(f"  词表中未见于语料的词形 {orphan} 条，作为零频词头补入")

    entries.sort(key=lambda e: (-e["n"], e["w"]))

    n_gl = sum(1 for e in entries if e["gl"])
    n_zh = sum(1 for e in entries if any(g["zh"] for g in e["gl"]))
    n_cc = sum(1 for e in entries if e["conc"])
    trads = collections.Counter(m[1] for m in line_meta)

    # 24,567 entry objects would spend ~1 MB on repeated JSON key names alone,
    # so entries ship as positional arrays and the repeated strings (tradition,
    # text sigil, gloss records) are interned. The renderer unpacks them once.
    trad_vocab, trad_idx = [], {}
    text_vocab, text_idx = [], {}
    gl_vocab,  gl_key    = [], {}

    def intern(vocab, idx, val):
        if val not in idx:
            idx[val] = len(vocab); vocab.append(val)
        return idx[val]

    packed_meta = [[m[0], intern(trad_vocab, trad_idx, m[1]),
                    intern(text_vocab, text_idx, m[2])] for m in line_meta]

    packed = []
    for e in entries:
        gi = -1
        if e["gl"]:
            k = json.dumps(e["gl"], ensure_ascii=False, sort_keys=True)
            if k not in gl_key:
                gl_key[k] = len(gl_vocab); gl_vocab.append(e["gl"])
            gi = gl_key[k]
        packed.append([e["w"], e["n"], e["nt"],
                       intern(trad_vocab, trad_idx, e["trad"]),
                       e["concN"], e["conc"], gi])

    payload = {
        "meta": {
            "source": "TITUS 粟特语语料 + Wiktionary 粟特语词表",
            "sourceUrl": "https://titus.uni-frankfurt.de/",
            "lines": len(lines), "tokens": sum(e["n"] for e in entries),
            "forms": len(entries), "glossed": n_gl, "zhGlossed": n_zh,
            "texts": len({m[2] for m in line_meta}),
            "traditions": dict(trads),
            "concMax": MAX_CONC,
        },
        "lines": lines, "lineMeta": packed_meta, "entries": packed,
        "tradVocab": trad_vocab, "textVocab": text_vocab, "glVocab": gl_vocab,
    }
    dst = os.path.join(ROOT, "sogdian.js")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* 粟特语 — built by tools/build_sogdian.py.\n"
                f"   语料 {len(lines)} 行 / {len(entries)} 词形；词表 {n_gl} 条附释义。\n"
                "   词表来自 Wiktionary（德/法/英/俄），语料来自 TITUS。 */\n")
        f.write("window.sogdianData = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    log(f"  语料 {len(lines)} 行 · {payload['meta']['tokens']} 词次 · {len(entries)} 词形 · {payload['meta']['texts']} 种文献")
    log(f"  传统分布: {dict(trads.most_common())}")
    log(f"  有释义的词形 {n_gl}（{n_gl/len(entries)*100:.1f}%）  其中已译中文 {n_zh}")
    log(f"  有用例的词形 {n_cc}（{n_cc/len(entries)*100:.0f}%）")
    log(f"→ {dst}  ({os.path.getsize(dst)/1024:.0f} KB)")

    if need:
        todo = os.path.join(HERE, "sog_untranslated.json")
        json.dump({"glosses": sorted(need)}, open(todo, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        log(f"  待译 {len(need)} 条释义（德/法/英/俄）→ {todo}")


if __name__ == "__main__":
    main()
