#!/usr/bin/env python3
"""
Mirror the openly-available Khitan literature and build docs/khitan/index.json.

What is mirrored and what is not
--------------------------------
Only material that is free to read at source is copied here:

  * REAL (Hungarian Academy of Sciences repository) — the Róna-Tas series
  * unicode.org WG2 / L2 documents — public standards correspondence
  * sinoss.net, kodaimoji.chowder.jp, KCI — freely posted articles

Anything behind a paywall or an account is INDEXED ONLY, as an outbound link:
Kane 2009 is a Brill book, Wu & Janhunen 2010 is Global Oriental, and the
Scribd scan of Kane is of uncertain provenance. Those are listed on the page
with what they are and where to get them, and nothing is fetched.

Why the PDFs and not the text
-----------------------------
Extracting text from these destroys the point: the Khitan characters in the
running text are glyphs the extractor drops, so a plain-text copy of a paper
about Khitan orthography comes out with the orthography missing. The originals
are mirrored byte for byte and served for reading in place.

Usage:  python3 tools/fetch_khitan_docs.py [--recheck]
"""
import hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "docs", "khitan")
log = lambda *a: print(*a, flush=True)

# (id, url, group, title, author, where, note)
DOCS = [
    # ---- A1  Róna-Tas, Khitan Studies (REAL, open access) -----------------
    ("rt-1-1", "https://real.mtak.hu/38020/1/062.2016.69.2.1.pdf", "A1",
     "Khitan Studies I.1 — The Graphs of the Khitan Small Script",
     "András Róna-Tas", "Acta Orient. Hung. 69 (2016) 117–138",
     "原字总论、带点／不带点的对立、数词系统。全系列里数据最硬的一篇。"),
    ("rt-1-3", "https://real.mtak.hu/94473/1/062.2019.72.1.4.pdf", "A1",
     "Khitan Studies I.3 — The Consonants",
     "András Róna-Tas", "Acta Orient. Hung. 72 (2019)",
     "辅音构拟。"),
    ("rt-3-3", "https://real.mtak.hu/153149/1/1588-2667-article-p669.pdf", "A1",
     "Khitan Studies 3.3 — 软腭／小舌塞音",
     "András Róna-Tas", "Acta Orient. Hung. 73 (2020) 669–683",
     "velar／uvular 的对立，送气与否。"),
    ("rt-74", "https://real.mtak.hu/153512/1/1588-2667-article-p673.pdf", "A1",
     "Khitan Studies（续）", "András Róna-Tas",
     "Acta Orient. Hung. 74 (2021) 673–684", "同系列后续。"),
    ("apa-rt", "https://real.mtak.hu/56019/1/062.2017.70.2.1.pdf", "A1",
     "Recent Developments on the Decipherment of the Khitan Small Script",
     "Ákos Bertalan Apatóczky · András Róna-Tas",
     "Acta Orient. Hung. 70 (2017)",
     "研究史综述，附完整书目。想知道各家分歧在哪，从这篇入手。"),

    # ---- A2  Unicode / WG2 (public documents) -----------------------------
    ("n4738r2", "https://www.unicode.org/wg2/docs/n4738r2-khitan-small.pdf", "A2",
     "N4738R2 = L2/16-245R2 契丹小字编码提案（正式）",
     "孙伯君 · 吴英喆 · 景永时 · 吉如何 · Zaytsev · West · Everson",
     "ISO/IEC JTC1/SC2/WG2", "472 字表，七种来源编号互相映射。"),
    ("n4725r", "https://www.unicode.org/L2/L2016/16113r-n4725r-khitan-small-script.pdf", "A2",
     "N4725R = L2/16-113R 预备文件（194 页）",
     "Andrew West · Viacheslav Zaytsev · Michael Everson", "ISO/IEC JTC1/SC2/WG2",
     "Table 4／5 是全部字形对照。做工具、字库、检索的话，这份比论文更实用。"
     "文件近 48 MB（194 页全彩字形表），手机上建议直接下载，不要在线翻。"),
    ("n3820", "https://www.unicode.org/L2/L2010/10130-n3820.pdf", "A2",
     "N3820 = L2/10-130 早期提案", "", "ISO/IEC JTC1/SC2/WG2", ""),
    ("n3918", "https://www.unicode.org/L2/L2010/10369-n3918.pdf", "A2",
     "N3918 = L2/10-369 早期提案", "", "ISO/IEC JTC1/SC2/WG2", ""),
    ("l2-23-199", "https://www.unicode.org/L2/L2023/23199-khitan-glyph-corr.pdf", "A2",
     "L2/23-199 字形勘误", "", "Unicode Technical Committee", ""),

    # ---- A3  中文单篇 -----------------------------------------------------
    ("wu-pindu", "https://www.sinoss.net/uploadfile/2010/1130/6340.pdf", "A3",
     "契丹小字拼读方法探索", "吴英喆", "sinoss.net",
     "「元音附加法」的原始论文。"),
    ("wu-xing", "https://www.sinoss.net/uploadfile/2010/1130/4822.pdf", "A3",
     "契丹小字「性」语法范畴再探 — 以带点与不带点的原字为主线",
     "吴英喆", "sinoss.net", ""),
    ("qing-shidu", "https://www.sinoss.net/uploadfile/2010/1130/4578.pdf", "A3",
     "契丹文字释读方法研究", "清格尔泰", "sinoss.net",
     "拟音的方法论前提 — 讲「为什么这么拟」，先看这个再看结论。"),
    ("wu-rusheng", "https://www.sinoss.net/uploadfile/2010/1130/6820.pdf", "A3",
     "契丹小字中的汉语入声韵尾的痕迹", "吴英喆", "sinoss.net", ""),
    ("wu-gaikuang", "https://kodaimoji.chowder.jp/pdf/pdf2/wu52.pdf", "A3",
     "契丹小字研究概况", "吴英喆", "日本古代文字资料馆",
     "四十分钟摸清全局，建议第一篇读。"),
    ("kang-xinshiji",
     "https://journal.kci.go.kr/manchuria/archive/articlePdf?artiId=ART002074040", "A3",
     "新世纪契丹语文研究的新进展及其对历史研究的贡献", "康鹏",
     "满洲研究（韩国 KCI），中文", ""),
]

