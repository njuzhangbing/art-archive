#!/usr/bin/env python3
"""Emit Python jieba's segmentation for a corpus, for tools/check_jieba.js.

The corpus is drawn from the site's own data — the Chinese glosses of every
section — plus a hand-written set of sentences that exercise the cases where a
port usually diverges: unknown proper nouns (the HMM path), numerals and units,
Latin runs, punctuation, and the ties the DP has to break the same way Python's
max() breaks them.

Usage:  python3 tools/check_jieba.py --emit > /tmp/expect.json
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# The cases a naive port gets wrong. Each is here because it exercises one
# specific branch, not because it reads well.
PROBES = [
    "内亚古文字的研究者在敦煌发现了西夏文写本",
    "阙特勤碑立于鄂尔浑河谷",
    "龚煌城的拟音与荒川慎太郎的拟音不同",
    "契丹小字至今只释读了一部分",
    "他说：“这不是一回事。”",
    "共 6051 字，收录于 ISO/IEC 10646",
    "Landsat WELD 1999 年的影像分辨率是 30 米",
    "乌拉熙春在1996年发表了这篇论文",
    "回鹘文写本出自吐鲁番高昌故城",
    "粟特商队沿绿洲一线从撒马尔罕通到敦煌",
    "西夏文六千余字全为自创",
    "这批墓志出土于上京临潢府",
    "他把书放在桌子上",
    "研究研究",
    "结婚的和尚未结婚的",
    "乒乓球拍卖完了",
    "南京市长江大桥",
    "我们中出了一个叛徒",
    "工信处女干事每月经过下属科室都要亲口交代24口交换机等技术性器件的安装工作",
    "一二三四五六七八九十",
    "他来到了网易杭研大厦",
    "小明硕士毕业于中国科学院计算所，后在日本京都大学深造",
    "",
    "。",
    "a",
    "𗼇𗧻是西夏人的自称",
]


def corpus(limit=6000):
    """The probes above, plus real Chinese from the site's own data.

    Sentences are what this feature will be pointed at, so the corpus is drawn
    from the example-sentence translations rather than from the one-word
    glosses: 485 of them in the Old Uyghur build alone, several clauses each.
    Failures to read a data file are reported, not swallowed — a corpus that
    silently shrinks to the 26 hand-written probes would let a real regression
    through while still printing "100% 一致".
    """
    out = list(PROBES)
    seen = set(out)
    sources = [("olduyghur.js", "window.oldUyghurData = "),
               ("oldturkic.js", "window.oldTurkicData = "),
               ("mongolian.js", "window.mongolianData = "),
               ("khitan.js", "window.khitanData = ")]
    for fn, var in sources:
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            print(f"  (缺 {fn}，跳过)", file=sys.stderr)
            continue
        raw = open(p, encoding="utf-8").read()
        if var not in raw:
            print(f"  !! {fn} 找不到 {var.strip()}", file=sys.stderr)
            continue
        blob = raw.split(var, 1)[1].rstrip().rstrip(";")
        json.loads(blob)                      # parse errors must be loud
        # any run of Chinese with punctuation, i.e. a sentence rather than a
        # headword gloss
        n0 = len(out)
        for m in re.finditer(r'"([^"\\]{8,120})"', blob):
            s = m.group(1)
            if s in seen or not re.search(r"[一-鿿]", s):
                continue
            if not re.search(r"[，。；：、？！]", s):
                continue
            seen.add(s); out.append(s)
            if len(out) >= limit:
                print(f"  语料 {len(out)} 句（达上限）", file=sys.stderr)
                return out
        print(f"  {fn}: +{len(out) - n0} 句", file=sys.stderr)
    print(f"  语料 {len(out)} 句", file=sys.stderr)
    return out


def main():
    try:
        import jieba, jieba.posseg as pseg
    except ImportError:
        sys.exit("jieba not installed:  pip3 install --user jieba")
    jieba.setLogLevel(60)
    data = {s: [[w, f] for w, f in pseg.cut(s)] for s in corpus()}
    json.dump(data, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
