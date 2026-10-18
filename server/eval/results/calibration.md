# Judge threshold calibration (JUDGE_YES_MIN)

Generated 2026-10-18 02:04 UTC by `node scripts/eval/calibrate.js` from raw-rules-on.json, raw.json: 7 labelled conversations with both judges' decisions.
A "yes" below the threshold becomes "unsure" (Maybe); the pair is the lower side. Current value: 0.6.

| threshold | correct | harmful errors |
|---|---|---|
| 0.50 | 2/7 | 1 |
| 0.55 | 2/7 | 1 |
| 0.60 (current) | 2/7 | 1 |
| 0.65 | 2/7 | 1 |
| 0.70 | 2/7 | 1 |
| 0.75 | 2/7 | 1 |
| 0.80 | 2/7 | 1 |
| 0.85 | 2/7 | 1 |
| 0.90 | 2/7 | 1 |
| 0.95 | 2/7 | 1 |

**Best: 0.50** (2/7 correct, 1 harmful). The threshold can only turn a low-confidence yes into Maybe; it cannot help pairs where a judge already said unsure or no.

