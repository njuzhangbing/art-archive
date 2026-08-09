#!/usr/bin/env python3
"""
Resize the section artwork for the cover sheet.

The originals in assets-src/persona are 6–12MB apiece and around 40MB together —
fine as masters, impossible to put on a page. Each section of the contents list
gets one plate at a size a browser can actually hold as a WebGL texture.

    python3 tools/section-plates.py

Reads assets-src/persona/{banner,b2,b3,b4,b5}.PNG, writes assets-src/persona/plate-*.webp.
"""

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "public", "persona")

# One plate per entry in the cover's contents list, plus the opening frame.
PLATES = [
    ("banner.PNG", "plate-00.webp"),
    ("b2.PNG", "plate-01.webp"),
    ("b3.PNG", "plate-02.webp"),
    ("b4.PNG", "plate-03.webp"),
    ("b5.PNG", "plate-04.webp"),
]

# Both dimensions matter: these become GPU textures that the melt shader samples
# many times per pixel, so oversized plates cost fill rate as well as bandwidth.
MAX_EDGE = 1500
QUALITY = 82


def main():
    total_before = total_after = 0
    print("%-14s %-16s %12s %12s" % ("source", "plate", "before", "after"))
    for src_name, out_name in PLATES:
        src = os.path.join(SRC_DIR, src_name)
        if not os.path.exists(src):
            print("  missing, skipped: %s" % src_name)
            continue
        out = os.path.join(SRC_DIR, out_name)

        im = Image.open(src)
        if im.mode in ("RGBA", "LA", "P"):
            flat = Image.new("RGB", im.size, (0, 0, 0))
            im = im.convert("RGBA")
            flat.paste(im, mask=im.split()[3])
            im = flat
        else:
            im = im.convert("RGB")

        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        im.save(out, "WEBP", quality=QUALITY, method=6)

        before = os.path.getsize(src)
        after = os.path.getsize(out)
        total_before += before
        total_after += after
        print("%-14s %-16s %9.1f MB %9.1f KB  %s"
              % (src_name, out_name, before / 1048576, after / 1024, "x".join(map(str, im.size))))

    if total_before:
        print("\ntotal        %.1f MB -> %.1f KB  (%.0fx smaller)"
              % (total_before / 1048576, total_after / 1024, total_before / max(total_after, 1)))


if __name__ == "__main__":
    main()
