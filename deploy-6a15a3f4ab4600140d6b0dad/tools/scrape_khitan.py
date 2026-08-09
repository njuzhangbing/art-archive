#!/usr/bin/env python3
"""
Re-scrape CCAMC Khitan Small Script data, preserving the structure that the
original scrape flattened away:

  * per-word SENSES        (were concatenated into one unsegmented string)
  * grammatical TAGS       (<code>领格</code> — were merged into the gloss text)
  * source CITATIONS       (（147） — were dropped entirely)
  * BOTH reconstructions   (Kane 擬音 vs 烏拉熙春擬音 — were conflated into one)
  * the 214-item BIBLIOGRAPHY that the citation numbers point into

Source: http://www.ccamc.org/khitan.php  (古今文字集成, by Jerry)

Usage:  python3 tools/scrape_khitan.py
Pages are cached under tools/.cache/ so re-runs are cheap.
Writes khitan.js in the site root.
"""
import urllib.request, urllib.parse, re, json, os, sys, time, html
from concurrent.futures import ThreadPoolExecutor

BASE  = "http://www.ccamc.org/"
HERE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(HERE)
CACHE = os.environ.get("KHITAN_CACHE", os.path.join(HERE, ".cache"))
CP_LO, CP_HI = 0xE000, 0xE199          # the 410 KSS characters
DELAY   = 1.0                           # per-request pause; be kind to a small server
WORKERS = 1                             # this host drops requests above ~1 in flight

os.makedirs(CACHE, exist_ok=True)
log = lambda *a: print(*a, flush=True)


class Throttled(Exception):
    """The host is refusing us; keep retrying and we only dig deeper."""


WAYBACK = "https://web.archive.org/web/2/"

# Once the origin has refused this many pages in a row, stop paying 3 retries ×
# backoff on every page and take the rest from the archive.
ORIGIN_GIVEUP = 5
# ...but the ban turns out to be INTERMITTENT — most pages we hold came from the
# origin, harvested before the give-up tripped. So re-probe it every N pages
# instead of writing it off for the whole round; one cheap request buys back a
# window that would otherwise be missed entirely.
ORIGIN_RECHECK = 15
_origin_fails = [0]
_since_probe  = [0]


def fetch_wayback(url, must_contain):
    """Second source for a page CCAMC will not serve.

    The ban is per-host, so the Internet Archive's copy is reachable when the
    origin is not. Snapshots carry the full markup — verified identical on
    U+E002 down to the citation numbers. Only ~99 of the 410 pages are archived,
    so this supplements the live fetch rather than replacing it.

    Note: do NOT use the `id_` replay modifier here; for these URLs it returns a
    redirect stub rather than the archived body.
    """
    try:
        req = urllib.request.Request(WAYBACK + url,
                                     headers={"User-Agent": "Mozilla/5.0 (khitan-dataset-rebuild)"})
        d = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
        return d if must_contain in d else None
    except Exception:
        return None


def fetch(url, cache_key, must_contain, tries=3):
    """Fetch with content validation.

    Under load this server answers with a 200 and a 62-byte empty body rather
    than an error status, so a page is only accepted (and only cached) once it
    actually contains the marker we came for. Anything else is a retry.
    """
    path = os.path.join(CACHE, cache_key)
    if os.path.exists(path):
        cached = open(path, encoding="utf-8", errors="replace").read()
        if must_contain in cached:
            return cached
        os.remove(path)                             # poisoned by an earlier run

    if _origin_fails[0] >= ORIGIN_GIVEUP:         # origin refusing — archive first
        _since_probe[0] += 1
        if _since_probe[0] >= ORIGIN_RECHECK:     # …but keep testing for a window
            _since_probe[0] = 0
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "Mozilla/5.0 (khitan-dataset-rebuild)"})
                d = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
                if must_contain in d:
                    log("      源站恢复，切回实时抓取")
                    _origin_fails[0] = 0
                    open(path, "w", encoding="utf-8").write(d)
                    time.sleep(DELAY)
                    return d
            except Exception:
                pass
        d = fetch_wayback(url, must_contain)
        if d:
            open(path, "w", encoding="utf-8").write(d)
            return d
        raise Throttled(f"{url}: origin refusing, no archived snapshot")

    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 (khitan-dataset-rebuild)"})
            d = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
            if must_contain in d:
                _origin_fails[0] = 0
                open(path, "w", encoding="utf-8").write(d)
                time.sleep(DELAY)
                return d
            last = f"truncated response ({len(d)} bytes) — throttled"
        except Exception as e:                      # transient network / 5xx
            last = e
        time.sleep(2.0 * (n + 1))                   # back off, the server is small

    _origin_fails[0] += 1
    d = fetch_wayback(url, must_contain)             # origin refused — try the archive
    if d:
        open(path, "w", encoding="utf-8").write(d)
        time.sleep(DELAY)
        return d
    raise Throttled(f"{url}: {last}")


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def field(doc, title):
    """Read one of the <p class="title">X</p><p>value</p> info cells."""
    m = re.search(r'<p class="title">' + re.escape(title) + r"</p>\s*<p>(.*?)</p>", doc, re.S)
    return html.unescape(strip(m.group(1))) if m else ""