# Indexed only — never fetched. Kept in the same file so the page and the
# mirror cannot drift apart.
EXTERNAL = [
    ("Kane, Daniel (2009) The Kitan Language and Script",
     "Brill, Handbook of Oriental Studies 8/19, 315 pp.",
     "https://brill.com/display/title/15288",
     "形态与句法部分最完整的英文单本。需购买。"),
    ("Wu Yingzhe & Juha Janhunen (2010) New Materials on the Khitan Small Script",
     "Global Oriental", "",
     "萧敌鲁、耶律糺里两方新志的校订本，附原字总表（Róna-Tas 引作 List／WJ）。需购买。"),
    ("Janhunen, Juha (2012) Khitan: Understanding the Language Behind the Scripts",
     "SCRIPTA 4: 107–132（訓民正音学会，开放获取）",
     "http://ancientworldonline.blogspot.com/2013/02/open-access-journal-scripta.html",
     "SCRIPTA 本身开放获取，值得去官网找 PDF。"),
    ("Shimunek, Andrew (2017) Languages of Ancient Southern Mongolia and North China",
     "Harrassowitz", "", "Serbi-Mongolic 比较，契丹拟音最激进的一路。"),
    ("Shimunek (2014) A New Decipherment … Bilingual Inscription of 1134 A.D.",
     "Acta Orient. Hung. 67: 97–118", "", ""),
    ("Vovin, Alexander (2011) 郎君行记解读 ／ (2013) 契丹语中的古突厥借词", "", "", ""),
    ("武内康则 Takeuchi Yasunori (2008) 契丹小字で表記された漢字音から見た契丹語音体系の研究",
     "京都大学硕士论文；(2015) Direction Terms in Khitan", "", ""),
    ("清格尔泰等《契丹小字研究》1985 ／ 清格尔泰《契丹小字释读问题》2002",
     "", "", "中文核心专著，基本只有纸本或馆藏。"),
    ("即实《谜林问径》1996 ／《谜田耕耘》2012", "", "", ""),
    ("刘凤翥《遍访契丹文字话拓碑》2004", "", "", ""),
    ("爱新觉罗·乌拉熙春《契丹语言文字研究》2004", "", "", ""),
]


