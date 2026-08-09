#!/usr/bin/env python3
"""Merge the hand-translated gloss parts into tools/ot_glosses.json."""
import json, os, glob, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
G = {}
# globbed, not a hardcoded ("a","b","c","d"): a new part file used to be skipped
# in silence, and the only symptom was a coverage number that would not move.
for p in sorted(glob.glob(os.path.join(HERE, "ot_gloss_*.py"))):
    part = os.path.basename(p)[len("ot_gloss_"):-3]
    spec = importlib.util.spec_from_file_location(f"ot_gloss_{part}", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    dup = set(G) & set(m.G)
    conflict = {k for k in dup if G[k] != m.G[k]}
    if conflict:
        print(f"  !! {part} 与前部冲突 {len(conflict)} 条: {sorted(conflict)[:3]}")
    G.update(m.G)
    print(f"  {os.path.basename(p)}: {len(m.G)} 条")
json.dump(G, open(os.path.join(HERE, "ot_glosses.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=0, sort_keys=True)
print(f"→ ot_glosses.json  {len(G)} 条")
