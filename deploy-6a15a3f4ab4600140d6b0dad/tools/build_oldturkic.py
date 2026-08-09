#!/usr/bin/env python3
"""
Build oldturkic.js from the kaikki (Wiktionary) Old Turkic dump.

Source of truth is kaikki-OldTurkic.jsonl, NOT the flattened CSV export beside
it. The CSVs collapse the nested structure the same way the old Khitan scrape
did — most importantly they turn `etymology_templates` into prose, which throws
away the one thing that makes the etymology translatable at all.

Translation strategy, three tiers by what the data actually supports:

  1. ETYMOLOGY — rendered, not translated.
     kaikki keeps etymologies as structured templates:
         {"name":"inh","args":{"1":"otk","2":"trk-pro","3":"*tür(ü)k"}}
     so Chinese is generated from the structure: connective from a fixed table,
     language name from a code table, and the form reproduced verbatim. Nothing
     is paraphrased, so no cognate form or scholarly claim can drift. Sentences
     with no template backing keep their English and are marked.

  2. CONTROLLED VOCABULARY — table lookup.
     POS, grammatical tags, semantic topics, form/case labels, relation types,
     language names. Small closed sets, translated once in TABLES below.

  3. GLOSSES AND EXAMPLE TRANSLATIONS — hand-translated.
     Free prose; no structure to exploit. Read from tools/ot_glosses.json keyed
     by the exact English string. Anything missing falls back to English and is
     counted in the build report, so coverage is always visible.

Usage:  python3 tools/build_oldturkic.py
"""
import json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC  = os.environ.get("OTK_JSONL",
                      "/Users/zhangbing/Downloads/old_turkic/kaikki-OldTurkic.jsonl")
GLOSS_FILE = os.path.join(HERE, "ot_glosses.json")
log = lambda *a: print(*a, flush=True)

# ---------------------------------------------------------------- TABLES

LANG = {
    "trk-pro": "原始突厥语", "trk-cmn-pro": "原始共同突厥语", "otk": "古突厥语",
    "otk-ork": "鄂尔浑突厥语", "otk-kir": "古柯尔克孜语", "trk-oat": "古安纳托利亚土耳其语",
    "tr": "土耳其语", "uz": "乌兹别克语", "ba": "巴什基尔语", "cv": "楚瓦什语",
    "sah": "雅库特语", "klj": "哈拉季语", "oui": "回鹘语", "xqa": "喀喇汗语",
    "az": "阿塞拜疆语", "tyv": "图瓦语", "kk": "哈萨克语", "tk": "土库曼语",
    "kjh": "哈卡斯语", "ky": "柯尔克孜语", "tt": "鞑靼语", "alt": "南阿尔泰语",
    "atv": "北阿尔泰语", "ug": "维吾尔语", "gag": "加告兹语", "crh": "克里米亚鞑靼语",
    "cjs": "绍尔语", "ota": "奥斯曼土耳其语", "ybe": "西部裕固语", "chg": "察合台语",
    "sty": "西伯利亚鞑靼语", "dlg": "多尔干语", "kim": "托法语", "xbo": "保加尔语",
    "qwm": "钦察语", "qwm-cum": "库曼语", "slr": "撒拉语",
    "sog": "粟特语", "syc": "古典叙利亚语", "grc": "古希腊语", "el": "希腊语",
    "mn": "蒙古语", "xgn": "蒙古语族", "xgn-pro": "原始蒙古语", "xng": "中古蒙古语",
    "cmg": "古典蒙古语", "bua": "布里亚特语", "mis-rou": "柔然语",
    "mnc": "满语", "hu": "匈牙利语", "ohu": "古匈牙利语", "fa": "波斯语",
    "fa-cls": "古典波斯语", "pal": "中古波斯语", "ira": "伊朗语族",
    "ira-pro": "原始伊朗语", "ae": "阿维斯陀语", "os": "奥塞梯语",
    "xsc": "斯基泰语", "xbc": "大夏语", "sa": "梵语", "ine-pro": "原始印欧语",
    "ine-toc": "吐火罗语", "txb": "吐火罗语B（龟兹语）", "xto": "吐火罗语A（焉耆语）",
    "ltc": "中古汉语", "cmn": "现代汉语", "zh": "汉语", "ko": "朝鲜语",
    "qfa-kor": "朝鲜语族", "ja": "日语", "ru": "俄语", "en": "英语", "vi": "越南语",
    "la": "拉丁语", "ar": "阿拉伯语", "bo": "藏语", "zkt": "契丹小字",
}

