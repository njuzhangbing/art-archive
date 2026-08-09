#!/usr/bin/env python3
"""
Build the web font files the site actually serves.

Why this exists
---------------
The previous build shipped three TTFs totalling 16.7 MB on every page load:

  tangut_n4694_v17.ttf       11.2 MB  — TRUNCATED. The file is 229,445 bytes
                                        short of the length its own table
                                        directory declares, so `loca`, `post`,
                                        `name`, `kern`, `gasp`, `GSUB` and
                                        `GPOS` all run past the end of the file.
                                        No shaper can parse it. It was listed
                                        first in the CSS font stack, so every
                                        visitor downloaded 11.2 MB and then
                                        silently fell through to the next face.
  notoseriftangut-regular.ttf 5.4 MB  — the face that was doing the work.
  ccamc_kss_kaiti.ttf         0.5 MB

The CSS also referenced them with mixed-case filenames (`Tangut_N4694_V17.ttf`)
while the files on disk are lowercase. macOS is case-insensitive so it worked
locally; on a case-sensitive host every @font-face would 404 and the pages
would render as tofu.

This script subsets the two working faces to the codepoints the data actually
contains and emits WOFF2:

  tangut-serif.woff2   0.90 MB   (6051 Tangut codepoints)
  khitan-kss.woff2     0.09 MB   (410 KSS codepoints)

16.7 MB → 0.99 MB.

Requires: fonttools, brotli   (pip install fonttools brotli)
"""
import os, re, sys, glob

try:
    from fontTools.ttLib import TTFont
    from fontTools import subset
    import brotli  # noqa: F401  — required by fontTools for woff2 output
except ImportError as e:
    sys.exit(f"missing dependency: {e}\n  pip install fonttools brotli")

HERE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(HERE)
FONTS = os.path.join(ROOT, "fonts")


def tangut_codepoints():
    """Every codepoint present in data.js."""
    src = open(os.path.join(ROOT, "data.js"), encoding="utf-8", errors="replace").read()
    return sorted({int(m.group(1)) for m in re.finditer(r'"(\d+)":', src)})


def khitan_codepoints():
    """The KSS PUA block. Fixed range — the data is keyed on it."""
    return list(range(0xE000, 0xE19A))


def oldturkic_codepoints():
    """The assigned part of the Old Turkic block. U+10C49–U+10C4F are unassigned,
    so asking for them would report a phantom gap on every build."""
    return list(range(0x10C00, 0x10C49))


def mongolian_codepoints():
    """Traditional Mongolian block. Includes the variation selectors and the
    Mongolian free variation selectors that shape the joining forms."""
    return list(range(0x1800, 0x18B0)) + list(range(0x180B, 0x180F))


def sogdian_codepoints():
    """The Sogdian block proper. U+10F5A–U+10F5F is unassigned."""
    return list(range(0x10F30, 0x10F5A))


def oldsogdian_codepoints():
    """The Old Sogdian block. U+10F28–U+10F2F is unassigned."""
    return list(range(0x10F00, 0x10F28))


def manichaean_codepoints():
    """The Manichaean block. The tail U+10AF7–U+10AFF is unassigned, and
    U+10AE7–U+10AEA / U+10AF0 are gaps inside it — ask only for what exists."""
    return sorted(set(range(0x10AC0, 0x10AF7)) - set(range(0x10AE7, 0x10AEB)))


def olduyghur_codepoints():
    """The assigned part of the Old Uyghur block — 26 codepoints, of which
    U+10F82–U+10F85 are combining marks. U+10F8A–U+10FAF is unassigned, so
    asking for the whole block would report a phantom 38-codepoint gap on
    every build."""
    return list(range(0x10F70, 0x10F8A))


def check_truncated(path):
    """A font whose table directory points past EOF cannot be parsed at all."""
    import struct
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(12)
        num = struct.unpack(">H", head[4:6])[0]
        dirent = f.read(16 * num)
    worst = max(struct.unpack(">4sIII", dirent[16 * i:16 * i + 16])[2] +
                struct.unpack(">4sIII", dirent[16 * i:16 * i + 16])[3]
                for i in range(num))
    return worst - size if worst > size else 0


