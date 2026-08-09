#!/usr/bin/env python3
"""Merge the hand-translated Mongolian gloss parts into tools/mn_glosses.json."""
import json, os, glob, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
G = {}
for p in sorted(glob.glob(os.path.join(HERE, "mn_gloss_*.py"))):
    spec = importlib.util.spec_from_file_location(os.path.basename(p)[:-3], p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    conflict = {k for k in set(G) & set(m.G) if G[k] != m.G[k]}
    if conflict:
        print(f"  !! {os.path.basename(p)} 冲突 {len(conflict)} 条: {sorted(conflict)[:3]}")
    G.update(m.G)
    print(f"  {os.path.basename(p)}: {len(m.G)} 条")
json.dump(G, open(os.path.join(HERE, "mn_glosses.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=0, sort_keys=True)
print(f"→ mn_glosses.json  {len(G)} 条")
