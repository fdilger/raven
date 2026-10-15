# raven — matrix reasoning benchmarkmaxxer

A local web app for practicing and benchmarking yourself on Raven's-style matrix
reasoning puzzles, built on the **MaRs-IB** (Matrix Reasoning Item Bank).

## Data source

Chierchia, G., Fuhrmann, D., Knoll, L. J., Pi-Sunyer, B. P., Sakhardande, A. L., &
Blakemore, S. J. (2019). *The matrix reasoning item bank (MaRs-IB): novel, open-access
abstract reasoning items for adolescents and adults.* Royal Society Open Science,
6(10), 190232. https://doi.org/10.1098/rsos.190232

- Items downloaded from https://osf.io/g96f4/ (item set 1: 3 parallel test forms × 80
  items × [1 matrix + 4 choices × 2 distractor variants] = 2,160 images).
- Per-item norms (accuracy, median RT) from the published sample of ~650 participants
  (ages 11–33) are baked into `app/manifest.json` and used for difficulty banding and
  you-vs-sample comparisons.
- License: CC BY-NC 3.0 — **non-commercial use only**. Note the authors' caveat: this
  is not an IQ test and has no population IQ norms.

## Run

```bash
python3 -m http.server 8517 -d app
```

then open http://localhost:8517.

## Features

- **Benchmark mode** — the MaRs-IB protocol: one form, fixed item order, 30 s/item,
  8 min total (or extended/uncapped/fully untimed), no feedback until the end. Score compared to the
  sample average on exactly the items you saw. 6 fresh runs available (3 forms × 2
  distractor variants) before you start repeating items.
- **Practice mode** — untimed, immediate feedback, filtered by difficulty band
  (Easy/Medium/Hard/Brutal, derived from published per-item accuracy); least-practiced
  items served first.
- **Infinite mode** — unlimited procedurally generated puzzles (client-side SVG, no
  data needed), built the way commercial vendors and the RAVEN/PGM research datasets
  build theirs: rule grammars over shape / size / shade / rotation / count, after the
  Carpenter et al. (1990) rule taxonomy (constant, progression, distribution-of-three,
  figure arithmetic). Difficulty tier 1–4 = number of simultaneous rules; tier 4 adds
  subtle (adjacent-value) rules and single-attribute distractors. Drill (feedback) or
  sprint (30 s/item) modes.
- **Stats** — all-time accuracy vs. sample, accuracy-by-difficulty chart, generated-item
  accuracy by tier, benchmark history, sortable per-item breakdown (your acc vs. sample
  acc, RT vs. sample median RT). All data stays in `localStorage`.
- Every mode has a Recorded/Casual toggle — casual sessions show results but are never
  saved to stats or history.
- Answer positions are shuffled every presentation (in the raw files T1 is always
  correct); keyboard shortcuts 1–4.

## Rebuilding the manifest

`python3 build_manifest.py` regenerates `app/manifest.json` and re-copies images from
`data/raw/`. That folder is not committed: download `tf1.zip`, `tf2.zip`, `tf3.zip`
(extracted into `tf1/`, `tf2/`, `tf3/`), `stats_by_form.csv` and `dimensionality.csv`
from https://osf.io/g96f4/ into it first. The built `app/` is committed, so this is only
needed to regenerate it.
