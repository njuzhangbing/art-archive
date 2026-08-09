#!/usr/bin/env python3
"""
Build mongolian.js from the kaikki (Wiktionary) Mongolian dump.

Script policy — attested only
-----------------------------
95% of the dump is Cyrillic (6305 of 6623 headwords). The traditional
Mongolian spelling (ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ, U+1800–U+18AF) is NOT machine-transliterated
here. It is taken only where the source records it:

  * the headword itself is already in Mongolian script, or
  * `forms` carries an entry tagged `Mongolian` — a spelling a Wiktionary
    editor supplied.

That covers 2126 of 6623 entries (32%). The remaining 68% show no Mongolian
spelling at all rather than a guessed one.

The reason is not laziness. Cyrillic → Mongolian script is not a deterministic
mapping: the traditional orthography is historically conservative and preserves
distinctions modern Cyrillic has merged, so one Cyrillic form can answer to
several legitimate Mongolian spellings. tugstugi/mongolian-nlp does ship a
`cyrillic2bichig` model, but it publishes no weights, and its training targets
were themselves produced by another automatic converter — a model trained to
imitate a converter, errors included. Output of that kind is a conjecture about
spelling, not a spelling, and mixing it in beside editor-supplied forms would
make the whole column unciteable.

Everything else follows tools/build_oldturkic.py: etymology is RENDERED from
kaikki's structured templates rather than translated, controlled vocabulary
comes from tables, and glosses are hand-translated via tools/mn_glosses.json
with coverage reported on every build.

Usage:  python3 tools/build_mongolian.py
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC  = os.environ.get("MN_JSONL",
                      "/Users/zhangbing/Downloads/kaikki.org-dictionary-Mongolian.jsonl")
GLOSS_FILE = os.path.join(HERE, "mn_glosses.json")
log = lambda *a: print(*a, flush=True)

sys.path.insert(0, HERE)
from build_oldturkic import LANG, TAG, CASE, TOPIC, REL, DESC_NOTE, \
                            render_etymology, clean_tags, lang_name, \
                            mark_segments                          # noqa: E402

POS = {
    "noun": "名词", "verb": "动词", "adj": "形容词", "adv": "副词", "name": "专名",
    "num": "数词", "pron": "代词", "postp": "后置词", "conj": "连词", "det": "限定词",
    "particle": "语气词", "intj": "感叹词", "suffix": "后缀", "prefix": "前缀",
    "character": "字母", "phrase": "短语", "proverb": "谚语", "abbrev": "缩略语",
    "romanization": "拉丁转写形", "punct": "标点", "affix": "词缀",
    "adv_phrase": "副词短语", "prep_phrase": "介词短语", "contraction": "缩合形",
}

MONGOL_LO, MONGOL_HI = 0x1800, 0x18AF


def is_mongol(s):
    return any(MONGOL_LO <= ord(c) <= MONGOL_HI for c in s or "")


def traditional_form(rec):
    """The Mongolian-script spelling, if the source actually records one.

    Returns (form, provenance) where provenance is 'head' when the headword is
    itself in Mongolian script and 'dict' when it comes from a `Mongolian`-tagged
    form. Never generated.
    """
    if is_mongol(rec.get("word", "")):
        return rec["word"], "head"
    for f in rec.get("forms", []) or []:
        if is_mongol(f.get("form", "")) and "Mongolian" in (f.get("tags") or []):
            return f["form"], "dict"
    return "", ""


ORDINAL = {
    "first":1,"second":2,"third":3,"fourth":4,"fifth":5,"sixth":6,"seventh":7,
    "eighth":8,"ninth":9,"tenth":10,"eleventh":11,"twelfth":12,"thirteenth":13,
    "fourteenth":14,"fifteenth":15,"sixteenth":16,"seventeenth":17,"eighteenth":18,
    "nineteenth":19,"twentieth":20,"twenty-first":21,"twenty-second":22,
    "twenty-third":23,"twenty-fourth":24,"twenty-fifth":25,"twenty-sixth":26,
    "twenty-seventh":27,"twenty-eighth":28,"twenty-ninth":29,"thirtieth":30,
    "thirty-first":31,"thirty-second":32,"thirty-third":33,"thirty-fourth":34,
}
INFL = {
    "genitive":"属格","dative":"与格","dative-locative":"与位格","accusative":"宾格",
    "ablative":"从格","instrumental":"工具格","comitative":"共同格","directional":"方向格",
    "nominative":"主格","oblique":"斜格","plural":"复数","singular":"单数",
    "causative":"使动式","imperative":"命令式","archaic":"古体",
}


def formulaic_zh(gl):
    """Render the patterned glosses instead of hand-listing them.

    kaikki carries several hundred glosses that are pure boilerplate — letter
    definitions, cross-references to another spelling, inflected-form pointers.
    Generating those from the pattern keeps them consistent and leaves the
    hand-translation budget for glosses that actually say something.
    Returns "" when the string is not one of the recognised shapes.
    """
    import re as _re
    g = gl.strip()

    m = _re.fullmatch(r"The ([a-z\-]+) letter of the Mongolian (?:alphabet|script|consonant), "
                      r"written in (?:the )?Mongolian script\.?", g)
    if m and m.group(1) in ORDINAL:
        return f"蒙文字母表第 {ORDINAL[m.group(1)]} 个字母，以蒙文书写。"

    m = _re.fullmatch(r"Mongolian spelling of (.+)", g, _re.S)
    if m:
        return f"{m.group(1)} 的蒙文写法"

    m = _re.fullmatch(r"[Aa]lternative (?:form|spelling) of (.+)", g, _re.S)
    if m:
        return f"{m.group(1)} 的异体"

    # "<voice/participle/aspect> in -X (-x) of Y" — kaikki's pointer from an
    # inflected form back to its stem. Pure boilerplate, hundreds of them.
    VOICE = {
        "causative voice":"使动式", "passive voice":"被动式", "cooperative voice":"共同式",
        "adversative voice":"交互式", "agentive participle":"施事分词",
        "modal converb":"情状副动词", "immediative aspect":"即行体",
        "iterative verbal noun":"反复体动名词", "reflexive accusative":"反身宾格",
    }
    m = _re.fullmatch(r"([a-z]+ [a-z]+) in (\S+ \([^)]*\)) of (.+)", g, _re.S)
    if m and m.group(1) in VOICE:
        return f"{m.group(3)} 的{VOICE[m.group(1)]}（{m.group(2)}）"
    m = _re.fullmatch(r"([a-z]+ [a-z]+) of (.+)", g, _re.S)
    if m and m.group(1) in VOICE:
        return f"{m.group(2)} 的{VOICE[m.group(1)]}"

    # "<Place> (a city, the administrative center of X Province, Mongolia)"
    m = _re.fullmatch(r"([^(]+) \(a city, (?:the )?administrative cent(?:er|re) of (.+?) Province, Mongolia\)", g)
    if m:
        return f"{m.group(1).strip()}（蒙古国{m.group(2)}省首府）"

    # "<case> [plural|singular] of X", "causative of X", "imperative of X", …
    m = _re.fullmatch(r"([a-z\-]+)(?: (plural|singular))? of (.+)", g, _re.S)
    if m and m.group(1) in INFL:
        head = INFL[m.group(1)]
        if m.group(2):
            head = INFL.get(m.group(2), m.group(2)) + head
        return f"{m.group(3)} 的{head}"

    return ""


def walk_descendants(ds, depth=1, acc=None):
    acc = acc if acc is not None else []
    for d in ds or []:
        w = d.get("word") or ""
        if w:
            acc.append({
                "d": depth,
                "lang": lang_name(d.get("lang_code")) or d.get("lang", ""),
                "w": w, "tr": d.get("roman", ""),
                "note": "、".join(DESC_NOTE.get(t, t) for t in (d.get("raw_tags") or [])),
                "gl": d.get("sense", ""),
            })
        walk_descendants(d.get("descendants"), depth + 1, acc)
    return acc


def main():
    if not os.path.exists(SRC):
        sys.exit(f"missing source: {SRC}\n  set MN_JSONL to point at the kaikki dump")
    rows = [json.loads(l) for l in open(SRC, encoding="utf-8")]

    ZH = json.load(open(GLOSS_FILE, encoding="utf-8")) if os.path.exists(GLOSS_FILE) else {}
    if not ZH:
        log(f"  (无 {os.path.basename(GLOSS_FILE)}，释义保留英文)")

    need_gloss, need_tr = set(), set()
    entries = []

    for r in rows:
        word = r.get("word", "")
        mn, mn_src = traditional_form(r)

        senses = []
        for s in r.get("senses", []):
            gl = "; ".join(s.get("glosses") or []).strip()
            if not gl:
                continue
            zh = ZH.get(gl, "") or formulaic_zh(gl)
            # only chase translations for the traditional-script core; the rest
            # would swamp the report without being the thing we set out to do
            if not zh and mn:
                need_gloss.add(gl)
            senses.append({
                "en": gl, "zh": zh,
                "t": clean_tags(s.get("tags"), TAG),
                "topic": clean_tags(s.get("topics"), TOPIC),
            })

        examples = []
        for s in r.get("senses", []):
            for e in s.get("examples", []) or []:
                en = (e.get("english") or e.get("translation") or "").strip()
                zh = ZH.get(en, "") if en else ""
                if en and not zh and mn:
                    need_tr.add(en)
                examples.append({
                    "t":  mark_segments(e.get("text", ""),  e.get("bold_text_offsets"),  word),
                    "tr": mark_segments(e.get("roman", ""), e.get("bold_roman_offsets")),
                    "en": en,
                    "enSeg": mark_segments(en, e.get("bold_translation_offsets")),
                    "zh": zh, "src": e.get("ref", ""), "k": e.get("type", ""),
                })

        forms = []
        for f in r.get("forms", []) or []:
            tags = f.get("tags") or []
            if {"table-tags", "inflection-template"} & set(tags):
                continue
            if f.get("form") == mn:            # shown in its own column already
                continue
            forms.append({"f": f.get("form", ""), "t": clean_tags(tags, CASE) or clean_tags(tags, TAG)})

        rel = []
        for kind in ("derived", "related", "synonyms", "antonyms", "hypernyms", "hyponyms"):
            for x in r.get(kind, []) or []:
                rel.append({"k": REL.get(kind, kind), "w": x.get("word", ""),
                            "gl": x.get("sense", "") or x.get("english", "")})

        zh_ety, _ = render_etymology(r.get("etymology_templates"),
                                     r.get("etymology_text", "") or "", ZH, None)

        entries.append({
            "w": word, "mn": mn, "mnSrc": mn_src,
            "pos": POS.get(r.get("pos", ""), r.get("pos", "")), "pos_en": r.get("pos", ""),
            "ipa": ((r.get("sounds") or [{}])[0].get("ipa", "")),
            "senses": senses,
            "ety": {"en": r.get("etymology_text", "") or "", "zh": zh_ety},
            "forms": forms, "rel": rel,
            "desc": walk_descendants(r.get("descendants")), "ex": examples,
        })

    entries.sort(key=lambda e: (e["w"], e["pos_en"]))

    core    = [e for e in entries if e["mn"]]
    n_sense = sum(len(e["senses"]) for e in entries)
    n_csense= sum(len(e["senses"]) for e in core)
    n_zh    = sum(1 for e in core for s in e["senses"] if s["zh"])
    n_ety   = sum(1 for e in entries if e["ety"]["en"])
    n_etyzh = sum(1 for e in entries if e["ety"]["zh"])
    n_ipa   = sum(1 for e in entries if e["ipa"])

    # 30k forms repeat a small set of tag combinations; interning them cuts the
    # payload by roughly half without losing anything.
    tagvocab, tagidx = [], {}
    for e in entries:
        packed = []
        for f in e["forms"]:
            if not f["f"]:
                continue
            key = "\u0001".join(f["t"])
            i = tagidx.get(key)
            if i is None:
                i = tagidx[key] = len(tagvocab)
                tagvocab.append(f["t"])
            packed.append([f["f"], i])
        e["forms"] = packed

    payload = {
        "meta": {
            "source": "Wiktionary / kaikki.org — Mongolian",
            "sourceUrl": "https://kaikki.org/dictionary/Mongolian/",
            "block": "西里尔 U+0400–U+04FF　传统蒙文 U+1800–U+18AF",
            "scriptPolicy": "attested-only",
            "entries": len(entries), "senses": n_sense,
            "traditional": len(core), "zhSenses": n_zh, "coreSenses": n_csense,
        },
        "entries": entries, "formTags": tagvocab,
    }

    dst = os.path.join(ROOT, "mongolian.js")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* 蒙古语 — built by tools/build_mongolian.py from the kaikki dump.\n"
                f"   {len(entries)} 词条 · {n_sense} 义项 · {len(core)} 条附考订传统蒙文写法\n"
                "   传统蒙文一律取自原始数据，不作机器转写。 */\n")
        f.write("window.mongolianData = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    log(f"  词条 {len(entries)}   义项 {n_sense}   读音 {n_ipa}   词源 {n_ety}")
    log(f"  传统蒙文（考订） {len(core)} ({len(core)/len(entries)*100:.0f}%)"
        f"   其中词头即蒙文 {sum(1 for e in core if e['mnSrc'] == 'head')}")
    log(f"  中文覆盖 — 核心义项 {n_zh}/{n_csense} ({n_zh/max(1,n_csense)*100:.0f}%)"
        f" · 词源 {n_etyzh}/{n_ety} ({n_etyzh/max(1,n_ety)*100:.0f}%)")
    log(f"→ {dst}  ({os.path.getsize(dst)/1024:.0f} KB)")

    todo = os.path.join(HERE, "mn_untranslated.json")
    if need_gloss or need_tr:
        json.dump({"glosses": sorted(need_gloss), "examples": sorted(need_tr)},
                  open(todo, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        log(f"  待译（仅核心）{len(need_gloss)} 条释义 + {len(need_tr)} 条例句 → {todo}")
    elif os.path.exists(todo):
        os.remove(todo)          # else the last run's list outlives the work
        log("  待译 0 条（已清除 mn_untranslated.json）")


if __name__ == "__main__":
    main()
