#!/usr/bin/env python3
"""Build app/manifest.json and copy MaRs-IB item images into app/items/.

Data source: MaRs-IB (Chierchia et al. 2019, https://osf.io/g96f4/), item set 1.
File naming: {tf}_{item}_{M|T1..T4}_{ss}[_{md|pd}].jpeg — T1 is always correct.
"""
import csv, json, re, shutil
from pathlib import Path

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
APP = ROOT / "app"
FORMS = ["tf1", "tf2", "tf3"]

def read_csv_rows(path):
    text = path.read_text().replace("\r\n", "\n").replace("\r", "\n")
    return list(csv.DictReader(text.strip().splitlines()))

# Norms: per-form and pooled accuracy / RT per item
norms = {}  # (group, item) -> stats
for row in read_csv_rows(RAW / "stats_by_form.csv"):
    def num(k):
        v = row[k]
        return None if v in ("NA", "") else float(v)
    norms[(row["Group"], int(row["Item"]))] = {
        "n": int(row["N"]),
        "acc": num("Mean.correct"),
        "rtMedian": num("RT.median.corr"),
        "rtIqr": num("RT.IQR.corr"),
    }

dim = {int(r["Item"]): int(r["Dimensionality Score"])
       for r in read_csv_rows(RAW / "dimensionality.csv")}

items = []
for form in FORMS:
    src_dir = RAW / form / form
    (APP / "items" / form).mkdir(parents=True, exist_ok=True)
    by_item = {}
    for f in sorted(src_dir.glob("*.jpeg")):
        m = re.match(rf"{form}_(\d+)_(M|T[1-4])_(ss\d)(?:_(md|pd))?\.jpeg", f.name)
        if not m:
            print("skip unrecognized:", f.name)
            continue
        num_, part, ss, variant = int(m.group(1)), m.group(2), m.group(3), m.group(4)
        rec = by_item.setdefault(num_, {"ss": ss, "choices": {"md": {}, "pd": {}}})
        shutil.copy2(f, APP / "items" / form / f.name)
        rel = f"items/{form}/{f.name}"
        if part == "M":
            rec["matrix"] = rel
        else:
            rec["choices"][variant][part] = rel

    for num_, rec in sorted(by_item.items()):
        choices = {}
        for variant in ("md", "pd"):
            ts = rec["choices"][variant]
            if len(ts) != 4:
                print(f"warn: {form} item {num_} variant {variant} has {len(ts)} tiles")
                continue
            # index 0 (T1) is the correct answer; app shuffles at render time
            choices[variant] = [ts[f"T{i}"] for i in range(1, 5)]
        items.append({
            "id": f"{form}-{num_}",
            "form": form,
            "num": num_,
            "shapeSet": rec["ss"],
            "matrix": rec["matrix"],
            "choices": choices,
            "dim": dim.get(num_),
            "norm": norms.get((form, num_)),
            "normPooled": norms.get(("total", num_)),
        })

manifest = {
    "source": "MaRs-IB (Chierchia, Fuhrmann, Knoll, Pi-Sunyer, Sakhardande & Blakemore, 2019). https://osf.io/g96f4/ CC BY-NC 3.0, non-commercial use.",
    "items": items,
}
APP.mkdir(exist_ok=True)
(APP / "manifest.json").write_text(json.dumps(manifest, indent=1))
print(f"wrote {len(items)} items to app/manifest.json")
