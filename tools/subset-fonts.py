#!/usr/bin/env python3
"""
Slice the CJK webfonts into tiers so a page downloads the glyphs it shows
instead of the whole language.

Each Chinese face ships ~8000 glyphs in one file — a megabyte or three that the
browser cannot start using until the last byte lands. Two of them were also in
a <link rel=preload>, so first paint waited on 4.4MB before drawing anything.

The split is by how likely a glyph is to be needed:

  t0  every character this site's own interface actually renders, read straight
      out of the source. Small enough to preload, and enough to paint the whole
      chrome correctly on the first frame.
  t1  the rest of GB2312 level 1 — the 3755 characters the standard defines as
      the common ones, which is what member titles and posts are made of.
  t2  everything else the font covers, for the rare character.

The tiers are disjoint, so the @font-face rules can be declared in any order and
each character resolves to exactly one file. Nothing is dropped: t2 still covers
every glyph the original file had, it just no longer holds up the page.

    python3 tools/subset-fonts.py

Writes public/fonts/subset/ and src/styles/fonts.generated.css.
"""

import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "fonts", "subset")
CSS_OUT = os.path.join(ROOT, "src", "styles", "fonts.generated.css")

# Sources live outside public/ so the multi-megabyte originals stay in the repo
# for regeneration without being deployed. Latin faces are already a few KB each
# and ship from public/fonts/ untouched.
SRC_DIR = os.path.join(ROOT, "tools", "fonts-src")

FACES = [
    # (family, weight, source file in tools/fonts-src/, output slug)
    ("HanCheng Lishu", 400, "lishu/HanChengLishu.woff2", "lishu-400"),
    ("Noto Serif SC", 600, "noto-serif-sc-chinese-simplified-600-normal.woff2", "serif-600"),
    ("Noto Serif SC", 900, "noto-serif-sc-chinese-simplified-900-normal.woff2", "serif-900"),
    ("Noto Sans SC", 300, "noto-sans-sc-chinese-simplified-300-normal.woff2", "sans-300"),
    ("Noto Sans SC", 400, "noto-sans-sc-chinese-simplified-400-normal.woff2", "sans-400"),
    ("Noto Sans SC", 500, "noto-sans-sc-chinese-simplified-500-normal.woff2", "sans-500"),
    ("Noto Sans SC", 700, "noto-sans-sc-chinese-simplified-700-normal.woff2", "sans-700"),
    ("Noto Sans SC", 900, "noto-sans-sc-chinese-simplified-900-normal.woff2", "sans-900"),
]

# Punctuation and full-width forms are cheap and show up on every screen, so
# they ride along in the preloaded tier rather than dragging a tier in later.
ALWAYS = [
    (0x3000, 0x303F),  # CJK punctuation 、。「」
    (0xFF00, 0xFFEF),  # full-width forms
    (0x2010, 0x201F),  # dashes and quotes
    (0x2026, 0x2026),  # ellipsis
    (0x00B7, 0x00B7),  # middle dot
]


def gb2312(first, last):
    """Characters in a GB2312 code range — level 1 is 0xB0..0xD7, level 2 0xD8..0xF7."""
    out = []
    for hi in range(first, last + 1):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return set(out)


def site_charset():
    """Every non-ASCII character this site's own source renders."""
    text = []
    globs = ["src/**/*.js", "src/**/*.css", "index.html"]
    for pattern in globs:
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            if "fonts.generated.css" in path:
                continue
            with open(path, encoding="utf8") as fh:
                text.append(fh.read())
    return set(ch for ch in "".join(text) if ord(ch) > 0x7F)