POS = {
    "noun": "名词", "verb": "动词", "character": "字母", "suffix": "后缀",
    "adj": "形容词", "name": "专名", "num": "数词", "adv": "副词", "pron": "代词",
    "postp": "后置词", "conj": "连词", "particle": "语气词", "romanization": "拉丁转写形",
    "prep": "介词", "intj": "感叹词", "det": "限定词", "prefix": "前缀",
}

TAG = {
    "letter": "字母", "morpheme": "词素", "transitive": "及物", "intransitive": "不及物",
    "alt-of": "异体", "alternative": "异体", "possessive": "领属", "suffix": "后缀",
    "first-person": "第一人称", "second-person": "第二人称", "third-person": "第三人称",
    "singular": "单数", "plural": "复数", "masculine": "阳性", "feminine": "阴性",
    "figuratively": "比喻", "romanization": "拉丁转写", "pronoun": "代词",
    "auxiliary": "助动词", "interrogative": "疑问", "particle": "语气词",
    "demonstrative": "指示", "personal": "人称", "reflexive": "反身",
    "cardinal": "基数", "ordinal": "序数", "collective": "集合", "obsolete": "废弃",
    "archaic": "古语", "rare": "罕用", "poetic": "诗语", "literary": "书面语",
    "error-unrecognized-form": None, "error-unknown-tag": None,
    "table-tags": None, "inflection-template": None, "canonical": None,
}

CASE = {
    "nominative": "主格", "genitive": "属格", "accusative": "宾格", "dative": "与格",
    "locative": "位格", "ablative": "从格", "instrumental": "工具格",
    "equative": "比较格", "directive": "方向格", "comitative": "共同格",
    "possessive": "领属", "singular": "单数", "plural": "复数",
}

TOPIC = {
    "sciences": "科学", "anatomy": "解剖", "medicine": "医学",
    "human-sciences": "人文科学", "natural-sciences": "自然科学",
    "government": "政治制度", "politics": "政治", "anthropology": "人类学",
    "lifestyle": "风俗", "biology": "生物", "social-science": "社会科学",
    "sociology": "社会学", "military": "军事", "war": "战争", "religion": "宗教",
    "shamanism": "萨满教", "zoology": "动物", "equestrianism": "马术",
    "hobbies": "习俗", "horses": "马", "botany": "植物", "astronomy": "天文",
    "geography": "地理", "kinship": "亲属", "law": "法律", "time": "时间",
    "body": "人体", "food": "饮食", "clothing": "服饰", "weaponry": "兵器",
    "nature": "自然", "business": "商贸", "authority": "职官",
    "manufacturing": "工艺", "sewing": "缝纫", "textiles": "纺织",
    "knitting": "编织", "fashion": "服饰", "engineering": "工程",
    "mathematics": "数学", "physics": "物理", "chemistry": "化学",
    "arts": "艺术", "music": "音乐", "literature": "文学",
    "mysticism": "神秘学", "buddhism": "佛教", "christianity": "基督教",
    "islam": "伊斯兰教", "manichaeism": "摩尼教", "mythology": "神话",
    "agriculture": "农业", "trade": "贸易", "finance": "金融",
    "computing": "计算机", "medicine-specialty": "医学", "pathology": "病理",
}

REL = {"derived": "派生词", "synonyms": "同义词", "antonyms": "反义词",
       "related": "相关词", "descendants": "后代词"}

# How a descendant relates to its ancestor. Free text in the source, but a
# closed set in practice.
DESC_NOTE = {
    "borrowed": "借入",
    "learned borrowing": "书面借词",
    "learned": "书面",
    "reshaped by analogy or addition of morphemes": "经类推或增缀改造",
    "Traditional-Chinese": "繁体",
    "semi-learned borrowing": "半书面借词",
    "calque": "仿译",
    "inherited": "继承",
}

