#!/usr/bin/env python3
"""
Build the black-and-white satellite plates the landing page flies over.

Imagery source
--------------
NASA GIBS (Global Imagery Browse Services), WMTS, EPSG:3857 — the same tiling
scheme the web uses, so tile maths is the ordinary slippy-map maths.

  ASTER_GDEM_Greyscale_Shaded_Relief   z≤12  terrain, already greyscale
  Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual  z≤12  surface texture

Both are NASA products and carry no copyright — they can be redistributed with
the site. Google's satellite tiles cannot: their terms forbid downloading tiles
for use outside the Maps API, and this site ships its own images. NASA is also
simply the better source here — no roads, no labels, no watermark, and the
shaded relief does most of the work a film grade wants done.

The two layers are composited: Landsat desaturated for texture, relief
multiplied over it for landform. Grain, vignette and flicker are NOT baked in —
those are animated in the page, so they move.

Usage:  python3 tools/fetch_plates.py [region …]
"""
import io, json, math, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps, ImageFilter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT  = os.path.join(ROOT, "plates")
CACHE = os.path.join(HERE, "_backup", "tilecache")
TILE = 256

RELIEF = ("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
          "ASTER_GDEM_Greyscale_Shaded_Relief/default/GoogleMapsCompatible_Level12"
          "/{z}/{y}/{x}.jpg")
# WELD is not a continuous archive — the annual product exists for 1984/89/99
# only, and 1984 404s over Inner Asia. 1999 is the one with full coverage here.
LANDSAT = ("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
           "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/1999-12-01/"
           "GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpg")

log = lambda *a: print(*a, flush=True)

# Each plate is centred on the landscape the script was actually written in.
# lon/lat are the centre; `span` is the width in degrees of longitude.
REGIONS = {
    "overview":  dict(lon=93.0, lat=43.0, span=76.0, z=7, max_w=3000,
                      label="内亚"),
    "sogdian":   dict(lon=66.96, lat=39.65, span=2.2, z=11,
                      label="粟特 — 撒马尔罕、泽拉夫尚河谷"),
    "oldturkic": dict(lon=102.83, lat=47.56, span=2.2, z=11,
                      label="古突厥 — 鄂尔浑河谷、和硕柴达木"),
    "olduyghur": dict(lon=89.30, lat=42.90, span=2.2, z=11,
                      label="回鹘 — 吐鲁番、高昌"),
    "khitan":    dict(lon=119.42, lat=43.96, span=2.2, z=11,
                      label="契丹 — 上京临潢府、西拉木伦河"),
    "tangut":    dict(lon=105.95, lat=38.55, span=2.2, z=11,
                      label="西夏 — 贺兰山、兴庆府"),
    # Karakorum sits in the same Orkhon valley as the Türk steles, so a plate
    # centred on it would be near-identical to the Old Turkic one. The Kherlen,
    # where the ordos actually were, is the distinct Mongol landscape.
    "mongolian": dict(lon=110.05, lat=48.05, span=2.2, z=11,
                      label="蒙古 — 克鲁伦河、阿巴儿合"),
}

# A resolution pyramid, not two isolated pictures.
#
# The overview resolves 0.025°/px and the close plates 0.0009° — 28× apart. Fly
# straight from one to the other and the wide map has to be blown up 33× at the
# hand-over, so an unreadable blur is asked to become a sharp photograph in one
# step. That is the seam, and no amount of grain over the top will hide it,
# because what the eye is catching is the change in resolution.
#
# One intermediate level at ~14° closes it: each step is then about 5×, which a
# short dissolve covers easily. The page picks whichever level is sharpest for
# the camera's current altitude, exactly as a slippy map picks a tile zoom.
for _k, _v in list(REGIONS.items()):
    if _k == "overview":
        continue
    REGIONS[_k + "@mid"] = dict(lon=_v["lon"], lat=_v["lat"], span=14.0, z=8,
                                label=_v["label"] + "（中景）")


def deg2tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return x, y


def merc(lat):
    """Web-Mercator y, normalised 0 at the north pole to 1 at the south."""
    return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2


def plate_bounds(name):
    """Bounds of an already-built plate, from the index this script writes."""
    try:
        return json.load(open(os.path.join(OUT, "index.json"), encoding="utf-8"))[name]
    except Exception:
        return None


