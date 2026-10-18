# Judge threshold calibration (JUDGE_YES_MIN)

Generated 2026-10-18 05:23 UTC by `node scripts/eval/calibrate.js` from raw-rejudge.json: 17 labelled conversations with both judges' decisions.
A "yes" below the threshold becomes "unsure" (Maybe); the pair is the lower side. Current value: 0.65.

| threshold | correct | harmful errors |
|---|---|---|
| 0.50 | 8/17 | 2 |
| 0.55 | 8/17 | 2 |
| 0.60 | 8/17 | 2 |
| 0.65 (current) | 8/17 | 1 |
| 0.70 | 8/17 | 1 |
| 0.75 | 7/17 | 0 |
| 0.80 | 6/17 | 0 |
| 0.85 | 5/17 | 0 |
| 0.90 | 5/17 | 0 |
| 0.95 | 5/17 | 0 |

**Best: 0.65** (8/17 correct, 1 harmful). The threshold can only turn a low-confidence yes into Maybe; it cannot help pairs where a judge already said unsure or no.