# ---------------------------------------------------------------- bibliography
def scrape_refs():
    doc = fetch(BASE + "khitan_small_script_voc_exp_source.php", "refs.html", "<ol")
    ol = max(re.findall(r"<ol[^>]*>(.*?)</ol>", doc, re.S), key=len)
    return [html.unescape(strip(li)) for li in re.findall(r"<li>(.*?)</li>", ol, re.S)]


# ------------------------------------------------------------- completeness gate
def legacy_ksw_set():
    """Word forms recorded by the previous scrape — 2350 of them.

    The 410 character pages should between them mention every word, since every
    word contains at least one character. Comparing against the legacy list is a
    free coverage check: it catches a page that returned a valid-looking shell
    with its 相關詞彙 tab empty, which content validation alone would not.
    """
    legacy = os.path.join(HERE, "_backup", "khitan.original.js")
    if not os.path.exists(legacy):
        return set()
    import subprocess
    out = subprocess.run(
        ["node", "-e",
         f'global.window={{}};require({json.dumps(legacy)});'
         'process.stdout.write(JSON.stringify(window.khitanData.vocabs.map(v=>v.ksw)));'],
        capture_output=True, text=True)
    return set(json.loads(out.stdout)) if out.returncode == 0 else set()


# ------------------------------------------------------------------ char pages
SENSE_RE = re.compile(r'<p class="exp">(?!\s*<p)(.*?)</p>', re.S)


def parse_senses(block):
    """One <p class="exp"> = one sense. Pull tag + citation out of the gloss."""
    out = []
    for raw in SENSE_RE.findall(block):
        src  = [int(x) for x in re.findall(r"<small>（(\d+)）</small>", raw)]
        tags = [html.unescape(strip(t)) for t in re.findall(r"<code>(.*?)</code>", raw)]
        txt  = re.sub(r"<small>.*?</small>", "", raw, flags=re.S)
        txt  = re.sub(r"<code>.*?</code>", "", txt, flags=re.S)
        txt  = html.unescape(strip(txt))
        if txt or tags:
            s = {"g": txt}
            if tags: s["t"] = tags
            if src:  s["s"] = src
            out.append(s)
    return out


def parse_char(cp):
    ch  = chr(cp)
    doc = fetch(BASE + "khitan.php?kss=" + urllib.parse.quote(ch.encode("utf-8")),
                f"kss_{cp:04X}.html", '<p class="title">序號</p>')

    gloss = ""
    m = re.search(r"<p><b>釋義</b></p>(.*?)</div>", doc, re.S)
    if m:
        g = html.unescape(strip(m.group(1)))
        gloss = "" if g in ("暫無解釋", "暂无解释", "") else g

    rec = {
        "cp":      cp,
        "kss_id":  field(doc, "序號"),
        "kane_id": field(doc, "Kane序號"),
        "strokes": field(doc, "總筆畫數"),
        "bs":      field(doc, "魏安字體"),          # BabelStone glyph
        "kane":    field(doc, "Kane擬音"),          # Daniel Kane
        "ulh":     field(doc, "烏拉熙春擬音"),      # 愛新覺羅·烏拉熙春
        "gloss":   gloss,
    }

    words, tab = [], doc.split('id="xgch"')[-1]
    for c in re.split(r'<span class="kss word">', tab)[1:]:
        head = re.match(r"(.*?)</span>", c, re.S)
        if not head:
            continue
        ksw = re.sub(r"^\s*\d+\.\s*", "", strip(head.group(1)))
        ksw = "".join(x for x in ksw if 0xE000 <= ord(x) <= 0xE7F3)
        if ksw:
            words.append({"ksw": ksw, "senses": parse_senses(c)})
    rec["words"] = words
    return rec


