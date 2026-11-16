"""Validate examples/*/example.toml and write examples.json for the gallery.

usage: python tools/build.py            # validate + write examples.json
       python tools/build.py --usage    # also print model -> examples (reverse links)
Card order: optional integer meta.order (smaller first; unset sorts last), ties by folder name.
Stdlib only (Python >= 3.11).
"""
import json, sys, tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = {"active", "planned", "retired"}
RUNTIME = {"browser-js", "precomputed", "pyodide"}
BACKEND = {"webgpu", "js-cpu", "python", "none"}
PRECISION = {"float32", "float64"}

def check(d, folder):
    e = []
    m, x = d.get("meta", {}), d.get("example", {})
    if m.get("name") != folder.name: e.append(f"meta.name {m.get('name')!r} != folder")
    for k in ("title", "status"):
        if not m.get(k): e.append(f"meta.{k} missing")
    if m.get("status") not in STATUS: e.append(f"meta.status {m.get('status')!r}")
    if "order" in m and (type(m["order"]) is not int): e.append(f"meta.order {m['order']!r} not an integer")
    if x.get("runtime") not in RUNTIME: e.append(f"example.runtime {x.get('runtime')!r}")
    for k in ("method", "entry", "blurb"):
        if not x.get(k): e.append(f"example.{k} missing")
    if x.get("entry") and not (folder / x["entry"]).exists(): e.append("entry file missing")
    for i, v in enumerate(d.get("variants", [])):
        if v.get("backend") not in BACKEND: e.append(f"variants[{i}].backend {v.get('backend')!r}")
        if v.get("precision") not in PRECISION: e.append(f"variants[{i}].precision {v.get('precision')!r}")
        if v.get("status") not in STATUS: e.append(f"variants[{i}].status {v.get('status')!r}")
    return e

def main():
    items, bad = [], 0
    for f in sorted((ROOT / "examples").glob("*/example.toml")):
        d = tomllib.loads(f.read_text("utf8"))
        errs = check(d, f.parent)
        for msg in errs: print(f"{f.parent.name}: {msg}")
        bad += bool(errs)
        x = d["example"]
        thumb = x.get("thumb", "")
        items.append({**d["meta"], **{k: x[k] for k in ("method", "runtime", "blurb")},
                      "href": f"examples/{f.parent.name}/{x['entry']}",
                      "thumb": f"examples/{f.parent.name}/{thumb}" if thumb and (f.parent / thumb).exists() else "",
                      "variants": d.get("variants", [])})
    if bad: sys.exit(f"{bad} example(s) invalid")
    # gallery order: meta.order ascending (unset = last), then folder name
    items.sort(key=lambda it: (it.get("order", float("inf")), it["name"]))
    (ROOT / "examples.json").write_text(json.dumps(items, indent=1), "utf8")
    print(f"ok: {len(items)} examples -> examples.json")
    if "--usage" in sys.argv:
        use = {}
        for it in items:
            for v in it["variants"]:
                if v["catalogue"]: use.setdefault(v["catalogue"], set()).add(it["name"])
        for k in sorted(use): print(f"  {k}: {sorted(use[k])}")

if __name__ == "__main__":
    main()