# Etymology connectives. Each renders as: prefix + language + form.
ETYM = {
    "inh":  "继承自", "inh+": "继承自",
    "der":  "派生自", "der+": "派生自",
    "bor":  "借自",   "bor+": "借自",
    "cog":  "同源词", "noncog": "参照（非同源）",
    "af":   "由词缀构成", "unc": "词源未定", "unk": "词源不明",
    # Mongolian leans on these where Old Turkic did not
    "ncog": "参照（非同源）", "cal": "仿译自", "calque": "仿译自",
    "suffix": "加后缀构成", "suf": "加后缀构成",
    "compound": "复合自", "com": "复合自", "surf": "表层分析",
    # no source language and no form — the whole statement is the connective
    "onomatopoeic": "拟声词", "onom": "拟声词",
}
# kaikki's newer `etymon` template packs everything into positional args:
#   {'1': 'oui', '2': ':inh', '3': 'trk-pro:*teŋri'}
# i.e. relation in arg 2 after a colon, and lang:form in arg 3.
ETYMON_REL = {"inh": "inh", "der": "der", "bor": "bor", "cog": "cog", "cal": "cal"}
LANG_ARG = {"inh": "2", "inh+": "2", "der": "2", "der+": "2",
            "bor": "2", "bor+": "2", "cog": "1", "noncog": "1",
            "ncog": "1", "cal": "2", "calque": "2"}
# word-formation templates: no source language, the pieces are args 2,3,4,…
PARTS = {"af", "suffix", "suf", "compound", "com", "surf"}


def lang_name(code):
    return LANG.get(code) or LANG.get((code or "").split(",")[0].strip()) or code


# kaikki packs annotations into the form argument itself:
#   '*küneš<t:sunny place, sunshine><alt:*künäš>'
#   'تِیغْ\n<ts:tïː ġ><t:a horse with a roan or reddish brown coat>'
# Printed verbatim that markup ends up on the page. Split it off so the gloss
# and transcription can be typeset — and, for `t:`, translated — like any other.
_KEY = re.compile(r"^([a-z]+):")
# `ety:` nests a whole sub-etymology inside the form — '<ety:der<trk-pro:*bulga->>'.
# It restates the chain the main templates already give, so it is dropped rather
# than printed; a flat regex would not have matched it and left the markup visible.
_DROP_ANNOT = {"ety", "id", "q", "qq", "nocap", "sc", "g"}


def split_form(raw):
    """'form<t:gloss><ts:translit>' → ('form', {'t': …, 'ts': …}).

    Scans with a depth counter rather than a regex: annotations nest, and an
    unterminated '<ts:çäk' at end of line is not rare in the dump either.
    """
    if not raw:
        return "", {}
    bare, ann, depth, buf = [], {}, 0, []
    for ch in raw:
        if ch == "<":
            depth += 1
            if depth == 1:
                buf = []
                continue
        elif ch == ">" and depth:
            depth -= 1
            if depth == 0:
                chunk = "".join(buf)
                m = _KEY.match(chunk)
                if m and m.group(1) not in _DROP_ANNOT:
                    ann.setdefault(m.group(1), chunk[m.end():].strip())
                continue
        (buf if depth else bare).append(ch)
    return "".join(bare).strip().strip("\n").strip(), ann


def render_form(raw, zh_map=None, want=None, tr="", gloss=""):
    """Typeset one etymon: form（transcription）「gloss」〔亦作 alt〕.

    `tr` and `gloss` are the values from the template's own args, which win over
    the annotations carried inside the form when both are present.
    """
    zh_map = zh_map if zh_map is not None else {}
    form, ann = split_form(raw)
    if not form:
        return ""
    tr = tr or ann.get("ts") or ann.get("tr") or ""
    gloss = gloss or ann.get("t") or ann.get("pos") or ""
    out = form
    if tr:
        out += f"（{tr}）"
    if gloss:
        # A leading * marks a reconstructed FORM sitting in the gloss slot, not a
        # gloss. Reproduce it; never send it for translation.
        if want is not None and gloss not in zh_map and not gloss.startswith("*"):
            want.add(gloss)
        out += f"「{zh_map.get(gloss, gloss)}」"
    if ann.get("alt"):
        out += f"〔亦作 {ann['alt']}〕"
    return out