def tile2deg(x, y, z):
    """Inverse of deg2tile — needed to record each plate's real bounds."""
    n = 2 ** z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


def fetch(url, tries=4):
    key = os.path.join(CACHE, url.split("/best/")[1].replace("/", "_"))
    if os.path.exists(key) and os.path.getsize(key) > 0:
        return open(key, "rb").read()
    os.makedirs(CACHE, exist_ok=True)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "inner-asia-lexica/1.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                blob = r.read()
            if len(blob) > 200:
                open(key, "wb").write(blob)
                return blob
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):      # outside the layer's coverage
                return None
        except Exception:
            pass
        time.sleep(1.5 * (i + 1))
    return None


def mosaic(url_tmpl, z, x0, y0, nx, ny):
    """Stitch nx×ny tiles. Missing tiles come back as mid-grey rather than
    aborting — Landsat WELD has real gaps, and a gap is not a failure."""
    im = Image.new("RGB", (nx * TILE, ny * TILE), (128, 128, 128))
    have = Image.new("L", (nx, ny), 0)          # 1 px per tile: was it fetched?
    jobs = [(dx, dy) for dy in range(ny) for dx in range(nx)]

    def one(job):
        dx, dy = job
        return job, fetch(url_tmpl.format(z=z, x=x0 + dx, y=y0 + dy))

    got = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for (dx, dy), blob in pool.map(one, jobs):
            if not blob:
                continue
            try:
                t = Image.open(io.BytesIO(blob)).convert("RGB")
            except Exception:
                continue
            im.paste(t, (dx * TILE, dy * TILE))
            have.putpixel((dx, dy), 255)
            got += 1
    return im, got, nx * ny, have


def grade(relief, landsat, landsat_have=None):
    """Composite to a single luminance plate, then grade it like film stock.

    Panchromatic film reads a landscape darker in the greens and lighter in the
    reds than the eye does; weighting the channels that way, instead of taking
    the sRGB luma, is most of what makes a desaturated satellite image stop
    looking like a desaturated satellite image.
    """
    a = np.asarray(landsat, dtype=np.float32) / 255.0
    pan = 0.28 * a[..., 0] + 0.36 * a[..., 1] + 0.36 * a[..., 2]
    r = np.asarray(relief.convert("L"), dtype=np.float32) / 255.0

    # Where Landsat has no tile the mosaic holds flat 0.5 grey, which composites
    # into a visible rectangle — the one artefact on this page that reads as a
    # bug rather than as film. Carry the relief through there instead, matched to
    # the mean of the tiles that did arrive so the patch does not change value.
    # The mask is one pixel per tile, so it is upscaled and feathered first.
    if landsat_have is not None:
        m = landsat_have.resize(landsat.size, Image.BILINEAR)
        m = m.filter(ImageFilter.GaussianBlur(TILE * 0.35))
        m = np.asarray(m, dtype=np.float32) / 255.0
        if m.min() < 0.999:
            lo, hi = np.percentile(r, 4), np.percentile(r, 96)
            stand_in = np.clip((r - lo) / max(hi - lo, 1e-6), 0, 1)
            good = m > 0.5
            if good.any():
                stand_in = stand_in * pan[good].std() / max(stand_in[good].std(), 1e-6)
                stand_in += pan[good].mean() - stand_in[good].mean()
            pan = m * pan + (1.0 - m) * np.clip(stand_in, 0, 1)

    # relief multiplied in, but softly — full multiply crushes the basins
    out = pan * (0.55 + 0.45 * r)
    # Normalise before grading. A 2°-wide plate of one basin covers a fraction
    # of the tonal range the whole of Inner Asia does, so a fixed curve leaves
    # the close shots flat and grey while the wide shot looks right.
    out = np.clip(out, 0, 1)
    lo, hi = np.percentile(out, 1.0), np.percentile(out, 99.0)
    if hi - lo > 0.05:
        out = (out - lo) / (hi - lo)

    # Film has no clipping point, it has a shoulder: past about 0.8 the response
    # compresses instead of stopping. Without it the Taklamakan and the Gobi go
    # to flat paper white and lose the dune texture that makes them worth
    # looking at. Shadows get the same treatment, gentler.
    out = np.clip(out, -0.2, 1.4)
    hi_k, sh = 0.78, 0.55
    top = out > hi_k
    out[top] = hi_k + (1 - hi_k) * np.tanh((out[top] - hi_k) / (1 - hi_k) / sh) * sh * 1.35
    lo_k = 0.10
    bot = out < lo_k
    out[bot] = lo_k - lo_k * np.tanh((lo_k - out[bot]) / lo_k / 0.8) * 0.8

    out = out ** 1.04
    out = 0.5 + 1.10 * (out - 0.5)

    # Print density. These are bright landscapes — desert, steppe under snow —
    # and at their native brightness pale type has nothing to sit on and the
    # halation layer tips the whole frame to milk. A release print is denser
    # than the negative for the same reason.
    out = out * 0.80 + 0.015
    out = np.clip(out, 0, 1)
    out = out * (1.0 - 0.07) + 0.035         # no true black, no true white
    return Image.fromarray((out * 255).astype(np.uint8))