def to_ranges(codepoints):
    cps = sorted(codepoints)
    if not cps:
        return []
    out, start, prev = [], cps[0], cps[0]
    for cp in cps[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        out.append((start, prev))
        start = prev = cp
    out.append((start, prev))
    return out


def css_ranges(codepoints):
    return ",".join(
        "U+%X" % a if a == b else "U+%X-%X" % (a, b) for a, b in to_ranges(codepoints)
    )


def coarse_ranges(codepoints, gap=512):
    """Ranges with small holes filled in.

    Spelling out a scattered set costs more CSS than the font it saves — the
    catch-all tier alone ran to hundreds of KB. It is declared first and so has
    the lowest priority, which means it may safely claim characters the later
    tiers also list: those rules win. Only its own glyphs can ever be served
    from it, so over-claiming costs nothing.
    """
    merged = []
    for a, b in to_ranges(codepoints):
        if merged and a - merged[-1][1] <= gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return ",".join("U+%X" % a if a == b else "U+%X-%X" % (a, b) for a, b in merged)


def subset(src, cps, dest):
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf8") as fh:
        fh.write("".join(chr(c) for c in sorted(cps)))
        listing = fh.name
    try:
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", src,
                "--text-file=" + listing,
                "--output-file=" + dest,
                "--flavor=woff2",
                "--layout-features=*",
                "--no-hinting",
                "--desubroutinize",
                "--drop-tables+=DSIG",
            ],
            check=True, capture_output=True,
        )
    finally:
        os.unlink(listing)
    return os.path.getsize(dest)


def main():
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit("fontTools is required: pip3 install fonttools brotli")

    chrome = site_charset()
    level1 = gb2312(0xB0, 0xD7)
    always = set(cp for a, b in ALWAYS for cp in range(a, b + 1))

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)

    rules = []
    before = after = 0
    print("%-12s %10s  %10s %10s %10s" % ("face", "original", "t0", "t1", "t2"))

    for family, weight, rel, slug in FACES:
        src = os.path.join(SRC_DIR, rel)
        covered = set(TTFont(src).getBestCmap().keys())
        original = os.path.getsize(src)
        before += original

        t0 = covered & (set(ord(c) for c in chrome) | always)
        t1 = (covered & set(ord(c) for c in level1)) - t0
        t2 = covered - t0 - t1

        # Declared widest-first: a character is served by the last rule that
        # claims it, so the cheap catch-all range never shadows the precise ones.
        sizes = {}
        for tier, cps, ranges in (
            ("t2", t2, coarse_ranges(t2)),
            ("t1", t1, css_ranges(t1)),
            ("t0", t0, css_ranges(t0)),
        ):
            if not cps:
                continue
            name = "%s-%s.woff2" % (slug, tier)
            sizes[tier] = subset(src, cps, os.path.join(OUT_DIR, name))
            after += sizes[tier]
            rules.append(
                "@font-face { font-family: \"%s\"; font-style: normal; font-weight: %d; "
                "font-display: swap; src: url(/fonts/subset/%s) format(\"woff2\"); "
                "unicode-range: %s; }" % (family, weight, name, ranges)
            )

        print("%-12s %9.1fK  %9.1fK %9.1fK %9.1fK" % (
            slug, original / 1024,
            sizes.get("t0", 0) / 1024, sizes.get("t1", 0) / 1024, sizes.get("t2", 0) / 1024))

    header = (
        "/* Generated by tools/subset-fonts.py — do not edit by hand.\n"
        " * Each CJK face is split into disjoint tiers so a page fetches only the\n"
        " * glyphs it shows: t0 is this site's own interface text, t1 is GB2312\n"
        " * level 1, t2 is everything else the original font covered.\n"
        " * Re-run the script after changing interface copy. */\n\n"
    )
    with open(CSS_OUT, "w", encoding="utf8") as fh:
        fh.write(header + "\n".join(rules) + "\n")

    print("\nCJK payload: %.1f MB in %d files -> %.1f MB in %d tiers"
          % (before / 1048576, len(FACES), after / 1048576, len(rules)))
    print("preloadable first tier: %.1f KB"
          % (os.path.getsize(os.path.join(OUT_DIR, "sans-400-t0.woff2")) / 1024))
    print("wrote %s (%.1f KB)" % (os.path.relpath(CSS_OUT, ROOT), os.path.getsize(CSS_OUT) / 1024))


if __name__ == "__main__":
    main()