# ---------------------------------------------------------------- helpers

def clean_tags(tags, table):
    out = []
    for t in tags or []:
        v = table.get(t, t)
        if v and v not in out:
            out.append(v)
    return out


def render_etymology(templates, prose, zh_map=None, want=None):
    """Compose a Chinese etymology from kaikki's structured templates.

    Returns (zh, covered). Forms are copied verbatim — only the connective
    tissue and language names come from the tables, so nothing can be
    paraphrased into a claim the source did not make.

    kaikki emits BOTH the bare template and its `+` display variant for the same
    fact (`inh` and `inh+`, `der`/`der+`, `bor`/`bor+`), and only the second
    carries the gloss. Keying on (connective, language, form) and keeping the
    richest rendering collapses that duplicate instead of printing the etymon
    twice.
    """
    if not templates:
        return "", False
    zh_map = zh_map if zh_map is not None else {}

    order, best = [], {}
    for t in templates:
        name = t.get("name")
        a = t.get("args", {})

        # Newer kaikki dumps emit `etymon` instead of inh/der/bor. Unpack it into
        # the shape the rest of this loop already handles, rather than growing a
        # second code path: ':inh' → inh, 'trk-pro:*teŋri' → lang trk-pro, form *teŋri.
        if name == "etymon":
            rel = ETYMON_REL.get(str(a.get("2", "")).lstrip(":").strip())
            tgt = str(a.get("3", ""))
            if not rel or ":" not in tgt:
                continue
            code, _, form = tgt.partition(":")
            name, a = rel, {"2": code, "1": code, "3": form, "t": a.get("t", "")}

        if name not in ETYM:
            continue
        if name in ("unc", "unk", "onomatopoeic", "onom"):
            key = (ETYM[name], "", "")
            if key not in best:
                order.append(key); best[key] = ETYM[name]
            continue

        if name in PARTS:
            bits = [render_form(a[k], zh_map, want)
                    for k in ("2", "3", "4", "5") if a.get(k)]
            bits = [b for b in bits if b]
            if not bits:
                continue
            key = (ETYM[name], "", " + ".join(bits))
            if key not in best:
                order.append(key)
                best[key] = " + ".join(bits)
            continue

        slot = LANG_ARG.get(name)
        code = a.get(slot, "") if slot else ""
        form = a.get("3") if name in ("inh", "inh+", "der", "der+", "bor", "bor+") else a.get("2")
        if not form or form in ("-", ""):
            # "Borrowed from Middle Persian." — kaikki writes the form as "-" when
            # the source states the donor language but no etymon. Dropping the
            # whole template loses a fact the source did make; keep the language.
            # The piece carries no connective — the grouping pass below prepends it.
            if code:
                key = (ETYM[name], code, "")
                if key not in best:
                    order.append(key); best[key] = lang_name(code)
            continue
        body = render_form(form, zh_map, want,
                           tr=a.get("tr") or a.get("ts") or "",
                           gloss=a.get("t") or a.get("4") or "")
        if not body:
            continue
        piece = f"{lang_name(code)} {body}"

        key = (ETYM[name], code, split_form(form)[0])
        if key not in best:
            order.append(key)
        # the `+` variant is the one carrying gloss/translit — keep the longest
        if len(piece) > len(best.get(key, "")):
            best[key] = piece

    parts = []
    for key in order:
        parts.append(best[key] if key[1] == "" and key[2] == "" else (key[0], best[key]))

    if not parts:
        return "", False

    # group consecutive pieces sharing a connective: 同源词：A、B、C
    out, i = [], 0
    while i < len(parts):
        p = parts[i]
        if isinstance(p, str):
            out.append(p); i += 1; continue
        head, group = p[0], [p[1]]
        j = i + 1
        while j < len(parts) and not isinstance(parts[j], str) and parts[j][0] == head:
            group.append(parts[j][1]); j += 1
        out.append(f"{head}{'：' if len(group) > 1 else ' '}{'、'.join(group)}")
        i = j
    return "；".join(out) + "。", True