def _contour(plate, stem, levels=9, smooth=14):
    g = plate.filter(ImageFilter.GaussianBlur(smooth))
    a = np.asarray(g, dtype=np.float32) / 255.0
    q = np.floor(a * levels)
    dx = np.abs(np.diff(q, axis=1, prepend=q[:, :1]))
    dy = np.abs(np.diff(q, axis=0, prepend=q[:1, :]))
    line = ((dx > 0) | (dy > 0)).astype(np.float32)
    # Not pure line on pure black: a flat basin yields almost no contours, and
    # the window would just be a black rectangle punched in the picture. A faint
    # print of the terrain underneath keeps the window legible as the same
    # ground, and the lines still carry it.
    base = np.asarray(plate, dtype=np.float32) / 255.0
    out = np.clip(0.05 + 0.78 * line + 0.30 * base * (1 - line), 0, 1)
    out = Image.fromarray((out * 255).astype(np.uint8))
    out.save(stem + ".webp", "WEBP", quality=80, method=6)
    out.save(stem + ".jpg", "JPEG", quality=76, optimize=True)
    return line.mean()


def build(name, cfg):
    z = cfg["z"]
    n = 2 ** z
    half = cfg["span"] / 2.0
    x_lo, _ = deg2tile(cfg["lon"] - half, cfg["lat"], z)
    x_hi, _ = deg2tile(cfg["lon"] + half, cfg["lat"], z)
    # keep a 3:2 frame — the page crops to whatever the viewport needs
    nx = max(2, int(round(x_hi - x_lo)))
    ny = max(2, int(round(nx * 2 / 3)))
    cx, cy = deg2tile(cfg["lon"], cfg["lat"], z)
    x0 = max(0, min(n - nx, int(cx - nx / 2)))
    y0 = max(0, min(n - ny, int(cy - ny / 2)))

    log(f"  {name:10} z{z}  {nx}×{ny} 瓦片  ({nx*TILE}×{ny*TILE} px)  {cfg['label']}")
    rel, gr, tr, _ = mosaic(RELIEF, z, x0, y0, nx, ny)
    log(f"      地形 {gr}/{tr}")
    lan, gl, tl, lan_have = mosaic(LANDSAT, z, x0, y0, nx, ny)
    log(f"      影像 {gl}/{tl}")
    if gr == 0 and gl == 0:
        log(f"      !! {name} 无可用瓦片，跳过")
        return None

    plate = grade(rel, lan, lan_have)

    # The mosaic is far larger than any screen will show — the overview comes in
    # at 6912 px, which is 6.5 MB of JPEG for a page that is mostly a backdrop.
    # Downsample first, THEN sharpen: sharpening at full size and shrinking
    # afterwards throws the sharpening away and keeps the file size.
    cap = cfg.get("max_w", 2560)
    if plate.width > cap:
        h = round(plate.height * cap / plate.width)
        plate = plate.resize((cap, h), Image.LANCZOS)
    plate = plate.filter(ImageFilter.UnsharpMask(radius=1.4, percent=62, threshold=3))
    plate = plate.convert("L")

    # Match this plate's tone to the same ground as it appears on the wide map.
    # Each plate is normalised against its own histogram, which is right on its
    # own but means the hand-off from the wide shot to the close one changes
    # exposure mid-move — the single thing that made the cut read as a cut. A
    # linear mean/σ match costs nothing and makes them the same photograph.
    if name != "overview":
        ref = os.path.join(OUT, "overview.jpg")
        ov = REGIONS.get("overview")
        if os.path.exists(ref) and ov:
            o = Image.open(ref).convert("L")
            ow, oh = o.size
            wl, el = tile2deg(x0, y0, z)[0], tile2deg(x0 + nx, y0 + ny, z)[0]
            nl, sl = tile2deg(x0, y0, z)[1], tile2deg(x0 + nx, y0 + ny, z)[1]
            ob = plate_bounds("overview")
            if ob:
                fx = lambda lon: (lon - ob["west"]) / (ob["east"] - ob["west"]) * ow
                fy = lambda lat: ((merc(lat) - merc(ob["north"])) /
                                  (merc(ob["south"]) - merc(ob["north"]))) * oh
                box = (max(0, int(fx(wl))), max(0, int(fy(nl))),
                       min(ow, int(fx(el)) + 1), min(oh, int(fy(sl)) + 1))
                if box[2] - box[0] > 4 and box[3] - box[1] > 4:
                    ra = np.asarray(o.crop(box), dtype=np.float32)
                    pa = np.asarray(plate, dtype=np.float32)
                    if pa.std() > 1:
                        # Exposure and contrast get very different weights. A
                        # brightness step is what the eye catches at a dissolve,
                        # so the mean is matched hard; contrast is not, because
                        # a 2° crop of the wide map genuinely holds less range
                        # than the close plate does and matching σ to it would
                        # just flatten the close shot.
                        k_mean, k_sd = 0.88, 0.20
                        g = 1 + k_sd * (ra.std() / pa.std() - 1)
                        b = k_mean * (ra.mean() - pa.mean() * g)
                        pa = np.clip(pa * g + b, 0, 255)
                        plate = Image.fromarray(pa.astype(np.uint8))
                        log(f"      调色对齐总图  μ {pa.mean():.0f}←{ra.mean():.0f}"
                            f"  σ {pa.std():.0f}←{ra.std():.0f}")

    os.makedirs(OUT, exist_ok=True)
    safe = name.replace("@", "-")

    # A pseudo-contour version of the same plate: posterise the terrain into a
    # handful of bands and keep only the boundaries between them, which is what
    # a contour line is. The heavy blur first is the whole trick — without it
    # the field texture and the irrigation blocks produce a boundary every few
    # pixels and the result is noise, not topography.
    _contour(plate, os.path.join(OUT, f"{safe}-contour"))
    dst = os.path.join(OUT, f"{safe}.webp")
    alt = os.path.join(OUT, f"{safe}.jpg")
    plate.save(dst, "WEBP", quality=78, method=6)
    plate.save(alt, "JPEG", quality=78, optimize=True, progressive=True)
    log(f"      → plates/{safe}.webp {os.path.getsize(dst)/1024:.0f} KB"
        f"   (jpg {os.path.getsize(alt)/1024:.0f} KB)  {plate.width}×{plate.height}")

    # The page flies a camera across the overview and has to know where each
    # region falls inside it. Deriving that in JS would mean a second copy of
    # this tile maths; recording it here means there is only ever one.
    w_lon, n_lat = tile2deg(x0, y0, z)
    e_lon, s_lat = tile2deg(x0 + nx, y0 + ny, z)
    return dict(file=safe, w=plate.width, h=plate.height,
                west=w_lon, east=e_lon, north=n_lat, south=s_lat,
                lon=cfg["lon"], lat=cfg["lat"], label=cfg["label"])


def main():
    want = sys.argv[1:] or list(REGIONS)
    log("抓取 NASA GIBS 瓦片并合成黑白底片 …")
    total = 0
    idx_path = os.path.join(OUT, "index.json")
    index = {}
    if os.path.exists(idx_path):        # a partial run must not drop the rest
        index = json.load(open(idx_path, encoding="utf-8"))
    for name in want:
        if name not in REGIONS:
            log(f"  未知区域 {name}"); continue
        meta = build(name, REGIONS[name])
        if meta:
            index[name] = meta
            total += os.path.getsize(os.path.join(OUT, name.replace("@","-") + ".webp"))
    if index:
        json.dump(index, open(idx_path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1, sort_keys=True)
        log(f"→ plates/index.json  {len(index)} 幅（含各幅经纬边界）")
    log(f"\n合计 {total/1048576:.2f} MB → {OUT}")
    log("影像来源：NASA GIBS（ASTER GDEM 灰阶晕渲 + Landsat WELD 真彩），公有领域。")


if __name__ == "__main__":
    main()
