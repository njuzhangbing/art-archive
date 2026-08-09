#!/usr/bin/env python3
"""
Convert the legacy khitan.js into the current data shape, without inventing
structure the legacy file does not contain.

The legacy file was scraped from CCAMC with the markup flattened, which cost
three separate things. This script can repair two of them offline; the third
needs the pages themselves (tools/scrape_khitan.py).

  FIXED HERE
    · Reconstruction attribution. The legacy `pron` field was labelled
      "Kane / 吉田" in the UI but holds 烏拉熙春's reconstruction — verified
      against every CCAMC page where the two differ (16/16). It is emitted as
      `ulh`, and `kane` is left empty rather than guessed.
    · The fabricated character gloss. Legacy `chars[].meaning` was not a gloss
      at all: it was the glosses of the first five words containing that
      character, joined with '、' (exactly reproducible for 272 of the 335
      characters that have related words). KSS characters are phonograms and
      carry no gloss of their own, so the field is dropped. The app derives
      "meanings of the words this character occurs in" itself and labels it
      as such.

  NOT FIXED HERE — needs the source pages
    · Sense boundaries. A legacy word gloss such as '×赫领格滑哥领格' is two
      senses run together. Splitting it by guesswork would be worse than
      leaving it whole, so each word gets exactly one sense containing the
      string as recorded, and meta.structured stays false.
    · Grammatical tags and source citations, which were discarded entirely.

Run tools/scrape_khitan.py to replace this output with the structured version.

Usage:  python3 tools/convert_legacy_khitan.py
"""
import json, os, re, subprocess, sys, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LEGACY = os.path.join(HERE, "_backup", "khitan.original.js")
CACHE  = os.environ.get("KHITAN_CACHE", os.path.join(HERE, ".cache"))


def read_legacy():
    if not os.path.exists(LEGACY):
        sys.exit(f"missing {LEGACY}")
    out = subprocess.run(
        ["node", "-e",
         f'global.window={{}};require({json.dumps(LEGACY)});'
         'process.stdout.write(JSON.stringify(window.khitanData));'],
        capture_output=True, text=True)
    if out.returncode:
        sys.exit("node failed: " + out.stderr[:400])
    return json.loads(out.stdout)


def read_refs():
    """The 214-item bibliography, if it has already been cached."""
    p = os.path.join(CACHE, "refs.html")
    if not os.path.exists(p):
        return []
    doc = open(p, encoding="utf-8", errors="replace").read()
    ols = re.findall(r"<ol[^>]*>(.*?)</ol>", doc, re.S)
    if not ols:
        return []
    big = max(ols, key=len)
    return [html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", li)).strip())
            for li in re.findall(r"<li>(.*?)</li>", big, re.S)]


def main():
    data = read_legacy()
    refs = read_refs()

    chars = []
    for c in data.get("chars", []):
        chars.append({
            "cp":      c["cp"],
            "kss_id":  str(c.get("kss_id", "")),
            "kane_id": str(c.get("kane_id", "")),
            "strokes": str(c.get("stroke_count", "")),
            "bs":      "",
            "kane":    "",                       # not present in the legacy file
            "ulh":     c.get("pron", "") or "",  # what `pron` actually was
            "gloss":   "",                       # legacy value was word glosses
            "ksws":    [],
        })
    by_cp = {c["cp"]: c for c in chars}
    id_by_cp = {c["cp"]: c["kss_id"] for c in chars}

    vocabs = []
    for v in data.get("vocabs", []):
        ksw = v.get("ksw") or ""
        if not ksw:
            continue
        for ch in ksw:
            c = by_cp.get(ord(ch))
            if c is not None and ksw not in c["ksws"]:
                c["ksws"].append(ksw)
        m = (v.get("meaning") or "").strip()
        vocabs.append({
            "ksw":    ksw,
            "ids":    [id_by_cp.get(ord(ch), "") for ch in ksw],
            "senses": [{"g": m}] if m else [],   # one sense: boundaries unknown
        })
    vocabs.sort(key=lambda x: (len(x["ksw"]), x["ksw"]))

    payload = {
        "meta": {
            "source":     "古今文字集成 CCAMC · 契丹小字",
            "sourceUrl":  "http://www.ccamc.org/khitan.php",
            "refsUrl":    "http://www.ccamc.org/khitan_small_script_voc_exp_source.php",
            "structured": False,
            "chars": len(chars), "vocabs": len(vocabs), "refs": len(refs),
        },
        "refs": refs, "chars": chars, "vocabs": vocabs,
    }

    dst = os.path.join(ROOT, "khitan.js")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* CCAMC 契丹小字 — converted from the legacy scrape by\n"
                "   tools/convert_legacy_khitan.py. Reconstruction attribution and the\n"
                "   fabricated character glosses are repaired; sense boundaries, tags and\n"
                "   citations still need tools/scrape_khitan.py. */\n")
        f.write("window.khitanData = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"  字 {len(chars)} · 词 {len(vocabs)} · 文献 {len(refs)}")
    print(f"  拟音归属已改正为「乌拉熙春」；字条伪释义已移除")
    print(f"  义项切分 / 语法标签 / 出处：待 tools/scrape_khitan.py")
    print(f"→ {dst}  ({os.path.getsize(dst)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