def mark_segments(text, offsets, fallback=""):
    """Split `text` into [[chunk, is_headword], …] for the renderer.

    kaikki gives bold ranges as PYTHON codepoint indices. JavaScript indexes
    strings by UTF-16 code unit, so for Old Turkic (astral plane, U+10C00+) the
    same numbers point somewhere else entirely — one sample text is 8 codepoints
    but 15 code units. Resolving the ranges here means the renderer never does
    index arithmetic and the bug cannot reappear.

    When the source records no ranges, fall back to locating `fallback` (the
    headword) literally.
    """
    if not text:
        return []
    spans = []
    for a, b in (offsets or []):
        if 0 <= a < b <= len(text):
            # kaikki sometimes includes the word separator; keep the word itself
            while a < b and text[a] in " :·":
                a += 1
            while b > a and text[b - 1] in " :·":
                b -= 1
            if a < b:
                spans.append((a, b))
    if not spans and fallback:
        start = text.find(fallback)
        while start != -1:
            spans.append((start, start + len(fallback)))
            start = text.find(fallback, start + len(fallback))
    if not spans:
        return [[text, 0]]

    spans.sort()
    out, cur = [], 0
    for a, b in spans:
        if a < cur:            # overlapping ranges — keep the first
            continue
        if a > cur:
            out.append([text[cur:a], 0])
        out.append([text[a:b], 1])
        cur = b
    if cur < len(text):
        out.append([text[cur:], 0])
    return out


def walk_descendants(ds, depth=1, acc=None):
    acc = acc if acc is not None else []
    for d in ds or []:
        w = d.get("word") or ""
        if w:
            acc.append({
                "d": depth,
                "lang": lang_name(d.get("lang_code")) or d.get("lang", ""),
                "w": w,
                "tr": d.get("roman", ""),
                "note": "、".join(DESC_NOTE.get(t, t) for t in (d.get("raw_tags") or [])),
                "gl": d.get("sense", ""),
            })
        walk_descendants(d.get("descendants"), depth + 1, acc)
    return acc


# ---------------------------------------------------------------- build

