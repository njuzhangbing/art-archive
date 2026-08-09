#!/usr/bin/env python3
"""
Export jieba's dictionary and HMM model for the browser.

Why export rather than reimplement
----------------------------------
jieba's accurate mode is three things: a prefix dictionary, a DAG over the
sentence, and a dynamic-programming pass for the maximum-probability path —
plus a Viterbi HMM for runs of characters the dictionary does not cover. All
three are small pieces of code. What is NOT small, and what cannot be
approximated without changing the answer, is the data: 349k entries with the
frequencies the DP weighs, and the emission table the HMM reads.

So the algorithm is reimplemented in JS (seg/jieba.js) and the data is taken
verbatim from jieba. tools/check_jieba.py then diffs the two implementations
over a corpus and will not let them drift.

Both jieba.cut and jieba.posseg.cut are exported, because they are NOT the same
segmenter — posseg carries its own HMM whose states are (B/M/E/S, tag) pairs, so
it cuts unknown runs differently AND names them. On 我们中出了一个叛徒 the two
disagree (中出/了 against 中/出/了), which is exactly the trap this build avoids
by shipping the second model rather than approximating tags from the dictionary.

The posseg pickles look enormous on disk (5 MB) but that is uncompressed Python
pickle: the same tables as gzipped JSON come to 0.75 MB.

Output (gzipped — the browser inflates with DecompressionStream, so this does
not depend on the host being configured to compress):

  seg/jieba-dict.txt.gz    word freq pos, one per line
  seg/jieba-hmm.json.gz    start / trans / emit for finalseg
  seg/jieba-pos.json.gz    start / trans / emit / char_state_tab for posseg

Usage:  python3 tools/build_jieba.py [path/to/jieba]
"""
import gzip, json, os, pickle, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "seg")
log = lambda *a: print(*a, flush=True)


def find_jieba(argv):
    if argv:
        return argv[0]
    try:
        import jieba
        return os.path.dirname(jieba.__file__)
    except ImportError:
        sys.exit("jieba not importable; pass its package directory as an argument")


