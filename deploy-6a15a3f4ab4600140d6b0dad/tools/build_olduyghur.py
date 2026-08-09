#!/usr/bin/env python3
"""
Build olduyghur.js from the kaikki (Wiktionary) Old Uyghur dump.

Same shape as tools/build_oldturkic.py — etymology rendered from structured
templates, controlled vocabulary from tables, glosses hand-translated via
tools/ou_glosses.json.

One presentational difference: the section is TRANSLITERATION-FIRST. 316 of the
423 headwords are written in Old Uyghur script (U+10F70–U+10FAF), for which no
font ships on macOS or Windows. The site now serves its own — Noto Serif Old
Uyghur, subset to fonts/olduyghur.woff2 — so the script form renders; but the
Latin transliteration still leads, because that is how Old Uyghur scholarship
cites, and because the app checks the Font Loading API and falls back to
transliteration alone if the face ever fails to resolve.

Usage:  python3 tools/build_olduyghur.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC  = os.environ.get("OU_JSONL",
                      "/Users/zhangbing/Downloads/old_turkic/kaikki-OldUyghur.jsonl")
GLOSS_FILE = os.path.join(HERE, "ou_glosses.json")
log = lambda *a: print(*a, flush=True)

sys.path.insert(0, HERE)
from build_oldturkic import (LANG, TAG, CASE, TOPIC, REL, POS, DESC_NOTE,   # noqa: E402
                             render_etymology, clean_tags, lang_name,
                             mark_segments, walk_descendants)
from build_mongolian import formulaic_zh                                   # noqa: E402

SCRIPT_LO, SCRIPT_HI = 0x10F70, 0x10FAF


def in_script(s):
    return any(SCRIPT_LO <= ord(c) <= SCRIPT_HI for c in s or "")


# Six entries state their etymology in prose with no templates behind it, so
# render_etymology has nothing to work from. All six are one of three fixed
# shapes; rewriting just the frame — and copying the forms, transcriptions and
# glosses through untouched — keeps the same guarantee the template path gives:
# nothing is paraphrased into a claim the source did not make.
PROSE_FRAME = [
    # Each pattern is anchored at both ends: a frame that matched only a prefix
    # would copy the untranslated remainder through, and half-Chinese prose reads
    # worse than leaving the whole sentence in English.
    (re.compile(r"^Orkhon script variant of ([^.]+)\.$", re.S),     "鄂尔浑文写法的异体：{}。"),
    (re.compile(r"^Variant form of (.+?), possibly a later spelling\.$", re.S),
                                                                    "{} 的异体，或为较晚的拼写。"),
    (re.compile(r"^Crasis of (.+?) and (.+?)\.$", re.S),            "由 {} 与 {} 缩合而成。"),
    # One entry carries a full argument rather than a formula. Forms and glosses
    # are still captured and copied, not retyped.
    (re.compile(r"^Orkhon script variant of (.+?) with a metathesis of "
                r"(\S+) > (\S+) before the antecedent stress\. The metathesis may also "
                r"have been influenced by (.+?) via association\.$", re.S),
     "鄂尔浑文写法的异体：{}，并在前重音之前发生 {} > {} 的音位换位。"
     "此换位或亦因联想而受 {} 影响。"),
]


def prose_etymology(text):
    for pat, frame in PROSE_FRAME:
        m = pat.match(text.strip())
        if m:
            return frame.format(*m.groups())
    return ""


def main():
    if not os.path.exists(SRC):
        sys.exit(f"missing source: {SRC}\n  set OU_JSONL to point at the kaikki dump")
    rows = [json.loads(l) for l in open(SRC, encoding="utf-8")]
    ZH = json.load(open(GLOSS_FILE, encoding="utf-8")) if os.path.exists(GLOSS_FILE) else {}
    if not ZH:
        log(f"  (无 {os.path.basename(GLOSS_FILE)}，释义保留英文)")

    need, entries = set(), []
    for r in rows:
        word = r.get("word", "")

        tr = ""
        for h in r.get("head_templates", []) or []:
            a = h.get("args", {})
            tr = a.get("tr") or a.get("ts") or tr
        if not tr:
            for f in r.get("forms", []) or []:
                if "romanization" in (f.get("tags") or []):
                    tr = f.get("form", ""); break

        senses = []
        for s in r.get("senses", []):
            gl = "; ".join(s.get("glosses") or []).strip()
            if not gl:
                continue
            # the same boilerplate shapes as Mongolian: alternative spellings,
            # romanisations, pointers from an inflected form back to its stem
            zh = ZH.get(gl, "") or formulaic_zh(gl)
            if not zh:
                need.add(gl)
            senses.append({"en": gl, "zh": zh,
                           "t": clean_tags(s.get("tags"), TAG),
                           "topic": clean_tags(s.get("topics"), TOPIC)})

        examples = []
        for s in r.get("senses", []):
            for e in s.get("examples", []) or []:
                en = (e.get("english") or e.get("translation") or "").strip()
                zh = ZH.get(en, "") if en else ""
                if en and not zh:
                    need.add(en)
                examples.append({
                    "t":  mark_segments(e.get("text", ""),  e.get("bold_text_offsets"),  word),
                    "tr": mark_segments(e.get("roman", ""), e.get("bold_roman_offsets"), tr),
                    "en": en, "enSeg": mark_segments(en, e.get("bold_translation_offsets")),
                    "zh": zh, "src": e.get("ref", ""), "k": e.get("type", ""),
                })

        forms = []
        for f in r.get("forms", []) or []:
            tags = f.get("tags") or []
            if {"table-tags", "inflection-template"} & set(tags):
                continue
            forms.append({"f": f.get("form", ""),
                          "t": clean_tags(tags, CASE) or clean_tags(tags, TAG)})

        rel = []
        for kind in ("derived", "related", "synonyms", "antonyms"):
            for x in r.get(kind, []) or []:
                rel.append({"k": REL.get(kind, kind), "w": x.get("word", ""),
                            "gl": x.get("sense", "") or x.get("english", "")})

        en_ety = r.get("etymology_text", "") or ""
        zh_ety, _ = render_etymology(r.get("etymology_templates"), en_ety, ZH, need)
        if not zh_ety and en_ety:
            zh_ety = prose_etymology(en_ety)

        entries.append({
            "w": word, "tr": tr, "script": in_script(word),
            "pos": POS.get(r.get("pos", ""), r.get("pos", "")), "pos_en": r.get("pos", ""),
            "ipa": ((r.get("sounds") or [{}])[0].get("ipa", "")),
            "senses": senses,
            "ety": {"en": r.get("etymology_text", "") or "", "zh": zh_ety},
            "forms": forms, "rel": rel,
            "desc": walk_descendants(r.get("descendants")), "ex": examples,
        })

    entries.sort(key=lambda e: (e["tr"] or e["w"], e["pos_en"]))

    n_sense = sum(len(e["senses"]) for e in entries)
    n_zh    = sum(1 for e in entries for s in e["senses"] if s["zh"])
    n_ex    = sum(len(e["ex"]) for e in entries)
    n_ety   = sum(1 for e in entries if e["ety"]["en"])
    n_etyzh = sum(1 for e in entries if e["ety"]["zh"])
    n_scr   = sum(1 for e in entries if e["script"])
    n_tr    = sum(1 for e in entries if e["tr"])

    payload = {
        "meta": {
            "source": "Wiktionary / kaikki.org — Old Uyghur",
            "sourceUrl": "https://kaikki.org/dictionary/Old%20Uyghur/",
            "block": "U+10F70–U+10FAF",
            "entries": len(entries), "senses": n_sense, "examples": n_ex,
            "inScript": n_scr, "zhSenses": n_zh, "coreSenses": n_sense,
        },
        "entries": entries,
    }
    dst = os.path.join(ROOT, "olduyghur.js")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* 回鹘文 — built by tools/build_olduyghur.py from the kaikki dump.\n"
                f"   {len(entries)} 词条 · {n_sense} 义项 · {n_ex} 例句 · {n_scr} 条以回鹘文书写 */\n")
        f.write("window.oldUyghurData = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    log(f"  词条 {len(entries)}   义项 {n_sense}   例句 {n_ex}   词源 {n_ety}")
    log(f"  回鹘文书写 {n_scr}   有拉丁转写 {n_tr}")
    log(f"  中文覆盖 — 义项 {n_zh}/{n_sense} ({n_zh/max(1,n_sense)*100:.0f}%)"
        f" · 词源 {n_etyzh}/{n_ety} ({n_etyzh/max(1,n_ety)*100:.0f}%)")
    log(f"→ {dst}  ({os.path.getsize(dst)/1024:.0f} KB)")

    todo = os.path.join(HERE, "ou_untranslated.json")
    if need:
        json.dump({"glosses": sorted(need)}, open(todo, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        log(f"  待译 {len(need)} 条 → {todo}")
    elif os.path.exists(todo):
        # Leaving the last run's list behind would report 665 outstanding glosses
        # long after they were all translated.
        os.remove(todo)
        log("  待译 0 条（已清除 ou_untranslated.json）")


if __name__ == "__main__":
    main()