def main():
    if not os.path.exists(SRC):
        sys.exit(f"missing source: {SRC}\n  set OTK_JSONL to point at kaikki-OldTurkic.jsonl")
    rows = [json.loads(l) for l in open(SRC, encoding="utf-8")]

    ZH = {}
    if os.path.exists(GLOSS_FILE):
        ZH = json.load(open(GLOSS_FILE, encoding="utf-8"))
    else:
        log(f"  (无 {os.path.basename(GLOSS_FILE)}，释义与译文将保留英文)")

    need_gloss, need_tr = set(), set()
    entries = []

    for r in rows:
        word = r.get("word", "")
        pos  = r.get("pos", "")

        # canonical transliteration: head_templates carry ts=/tr=, else a
        # romanization form, else nothing.
        tr = ""
        for h in r.get("head_templates", []) or []:
            a = h.get("args", {})
            tr = a.get("ts") or a.get("tr") or tr
        if not tr:
            for f in r.get("forms", []) or []:
                if "romanization" in (f.get("tags") or []):
                    tr = f.get("form", ""); break

        senses = []
        for s in r.get("senses", []):
            gl = "; ".join(s.get("glosses") or []).strip()
            if not gl:
                continue
            zh = ZH.get(gl, "")
            if not zh:
                need_gloss.add(gl)
            senses.append({
                "en": gl,
                "zh": zh,
                "t": clean_tags(s.get("tags"), TAG),
                "topic": clean_tags(s.get("topics"), TOPIC),
            })

        examples = []
        for s in r.get("senses", []):
            for e in s.get("examples", []) or []:
                en = (e.get("english") or e.get("translation") or "").strip()
                if en:
                    zh = ZH.get(en, "")
                    if not zh:
                        need_tr.add(en)
                else:
                    zh = ""
                examples.append({
                    "t":   mark_segments(e.get("text", ""),  e.get("bold_text_offsets"),  word),
                    "tr":  mark_segments(e.get("roman", ""), e.get("bold_roman_offsets"), tr),
                    "en":  en,
                    "enSeg": mark_segments(en, e.get("bold_translation_offsets")),
                    "zh":  zh,
                    "src": e.get("ref", ""),
                    "k":   e.get("type", ""),
                })

        forms = []
        for f in r.get("forms", []) or []:
            tags = f.get("tags") or []
            if {"table-tags", "inflection-template"} & set(tags):
                continue
            label = clean_tags(tags, CASE) or clean_tags(tags, TAG)
            forms.append({"f": f.get("form", ""), "t": label})

        rel = []
        for kind in ("derived", "related", "synonyms", "antonyms"):
            for x in r.get(kind, []) or []:
                rel.append({"k": REL.get(kind, kind), "w": x.get("word", ""),
                            "gl": x.get("sense", "") or x.get("english", "")})

        prose = r.get("etymology_text", "") or ""
        zh_ety, covered = render_etymology(r.get("etymology_templates"), prose,
                                           ZH, need_gloss)

        entries.append({
            "w": word, "tr": tr, "pos": POS.get(pos, pos), "pos_en": pos,
            "hom": r.get("etymology_number", ""),
            "ipa": ((r.get("sounds") or [{}])[0].get("ipa", "")),
            "senses": senses,
            "ety": {"en": prose, "zh": zh_ety, "auto": covered},
            "forms": forms,
            "rel": rel,
            "desc": walk_descendants(r.get("descendants")),
            "ex": examples,
        })

    entries.sort(key=lambda e: (e["w"], e["pos_en"]))

    n_sense = sum(len(e["senses"]) for e in entries)
    n_zh    = sum(1 for e in entries for s in e["senses"] if s["zh"])
    n_ex    = sum(len(e["ex"]) for e in entries)
    n_exen  = sum(1 for e in entries for x in e["ex"] if x["en"])
    n_exzh  = sum(1 for e in entries for x in e["ex"] if x["zh"])
    n_ety   = sum(1 for e in entries if e["ety"]["en"])
    n_etyzh = sum(1 for e in entries if e["ety"]["zh"])

    payload = {
        "meta": {
            "source": "Wiktionary / kaikki.org — Old Turkic",
            "sourceUrl": "https://kaikki.org/dictionary/Old%20Turkic/",
            "block": "U+10C00–U+10C4F",
            "entries": len(entries), "senses": n_sense, "examples": n_ex,
            "zhSenses": n_zh, "zhExamples": n_exzh, "zhEtymology": n_etyzh,
        },
        "entries": entries,
    }

    dst = os.path.join(ROOT, "oldturkic.js")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* 古突厥语 — built by tools/build_oldturkic.py from the kaikki dump.\n"
                f"   {len(entries)} 词条 · {n_sense} 义项 · {n_ex} 例句 · {n_ety} 条词源 */\n")
        f.write("window.oldTurkicData = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    log(f"  词条 {len(entries)}   义项 {n_sense}   例句 {n_ex}   词源 {n_ety}")
    log(f"  中文覆盖 — 义项 {n_zh}/{n_sense} ({n_zh/max(1,n_sense)*100:.0f}%)"
        f" · 例句译文 {n_exzh}/{n_exen} ({n_exzh/max(1,n_exen)*100:.0f}%)"
        f" · 词源 {n_etyzh}/{n_ety} ({n_etyzh/max(1,n_ety)*100:.0f}%)")
    log(f"→ {dst}  ({os.path.getsize(dst)/1024:.0f} KB)")

    todo = os.path.join(HERE, "ot_untranslated.json")
    if need_gloss or need_tr:
        json.dump({"glosses": sorted(need_gloss), "examples": sorted(need_tr)},
                  open(todo, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        log(f"  待译 {len(need_gloss)} 条释义 + {len(need_tr)} 条例句译文 → {todo}")
    elif os.path.exists(todo):
        os.remove(todo)          # else the last run's list outlives the work
        log("  待译 0 条（已清除 ot_untranslated.json）")


if __name__ == "__main__":
    main()