def main():
    src = find_jieba(sys.argv[1:])
    dict_txt = os.path.join(src, "dict.txt")
    if not os.path.exists(dict_txt):
        sys.exit(f"missing {dict_txt}")
    os.makedirs(OUT, exist_ok=True)

    raw = open(dict_txt, encoding="utf-8").read()
    lines = [l for l in raw.splitlines() if l.strip()]
    total = 0
    pos_count = {}
    for l in lines:
        p = l.split(" ")
        total += int(p[1])
        if len(p) > 2:
            pos_count[p[2]] = pos_count.get(p[2], 0) + 1

    dst = os.path.join(OUT, "jieba-dict.txt.gz")
    with gzip.open(dst, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(raw)
    log(f"  词典 {len(lines)} 条 · 总频次 {total} · 词性 {len(pos_count)} 种")
    log(f"  → seg/jieba-dict.txt.gz  {os.path.getsize(dst)/1048576:.2f} MB"
        f"（原 {len(raw.encode())/1048576:.2f} MB）")

    # finalseg's HMM: the one that segments runs of characters the dictionary
    # has never seen. Its pickles are keyed by single characters, so the JSON is
    # a straight dump — no restructuring, no rounding of the log probabilities.
    fs = os.path.join(src, "finalseg")
    model = {}
    for name, fn in (("start", "prob_start.p"), ("trans", "prob_trans.p"),
                     ("emit", "prob_emit.p")):
        with open(os.path.join(fs, fn), "rb") as fh:
            model[name] = pickle.load(fh)
    # keys are single-char states 'B','M','E','S'; JSON needs them as strings
    model["start"] = {k: v for k, v in model["start"].items()}
    model["trans"] = {k: {k2: v2 for k2, v2 in v.items()} for k, v in model["trans"].items()}
    model["emit"] = {k: {k2: v2 for k2, v2 in v.items()} for k, v in model["emit"].items()}

    dst2 = os.path.join(OUT, "jieba-hmm.json.gz")
    blob = json.dumps(model, ensure_ascii=False, separators=(",", ":"))
    with gzip.open(dst2, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(blob)
    log(f"  HMM 发射表 {sum(len(v) for v in model['emit'].values())} 项")
    log(f"  → seg/jieba-hmm.json.gz  {os.path.getsize(dst2)/1048576:.2f} MB"
        f"（原 {len(blob.encode())/1048576:.2f} MB）")

    # posseg: its own start/trans/emit plus the char -> allowed-states table.
    # States are (BMES, tag) tuples; JSON has no tuple key, so they are written
    # as "B,n". Comma sorts below every letter and digit, so JS string ordering
    # over these keys matches Python's tuple ordering -- which matters, because
    # posseg's viterbi breaks ties by taking the LARGEST state.
    ps = os.path.join(src, "posseg")

    def conv(o):
        if isinstance(o, dict):
            return {(",".join(k) if isinstance(k, tuple) else str(k)): conv(v)
                    for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [",".join(x) if isinstance(x, tuple) else conv(x) for x in o]
        return o

    pos_model = {}
    for name, fn in (("start", "prob_start.p"), ("trans", "prob_trans.p"),
                     ("emit", "prob_emit.p"), ("charStates", "char_state_tab.p")):
        with open(os.path.join(ps, fn), "rb") as fh:
            pos_model[name] = conv(pickle.load(fh))

    dst3 = os.path.join(OUT, "jieba-pos.json.gz")
    blob3 = json.dumps(pos_model, ensure_ascii=False, separators=(",", ":"))
    with gzip.open(dst3, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(blob3)
    log(f"  词性 HMM 状态 {len(pos_model['trans'])} 个，字表 {len(pos_model['charStates'])} 字")
    log(f"  -> seg/jieba-pos.json.gz  {os.path.getsize(dst3)/1048576:.2f} MB"
        f"（原 {len(blob3.encode())/1048576:.2f} MB）")

    # the tag table the UI shows, so the abbreviations mean something on screen
    json.dump(POS_ZH, open(os.path.join(OUT, "pos-zh.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0, sort_keys=True)
    seen = sorted(pos_count, key=lambda k: -pos_count[k])
    miss = [p for p in seen if p not in POS_ZH]
    log(f"  词性表 {len(POS_ZH)} 项；词典用到 {len(seen)} 种，未收 {len(miss)}"
        + (f"：{miss[:12]}" if miss else ""))


# ICTPOL/863 tag set as jieba ships it. Kept as a table rather than generated,
# because several of these are jieba-specific (`eng`, `x`, the `u*` particles)
# and only a reader who knows the scheme can name them.
POS_ZH = {
    "n": "名词", "nr": "人名", "nr1": "汉语姓氏", "nr2": "汉语名字",
    "nrj": "日语人名", "nrf": "音译人名", "ns": "地名", "nsf": "音译地名",
    "nt": "机构团体", "nz": "其他专名", "nl": "名词性惯用语", "ng": "名语素",
    "nrt": "音译人名", "nw": "作品名",
    "t": "时间词", "tg": "时语素", "s": "处所词", "f": "方位词",
    "v": "动词", "vd": "副动词", "vn": "名动词", "vshi": "动词“是”",
    "vyou": "动词“有”", "vf": "趋向动词", "vx": "形式动词", "vi": "不及物动词",
    "vl": "动词性惯用语", "vg": "动语素",
    "a": "形容词", "ad": "副形词", "an": "名形词", "ag": "形语素",
    "al": "形容词性惯用语", "b": "区别词", "bl": "区别词性惯用语",
    "z": "状态词", "r": "代词", "rr": "人称代词", "rz": "指示代词",
    "rzt": "时间指示代词", "rzs": "处所指示代词", "rzv": "谓词性指示代词",
    "ry": "疑问代词", "ryt": "时间疑问代词", "rys": "处所疑问代词",
    "ryv": "谓词性疑问代词", "rg": "代语素",
    "m": "数词", "mq": "数量词", "mg": "数语素",
    "q": "量词", "qv": "动量词", "qt": "时量词",
    "d": "副词", "dg": "副语素",
    "p": "介词", "pba": "介词“把”", "pbei": "介词“被”",
    "c": "连词", "cc": "并列连词",
    "u": "助词", "uzhe": "助词“着”", "ule": "助词“了/喽”", "uguo": "助词“过”",
    "ude1": "助词“的/底”", "ude2": "助词“地”", "ude3": "助词“得”",
    "usuo": "助词“所”", "udeng": "助词“等/等等”", "uyy": "助词“一样/一般”",
    "udh": "助词“的话”", "uls": "助词“来讲/来说”", "uzhi": "助词“之”",
    "ulian": "助词“连”", "ug": "助词“过”", "uj": "结构助词“的”",
    "ul": "时态助词“了”", "uv": "结构助词“地”", "uz": "时态助词“着”",
    "vq": "动词", "ud": "结构助词“得”",
    "e": "叹词", "y": "语气词", "o": "拟声词", "h": "前缀", "k": "后缀",
    "x": "非语素字", "xx": "非语素字", "xu": "网址URL", "w": "标点",
    "eng": "英文", "l": "习用语", "i": "成语", "j": "简称略语",
    "g": "语素", "zg": "状态语素", "an ": "名形词", "df": "副词性区别词",
    "in": "名词性成语", "iv": "动词性成语", "ia": "形容词性成语",
    "id": "副词性成语", "jn": "名词性略语", "jv": "动词性略语",
    "ja": "形容词性略语", "jd": "副词性略语", "lv": "动词性习用语",
    "ln": "名词性习用语", "la": "形容词性习用语", "ld": "副词性习用语",
    "mg ": "数语素", "nrfg": "人名", "tg ": "时语素",
}

if __name__ == "__main__":
    main()