def fetch(url, dst, tries=4):
    """curl with resume. These servers close connections mid-transfer often
    enough that a single GET is not a reliable test of availability."""
    for i in range(tries):
        cmd = ["curl", "-sS", "-L", "--max-time", "180", "--retry", "2",
               "--retry-delay", "2", "-A", "Mozilla/5.0 (compatible; lexica-mirror/1.0)",
               "-o", dst, url]
        # Resume only on a retry, and only once: KCI answers a Range request
        # with 33 "server doesn't seem to support byte ranges", after which the
        # partial file poisons every further attempt. Dropping it and asking
        # for the whole thing is the only way through.
        partial = os.path.exists(dst) and os.path.getsize(dst) > 0
        if partial and i == 1:
            cmd.insert(1, "-C"); cmd.insert(2, "-")
        elif partial:
            os.remove(dst)
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 4096:
            ok, why = verify(dst)
            if ok:
                return True, ""
            # a truncated PDF starts perfectly well — checking only the header
            # accepted a half-downloaded file and shipped it
            os.remove(dst)
            if i == tries - 1:
                return False, why
        time.sleep(2 * (i + 1))
    return False, (r.stderr or "download failed").strip()[:120]


def verify(path):
    """A PDF is only usable if it also ENDS like one.

    curl returns 0 on a connection that closed cleanly after a partial body, and
    the first bytes of a truncated PDF are indistinguishable from a whole one —
    so a header check alone let a half-fetched paper through, marked OK. The
    %%EOF trailer is the cheap structural check; opening it is the real one.
    """
    with open(path, "rb") as f:
        if f.read(5) != b"%PDF-":
            return False, "不是 PDF"
        f.seek(max(0, os.path.getsize(path) - 2048))
        if b"%%EOF" not in f.read():
            return False, "PDF 截断（无 %%EOF）"
    try:
        import warnings
        from pypdf import PdfReader
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if len(PdfReader(path).pages) < 1:
                return False, "PDF 无页面"
    except ImportError:
        pass
    except Exception as e:
        return False, f"PDF 无法解析（{type(e).__name__}）"
    return True, ""


def pages(path):
    """Page count.

    Counting /Type/Page in the raw bytes only works on uncompressed files —
    most of these use object streams, where the page objects are deflated and
    never appear literally, which is why the first attempt returned "?" for all
    but two. pypdf reads the structure properly; the byte-count stays as a
    fallback so the script still runs without it.
    """
    try:
        from pypdf import PdfReader
        return len(PdfReader(path).pages)
    except Exception:
        pass
    import re as _re
    try:
        blob = open(path, "rb").read()
    except Exception:
        return None
    n = len(_re.findall(rb"/Type\s*/Page[^s]", blob))
    return n if n > 0 else None


def main():
    os.makedirs(OUT, exist_ok=True)
    index = {"docs": [], "external": [], "fetched": None}
    ok = fail = 0
    for did, url, group, title, author, where, note in DOCS:
        dst = os.path.join(OUT, did + ".pdf")
        have = os.path.exists(dst) and os.path.getsize(dst) > 4096
        if have and "--recheck" not in sys.argv:
            good, err = True, ""
        else:
            log(f"  取 {did} …")
            good, err = fetch(url, dst)
        rec = {"id": did, "group": group, "title": title, "author": author,
               "where": where, "note": note, "source": url}
        if good:
            size = os.path.getsize(dst)
            rec.update(file=f"docs/khitan/{did}.pdf", bytes=size,
                       sha256=hashlib.sha256(open(dst, "rb").read()).hexdigest()[:16],
                       pages=pages(dst))
            ok += 1
            log(f"    {did:12} {size/1048576:5.2f} MB  {rec['pages'] or '?'} 页")
        else:
            rec.update(file=None, error=err)
            fail += 1
            log(f"    !! {did:12} {err}")
        index["docs"].append(rec)

    for title, where, url, note in EXTERNAL:
        index["external"].append({"title": title, "where": where,
                                  "url": url, "note": note})

    index["fetched"] = time.strftime("%Y-%m-%d")
    json.dump(index, open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    total = sum(d.get("bytes", 0) for d in index["docs"])
    log(f"\n镜像 {ok}／{len(DOCS)} 篇，合计 {total/1048576:.1f} MB；"
        f"失败 {fail}；仅索引 {len(EXTERNAL)} 条")
    log(f"→ docs/khitan/index.json")


if __name__ == "__main__":
    main()
