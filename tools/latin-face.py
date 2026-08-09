#!/usr/bin/env python3
"""
Cut the Latin out of 汉仪古简东梁体 and leave the Chinese behind.

The face ships 10,733 glyphs — 7.8MB, nearly all of it CJK — and the site does
not want any of that: its Chinese is set in Noto Sans/Serif SC and its titles in
the Lishu. What it wants is the Latin, which is the archive's English voice
everywhere Futura is not named.

So the subset keeps the same Latin range the other Latin faces here declare, and
the @font-face limits itself to that range as well. Two safeguards for the same
thing: a Chinese character can never resolve to this file, and the file does not
carry the glyphs to serve one anyway.

Retained on purpose:
  tnum, lnum   every figure on this site sits in a register and has to line up
  smcp, c2sc   the kickers and field labels are set in small caps
  kern, liga, calt, case, ordn, frac  ordinary Latin typesetting

The face draws its S as a long s — the archaic ſ. It is a lovely mark and it is
wrong on a form: PASSWORD comes out PAſſWORD. The font carries a conventional S
as its ss01 stylistic set, so that one is wired into the cmap here and the
archaic one is left behind. Pass --archaic-s to keep the original.

    python3 tools/latin-face.py [--archaic-s]

Writes public/fonts/gujian/.
"""

import os
import shutil
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

SRC = "assets-src/fonts/HYGuJianDongLiangTiU.ttf"
OUT_DIR = "public/fonts/gujian"
OUT = os.path.join(OUT_DIR, "gujian-latin-400.woff2")

# Each default glyph and the ss01 drawing that should take its place. The
# outline is moved onto the default name rather than the cmap being pointed at
# the alternate: every feature in the font — small caps especially — is keyed on
# these names, and redirecting the cmap would leave c2sc looking up a glyph it
# has never heard of, so an S would stand at full height in a line of small caps.
SWAP = {
    "S": "S.ss01", "s": "s.ss01",
    "Scaron": "Scaron.ss01", "scaron": "scaron.ss01",
    "S.sc": "S.sc.ss01", "Scaron.sc": "Scaron.sc.ss01",
}


def straighten(src):
    """Give S its conventional drawing, wherever the S is asked for."""
    font = TTFont(src)
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = set(font.getGlyphOrder())
    for name, alt in SWAP.items():
        if name in order and alt in order:
            glyf[name] = glyf[alt]
            hmtx[name] = hmtx[alt]
    out = os.path.join(tempfile.mkdtemp(), "straight.ttf")
    font.save(out)
    return out

# The range every other Latin face in fonts.css declares, so all of them tile
# the same space and a character resolves to exactly one file.
UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,"
    "U+2212,U+2215,U+FEFF,U+FFFD"
)

FEATURES = "kern,liga,calt,case,ordn,frac,tnum,lnum,onum,pnum,smcp,c2sc,ss01,ss02"


def main():
    if not os.path.exists(SRC):
        sys.exit("missing " + SRC)
    os.makedirs(OUT_DIR, exist_ok=True)
    archaic = "--archaic-s" in sys.argv
    src = SRC if archaic else straighten(SRC)
    subprocess.run([
        sys.executable, "-m", "fontTools.subset", src,
        "--unicodes=" + UNICODES,
        "--layout-features=" + FEATURES,
        "--flavor=woff2",
        "--desubroutinize",
        "--name-IDs=1,2,3,4,5,6",
        "--output-file=" + OUT,
    ], check=True)
    if src != SRC:
        shutil.rmtree(os.path.dirname(src), ignore_errors=True)
    before = os.path.getsize(SRC)
    after = os.path.getsize(OUT)
    print("%s  %.1f MB -> %.1f KB  (%.0f x smaller)  S: %s"
          % (OUT, before / 1048576, after / 1024, before / after,
             "archaic \u017f" if archaic else "conventional"))


if __name__ == "__main__":
    main()