def build(src, dst, cps, label, keep_layout=False):
    """keep_layout: Mongolian and Old Uyghur are cursive joining scripts — their
    initial/medial/final forms live in GSUB. Dropping the layout tables would
    leave every letter in isolated form, which is simply wrong text."""
    ft = TTFont(src)
    opts = subset.Options(
        layout_features=["*"] if keep_layout else [],
        name_IDs=[1, 2, 3, 4, 6], notdef_outline=True,
        drop_tables=(["DSIG", "kern", "gasp", "vhea", "vmtx", "LTSH"] if keep_layout else
                     ["DSIG", "kern", "GPOS", "GSUB", "gasp", "vhea", "vmtx", "LTSH"]),
        hinting=False, desubroutinize=True, recalc_bounds=True,
    )
    s = subset.Subsetter(options=opts)
    s.populate(unicodes=cps)
    s.subset(ft)

    covered = set()
    for t in ft["cmap"].tables:
        covered |= set(t.cmap.keys())
    missing = set(cps) - covered

    ft.flavor = "woff2"
    ft.save(dst)
    ft.close()
    print(f"  {label:16} {os.path.getsize(src)/1048576:6.2f} MB → "
          f"{os.path.basename(dst):22} {os.path.getsize(dst)/1048576:5.2f} MB  "
          f"({len(cps)} 码位, 缺 {len(missing)})")
    if missing:
        print(f"    !! 未覆盖: {sorted(missing)[:10]}{' …' if len(missing) > 10 else ''}")
    return os.path.getsize(dst)


ORIG = os.path.join(HERE, "_backup", "fonts-original")


def source(name):
    """Source TTFs live in fonts/ before the first build and in
    tools/_backup/fonts-original/ afterwards — only the WOFF2s ship."""
    for d in (FONTS, ORIG):
        for cand in (name, name.lower()):
            p = os.path.join(d, cand)
            if os.path.exists(p):
                return p
    return os.path.join(FONTS, name)


def main():
    src_tangut = source("NotoSerifTangut-Regular.ttf")
    src_khitan = source("CCAMC_KSS_Kaiti.ttf")
    src_otk    = source("NotoSansOldTurkic-Regular.ttf")
    src_mn     = source("NotoSansMongolian-Regular.ttf")
    src_ou     = source("NotoSerifOldUyghur-Regular.ttf")
    src_sog    = source("NotoSansSogdian-Regular.ttf")
    src_osog   = source("NotoSansOldSogdian-Regular.ttf")
    src_mani   = source("NotoSansManichaean-Regular.ttf")
    broken     = source("tangut_n4694_v17.ttf")

    if os.path.exists(broken):
        short = check_truncated(broken)
        if short:
            print(f"  tangut_n4694_v17.ttf 截断，缺 {short:,} 字节 — 无法解析，可删除")

    for p in (src_tangut, src_khitan):
        if not os.path.exists(p):
            sys.exit(f"missing source font: {p}")

    before = sum(os.path.getsize(p) for p in
                 glob.glob(os.path.join(FONTS, "*.ttf")) + glob.glob(os.path.join(ORIG, "*.ttf")))
    print("subsetting …")
    after = 0
    after += build(src_tangut, os.path.join(FONTS, "tangut-serif.woff2"),
                   tangut_codepoints(), "Tangut serif")
    after += build(src_khitan, os.path.join(FONTS, "khitan-kss.woff2"),
                   khitan_codepoints(), "Khitan KSS")
    if os.path.exists(src_otk):
        after += build(src_otk, os.path.join(FONTS, "oldturkic.woff2"),
                       oldturkic_codepoints(), "Old Turkic")
    if os.path.exists(src_mn):
        after += build(src_mn, os.path.join(FONTS, "mongolian.woff2"),
                       mongolian_codepoints(), "Mongolian", keep_layout=True)
    if os.path.exists(src_ou):
        after += build(src_ou, os.path.join(FONTS, "olduyghur.woff2"),
                       olduyghur_codepoints(), "Old Uyghur", keep_layout=True)
    # These three never carry a headword — they turn up inline, inside Sogdian
    # corpus forms and inside etymologies ("From 𐼀𐼀𐼄𐼀𐼊𐼌, 𐫀𐫀𐫄𐫀𐫏𐫔, …"), which is
    # exactly where an unscoped font stack leaves tofu.
    if os.path.exists(src_sog):
        after += build(src_sog, os.path.join(FONTS, "sogdian.woff2"),
                       sogdian_codepoints(), "Sogdian", keep_layout=True)
    if os.path.exists(src_osog):
        after += build(src_osog, os.path.join(FONTS, "oldsogdian.woff2"),
                       oldsogdian_codepoints(), "Old Sogdian", keep_layout=True)
    if os.path.exists(src_mani):
        after += build(src_mani, os.path.join(FONTS, "manichaean.woff2"),
                       manichaean_codepoints(), "Manichaean", keep_layout=True)
    print(f"\n  原 TTF 合计 {before/1048576:.2f} MB → 新 WOFF2 合计 {after/1048576:.2f} MB "
          f"（省 {(before-after)/1048576:.2f} MB, {(1-after/before)*100:.0f}%）")
    print("  源 TTF 可自 fonts/ 移除；styles.css 只引用 .woff2。")


if __name__ == "__main__":
    main()