def main():
    log("[1/3] bibliography …")
    refs = scrape_refs()
    log(f"      {len(refs)} references")

    cps = list(range(CP_LO, CP_HI + 1))
    total = len(cps)
    log(f"[2/3] {total} character pages · {WORKERS} workers …")
    chars, vocab, failed = [], {}, []
    done = 0
    _origin_fails[0] = 0
    _since_probe[0]  = 0

    STREAK_LIMIT = 60         # consecutive pages unavailable from BOTH sources
    streak = 0

    def work(cp):
        nonlocal streak
        if streak >= STREAK_LIMIT:
            return cp, None, Throttled("skipped — host refusing")
        try:
            rec = parse_char(cp)
            streak = 0
            return cp, rec, None
        except Throttled as e:
            streak += 1
            return cp, None, e
        except Exception as e:
            streak = 0
            return cp, None, e

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for cp, rec, err in pool.map(work, cps):
            done += 1
            if err is not None:
                failed.append(cp)
                if len(failed) <= 3 or done % 100 == 0:
                    log(f"  !! U+{cp:04X}: {err}")
                continue
            for w in rec.pop("words"):
                prev = vocab.get(w["ksw"])
                if prev is None or len(w["senses"]) > len(prev["senses"]):
                    vocab[w["ksw"]] = w      # keep the richest observation
            rec["ksws"] = []
            chars.append(rec)
            if done % 40 == 0:
                log(f"      {done}/{total} · words so far {len(vocab)}")

    chars.sort(key=lambda c: c["cp"])

    log("[3/3] cross-linking …")
    kss_by_cp = {c["cp"]: c for c in chars}
    id_by_cp  = {c["cp"]: c["kss_id"] for c in chars}
    vocabs = []
    for ksw, w in vocab.items():
        for cp in [ord(x) for x in ksw]:
            c = kss_by_cp.get(cp)
            if c is not None and ksw not in c["ksws"]:
                c["ksws"].append(ksw)
        vocabs.append({
            "ksw":    ksw,
            "ids":    [id_by_cp.get(ord(x), "") for x in ksw],
            "senses": w["senses"],
        })
    vocabs.sort(key=lambda v: (len(v["ksw"]), v["ksw"]))

    n_multi = sum(1 for v in vocabs if len(v["senses"]) > 1)
    n_cited = sum(1 for v in vocabs if any("s" in s for s in v["senses"]))
    n_tag   = sum(1 for v in vocabs if any("t" in s for s in v["senses"]))
    n_two   = sum(1 for c in chars if c["kane"] and c["ulh"] and c["kane"] != c["ulh"])
    n_gloss = sum(1 for c in chars if c["gloss"])

    if failed:
        if streak >= STREAK_LIMIT:
            log(f"\n  !! 连续 {STREAK_LIMIT} 页两个来源都取不到，本轮提前中止")
        log(f"  !! {len(failed)} 页未取到，不写出 khitan.js（避免半份数据）")
        log(f"  已缓存 {len(chars)}/{total} 页；服务器放行后重跑本脚本即可断点续抓。")
        sys.exit(2)

    known = legacy_ksw_set()
    got = {v["ksw"] for v in vocabs}
    missing = known - got
    if known:
        log(f"      覆盖核对：旧数据 {len(known)} 词，本次取到 {len(got)} 词，"
            f"缺 {len(missing)}，新增 {len(got - known)}")
        if missing:
            log(f"  !! 有 {len(missing)} 个词未出现在任何字页上，不写出 khitan.js")
            sample = sorted(missing)[:5]
            for w in sample:
                log("     " + "+".join(f"U+{ord(c):04X}" for c in w))
            sys.exit(3)

    payload = {
        "meta": {
            "source":    "古今文字集成 CCAMC · 契丹小字",
            "sourceUrl": "http://www.ccamc.org/khitan.php",
            "refsUrl":   BASE + "khitan_small_script_voc_exp_source.php",
            "structured": True,
            "chars": len(chars), "vocabs": len(vocabs), "refs": len(refs),
        },
        "refs": refs, "chars": chars, "vocabs": vocabs,
    }
    dst = os.path.join(ROOT, "khitan.js")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* CCAMC 契丹小字 — rebuilt by tools/scrape_khitan.py\n")
        f.write(f"   {len(chars)} 字 · {len(vocabs)} 词 · {len(refs)} 条参考文献\n")
        f.write("   Senses, grammatical tags and source citations preserved. */\n")
        f.write("window.khitanData = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    log("")
    log(f"  字条           {len(chars)}   其中有独立釋義 {n_gloss}")
    log(f"  词条           {len(vocabs)}")
    log(f"  多义项词条     {n_multi}  ({n_multi/max(1,len(vocabs))*100:.0f}%)  ← 原来被粘成一串")
    log(f"  带出处词条     {n_cited}  ({n_cited/max(1,len(vocabs))*100:.0f}%)  ← 原来全丢")
    log(f"  带语法标签     {n_tag}")
    log(f"  Kane≠烏拉熙春  {n_two} 个字两套拟音不同")
    log(f"  参考文献       {len(refs)}")
    if failed:
        log(f"  !! 失败 {len(failed)}: {[f'U+{c:04X}' for c in failed]}")
    log(f"→ {dst}  ({os.path.getsize(dst)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
